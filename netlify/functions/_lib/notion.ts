import type { ActionItem, MeetingRecord } from '../../../shared/contract'
import { buildActionItemPage, buildMeetingPage } from './notion-mapping'

// This app deliberately stays on the pre-data-source Notion API contract.
// Database IDs and the payloads in notion-mapping.ts rely on this version.
export const NOTION_VERSION = '2022-06-28'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const RATE_LIMIT_DELAY_MS = 350

type NotionPage = {
  id: string
  url: string
}

type NotionError = {
  message?: string
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function requiredEnvironment(name: 'NOTION_TOKEN' | 'NOTION_MEETINGS_DB' | 'NOTION_ACTIONS_DB') {
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

/**
 * Creates a meeting page and then its linked action-item pages. A retry receives
 * the original meeting page ID, so it never makes a second official record.
 */
export async function createMeeting(
  record: MeetingRecord,
  existingPageId?: string,
): Promise<{ pageId: string; pageUrl: string; failedItems: ActionItem[] }> {
  const meetingsDatabaseId = requiredEnvironment('NOTION_MEETINGS_DB')
  const actionsDatabaseId = requiredEnvironment('NOTION_ACTIONS_DB')

  const page = existingPageId
    ? {
        id: existingPageId,
        url: `https://www.notion.so/${existingPageId.replace(/-/g, '')}`,
      }
    : await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify(buildMeetingPage(record, meetingsDatabaseId)),
      }) as NotionPage

  const failedItems: ActionItem[] = []
  for (const item of record.액션아이템) {
    await sleep(RATE_LIMIT_DELAY_MS)
    try {
      await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify(buildActionItemPage(item, actionsDatabaseId, page.id)),
      })
    } catch {
      // Notion has no transaction support: retain successful items and let the
      // UI retry only the failed ones against the same meeting page.
      failedItems.push(item)
    }
  }

  return { pageId: page.id, pageUrl: page.url, failedItems }
}
