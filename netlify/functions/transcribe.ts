import type { Config } from '@netlify/functions'
import { requireSitePassword } from './_lib/access'

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
// turbo는 120초 조각을 약 2초에 처리한다 — Netlify 동기 함수 10초 제한에 여유가 크다.
// whisper-large-v3는 같은 조각에 약 5초로, 정확도를 더 원할 때만 바꾼다.
const GROQ_MODEL = 'whisper-large-v3-turbo'

// Netlify 동기 함수 요청 본문 상한(약 6MB)보다 조금 낮게 잡는다.
const MAX_AUDIO_BYTES = 5.5 * 1024 * 1024

type GroqResponse = {
  text?: string
  error?: { message?: string }
}

export default async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const denied = requireSitePassword(request)
  if (denied) return denied

  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY 환경 변수가 설정되지 않았습니다' }, { status: 500 })
  }

  const audio = await request.arrayBuffer()
  if (audio.byteLength === 0) {
    return Response.json({ error: '오디오 본문이 비어 있습니다' }, { status: 400 })
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: '오디오 조각이 너무 큽니다' }, { status: 413 })
  }

  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'chunk.wav')
  form.append('model', GROQ_MODEL)
  form.append('language', 'ko')
  form.append('response_format', 'json')

  const response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  const body = await response.json() as GroqResponse
  if (!response.ok) {
    return Response.json(
      { error: `Groq ${response.status}: ${body.error?.message ?? '알 수 없는 오류'}` },
      { status: 502 },
    )
  }

  // 무음 구간은 빈 텍스트가 정상이므로 오류로 다루지 않는다.
  return Response.json({ text: (body.text ?? '').trim() })
}

export const config: Config = { path: '/api/transcribe' }
