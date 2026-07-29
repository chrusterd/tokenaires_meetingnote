export const SCHEDULE_KINDS = ['개인 일정', '팀 일정', '다음 계획'] as const
export type ScheduleKind = typeof SCHEDULE_KINDS[number]

export const SCHEDULE_STATUSES = ['진행', '완료'] as const
export type ScheduleStatus = typeof SCHEDULE_STATUSES[number]

export const MEETING_STATUSES = ['진행 예정', '진행 중', '완료'] as const
export type MeetingStatus = typeof MEETING_STATUSES[number]

export interface ActionItem {
  // id는 공용 저장소가 부여한다. 모델이 만든 새 회의록에는 아직 없을 수 있다.
  id?: string
  할일: string
  담당자: string   // 미상이면 "미정"
  기한: string     // "YYYY-MM-DD" 또는 "미정"
  유형?: ScheduleKind
  상태?: ScheduleStatus
}

export interface MeetingRecord {
  날짜: string     // "YYYY-MM-DD"
  참석자: string[]
  안건_태그: string[]
  제목: string     // Notion 회의명("[M/D] 제목")에 쓰이는 짧은 요약 제목
  상태: MeetingStatus  // Notion "상태" select 속성. 검토 화면에서 사람이 고른다.
  핵심_요약: string
  결정사항: string[]
  액션아이템: ActionItem[]
  논의_기록: string[]
  전사문: string
}

export const UNSET = '미정'

export function scheduleKindOf(item: Pick<ActionItem, '담당자' | '유형'>): ScheduleKind {
  if (item.유형 && SCHEDULE_KINDS.includes(item.유형)) return item.유형
  return item.담당자 && item.담당자 !== UNSET ? '개인 일정' : '팀 일정'
}

export function scheduleStatusOf(item: Pick<ActionItem, '상태'>): ScheduleStatus {
  return item.상태 === '완료' ? '완료' : '진행'
}

/** "2026-07-29" → "7/29". Notion 회의명("[M/D] 제목")과 그 미리보기에 쓰는 짧은 날짜 표기. */
export function shortDate(날짜: string): string {
  const match = 날짜.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!match) return 날짜
  return `${Number(match[1])}/${Number(match[2])}`
}

export const EMPTY_RECORD: MeetingRecord = {
  날짜: new Date().toISOString().slice(0, 10),
  참석자: [],
  안건_태그: [],
  제목: '',
  상태: '완료',
  핵심_요약: '',
  결정사항: [],
  액션아이템: [],
  논의_기록: [],
  전사문: '',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type ValidationResult =
  | { ok: true; value: MeetingRecord }
  | { ok: false; errors: string[] }

export function validateMeetingRecord(value: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof value !== 'object' || value === null) {
    return { ok: false, errors: ['최상위 값이 객체가 아닙니다'] }
  }
  const raw = value as Record<string, unknown>

  const stringArray = (key: string): string[] => {
    const v = raw[key]
    if (v === undefined) { errors.push(`${key} 누락`); return [] }
    if (!Array.isArray(v)) { errors.push(`${key}는 배열이어야 합니다`); return [] }
    if (v.some((el) => typeof el !== 'string')) {
      errors.push(`${key}는 문자열 배열이어야 합니다`)
      return []
    }
    return v as string[]
  }

  const 날짜 = typeof raw.날짜 === 'string' ? raw.날짜 : ''
  if (!날짜) errors.push('날짜 누락')
  else if (!DATE_RE.test(날짜)) errors.push('날짜는 YYYY-MM-DD 형식이어야 합니다')

  const 참석자 = stringArray('참석자')
  const 안건_태그 = stringArray('안건_태그')
  const 결정사항 = stringArray('결정사항')
  // 기존 회의록의 논의_요약은 읽되, 새 레코드는 논의_기록으로 표준화한다.
  const 논의_기록 = raw.논의_기록 === undefined
    ? stringArray('논의_요약')
    : stringArray('논의_기록')

  const 상태 = typeof raw.상태 === 'string' && MEETING_STATUSES.includes(raw.상태 as MeetingStatus)
    ? raw.상태 as MeetingStatus
    : '완료'

  if (typeof raw.제목 !== 'string') errors.push('제목 누락')
  if (typeof raw.핵심_요약 !== 'string') errors.push('핵심_요약 누락')
  if (typeof raw.전사문 !== 'string') errors.push('전사문 누락')

  let 액션아이템: ActionItem[] = []
  if (!Array.isArray(raw.액션아이템)) {
    errors.push('액션아이템 누락')
  } else {
    액션아이템 = raw.액션아이템.map((item, i) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`액션아이템[${i}]은 객체여야 합니다`)
        return { 할일: '', 담당자: UNSET, 기한: UNSET }
      }
      const o = item as Record<string, unknown>
      const 할일 = typeof o.할일 === 'string' ? o.할일 : ''
      if (!할일.trim()) errors.push(`액션아이템[${i}].할일 누락`)
      const 기한 = typeof o.기한 === 'string' ? o.기한.trim() : ''
      const 담당자 = typeof o.담당자 === 'string' && o.담당자.trim() ? o.담당자.trim() : UNSET
      const 유형 = typeof o.유형 === 'string' && SCHEDULE_KINDS.includes(o.유형 as ScheduleKind)
        ? o.유형 as ScheduleKind
        : scheduleKindOf({ 담당자 })
      const 상태 = typeof o.상태 === 'string' && SCHEDULE_STATUSES.includes(o.상태 as ScheduleStatus)
        ? o.상태 as ScheduleStatus
        : '진행'
      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : undefined
      return {
        ...(id ? { id } : {}),
        할일,
        담당자,
        기한: 기한 && DATE_RE.test(기한) ? 기한 : UNSET,
        유형,
        상태,
      }
    })
  }

  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    value: {
      날짜,
      참석자,
      안건_태그,
      제목: raw.제목 as string,
      상태,
      핵심_요약: raw.핵심_요약 as string,
      결정사항,
      액션아이템,
      논의_기록,
      전사문: raw.전사문 as string,
    },
  }
}
