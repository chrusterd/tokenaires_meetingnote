import { describe, it, expect } from 'vitest'
import { buildMeetingPage, buildActionItemPage, splitRichText } from '../netlify/functions/_lib/notion-mapping'
import dummy from '../fixtures/dummy-meeting.json'
import type { MeetingRecord } from '../shared/contract'

const record = dummy as MeetingRecord

describe('splitRichText', () => {
  it('2000자 이하는 한 조각', () => {
    expect(splitRichText('짧은 글')).toHaveLength(1)
  })

  it('2000자를 넘으면 2000자 단위로 쪼갠다', () => {
    const chunks = splitRichText('가'.repeat(4500))
    expect(chunks).toHaveLength(3)
    expect(chunks[0].text.content.length).toBe(2000)
    expect(chunks[2].text.content.length).toBe(500)
  })
})

describe('buildMeetingPage', () => {
  const page = buildMeetingPage(record, 'DB1') as any

  it('제목을 "YYYY-MM-DD 회의록" 형식으로 만든다', () => {
    expect(page.properties['제목'].title[0].text.content).toBe('2026-07-28 회의록')
  })

  it('진행 상태는 rollup이므로 properties에 넣지 않는다', () => {
    expect(page.properties['진행 상태']).toBeUndefined()
  })

  it('액션아이템은 본문에 넣지 않는다 (DB2로 감)', () => {
    const text = JSON.stringify(page.children)
    expect(text).not.toContain('Notion 액션아이템 DB 신설')
  })

  it('전사문을 토글 블록 안에 넣는다', () => {
    const toggle = page.children.find((b: any) => b.type === 'toggle')
    expect(toggle).toBeDefined()
    expect(JSON.stringify(toggle)).toContain('회의록 자동화 어디까지')
  })

  it('children이 100블록을 넘지 않는다', () => {
    expect(page.children.length).toBeLessThanOrEqual(100)
  })

  it('2000자를 넘는 전사문도 한 블록의 rich_text 런에 걸쳐 전부 보존된다', () => {
    const bigText = '가'.repeat(5000)
    const bigRecord: MeetingRecord = { ...record, 전사문: bigText }
    const bigPage = buildMeetingPage(bigRecord, 'DB1') as any
    const toggle = bigPage.children.find((b: any) => b.type === 'toggle')
    // 블록 하나에 런 3개가 들어가야 한다 (블록 3개로 쪼개는 게 아니라)
    expect(toggle.toggle.children).toHaveLength(1)
    const runs = toggle.toggle.children.flatMap((b: any) => b.paragraph.rich_text)
    const joined = runs.map((r: any) => r.text.content).join('')
    expect(joined).toBe(bigText)
  })

  it('20만자를 넘으면 잘리되 잘렸다는 표시 블록을 남긴다', () => {
    const huge = '가'.repeat(200_001) // 101 런 > RICH_TEXT_RUNS_LIMIT(100)
    const hugeRecord: MeetingRecord = { ...record, 전사문: huge }
    const hugePage = buildMeetingPage(hugeRecord, 'DB1') as any
    const toggle = hugePage.children.find((b: any) => b.type === 'toggle')
    expect(toggle.toggle.children).toHaveLength(2)
    expect(toggle.toggle.children[0].paragraph.rich_text).toHaveLength(100)
    expect(JSON.stringify(toggle.toggle.children[1])).toContain('원본 길이')
  })

  it('결정사항/논의_요약이 블록 예산을 넘어도 전사문 토글은 살아남는다', () => {
    const bigRecord: MeetingRecord = {
      ...record,
      결정사항: Array.from({ length: 60 }, (_, i) => `결정 ${i}`),
      논의_요약: Array.from({ length: 60 }, (_, i) => `논의 ${i}`),
    }
    const bigPage = buildMeetingPage(bigRecord, 'DB1') as any
    const toggle = bigPage.children.find((b: any) => b.type === 'toggle')
    expect(toggle).toBeDefined()
    expect(JSON.stringify(toggle)).toContain('회의록 자동화 어디까지')
  })

  it('블록 예산이 실제로 걸리는 경우에도 children이 100을 넘지 않는다', () => {
    const bigRecord: MeetingRecord = {
      ...record,
      결정사항: Array.from({ length: 60 }, (_, i) => `결정 ${i}`),
      논의_요약: Array.from({ length: 60 }, (_, i) => `논의 ${i}`),
    }
    const bigPage = buildMeetingPage(bigRecord, 'DB1') as any
    expect(bigPage.children.length).toBeLessThanOrEqual(100)
  })
})

describe('buildActionItemPage', () => {
  it('기한이 미정이면 date를 null로 보낸다', () => {
    const p = buildActionItemPage(
      { 할일: 'x', 담당자: '미정', 기한: '미정' }, 'DB2', 'PAGE',
    ) as any
    expect(p.properties['기한'].date).toBeNull()
  })

  it('기한이 있으면 date.start에 넣는다', () => {
    const p = buildActionItemPage(
      { 할일: 'x', 담당자: '소정', 기한: '2026-08-04' }, 'DB2', 'PAGE',
    ) as any
    expect(p.properties['기한'].date.start).toBe('2026-08-04')
  })

  it('회의 relation을 연결하고 출처를 AI추출로 둔다', () => {
    const p = buildActionItemPage(
      { 할일: 'x', 담당자: '소정', 기한: '미정' }, 'DB2', 'PAGE',
    ) as any
    expect(p.properties['회의'].relation[0].id).toBe('PAGE')
    expect(p.properties['출처'].select.name).toBe('AI추출')
  })
})
