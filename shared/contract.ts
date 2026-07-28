export interface ActionItem {
  할일: string
  담당자: string   // 미상이면 "미정"
  기한: string     // "YYYY-MM-DD" 또는 "미정"
}

export interface MeetingRecord {
  날짜: string     // "YYYY-MM-DD"
  참석자: string[]
  안건_태그: string[]
  핵심_요약: string
  결정사항: string[]
  액션아이템: ActionItem[]
  논의_요약: string[]
  전사문: string
}

export const UNSET = '미정'

export const EMPTY_RECORD: MeetingRecord = {
  날짜: new Date().toISOString().slice(0, 10),
  참석자: [],
  안건_태그: [],
  핵심_요약: '',
  결정사항: [],
  액션아이템: [],
  논의_요약: [],
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

  const stringArray = (key: keyof MeetingRecord): string[] => {
    const v = raw[key]
    if (v === undefined) { errors.push(`${key} 누락`); return [] }
    if (!Array.isArray(v)) { errors.push(`${key}는 배열이어야 합니다`); return [] }
    return v.map(String)
  }

  const 날짜 = typeof raw.날짜 === 'string' ? raw.날짜 : ''
  if (!날짜) errors.push('날짜 누락')
  else if (!DATE_RE.test(날짜)) errors.push('날짜는 YYYY-MM-DD 형식이어야 합니다')

  const 참석자 = stringArray('참석자')
  const 안건_태그 = stringArray('안건_태그')
  const 결정사항 = stringArray('결정사항')
  const 논의_요약 = stringArray('논의_요약')

  if (typeof raw.핵심_요약 !== 'string') errors.push('핵심_요약 누락')
  if (typeof raw.전사문 !== 'string') errors.push('전사문 누락')

  let 액션아이템: ActionItem[] = []
  if (!Array.isArray(raw.액션아이템)) {
    errors.push('액션아이템 누락')
  } else {
    액션아이템 = raw.액션아이템.map((item) => {
      const o = (item ?? {}) as Record<string, unknown>
      const 기한 = typeof o.기한 === 'string' ? o.기한.trim() : ''
      return {
        할일: typeof o.할일 === 'string' ? o.할일 : '',
        담당자: typeof o.담당자 === 'string' && o.담당자.trim() ? o.담당자.trim() : UNSET,
        기한: 기한 && DATE_RE.test(기한) ? 기한 : UNSET,
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
      핵심_요약: raw.핵심_요약 as string,
      결정사항,
      액션아이템,
      논의_요약,
      전사문: raw.전사문 as string,
    },
  }
}
