import { useEffect, useState } from 'react'
import type { ActionItem, MeetingRecord } from '../shared/contract'
import {
  createNotionPage,
  deleteSharedMeeting,
  deleteSharedMeetingAction,
  fetchSharedMeetings,
  hasSiteAccess,
  saveSharedMeeting,
  updateSharedMeetingAction,
  type SharedActionPatch,
} from './api'
import { ScheduleBoard } from './components/ActionDashboard'
import { AccessGate } from './components/AccessGate'
import { LoadingOverlay } from './components/LogoLoader'
import MeetingInput from './components/MeetingInput'
import { MeetingHistory } from './components/MeetingHistory'
import { ResultScreen } from './components/ResultScreen'
import { ReviewScreen } from './components/ReviewScreen'
import { useHeldValue } from './loading'
import {
  clearRestorableSession,
  readLegacySavedMeetings,
  readRestorableSession,
  saveRestorableSession,
  type SavedMeeting,
} from './meeting-history'
import './App.css'

type Screen = 'input' | 'review' | 'result' | 'history' | 'dashboard'

/** 화면 전체를 덮을 만큼 긴 대기 세 곳. 짧은 대기는 각 화면이 자기 자리에서 알린다. */
const overlayCopy = {
  access: { title: '입장 확인 중', detail: '팀 비밀번호를 확인하고 있습니다.' },
  boot: { title: '회의록 불러오는 중', detail: '공용 기록과 Notion 동기화 상태를 확인하고 있습니다.' },
  save: { title: 'Notion에 기록 중', detail: '회의록 페이지를 만들고 액션 아이템을 연결하고 있습니다.' },
} as const

const workflow = [
  { id: 'input', label: '메모' },
  { id: 'review', label: '검토' },
  { id: 'result', label: '기록' },
] as const

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(hasSiteAccess)
  const [initialSession] = useState(readRestorableSession)
  const [screen, setScreen] = useState<Screen>(initialSession?.screen ?? 'input')
  const [record, setRecord] = useState<MeetingRecord | null>(initialSession?.record ?? null)
  const [pageId, setPageId] = useState(initialSession?.pageId ?? '')
  const [pageUrl, setPageUrl] = useState(initialSession?.pageUrl ?? '')
  const [failedItems, setFailedItems] = useState<ActionItem[]>(initialSession?.failedItems ?? [])
  const [savedMeetings, setSavedMeetings] = useState<SavedMeeting[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(false)
  const [isBooting, setIsBooting] = useState(false)
  const [deletingMeetingId, setDeletingMeetingId] = useState('')
  const [mutatingScheduleId, setMutatingScheduleId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (record && (screen === 'review' || screen === 'result')) {
      saveRestorableSession({ screen, record, pageId, pageUrl, failedItems })
      return
    }
    clearRestorableSession()
  }, [failedItems, pageId, pageUrl, record, screen])

  const loadSharedMeetings = async () => {
    setIsLoadingMeetings(true)
    try {
      const legacyMeetings = readLegacySavedMeetings()
      if (legacyMeetings.length) {
        await Promise.all(legacyMeetings.map(({ record: legacyRecord, pageId: legacyPageId, pageUrl: legacyPageUrl, failedItems: legacyFailedItems }) =>
          saveSharedMeeting({ record: legacyRecord, pageId: legacyPageId, pageUrl: legacyPageUrl, failedItems: legacyFailedItems }),
        ))
      }
      const result = await fetchSharedMeetings()
      setSavedMeetings(result.meetings)
      if (result.sync && !result.sync.ok) {
        setError(`Notion 회의록을 동기화하지 못해 마지막 공용 기록을 표시합니다: ${result.sync.error}`)
      }
    } catch (loadError) {
      setError(`공용 회의록을 불러오지 못했습니다: ${(loadError as Error).message}`)
    } finally {
      setIsLoadingMeetings(false)
      setIsBooting(false)
    }
  }

  useEffect(() => {
    if (isUnlocked) void loadSharedMeetings()
  }, [isUnlocked])

  const save = async (edited: MeetingRecord) => {
    setIsSaving(true)
    setError('')
    try {
      const result = await createNotionPage(edited)
      setRecord(edited)
      setPageId(result.pageId)
      setPageUrl(result.pageUrl)
      setFailedItems(result.failedItems)
      try {
        const shared = await saveSharedMeeting({ record: edited, pageId: result.pageId, pageUrl: result.pageUrl, failedItems: result.failedItems })
        setSavedMeetings((current) => [shared, ...current.filter((meeting) => meeting.id !== shared.id)])
      } catch (sharedError) {
        setError(`Notion 저장은 완료됐지만 공용 기록 저장에 실패했습니다: ${(sharedError as Error).message}`)
      }
      setScreen('result')
    } catch (saveError) {
      setError(`Notion에 기록하지 못했습니다: ${(saveError as Error).message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const startNewMeeting = () => {
    clearRestorableSession()
    setRecord(null)
    setPageId('')
    setPageUrl('')
    setFailedItems([])
    setError('')
    setScreen('input')
  }

  const openSavedMeeting = (meeting: SavedMeeting) => {
    setRecord(meeting.record)
    setPageId(meeting.pageId)
    setPageUrl(meeting.pageUrl)
    setFailedItems(meeting.failedItems)
    setError('')
    setScreen('result')
  }

  const deleteSavedMeeting = async (meeting: SavedMeeting) => {
    const confirmed = window.confirm('이 회의록을 사이트의 Records 목록에서 삭제할까요?\nNotion 원본 회의록은 그대로 유지됩니다.')
    if (!confirmed) return

    setDeletingMeetingId(meeting.id)
    setError('')
    try {
      await deleteSharedMeeting(meeting.id)
      setSavedMeetings((current) => current.filter((saved) => saved.id !== meeting.id))
    } catch (deleteError) {
      setError(`회의록을 삭제하지 못했습니다: ${(deleteError as Error).message}`)
    } finally {
      setDeletingMeetingId('')
    }
  }

  const updateScheduleAction = async (meetingId: string, actionId: string, patch: SharedActionPatch) => {
    const scheduleId = `${meetingId}:${actionId}`
    setMutatingScheduleId(scheduleId)
    setError('')
    try {
      const updated = await updateSharedMeetingAction(meetingId, actionId, patch)
      setSavedMeetings((current) => current.map((meeting) => meeting.id === updated.id ? updated : meeting))
    } catch (updateError) {
      setError(`일정을 변경하지 못했습니다. Notion에도 반영되지 않았습니다: ${(updateError as Error).message}`)
    } finally {
      setMutatingScheduleId('')
    }
  }

  const deleteScheduleAction = async (meetingId: string, actionId: string) => {
    const scheduleId = `${meetingId}:${actionId}`
    setMutatingScheduleId(scheduleId)
    setError('')
    try {
      const updated = await deleteSharedMeetingAction(meetingId, actionId)
      setSavedMeetings((current) => current.map((meeting) => meeting.id === updated.id ? updated : meeting))
    } catch (deleteError) {
      setError(`일정을 삭제하지 못했습니다. Notion에도 반영되지 않았습니다: ${(deleteError as Error).message}`)
    } finally {
      setMutatingScheduleId('')
    }
  }

  const currentWorkflowIndex = workflow.findIndex((step) => step.id === screen)

  // 대기가 순식간에 끝나도 로더는 잠시 남는다. 입장 직후 목록 로딩으로 이어질 때 영상이 끊기지 않게,
  // 두 분기 모두 같은 자리에 이 노드를 둔다.
  const overlay = useHeldValue(isCheckingAccess ? 'access' : isBooting ? 'boot' : isSaving ? 'save' : null)
  const overlayNode = overlay
    ? <LoadingOverlay title={overlayCopy[overlay].title} detail={overlayCopy[overlay].detail} />
    : null

  if (!isUnlocked) return (
    <>
      {overlayNode}
      <AccessGate onCheckingChange={setIsCheckingAccess} onUnlocked={() => { setIsBooting(true); setIsUnlocked(true) }} />
    </>
  )

  return (
    <>
      {overlayNode}
      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" type="button" onClick={startNewMeeting} aria-label="새 회의록 만들기">
            <span className="brand-mark" aria-hidden="true"><img src="/tokenaires-logo.png" alt="" /></span>
            <span className="brand-copy"><span className="brand-name">TOKEN<span>AI</span>RES</span><small>MEETING NOTES</small></span>
          </button>
          <nav aria-label="주요 메뉴">
            <button type="button" className={screen === 'input' || screen === 'review' || screen === 'result' ? 'is-active' : ''} onClick={startNewMeeting}>New note</button>
            <button type="button" className={screen === 'history' ? 'is-active' : ''} onClick={() => { void loadSharedMeetings(); setScreen('history') }}>Records</button>
            <button type="button" className={screen === 'dashboard' ? 'is-active' : ''} onClick={() => { void loadSharedMeetings(); setScreen('dashboard') }}>Action Items</button>
          </nav>
        </header>

        {screen !== 'history' && screen !== 'dashboard' && (
          <ol className="workflow" aria-label="회의록 작성 단계">
            {workflow.map((step, index) => (
              <li
                className={index < currentWorkflowIndex ? 'is-complete' : index === currentWorkflowIndex ? 'is-current' : ''}
                key={step.id}
                aria-current={index === currentWorkflowIndex ? 'step' : undefined}
              >
                <span>{index + 1}</span>{step.label}
              </li>
            ))}
          </ol>
        )}

        <main>
          {error && <p className="global-error" role="alert">{error}</p>}
          {screen === 'input' && <MeetingInput onStructured={(structured) => { setError(''); setRecord(structured); setScreen('review') }} />}
          {screen === 'review' && record && <ReviewScreen record={record} onBack={() => setScreen('input')} onApprove={(edited) => void save(edited)} isSaving={isSaving} />}
          {screen === 'result' && record && <ResultScreen pageUrl={pageUrl} record={record} onNew={startNewMeeting} onOpenHistory={() => setScreen('history')} />}
          {screen === 'history' && <MeetingHistory meetings={savedMeetings} isLoading={isLoadingMeetings} onOpen={openSavedMeeting} onDelete={(meeting) => void deleteSavedMeeting(meeting)} deletingId={deletingMeetingId} />}
          {screen === 'dashboard' && <ScheduleBoard
            meetings={savedMeetings}
            isRefreshing={isLoadingMeetings}
            mutatingId={mutatingScheduleId}
            onRefresh={() => void loadSharedMeetings()}
            onUpdateAction={(meetingId, actionId, patch) => void updateScheduleAction(meetingId, actionId, patch)}
            onDeleteAction={(meetingId, actionId) => void deleteScheduleAction(meetingId, actionId)}
          />}
        </main>

        <footer>원본 메모 → AI 정리 → 사람 검토 → Notion 기록</footer>
      </div>
    </>
  )
}
