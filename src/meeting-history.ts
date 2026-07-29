import type { ActionItem, MeetingRecord } from '../shared/contract'
import { validateMeetingRecord } from '../shared/contract'

const LEGACY_HISTORY_KEY = 'tokenaires-meeting-history:v1'
const SESSION_KEY = 'tokenaires-meeting-session:v1'

export type SavedMeeting = {
  id: string
  savedAt: string
  record: MeetingRecord
  pageId: string
  pageUrl: string
  failedItems: ActionItem[]
  notionLastEditedAt?: string
}

export type RestorableSession = Pick<SavedMeeting, 'record' | 'pageId' | 'pageUrl' | 'failedItems'> & {
  screen: 'review' | 'result'
}

function browserStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function isActionItem(value: unknown): value is ActionItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.할일 === 'string' && typeof item.담당자 === 'string' && typeof item.기한 === 'string'
}

function isSavedMeeting(value: unknown): value is SavedMeeting {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const meeting = value as Record<string, unknown>
  const validation = validateMeetingRecord(meeting.record)
  return validation.ok
    && typeof meeting.id === 'string'
    && typeof meeting.savedAt === 'string'
    && typeof meeting.pageId === 'string'
    && typeof meeting.pageUrl === 'string'
    && (meeting.notionLastEditedAt === undefined || typeof meeting.notionLastEditedAt === 'string')
    && Array.isArray(meeting.failedItems)
    && meeting.failedItems.every(isActionItem)
}

function readJson(key: string): unknown {
  try {
    const raw = browserStorage()?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    browserStorage()?.setItem(key, JSON.stringify(value))
  } catch {
    // Browser storage can be unavailable or full. Notion saving is unaffected.
  }
}

// Records saved before the shared server was introduced live only in a browser.
// Keeping this reader lets each team member safely move their own old records once.
export function readLegacySavedMeetings(): SavedMeeting[] {
  const stored = readJson(LEGACY_HISTORY_KEY)
  return Array.isArray(stored) ? stored.filter(isSavedMeeting) : []
}

export function readRestorableSession(): RestorableSession | null {
  const stored = readJson(SESSION_KEY)
  if (typeof stored !== 'object' || stored === null) return null
  const session = stored as Record<string, unknown>
  const validation = validateMeetingRecord(session.record)
  if (!validation.ok || (session.screen !== 'review' && session.screen !== 'result')) return null
  if (typeof session.pageId !== 'string' || typeof session.pageUrl !== 'string') return null
  if (!Array.isArray(session.failedItems) || !session.failedItems.every(isActionItem)) return null
  return {
    screen: session.screen,
    record: validation.value,
    pageId: session.pageId,
    pageUrl: session.pageUrl,
    failedItems: session.failedItems,
  }
}

export function saveRestorableSession(session: RestorableSession) {
  writeJson(SESSION_KEY, session)
}

export function clearRestorableSession() {
  try {
    browserStorage()?.removeItem(SESSION_KEY)
  } catch {
    // Keeping an old session is preferable to blocking the app when storage is unavailable.
  }
}
