import type { Config } from '@netlify/functions'
import { validateMeetingRecord } from '../../shared/contract'
import { parseModelResponse, SYSTEM_PROMPT } from './_lib/structure-prompt'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'
const MAX_ATTEMPTS = 3

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

async function callGroq(text: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) throw new Error('GROQ_API_KEY 환경 변수가 설정되지 않았습니다')

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  })

  const body = await response.json() as GroqResponse
  if (!response.ok) throw new Error(`Groq ${response.status}: ${body.error?.message ?? '알 수 없는 오류'}`)

  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Groq 응답에 구조화 결과가 없습니다')
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
      lastRaw = await callGroq(텍스트)
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
