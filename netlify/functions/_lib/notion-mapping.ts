import type { MeetingRecord, ActionItem } from '../../../shared/contract'
import { UNSET } from '../../../shared/contract'

const RICH_TEXT_LIMIT = 2000
const MAX_CHILDREN = 100

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

export function buildMeetingPage(record: MeetingRecord, databaseId: string) {
  // 전사문은 문단당 2000자씩 쪼개고, 토글의 자식으로 넣는다.
  const 전사문_문단 = record.전사문
    ? record.전사문.match(/[\s\S]{1,2000}/g)!.map(paragraph)
    : [paragraph('(전사문 없음)')]

  const children: object[] = [
    paragraph('이 회의록은 자동 생성 후 사람이 검토·승인한 기록입니다.'),
    heading('결정사항'),
    ...record.결정사항.map(bullet),
    heading('논의 내용 요약'),
    ...record.논의_요약.map(bullet),
    {
      object: 'block', type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: '전사 전문' } }],
        children: 전사문_문단.slice(0, MAX_CHILDREN),
      },
    },
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
    children: children.slice(0, MAX_CHILDREN),
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
