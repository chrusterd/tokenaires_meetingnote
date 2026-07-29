const PASSWORD_HEADER = 'x-site-password'

export function requireSitePassword(request: Request) {
  const expected = process.env.SITE_PASSWORD?.trim()
  if (!expected) {
    return Response.json({ error: '사이트 비밀번호가 설정되지 않았습니다' }, { status: 503 })
  }

  if (request.headers.get(PASSWORD_HEADER) !== expected) {
    return Response.json({ error: '사이트 비밀번호를 확인해 주세요' }, { status: 401 })
  }

  return null
}
