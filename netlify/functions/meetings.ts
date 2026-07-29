import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import type { ActionItem, MeetingRecord, ScheduleKind, ScheduleStatus } from '../../shared/contract'
import { scheduleKindOf, scheduleStatusOf, SCHEDULE_KINDS, SCHEDULE_STATUSES, validateMeetingRecord } from '../../shared/contract'
import { requireSitePassword } from './_lib/access'
import { listNotionMeetingPages, readNotionMeetingRecord, syncMeetingActionTable } from './_lib/notion'

type SharedMeeting = {
  id: string
  savedAt: string
  record: MeetingRecord
  pageId: string
  pageUrl: string
  failedItems: ActionItem[]
  notionLastEditedAt?: string
}

const STORE_NAME = 'shared-meeting-records'
const MAX_MEETINGS = 100

function isActionItem(value: unknown): value is ActionItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.할일 === 'string' && typeof item.담당자 === 'string' && typeof item.기한 === 'string'
}

function isSharedMeeting(value: unknown): value is SharedMeeting {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const meeting = value as Record<string, unknown>
  const parsed = validateMeetingRecord(meeting.record)
  return parsed.ok
    && typeof meeting.id === 'string'
    && typeof meeting.savedAt === 'string'
    && typeof meeting.pageId === 'string'
    && typeof meeting.pageUrl === 'string'
    && (meeting.notionLastEditedAt === undefined || typeof meeting.notionLastEditedAt === 'string')
    && Array.isArray(meeting.failedItems)
    && meeting.failedItems.every(isActionItem)
}

function store() {
  return getStore({ name: STORE_NAME, consistency: 'strong' })
}

function normalizeRecordActions(record: MeetingRecord) {
  // Cached records created before the 논의 기록 migration still carry 논의_요약.
  // Validate once more here so every GET response and Blob rewrite uses the current contract.
  const parsed = validateMeetingRecord(record)
  const canonical = parsed.ok ? parsed.value : record
  let changed = !Object.prototype.hasOwnProperty.call(record, '논의_기록')
  const seenIds = new Set<string>()
  const 액션아이템 = canonical.액션아이템.map((item) => {
    const id = item.id?.trim()
    const uniqueId = id && !seenIds.has(id) ? id : randomUUID()
    const 유형 = scheduleKindOf(item)
    const 상태 = scheduleStatusOf(item)
    seenIds.add(uniqueId)

    if (item.id !== uniqueId || item.유형 !== 유형 || item.상태 !== 상태) changed = true
    return { ...item, id: uniqueId, 유형, 상태 }
  })
  return { record: changed ? { ...canonical, 액션아이템 } : canonical, changed }
}

async function readMeeting(meetingId: string) {
  const key = `meeting:${meetingId}`
  const stored = await store().get(key, { type: 'json' })
  if (!isSharedMeeting(stored)) return null

  const normalized = normalizeRecordActions(stored.record)
  if (normalized.changed) {
    const migrated = { ...stored, record: normalized.record }
    await store().setJSON(key, migrated)
    return migrated
  }
  return stored
}

async function listCachedMeetings() {
  const blobs = await store().list({ prefix: 'meeting:' })
  const entries = await Promise.all(blobs.blobs.map(async ({ key }) => store().get(key, { type: 'json' })))
  const meetings = entries
    .filter(isSharedMeeting)
    .map((meeting) => ({ meeting, normalized: normalizeRecordActions(meeting.record) }))
  await Promise.all(meetings
    .filter(({ normalized }) => normalized.changed)
    .map(({ meeting, normalized }) => store().setJSON(`meeting:${meeting.id}`, { ...meeting, record: normalized.record })))
  return meetings
    .map(({ meeting, normalized }) => normalized.changed ? { ...meeting, record: normalized.record } : meeting)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, MAX_MEETINGS)
}

async function syncMeetingsFromNotion(cachedMeetings: SharedMeeting[]) {
  const notionPages = await listNotionMeetingPages()
  const cachedById = new Map(cachedMeetings.map((meeting) => [meeting.pageId, meeting]))
  const meetings: SharedMeeting[] = []
  let imported = 0
  let refreshed = 0

  for (const page of notionPages) {
    const cached = cachedById.get(page.id)
    const isCurrent = cached?.notionLastEditedAt === page.lastEditedAt
    if (cached && isCurrent) {
      meetings.push(cached.pageUrl === page.url ? cached : { ...cached, pageUrl: page.url })
      continue
    }

    const record = normalizeRecordActions(await readNotionMeetingRecord(page)).record
    const meeting: SharedMeeting = {
      id: page.id,
      savedAt: cached?.savedAt ?? page.createdAt,
      record,
      pageId: page.id,
      pageUrl: page.url,
      failedItems: cached?.failedItems ?? [],
      notionLastEditedAt: page.lastEditedAt,
    }
    await store().setJSON(`meeting:${meeting.id}`, meeting)
    meetings.push(meeting)
    if (cached) refreshed += 1
    else imported += 1
  }

  return {
    meetings: meetings
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .slice(0, MAX_MEETINGS),
    notionCount: notionPages.length,
    imported,
    refreshed,
  }
}

async function saveMeeting(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { error: '객체 JSON 본문이 필요합니다' } as const
  }

  const value = payload as Record<string, unknown>
  const parsed = validateMeetingRecord(value.record)
  if (!parsed.ok) return { error: '회의록 형식이 올바르지 않습니다' } as const
  if (typeof value.pageId !== 'string' || !value.pageId.trim()) return { error: 'pageId가 필요합니다' } as const
  if (typeof value.pageUrl !== 'string') return { error: 'pageUrl 형식이 올바르지 않습니다' } as const
  if (!Array.isArray(value.failedItems) || !value.failedItems.every(isActionItem)) {
    return { error: '실패한 액션 아이템 형식이 올바르지 않습니다' } as const
  }

  const normalized = normalizeRecordActions(parsed.value)
  const savedAt = new Date().toISOString()
  const meeting: SharedMeeting = {
    id: value.pageId,
    savedAt,
    record: normalized.record,
    pageId: value.pageId,
    pageUrl: value.pageUrl,
    failedItems: value.failedItems,
    notionLastEditedAt: savedAt,
  }
  await store().setJSON(`meeting:${meeting.id}`, meeting)
  return { meeting } as const
}

type ActionPatch = Partial<Pick<ActionItem, '할일' | '담당자' | '기한' | '유형' | '상태'>>

function parseActionPatch(value: unknown): ActionPatch | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const patch: ActionPatch = {}
  if ('할일' in raw) {
    if (typeof raw.할일 !== 'string') return null
    patch.할일 = raw.할일
  }
  if ('담당자' in raw) {
    if (typeof raw.담당자 !== 'string') return null
    patch.담당자 = raw.담당자
  }
  if ('기한' in raw) {
    if (typeof raw.기한 !== 'string') return null
    patch.기한 = raw.기한
  }
  if ('유형' in raw) {
    if (typeof raw.유형 !== 'string' || !SCHEDULE_KINDS.includes(raw.유형 as ScheduleKind)) return null
    patch.유형 = raw.유형 as ScheduleKind
  }
  if ('상태' in raw) {
    if (typeof raw.상태 !== 'string' || !SCHEDULE_STATUSES.includes(raw.상태 as ScheduleStatus)) return null
    patch.상태 = raw.상태 as ScheduleStatus
  }
  return Object.keys(patch).length ? patch : null
}

async function updateAction(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { error: '수정할 일정 정보가 필요합니다', status: 400 } as const
  }
  const value = payload as Record<string, unknown>
  const meetingId = typeof value.meetingId === 'string' ? value.meetingId.trim() : ''
  const actionId = typeof value.actionId === 'string' ? value.actionId.trim() : ''
  const patch = parseActionPatch(value.patch)
  if (!meetingId || !actionId || !patch) {
    return { error: '수정할 일정의 id와 변경 내용이 필요합니다', status: 400 } as const
  }

  const meeting = await readMeeting(meetingId)
  if (!meeting) return { error: '찾을 수 없는 회의록입니다', status: 404 } as const
  if (!meeting.record.액션아이템.some((item) => item.id === actionId)) {
    return { error: '찾을 수 없는 일정입니다', status: 404 } as const
  }

  const parsed = validateMeetingRecord({
    ...meeting.record,
    액션아이템: meeting.record.액션아이템.map((item) => item.id === actionId ? { ...item, ...patch } : item),
  })
  if (!parsed.ok) return { error: '일정 내용을 확인해 주세요', status: 400 } as const

  const normalized = normalizeRecordActions(parsed.value)
  await syncMeetingActionTable(meeting.pageId, normalized.record.액션아이템)
  const updated = { ...meeting, record: normalized.record }
  await store().setJSON(`meeting:${meeting.id}`, updated)
  return { meeting: updated } as const
}

async function deleteAction(meetingId: string | null, actionId: string | null) {
  const id = meetingId?.trim()
  const action = actionId?.trim()
  if (!id || !action) return { error: '삭제할 일정 id가 필요합니다', status: 400 } as const

  const meeting = await readMeeting(id)
  if (!meeting) return { error: '찾을 수 없는 회의록입니다', status: 404 } as const
  const remaining = meeting.record.액션아이템.filter((item) => item.id !== action)
  if (remaining.length === meeting.record.액션아이템.length) {
    return { error: '이미 삭제되었거나 찾을 수 없는 일정입니다', status: 404 } as const
  }

  await syncMeetingActionTable(meeting.pageId, remaining)
  const updated = { ...meeting, record: { ...meeting.record, 액션아이템: remaining } }
  await store().setJSON(`meeting:${meeting.id}`, updated)
  return { meeting: updated } as const
}

async function deleteMeeting(id: string | null) {
  const meetingId = id?.trim()
  if (!meetingId) return { error: '삭제할 회의록 id가 필요합니다', status: 400 } as const

  const key = `meeting:${meetingId}`
  // Notion 원본은 건드리지 않는다. 이 삭제는 사이트의 공용 Records 목록에만 적용된다.
  if (!await readMeeting(meetingId)) {
    return { error: '이미 삭제되었거나 찾을 수 없는 회의록입니다', status: 404 } as const
  }

  await store().delete(key)
  return { ok: true } as const
}

export default async (request: Request) => {
  const denied = requireSitePassword(request)
  if (denied) return denied

  try {
    if (request.method === 'GET') {
      const cached = await listCachedMeetings()
      try {
        const result = await syncMeetingsFromNotion(cached)
        return Response.json({
          meetings: result.meetings,
          sync: {
            ok: true,
            source: 'notion',
            notionCount: result.notionCount,
            imported: result.imported,
            refreshed: result.refreshed,
          },
        })
      } catch (error) {
        console.error('Notion meeting sync failed', error)
        return Response.json({
          meetings: cached,
          sync: { ok: false, source: 'cache', error: (error as Error).message },
        })
      }
    }
    if (request.method === 'POST') {
      const result = await saveMeeting(await request.json())
      if ('error' in result) return Response.json(result, { status: 400 })
      return Response.json(result)
    }
    if (request.method === 'PATCH') {
      const result = await updateAction(await request.json())
      if ('error' in result) return Response.json({ error: result.error }, { status: result.status })
      return Response.json(result)
    }
    if (request.method === 'DELETE') {
      const url = new URL(request.url)
      const result = url.searchParams.get('actionId')
        ? await deleteAction(url.searchParams.get('id'), url.searchParams.get('actionId'))
        : await deleteMeeting(url.searchParams.get('id'))
      if ('error' in result) return Response.json({ error: result.error }, { status: result.status })
      return Response.json(result)
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}

export const config: Config = { path: '/api/meetings' }
