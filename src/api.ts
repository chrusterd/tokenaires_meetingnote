import type { ActionItem, MeetingRecord } from '../shared/contract'
import type { SavedMeeting } from './meeting-history'

type ApiError = { error?: unknown }
const SITE_PASSWORD_KEY = 'tokenaires-site-password:v1'

function passwordStorage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

export function hasSiteAccess() {
  return Boolean(passwordStorage()?.getItem(SITE_PASSWORD_KEY))
}

function sitePassword() {
  return passwordStorage()?.getItem(SITE_PASSWORD_KEY) ?? ''
}

function accessHeaders(password = sitePassword()): Record<string, string> {
  return password ? { 'x-site-password': password } : {}
}

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
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
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
  const response = await fetch(path, { headers: accessHeaders() })
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('API가 JSON 대신 페이지를 반환했습니다. Netlify 함수 경로 설정을 확인하세요.')
  }
  return data as T
}

async function del<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'DELETE', headers: accessHeaders() })
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('API가 JSON 대신 페이지를 반환했습니다. Netlify 함수 경로 설정을 확인하세요.')
  }
  return data as T
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
    body: JSON.stringify(body),
  })
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('API가 JSON 대신 페이지를 반환했습니다. Netlify 함수 경로 설정을 확인하세요.')
  }
  return data as T
}

export async function unlockSite(password: string) {
  const response = await fetch('/api/access', { method: 'POST', headers: accessHeaders(password) })
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  try {
    passwordStorage()?.setItem(SITE_PASSWORD_KEY, password)
  } catch {
    // The open tab remains usable even when session storage is unavailable.
  }
}

/** WAV 조각 하나를 전사한다. 큰 오디오는 호출하는 쪽에서 잘라 여러 번 부른다. */
export async function transcribeChunk(wav: Uint8Array): Promise<string> {
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', ...accessHeaders() },
    body: wav as BodyInit,
  })
  const data = await readResponse(response)
  if (!response.ok) throw new Error(errorMessage(data, response.status))
  if (typeof data !== 'object' || data === null || typeof (data as { text?: unknown }).text !== 'string') {
    throw new Error('전사 응답 형식이 올바르지 않습니다')
  }
  return (data as { text: string }).text
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

export type MeetingSyncStatus =
  | { ok: true; source: 'notion'; notionCount: number; imported: number; refreshed: number }
  | { ok: false; source: 'cache'; error: string }

export async function fetchSharedMeetings(): Promise<{ meetings: SavedMeeting[]; sync?: MeetingSyncStatus }> {
  const response = await get<{ meetings: SavedMeeting[]; sync?: MeetingSyncStatus }>('/api/meetings')
  if (!Array.isArray(response.meetings)) throw new Error('공용 회의록 응답 형식이 올바르지 않습니다')
  return response
}

export async function saveSharedMeeting(meeting: Omit<SavedMeeting, 'id' | 'savedAt'>): Promise<SavedMeeting> {
  const response = await post<{ meeting: SavedMeeting }>('/api/meetings', meeting)
  if (!response.meeting || typeof response.meeting !== 'object') {
    throw new Error('공용 회의록 저장 응답 형식이 올바르지 않습니다')
  }
  return response.meeting
}

export const deleteSharedMeeting = (meetingId: string) =>
  del<{ ok: true }>(`/api/meetings?id=${encodeURIComponent(meetingId)}`)

export type SharedActionPatch = Partial<Pick<ActionItem, '할일' | '담당자' | '기한' | '유형' | '상태'>>

export async function updateSharedMeetingAction(
  meetingId: string,
  actionId: string,
  patchValue: SharedActionPatch,
): Promise<SavedMeeting> {
  const response = await patch<{ meeting: SavedMeeting }>('/api/meetings', { meetingId, actionId, patch: patchValue })
  if (!response.meeting || typeof response.meeting !== 'object') {
    throw new Error('일정 수정 응답 형식이 올바르지 않습니다')
  }
  return response.meeting
}

export async function deleteSharedMeetingAction(meetingId: string, actionId: string): Promise<SavedMeeting> {
  const response = await del<{ meeting: SavedMeeting }>(
    `/api/meetings?id=${encodeURIComponent(meetingId)}&actionId=${encodeURIComponent(actionId)}`,
  )
  if (!response.meeting || typeof response.meeting !== 'object') {
    throw new Error('일정 삭제 응답 형식이 올바르지 않습니다')
  }
  return response.meeting
}
