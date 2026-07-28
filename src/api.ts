import type { ActionItem, MeetingRecord } from '../shared/contract'

type ApiError = { error?: unknown }

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { error: text }
  }
}

function errorMessage(data: unknown, status: number) {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const error = (data as ApiError).error
    if (typeof error === 'string') return error
  }
  return `요청 실패 (${status})`
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('API가 JSON 대신 페이지를 반환했습니다. Netlify 함수 경로 설정을 확인하세요.')
  }
  return data as T
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path)
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('API가 JSON 대신 페이지를 반환했습니다. Netlify 함수 경로 설정을 확인하세요.')
  }
  return data as T
}

export const structure = (input: { 텍스트: string; 날짜: string; 참석자: string[] }) =>
  post<MeetingRecord>('/api/structure', input)

export const createNotionPage = (record: MeetingRecord, pageId?: string) =>
  post<{ pageId: string; pageUrl: string; failedItems: ActionItem[] }>(
    '/api/notion-create',
    pageId ? { ...record, pageId } : record,
  )

export type DashboardItem = {
  id: string
  할일: string
  담당자: string[]
  기한: string | null
  완료: boolean
}

export async function fetchActionItems(): Promise<DashboardItem[]> {
  const response = await get<{ items: DashboardItem[] }>('/api/notion-query')
  if (!Array.isArray(response.items)) throw new Error('액션 아이템 응답 형식이 올바르지 않습니다')
  return response.items
}

export const toggleActionItem = (pageId: string, 완료: boolean) =>
  post<{ ok: true }>('/api/notion-toggle', { pageId, 완료 })
