import type { Config } from '@netlify/functions'
import { validateMeetingRecord } from '../../shared/contract'
import { parseModelResponse, SYSTEM_PROMPT } from './_lib/structure-prompt'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const GEMINI_MODEL = 'gemini-3.6-flash'
const MAX_ATTEMPTS = 3

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string }
}

const MEETING_STRUCTURE_SCHEMA = {
  type: 'object',
  properties: {
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
        properties: {
          할일: { type: 'string' },
          담당자: { type: 'string', description: '명시되지 않았으면 미정' },
          기한: { type: 'string', description: 'YYYY-MM-DD 또는 미정' },
        },
        required: ['할일', '담당자', '기한'],
      },
      description: '회의에서 명시된 실행 항목',
    },
    논의_요약: { type: 'array', items: { type: 'string' }, description: '결론이 나지 않았거나 보류한 논의' },
  },
  required: ['핵심_요약', '안건_태그', '결정사항', '액션아이템', '논의_요약'],
} as const

async function callGemini(text: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다')

  const response = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        { role: 'user', parts: [{ text }] },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: MEETING_STRUCTURE_SCHEMA,
      },
    }),
  })

  const body = await response.json() as GeminiResponse
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${body.error?.message ?? '알 수 없는 오류'}`)

  const content = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Gemini 응답에 구조화 결과가 없습니다')
  }
  return content
}

export default async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

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
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      lastRaw = await callGemini(텍스트)
      const parsed = parseModelResponse(lastRaw)
      const modelRecord = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
      const candidate = {
        날짜,
        참석자: 참석자 ?? [],
        안건_태그: modelRecord.안건_태그 ?? [],
        핵심_요약: modelRecord.핵심_요약 ?? '',
        결정사항: modelRecord.결정사항 ?? [],
        액션아이템: modelRecord.액션아이템 ?? [],
        논의_요약: modelRecord.논의_요약 ?? [],
        전사문: 텍스트,
      }

      const validated = validateMeetingRecord(candidate)
      if (validated.ok) return Response.json(validated.value)
      lastValidationErrors = validated.errors
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        return Response.json({ error: (error as Error).message, raw: lastRaw }, { status: 502 })
      }
    }
  }

  return Response.json(
    { error: '구조화 결과가 계약을 만족하지 않습니다', details: lastValidationErrors, raw: lastRaw },
    { status: 422 },
  )
}

export const config: Config = { path: '/api/structure' }
