import type { Config } from '@netlify/functions'
import { validateMeetingRecord } from '../../shared/contract'
import { parseModelResponse, SYSTEM_PROMPT } from './_lib/structure-prompt'
import { requireSitePassword } from './_lib/access'

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
// json_schema를 지원하는 Groq 모델은 gpt-oss 계열뿐이다.
const GROQ_MODEL = 'openai/gpt-oss-120b'
const MAX_ATTEMPTS = 3
// Netlify 동기 함수는 10초에 잘린다. 한도 직전 크기의 전사문이 약 4.4초 걸리므로,
// 이만큼 이미 썼다면 다시 부를 시간이 없다고 보고 재시도를 멈춘다.
const RETRY_BUDGET_MS = 4000

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

/** 전사문이 분당 토큰 한도를 넘은 경우. 같은 크기로 다시 보내도 소용없으니 재시도하지 않는다. */
class TranscriptTooLongError extends Error {}

// OpenAI json_schema strict 규칙: 모든 키가 required이고 additionalProperties가 false여야 한다.
const MEETING_STRUCTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    제목: { type: 'string', description: '회의 핵심 내용을 10~15자 내외로 압축한 짧은 제목. 명사구로 작성.' },
    핵심_요약: { type: 'string', description: '회의 전체의 핵심을 3줄 이내로 요약한 문자열' },
    안건_태그: {
      type: 'array',
      items: { type: 'string', enum: ['기획', '개발', '디자인', '기타'] },
      description: '회의에서 다룬 안건 태그',
    },
    결정사항: { type: 'array', items: { type: 'string' }, description: '확정된 결정만 담은 목록' },
    액션아이템: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          할일: { type: 'string' },
          담당자: { type: 'string', description: '명시되지 않았으면 미정' },
          기한: { type: 'string', description: 'YYYY-MM-DD 또는 미정' },
          유형: { type: 'string', enum: ['개인 일정', '팀 일정', '다음 계획'] },
          상태: { type: 'string', enum: ['진행'] },
        },
        required: ['할일', '담당자', '기한', '유형', '상태'],
      },
      description: '회의에서 명시된 실행 항목',
    },
    논의_기록: { type: 'array', items: { type: 'string' }, description: '회의에서 논의된 모든 주제와 근거를 안건별로 보존한 기록' },
  },
  required: ['제목', '핵심_요약', '안건_태그', '결정사항', '액션아이템', '논의_기록'],
} as const

async function callGroq(text: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) throw new Error('GROQ_API_KEY 환경 변수가 설정되지 않았습니다')

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'meeting_record', strict: true, schema: MEETING_STRUCTURE_SCHEMA },
      },
    }),
  })

  const body = await response.json() as GroqResponse
  if (response.status === 413) throw new TranscriptTooLongError(body.error?.message ?? '')
  if (!response.ok) throw new Error(`Groq ${response.status}: ${body.error?.message ?? '알 수 없는 오류'}`)

  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Groq 응답에 구조화 결과가 없습니다')
  }
  return content
}

/** Groq의 413 본문에서 "Limit 8000, Requested 8038"을 뽑아 사람이 읽을 안내로 바꾼다. */
function tooLongMessage(detail: string): string {
  const limit = detail.match(/Limit (\d+)/)?.[1]
  const requested = detail.match(/Requested (\d+)/)?.[1]
  const numbers = limit && requested ? ` (${requested}토큰 / 한도 ${limit}토큰)` : ''
  return `전사문이 길어 한 번에 정리할 수 없습니다${numbers}. `
    + '지금 요금제에서는 25분 안팎의 회의까지 가능합니다. 회의를 나눠서 올리거나 Groq 요금제를 올려 주세요.'
}

export default async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const denied = requireSitePassword(request)
  if (denied) return denied

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return Response.json({ error: 'JSON 본문이 필요합니다' }, { status: 400 })
  }

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return Response.json({ error: '객체 JSON 본문이 필요합니다' }, { status: 400 })
  }

  const { 텍스트, 날짜, 참석자 } = input as Record<string, unknown>
  if (typeof 텍스트 !== 'string' || !텍스트.trim()) {
    return Response.json({ error: '회의 내용이 비어 있습니다' }, { status: 400 })
  }
  if (typeof 날짜 !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(날짜)) {
    return Response.json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 })
  }
  if (참석자 !== undefined && !Array.isArray(참석자)) {
    return Response.json({ error: '참석자는 배열이어야 합니다' }, { status: 400 })
  }

  let lastRaw = ''
  let lastValidationErrors: string[] = []
  let lastError: Error | null = null
  const startedAt = Date.now()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1 && Date.now() - startedAt > RETRY_BUDGET_MS) break
    try {
      lastRaw = await callGroq(텍스트)
      const parsed = parseModelResponse(lastRaw)
      const modelRecord = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
      const candidate = {
        날짜,
        참석자: 참석자 ?? [],
        안건_태그: modelRecord.안건_태그 ?? [],
        제목: modelRecord.제목 ?? '',
        핵심_요약: modelRecord.핵심_요약 ?? '',
        결정사항: modelRecord.결정사항 ?? [],
        액션아이템: modelRecord.액션아이템 ?? [],
        논의_기록: modelRecord.논의_기록 ?? modelRecord.논의_요약 ?? [],
        전사문: 텍스트,
      }

      const validated = validateMeetingRecord(candidate)
      if (validated.ok) return Response.json(validated.value)
      lastValidationErrors = validated.errors
    } catch (error) {
      // 길이 초과는 같은 전사문을 다시 보내도 결과가 같다. 바로 안내하고 끝낸다.
      if (error instanceof TranscriptTooLongError) {
        return Response.json({ error: tooLongMessage(error.message) }, { status: 413 })
      }
      lastError = error as Error
    }
  }

  // 시간 예산 때문에 중간에 멈춘 경우도 있으므로, 마지막 실패 원인으로 응답을 고른다.
  if (lastError) {
    return Response.json({ error: lastError.message, raw: lastRaw }, { status: 502 })
  }

  return Response.json(
    { error: '구조화 결과가 계약을 만족하지 않습니다', details: lastValidationErrors, raw: lastRaw },
    { status: 422 },
  )
}

export const config: Config = { path: '/api/structure' }
