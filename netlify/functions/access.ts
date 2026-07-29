import type { Config } from '@netlify/functions'
import { requireSitePassword } from './_lib/access'

export default async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const denied = requireSitePassword(request)
  if (denied) return denied
  return Response.json({ ok: true })
}

export const config: Config = { path: '/api/access' }
