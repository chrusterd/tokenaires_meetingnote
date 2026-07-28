import { useState } from 'react'
import type { ActionItem, MeetingRecord } from '../shared/contract'
import { createNotionPage } from './api'
import { ActionDashboard } from './components/ActionDashboard'
import { InputScreen } from './components/InputScreen'
import { ResultScreen } from './components/ResultScreen'
import { ReviewScreen } from './components/ReviewScreen'
import './App.css'

type Screen = 'input' | 'review' | 'result' | 'dashboard'

const workflow = [
  { id: 'input', label: '메모' },
  { id: 'review', label: '검토' },
  { id: 'result', label: '기록' },
] as const

export default function App() {
  const [screen, setScreen] = useState<Screen>('input')
  const [record, setRecord] = useState<MeetingRecord | null>(null)
  const [pageId, setPageId] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [failedItems, setFailedItems] = useState<ActionItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (edited: MeetingRecord) => {
    setIsSaving(true)
    setError('')
    try {
      const result = await createNotionPage(edited)
      setRecord(edited)
      setPageId(result.pageId)
      setPageUrl(result.pageUrl)
      setFailedItems(result.failedItems)
      setScreen('result')
    } catch (saveError) {
      setError(`Notion에 기록하지 못했습니다: ${(saveError as Error).message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const retryFailedItems = async () => {
    if (!record || !pageId || failedItems.length === 0) return
    setIsSaving(true)
    setError('')
    try {
      const result = await createNotionPage({ ...record, 액션아이템: failedItems }, pageId)
      setFailedItems(result.failedItems)
    } catch (retryError) {
      setError(`실패한 항목을 다시 기록하지 못했습니다: ${(retryError as Error).message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const startNewMeeting = () => {
    setRecord(null)
    setPageId('')
    setPageUrl('')
    setFailedItems([])
    setError('')
    setScreen('input')
  }

  const currentWorkflowIndex = workflow.findIndex((step) => step.id === screen)

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="wordmark" type="button" onClick={startNewMeeting} aria-label="새 회의록 만들기">회의록<span>:</span>기록</button>
        <nav aria-label="주요 메뉴">
          <button type="button" className={screen !== 'dashboard' ? 'is-active' : ''} onClick={startNewMeeting}>회의 기록</button>
          <button type="button" className={screen === 'dashboard' ? 'is-active' : ''} onClick={() => setScreen('dashboard')}>할 일</button>
        </nav>
      </header>

      {screen !== 'dashboard' && (
        <ol className="workflow" aria-label="회의록 작성 단계">
          {workflow.map((step, index) => <li className={index <= currentWorkflowIndex ? 'is-complete' : ''} key={step.id}><span>{index + 1}</span>{step.label}</li>)}
        </ol>
      )}

      <main>
        {error && <p className="global-error" role="alert">{error}</p>}
        {screen === 'input' && <InputScreen onStructured={(structured) => { setError(''); setRecord(structured); setScreen('review') }} />}
        {screen === 'review' && record && <ReviewScreen record={record} onBack={() => setScreen('input')} onApprove={(edited) => void save(edited)} isSaving={isSaving} />}
        {screen === 'result' && record && <ResultScreen pageUrl={pageUrl} record={record} failedItems={failedItems} onRetryFailed={() => void retryFailedItems()} onNew={startNewMeeting} isSaving={isSaving} />}
        {screen === 'dashboard' && <ActionDashboard />}
      </main>

      <footer>원본 메모 → AI 정리 → 사람 검토 → Notion 기록</footer>
    </div>
  )
}
