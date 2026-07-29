import type { MeetingRecord, ActionItem } from '../../../shared/contract'
import { scheduleKindOf, scheduleStatusOf, UNSET } from '../../../shared/contract'

const RICH_TEXT_LIMIT = 2000
const MAX_CHILDREN = 100
// Notion 블록의 rich_text 배열 요소 개수 상한 — 한 블록에 최대 RICH_TEXT_RUNS_LIMIT * RICH_TEXT_LIMIT자를 담을 수 있다.
const RICH_TEXT_RUNS_LIMIT = 100

type RichText = { type: 'text'; text: { content: string } }

export function splitRichText(text: string): RichText[] {
  if (!text) return [{ type: 'text', text: { content: '' } }]
  const chunks: RichText[] = []
  for (let i = 0; i < text.length; i += RICH_TEXT_LIMIT) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + RICH_TEXT_LIMIT) } })
  }
  return chunks
}

const heading = (text: string) => ({
  object: 'block', type: 'heading_2',
  heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
})

const bullet = (text: string) => ({
  object: 'block', type: 'bulleted_list_item',
  bulleted_list_item: { rich_text: splitRichText(text) },
})

const paragraph = (text: string) => ({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: splitRichText(text) },
})

const ACTION_TABLE_HEADERS = ['구분', '담당자', '할 일', '기한', '상태']

const tableRow = (cells: string[]) => ({
  object: 'block', type: 'table_row',
  table_row: { cells: cells.map(splitRichText) },
})

// 이 표는 사이트의 Schedule과 같은 액션 아이템을 회의록 안에서도 바로 읽게 한다.
export function buildActionTable(items: ActionItem[]): object[] {
  if (!items.length) return [paragraph('(액션 아이템 없음)')]

  const rows = items
    .slice(0, MAX_CHILDREN - 1) // 헤더 행 한 줄을 뺀 나머지가 예산이다
    .map((item) => tableRow([
      scheduleKindOf(item),
      item.담당자,
      item.할일,
      item.기한,
      scheduleStatusOf(item),
    ]))

  return [{
    object: 'block', type: 'table',
    table: {
      table_width: ACTION_TABLE_HEADERS.length,
      has_column_header: true,
      has_row_header: false,
      children: [tableRow(ACTION_TABLE_HEADERS), ...rows],
    },
  }]
}

// 전사문을 토글의 자식 블록으로 만든다. rich_text 런은 한 블록에 최대
// RICH_TEXT_RUNS_LIMIT개까지 담아(문단 블록당 최대 20만자) 블록 예산을 아낀다.
// 그래도 넘치는 경우에만 잘라내고, 잘렸다는 표시 블록을 남긴다.
function buildTranscriptChildren(text: string): object[] {
  if (!text) return [paragraph('(전사문 없음)')]

  const runs = splitRichText(text)
  const kept = runs.slice(0, RICH_TEXT_RUNS_LIMIT)
  const block = { object: 'block', type: 'paragraph', paragraph: { rich_text: kept } }

  if (runs.length <= RICH_TEXT_RUNS_LIMIT) return [block]

  const shownChars = RICH_TEXT_RUNS_LIMIT * RICH_TEXT_LIMIT
  return [
    block,
    paragraph(`(전사문이 길어 앞 ${shownChars}자만 표시했습니다. 원본 길이: ${text.length}자)`),
  ]
}

export function buildMeetingPage(record: MeetingRecord, databaseId: string) {
  const toggle = {
    object: 'block', type: 'toggle',
    toggle: {
      rich_text: [{ type: 'text', text: { content: '전사 전문' } }],
      children: buildTranscriptChildren(record.전사문),
    },
  }

  const actionTable = buildActionTable(record.액션아이템)

  // intro 문단, 헤딩 4개, 참석자 문단, 액션 아이템 표, 전사문 토글은 항상 포함되는 고정 블록이다.
  // Notion은 한 요청에 자식 블록 100개까지만 허용한다. 한도를 넘는 경우에도 내용을 버리지 않고
  // 각 섹션을 줄바꿈 문단 하나로 압축해 원문에서 뽑힌 기록 전체를 보존한다.
  const FIXED_BLOCKS = 8
  const shouldCompactRecords = FIXED_BLOCKS + record.결정사항.length + record.논의_기록.length > MAX_CHILDREN
  const recordBlocks = (items: string[]) => {
    if (!items.length) return []
    return shouldCompactRecords
      ? [paragraph(items.map((item) => `• ${item}`).join('\n'))]
      : items.map(bullet)
  }

  const decisionBlocks = recordBlocks(record.결정사항)
  const discussionBlocks = recordBlocks(record.논의_기록)

  const children: object[] = [
    paragraph('이 회의록은 자동 생성 후 사람이 검토·승인한 기록입니다.'),
    heading('참석자'),
    paragraph(record.참석자.join(', ')),
    heading('결정사항'),
    ...decisionBlocks,
    heading('액션 아이템'),
    ...actionTable,
    heading('논의 기록'),
    ...discussionBlocks,
    toggle,
  ]

  return {
    parent: { database_id: databaseId },
    properties: {
      // 실제 1.회의록 DB의 필수 속성만 쓴다. 참석자·안건은 본문에 보존한다.
      '회의명': { title: [{ type: 'text', text: { content: `${record.날짜} 회의록` } }] },
      '날짜': { date: { start: record.날짜 } },
      '내용': { rich_text: splitRichText(record.핵심_요약) },
    },
    children,
  }
}

export function buildActionItemPage(item: ActionItem, databaseId: string, meetingPageId: string) {
  return {
    parent: { database_id: databaseId },
    properties: {
      '할 일': { title: [{ type: 'text', text: { content: item.할일 } }] },
      '담당자': { multi_select: [{ name: item.담당자 || UNSET }] },
      '기한': { date: item.기한 && item.기한 !== UNSET ? { start: item.기한 } : null },
      '완료': { checkbox: false },
      '회의': { relation: [{ id: meetingPageId }] },
      '출처': { select: { name: 'AI추출' } },
    },
  }
}
