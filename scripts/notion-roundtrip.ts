import 'dotenv/config'
import dummy from '../fixtures/dummy-meeting.json'
import type { MeetingRecord } from '../shared/contract'
import { createMeeting, notionFetch } from '../netlify/functions/_lib/notion'

type NotionDatabaseQuery = {
  results?: unknown[]
}

const record = dummy as MeetingRecord
const result = await createMeeting(record)

console.log('생성됨:', result.pageUrl)
console.log('실패한 액션아이템:', result.failedItems.length)

const actionsDatabaseId = process.env.NOTION_ACTIONS_DB
if (!actionsDatabaseId) throw new Error('NOTION_ACTIONS_DB 환경 변수가 설정되지 않았습니다')

const linked = await notionFetch(`/databases/${actionsDatabaseId}/query`, {
  method: 'POST',
  body: JSON.stringify({
    filter: { property: '회의', relation: { contains: result.pageId } },
  }),
}) as NotionDatabaseQuery

const linkedCount = linked.results?.length ?? 0
console.log('relation으로 다시 읽은 액션아이템 수:', linkedCount)

if (result.failedItems.length > 0 || linkedCount !== record.액션아이템.length) {
  console.error('불일치 — 생성/연결한 액션아이템 수가 다릅니다')
  process.exitCode = 1
} else {
  console.log('왕복 성공')
}
