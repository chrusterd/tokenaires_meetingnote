import type { Config } from '@netlify/functions'
import { validateMeetingRecord } from '../../shared/contract'
import { requireSitePassword } from './_lib/access'
import { createMeeting } from './_lib/notion'

export default async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const denied = requireSitePassword(request)
  if (denied) return denied

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'JSON 본문이 필요합니다' }, { status: 400 })
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return Response.json({ error: '객체 JSON 본문이 필요합니다' }, { status: 400 })
  }

  // pageId is only accepted for retrying action items on an existing meeting.
  const { pageId, ...record } = payload as Record<string, unknown>
  if (pageId !== undefined && (typeof pageId !== 'string' || !pageId.trim())) {
    return Response.json({ error: 'pageId는 비어 있지 않은 문자열이어야 합니다' }, { status: 400 })
  }

  const parsed = validateMeetingRecord(record)
  if (!parsed.ok) {
    return Response.json({ error: '계약 위반', details: parsed.errors }, { status: 400 })
  }

  try {
    const result = await createMeeting(parsed.value, pageId)
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}

export const config: Config = { path: '/api/notion-create' }
