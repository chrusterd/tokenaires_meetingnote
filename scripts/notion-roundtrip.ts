import 'dotenv/config'
import dummy from '../fixtures/dummy-meeting.json'
import type { MeetingRecord } from '../shared/contract'
import { createMeeting, notionFetch } from '../netlify/functions/_lib/notion'

type NotionChildrenQuery = {
  results?: unknown[]
}

const record = dummy as MeetingRecord
const result = await createMeeting(record)

console.log('생성됨:', result.pageUrl)

const children = await notionFetch(`/blocks/${result.pageId}/children`) as NotionChildrenQuery
const actionTableExists = (children.results ?? []).some((block) =>
  typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'table',
)
console.log('본문 액션 아이템 표:', actionTableExists ? '확인됨' : '없음')

if (!actionTableExists) {
  console.error('본문 액션 아이템 표를 찾지 못했습니다')
  process.exitCode = 1
} else {
  console.log('왕복 성공')
}
