import { describe, it, expect } from 'vitest'
import { validateMeetingRecord, EMPTY_RECORD } from '../shared/contract'
import dummy from '../fixtures/dummy-meeting.json'

describe('validateMeetingRecord', () => {
  it('더미 픽스처를 통과시킨다', () => {
    const result = validateMeetingRecord(dummy)
    expect(result.ok).toBe(true)
  })

  it('빈 레코드를 통과시킨다', () => {
    expect(validateMeetingRecord(EMPTY_RECORD).ok).toBe(true)
  })

  it('필수 키가 없으면 실패하고 어떤 키인지 알려준다', () => {
    const { 결정사항, ...missing } = dummy as Record<string, unknown>
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
    }
  })

  it('날짜가 YYYY-MM-DD 형식이 아니면 실패한다', () => {
    const result = validateMeetingRecord({ ...dummy, 날짜: '2026/07/28' })
    expect(result.ok).toBe(false)
  })
})
