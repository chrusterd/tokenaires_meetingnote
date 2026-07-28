import type { MeetingRecord, ActionItem } from '../../../shared/contract'
import { UNSET } from '../../../shared/contract'

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

  // intro 문단, 헤딩 2개, 전사문 토글은 항상 포함되는 고정 블록이다.
  // 남는 예산만 결정사항/논의_요약 불릿에 쓴다 — 전사문 토글이 밀려나지 않도록.
  const FIXED_BLOCKS = 4
  const bulletBudget = Math.max(0, MAX_CHILDREN - FIXED_BLOCKS)

  const decisionBullets = record.결정사항.map(bullet).slice(0, bulletBudget)
  const discussionBullets = record.논의_요약
    .map(bullet)
    .slice(0, Math.max(0, bulletBudget - decisionBullets.length))

  const children: object[] = [
    paragraph('이 회의록은 자동 생성 후 사람이 검토·승인한 기록입니다.'),
    heading('결정사항'),
    ...decisionBullets,
    heading('논의 내용 요약'),
    ...discussionBullets,
    toggle,
  ]

  return {
    parent: { database_id: databaseId },
    properties: {
      // '진행 상태'는 rollup이라 쓰기 불가 — 넣지 않는다.
      '제목': { title: [{ type: 'text', text: { content: `${record.날짜} 회의록` } }] },
      '날짜': { date: { start: record.날짜 } },
      '참석자': { multi_select: record.참석자.map((name) => ({ name })) },
      '안건 태그': { multi_select: record.안건_태그.map((name) => ({ name })) },
      '핵심 요약': { rich_text: splitRichText(record.핵심_요약) },
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
