import type { ActionItem, MeetingRecord, MeetingStatus } from '../../../shared/contract'
import { MEETING_STATUSES, scheduleKindOf, UNSET, validateMeetingRecord } from '../../../shared/contract'
import { buildActionTable, buildMeetingPage } from './notion-mapping'

// This app deliberately stays on the pre-data-source Notion API contract.
// Database IDs and the payloads in notion-mapping.ts rely on this version.
export const NOTION_VERSION = '2022-06-28'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const RATE_LIMIT_DELAY_MS = 350
let nextNotionRequestAt = 0

type NotionPage = {
  id: string
  url: string
}

type NotionError = {
  message?: string
}

type NotionRichText = { plain_text?: string; text?: { content?: string } }

type NotionBlock = {
  id: string
  type: string
  has_children?: boolean
  heading_2?: { rich_text?: NotionRichText[] }
  paragraph?: { rich_text?: NotionRichText[] }
  bulleted_list_item?: { rich_text?: NotionRichText[] }
  toggle?: { rich_text?: NotionRichText[] }
  table_row?: { cells?: NotionRichText[][] }
}

type NotionBlockList = {
  results?: unknown[]
  has_more?: boolean
  next_cursor?: string | null
}

type NotionProperty = {
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  date?: { start?: string | null }
  multi_select?: Array<{ name?: string }>
  select?: { name?: string } | null
}

type NotionDatabasePage = NotionPage & {
  created_time: string
  last_edited_time: string
  properties: Record<string, NotionProperty>
}

type NotionDatabaseQuery = {
  results?: unknown[]
  has_more?: boolean
  next_cursor?: string | null
}

export type NotionMeetingPage = {
  id: string
  url: string
  createdAt: string
  lastEditedAt: string
  날짜: string
  제목: string
  상태: MeetingStatus
  핵심_요약: string
  안건_태그: string[]
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitForNotionRequestSlot() {
  const now = Date.now()
  const scheduledAt = Math.max(now, nextNotionRequestAt)
  nextNotionRequestAt = scheduledAt + RATE_LIMIT_DELAY_MS
  await sleep(scheduledAt - now)
}

function requiredEnvironment(name: 'NOTION_TOKEN' | 'NOTION_MEETINGS_DB') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} 환경 변수가 설정되지 않았습니다`)
  return value
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text }
  }
}

export async function notionFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = requiredEnvironment('NOTION_TOKEN')
  await waitForNotionRequestSlot()
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = await readJson(response)

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? (body as NotionError).message
      : undefined
    throw new Error(`Notion ${response.status}: ${message ?? JSON.stringify(body)}`)
  }

  return body
}

function isNotionBlock(value: unknown): value is NotionBlock {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { type?: unknown }).type === 'string'
}

function blockText(block: NotionBlock) {
  return block.heading_2?.rich_text
    ?.map((text) => text.plain_text ?? text.text?.content ?? '')
    .join('') ?? ''
}

function richTextValue(value: NotionRichText[] | undefined) {
  return value?.map((text) => text.plain_text ?? text.text?.content ?? '').join('') ?? ''
}

function recordLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[•-]\s*/, '').trim())
    .filter(Boolean)
}

function isNotionDatabasePage(value: unknown): value is NotionDatabasePage {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { url?: unknown }).url === 'string'
    && typeof (value as { created_time?: unknown }).created_time === 'string'
    && typeof (value as { last_edited_time?: unknown }).last_edited_time === 'string'
    && typeof (value as { properties?: unknown }).properties === 'object'
    && (value as { properties?: unknown }).properties !== null
}

function propertyText(page: NotionDatabasePage, names: string[], kind: 'title' | 'rich_text') {
  for (const name of names) {
    const property = page.properties[name]
    const text = richTextValue(property?.[kind])
    if (text) return text
  }
  return ''
}

function propertyDate(page: NotionDatabasePage) {
  return page.properties['날짜']?.date?.start?.slice(0, 10) ?? page.created_time.slice(0, 10)
}

function propertyStatus(page: NotionDatabasePage): MeetingStatus {
  const name = page.properties['상태']?.select?.name
  return name && MEETING_STATUSES.includes(name as MeetingStatus) ? name as MeetingStatus : '완료'
}

function propertyTags(page: NotionDatabasePage) {
  const property = page.properties['안건 태그'] ?? page.properties['안건_태그']
  return property?.multi_select?.map((option) => option.name?.trim()).filter((name): name is string => Boolean(name)) ?? []
}

async function listBlockChildren(blockId: string) {
  const blocks: NotionBlock[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ page_size: '100' })
    if (cursor) query.set('start_cursor', cursor)
    const raw = await notionFetch(`/blocks/${blockId}/children?${query}`) as NotionBlockList
    if (Array.isArray(raw.results)) blocks.push(...raw.results.filter(isNotionBlock))
    cursor = raw.has_more && typeof raw.next_cursor === 'string' ? raw.next_cursor : null
  } while (cursor)
  return blocks
}

export async function listNotionMeetingPages(): Promise<NotionMeetingPage[]> {
  const databaseId = requiredEnvironment('NOTION_MEETINGS_DB')
  const pages: NotionDatabasePage[] = []
  let cursor: string | null = null

  do {
    const raw = await notionFetch(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    }) as NotionDatabaseQuery
    if (Array.isArray(raw.results)) pages.push(...raw.results.filter(isNotionDatabasePage))
    cursor = raw.has_more && typeof raw.next_cursor === 'string' ? raw.next_cursor : null
  } while (cursor)

  return pages.map((page) => ({
    id: page.id,
    url: page.url,
    createdAt: page.created_time,
    lastEditedAt: page.last_edited_time,
    날짜: propertyDate(page),
    제목: propertyText(page, ['회의명', '제목', 'Name'], 'title'),
    상태: propertyStatus(page),
    핵심_요약: propertyText(page, ['내용', '핵심 요약', '핵심_요약'], 'rich_text'),
    안건_태그: propertyTags(page),
  }))
}

function actionItemsFromRows(rows: NotionBlock[]): ActionItem[] {
  const matrix = rows
    .filter((block) => block.type === 'table_row' && Array.isArray(block.table_row?.cells))
    .map((block) => block.table_row?.cells?.map(richTextValue) ?? [])
  if (matrix.length < 2) return []

  const headers = matrix[0].map((cell) => cell.trim())
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header))
  const kindIndex = indexOf('구분', '유형')
  const assigneeIndex = indexOf('담당자')
  const taskIndex = indexOf('할 일', '할일')
  const dueIndex = indexOf('기한')
  const statusIndex = indexOf('상태')

  return matrix.slice(1).flatMap((cells) => {
    const 할일 = taskIndex >= 0 ? cells[taskIndex]?.trim() : ''
    if (!할일) return []
    const 담당자 = assigneeIndex >= 0 && cells[assigneeIndex]?.trim() ? cells[assigneeIndex].trim() : UNSET
    const rawKind = kindIndex >= 0 ? cells[kindIndex]?.trim() : ''
    const 유형 = rawKind === '개인 일정' || rawKind === '팀 일정' || rawKind === '다음 계획'
      ? rawKind
      : scheduleKindOf({ 담당자 })
    const rawStatus = statusIndex >= 0 ? cells[statusIndex]?.trim() : ''
    return [{
      할일,
      담당자,
      기한: dueIndex >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(cells[dueIndex]?.trim() ?? '')
        ? cells[dueIndex].trim()
        : UNSET,
      유형,
      상태: rawStatus.includes('완료') ? '완료' as const : '진행' as const,
    }]
  })
}

export async function readNotionMeetingRecord(page: NotionMeetingPage): Promise<MeetingRecord> {
  const blocks = await listBlockChildren(page.id)
  const 참석자: string[] = []
  const 결정사항: string[] = []
  const 액션아이템: ActionItem[] = []
  const 논의_기록: string[] = []
  let 전사문 = ''
  let section = ''

  for (const block of blocks) {
    if (block.type === 'heading_2') {
      section = blockText(block).trim()
      continue
    }

    if (section === '참석자' && block.type === 'paragraph') {
      참석자.push(...richTextValue(block.paragraph?.rich_text).split(/[,·]/).map((name) => name.trim()).filter(Boolean))
      continue
    }
    if (section === '결정사항' && (block.type === 'bulleted_list_item' || block.type === 'paragraph')) {
      const text = block.type === 'bulleted_list_item'
        ? richTextValue(block.bulleted_list_item?.rich_text)
        : richTextValue(block.paragraph?.rich_text)
      결정사항.push(...recordLines(text))
      continue
    }
    if (section === '액션 아이템' && block.type === 'table') {
      액션아이템.push(...actionItemsFromRows(await listBlockChildren(block.id)))
      continue
    }
    if ((section === '논의 기록' || section === '논의 내용 요약') && (block.type === 'bulleted_list_item' || block.type === 'paragraph')) {
      const text = block.type === 'bulleted_list_item'
        ? richTextValue(block.bulleted_list_item?.rich_text)
        : richTextValue(block.paragraph?.rich_text)
      논의_기록.push(...recordLines(text))
      continue
    }
    if (block.type === 'toggle' && richTextValue(block.toggle?.rich_text).includes('전사')) {
      const transcriptBlocks = await listBlockChildren(block.id)
      전사문 = transcriptBlocks
        .filter((child) => child.type === 'paragraph')
        .map((child) => richTextValue(child.paragraph?.rich_text))
        .join('\n')
        .trim()
    }
  }

  // 회의명은 "[M/D] 제목" 형식으로 저장된다. 앞의 날짜 대괄호를 떼어 원래 제목만 남긴다.
  const 제목 = page.제목.replace(/^\[\d{1,2}\/\d{1,2}\]\s*/, '')

  const parsed = validateMeetingRecord({
    날짜: page.날짜,
    참석자: [...new Set(참석자)],
    안건_태그: page.안건_태그,
    제목,
    상태: page.상태,
    핵심_요약: page.핵심_요약 || page.제목 || `${page.날짜} 회의록`,
    결정사항,
    액션아이템,
    논의_기록,
    전사문,
  })
  if (!parsed.ok) throw new Error(`Notion 회의록 형식이 올바르지 않습니다: ${parsed.errors.join(', ')}`)
  return parsed.value
}

/**
 * Replaces only the action-item table directly under a meeting page.
 * The shared Schedule is updated only after this operation succeeds, so the two views
 * never report an action update that Notion did not accept.
 */
export async function syncMeetingActionTable(pageId: string, items: ActionItem[]) {
  const raw = await notionFetch(`/blocks/${pageId}/children?page_size=100`) as NotionBlockList
  const blocks = Array.isArray(raw.results) ? raw.results.filter(isNotionBlock) : []
  const headingIndex = blocks.findIndex((block) => block.type === 'heading_2' && blockText(block) === '액션 아이템')
  if (headingIndex < 0) throw new Error('Notion 회의록에서 액션 아이템 섹션을 찾지 못했습니다')

  const heading = blocks[headingIndex]
  const previousTableBlocks: NotionBlock[] = []
  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block.type === 'heading_2') break
    if (block.type === 'table' || block.type === 'paragraph') previousTableBlocks.push(block)
  }

  // 먼저 새 표를 넣고, 성공한 뒤 기존 표를 지운다. 중간 실패로 표가 사라지는 일을 막는다.
  await notionFetch(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({ children: buildActionTable(items), after: heading.id }),
  })

  for (const block of previousTableBlocks) {
    await notionFetch(`/blocks/${block.id}`, { method: 'DELETE' })
  }
}

/** Creates one meeting page. Action items stay in that page's action-item table. */
export async function createMeeting(
  record: MeetingRecord,
  existingPageId?: string,
): Promise<{ pageId: string; pageUrl: string; failedItems: ActionItem[] }> {
  const meetingsDatabaseId = requiredEnvironment('NOTION_MEETINGS_DB')
  const savedAt = new Date().toISOString()

  const page = existingPageId
    ? {
        id: existingPageId,
        url: `https://www.notion.so/${existingPageId.replace(/-/g, '')}`,
      }
    : await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify(buildMeetingPage(record, meetingsDatabaseId, savedAt)),
      }) as NotionPage

  return { pageId: page.id, pageUrl: page.url, failedItems: [] }
}
