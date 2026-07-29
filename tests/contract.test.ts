import { describe, it, expect } from 'vitest'
import { validateMeetingRecord, EMPTY_RECORD, shortDate } from '../shared/contract'
import dummy from '../fixtures/dummy-meeting.json'

describe('validateMeetingRecord', () => {
  it('더미 픽스처를 통과시킨다', () => {
    const result = validateMeetingRecord(dummy)
    expect(result.ok).toBe(true)
  })

  it('빈 레코드를 통과시킨다', () => {
    expect(validateMeetingRecord(EMPTY_RECORD).ok).toBe(true)
  })

  it('기존 논의_요약 레코드를 논의_기록으로 읽는다', () => {
    const { 논의_기록: _논의기록, ...legacy } = dummy as Record<string, unknown>
    const result = validateMeetingRecord({ ...legacy, 논의_요약: ['이전 회의 논의'] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.논의_기록).toEqual(['이전 회의 논의'])
  })

  it('필수 키가 없으면 실패하고 어떤 키인지 알려준다', () => {
    const { 결정사항: _결정사항, ...missing } = dummy as Record<string, unknown>
    const result = validateMeetingRecord(missing)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('결정사항')
  })

  it('액션아이템의 담당자가 비어 있으면 미정으로 채운다', () => {
    const input = { ...dummy, 액션아이템: [{ 할일: '자료 정리', 담당자: '', 기한: '' }] }
    const result = validateMeetingRecord(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.액션아이템[0].담당자).toBe('미정')
      expect(result.value.액션아이템[0].기한).toBe('미정')
      expect(result.value.액션아이템[0].유형).toBe('팀 일정')
      expect(result.value.액션아이템[0].상태).toBe('진행')
    }
  })

  it('날짜가 YYYY-MM-DD 형식이 아니면 실패한다', () => {
    const result = validateMeetingRecord({ ...dummy, 날짜: '2026/07/28' })
    expect(result.ok).toBe(false)
  })

  it('유효한 액션아이템 값은 그대로 통과한다', () => {
    const result = validateMeetingRecord(dummy)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.액션아이템[0].할일).toBe('Notion 액션아이템 DB 신설')
      expect(result.value.액션아이템[0].담당자).toBe('소정')
      expect(result.value.액션아이템[0].기한).toBe('2026-08-04')
      expect(result.value.액션아이템[0].유형).toBe('개인 일정')
      expect(result.value.액션아이템[0].상태).toBe('진행')
      expect(result.value.참석자).toEqual(['소정', '하영', '해냄', '유진'])
    }
  })

  it('액션아이템 원소가 객체가 아니면 실패하고 인덱스를 알려준다', () => {
    const input = { ...dummy, 액션아이템: ['oops'] }
    const result = validateMeetingRecord(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('액션아이템[0]')
  })

  it('액션아이템의 할일이 없으면 실패하고 인덱스를 알려준다', () => {
    const input = { ...dummy, 액션아이템: [{ 담당자: '소정', 기한: '2026-08-04' }] }
    const result = validateMeetingRecord(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('액션아이템[0]')
  })

  it('참석자 배열에 문자열이 아닌 원소가 있으면 실패한다', () => {
    const result = validateMeetingRecord({ ...dummy, 참석자: [{ a: 1 }] })
    expect(result.ok).toBe(false)
  })

  it('상태가 없으면 완료로 채운다', () => {
    const { 상태: _상태, ...withoutStatus } = dummy as Record<string, unknown>
    const result = validateMeetingRecord(withoutStatus)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.상태).toBe('완료')
  })

  it('상태가 유효하지 않은 값이면 완료로 채운다', () => {
    const result = validateMeetingRecord({ ...dummy, 상태: '보류' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.상태).toBe('완료')
  })

  it('상태가 유효한 값이면 그대로 통과한다', () => {
    const result = validateMeetingRecord({ ...dummy, 상태: '진행 중' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.상태).toBe('진행 중')
  })
})

describe('shortDate', () => {
  it('"YYYY-MM-DD"를 앞자리 0 없는 "M/D"로 줄인다', () => {
    expect(shortDate('2026-07-29')).toBe('7/29')
    expect(shortDate('2026-01-05')).toBe('1/5')
  })

  it('형식이 맞지 않으면 원본을 그대로 돌려준다', () => {
    expect(shortDate('2026/07/29')).toBe('2026/07/29')
  })
})
