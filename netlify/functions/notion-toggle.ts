import type { Config } from '@netlify/functions'
import { notionFetch } from './_lib/notion'
import { requireSitePassword } from './_lib/access'

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

  const { pageId, 완료 } = payload as Record<string, unknown>
  if (typeof pageId !== 'string' || !pageId.trim()) {
    return Response.json({ error: 'pageId가 필요합니다' }, { status: 400 })
  }
  if (typeof 완료 !== 'boolean') {
    return Response.json({ error: '완료는 boolean이어야 합니다' }, { status: 400 })
  }

  try {
    await notionFetch(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: { 완료: { checkbox: 완료 } } }),
    })
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}

export const config: Config = { path: '/api/notion-toggle' }
