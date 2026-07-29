import { describe, it, expect } from 'vitest'
import { buildMeetingPage, buildActionItemPage, splitRichText } from '../netlify/functions/_lib/notion-mapping'
import dummy from '../fixtures/dummy-meeting.json'
import type { MeetingRecord } from '../shared/contract'

const record = dummy as MeetingRecord
const SAVED_AT = '2026-07-28T10:00:00.000Z'

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
  const page = buildMeetingPage(record, 'DB1', SAVED_AT) as any

  it('회의명을 "[M/D] 제목" 형식으로 만든다', () => {
    expect(page.properties['회의명'].title[0].text.content).toBe('[7/28] 회의록 자동화 범위 확정')
  })

  it('제목이 비어 있으면 핵심_요약 앞부분으로 대신한다', () => {
    const noTitlePage = buildMeetingPage({ ...record, 제목: '' }, 'DB1', SAVED_AT) as any
    expect(noTitlePage.properties['회의명'].title[0].text.content).toBe(`[7/28] ${record.핵심_요약.slice(0, 30)}`)
  })

  it('날짜 속성에 저장(승인) 시각을 그대로 넣는다', () => {
    expect(page.properties['날짜'].date.start).toBe(SAVED_AT)
  })

  it('참여자를 multi_select 속성으로 노출한다', () => {
    expect(page.properties['참여자'].multi_select.map((o: any) => o.name)).toEqual(['소정', '하영', '해냄', '유진'])
  })

  it('상태를 select 속성으로 넣는다', () => {
    expect(page.properties['상태'].select.name).toBe('완료')
  })

  it('참석자를 본문 맨 위 섹션에 넣는다', () => {
    const idx = page.children.findIndex(
      (b: any) => b.type === 'heading_2' && b.heading_2.rich_text[0].text.content === '참석자',
    )
    expect(idx).toBeGreaterThan(-1)
    expect(page.children[idx + 1].paragraph.rich_text[0].text.content).toBe('소정, 하영, 해냄, 유진')
  })

  it('액션아이템을 본문 표로도 넣는다 (원본은 여전히 DB2)', () => {
    const table = page.children.find((b: any) => b.type === 'table')
    expect(table.table.has_column_header).toBe(true)
    const rows = table.table.children
    expect(rows[0].table_row.cells.map((c: any) => c[0].text.content))
      .toEqual(['구분', '담당자', '할 일', '기한', '상태'])
    expect(rows[1].table_row.cells.map((c: any) => c[0].text.content))
      .toEqual(['개인 일정', '소정', 'Notion 액션아이템 DB 신설', '2026-08-04', '진행'])
  })

  it('모든 행의 셀 개수가 table_width와 같다', () => {
    const table = page.children.find((b: any) => b.type === 'table')
    for (const row of table.table.children) {
      expect(row.table_row.cells).toHaveLength(table.table.table_width)
    }
  })

  it('액션아이템이 없으면 표 대신 안내 문단을 넣는다', () => {
    const emptyPage = buildMeetingPage({ ...record, 액션아이템: [] }, 'DB1', SAVED_AT) as any
    expect(emptyPage.children.find((b: any) => b.type === 'table')).toBeUndefined()
    expect(JSON.stringify(emptyPage.children)).toContain('(액션 아이템 없음)')
  })

  it('전사문을 토글 블록 안에 넣는다', () => {
    const toggle = page.children.find((b: any) => b.type === 'toggle')
    expect(toggle).toBeDefined()
    expect(JSON.stringify(toggle)).toContain('회의록 자동화 어디까지')
  })

  it('children이 100블록을 넘지 않는다', () => {
    expect(page.children.length).toBeLessThanOrEqual(100)
  })

  it('논의 기록을 Notion 본문의 같은 이름 섹션에 넣는다', () => {
    const headingIndex = page.children.findIndex(
      (block: any) => block.type === 'heading_2' && block.heading_2.rich_text[0].text.content === '논의 기록',
    )
    expect(headingIndex).toBeGreaterThan(-1)
    expect(JSON.stringify(page.children[headingIndex + 1])).toContain('오디오 업로드 용량 제한 문제')
  })

  it('2000자를 넘는 전사문도 한 블록의 rich_text 런에 걸쳐 전부 보존된다', () => {
    const bigText = '가'.repeat(5000)
    const bigRecord: MeetingRecord = { ...record, 전사문: bigText }
    const bigPage = buildMeetingPage(bigRecord, 'DB1', SAVED_AT) as any
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
    const hugePage = buildMeetingPage(hugeRecord, 'DB1', SAVED_AT) as any
    const toggle = hugePage.children.find((b: any) => b.type === 'toggle')
    expect(toggle.toggle.children).toHaveLength(2)
    expect(toggle.toggle.children[0].paragraph.rich_text).toHaveLength(100)
    expect(JSON.stringify(toggle.toggle.children[1])).toContain('원본 길이')
  })

  it('결정사항/논의 기록이 블록 예산을 넘어도 전사문 토글은 살아남는다', () => {
    const bigRecord: MeetingRecord = {
      ...record,
      결정사항: Array.from({ length: 60 }, (_, i) => `결정 ${i}`),
      논의_기록: Array.from({ length: 60 }, (_, i) => `논의 ${i}`),
    }
    const bigPage = buildMeetingPage(bigRecord, 'DB1', SAVED_AT) as any
    const toggle = bigPage.children.find((b: any) => b.type === 'toggle')
    expect(toggle).toBeDefined()
    expect(JSON.stringify(toggle)).toContain('회의록 자동화 어디까지')
  })

  it('블록 예산이 실제로 걸리는 경우에도 children이 100을 넘지 않는다', () => {
    const bigRecord: MeetingRecord = {
      ...record,
      결정사항: Array.from({ length: 60 }, (_, i) => `결정 ${i}`),
      논의_기록: Array.from({ length: 60 }, (_, i) => `논의 ${i}`),
    }
    const bigPage = buildMeetingPage(bigRecord, 'DB1', SAVED_AT) as any
    expect(bigPage.children.length).toBeLessThanOrEqual(100)
    expect(JSON.stringify(bigPage.children)).toContain('논의 59')
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
