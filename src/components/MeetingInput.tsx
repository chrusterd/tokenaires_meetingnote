import { useRef, useState } from 'react'
import type { MeetingRecord } from '../../shared/contract'
import { structure, transcribeChunk } from '../api'
import { decodeToMono, splitIntoWavChunks } from '../audio'
import './MeetingInput.css'

/** 세 가지 입력 방식이 만들어내는 결과. 어느 쪽이든 전사문 한 덩어리로 수렴한다. */
export type MeetingInputResult =
  | { kind: 'memo'; text: string }
  | { kind: 'upload'; file: File }
  | { kind: 'record'; blob: Blob }

interface Props {
  /** 구조화까지 끝난 회의록. 다음은 검토 화면이 받는다. */
  onStructured: (record: MeetingRecord) => void
}

type Tab = 'memo' | 'upload' | 'record'

const TABS: { id: Tab; label: string }[] = [
  { id: 'memo', label: '메모' },
  { id: 'upload', label: '파일 업로드' },
  { id: 'record', label: '녹음' },
]

const TEAM_MEMBERS = ['소정', '하영', '해냄', '유진']

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function todayInKorea() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export default function MeetingInput({ onStructured }: Props) {
  const [tab, setTab] = useState<Tab>('memo')

  // 메타 — 구조화 API와 Notion 본문 '참석자' 섹션이 둘 다 쓴다.
  const [날짜, set날짜] = useState(todayInKorea)
  const [참석자, set참석자] = useState<string[]>([])

  // 메모
  const [memo, setMemo] = useState('')

  // 업로드
  const [file, setFile] = useState<File | null>(null)

  // 녹음
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const recordedBlob = useRef<Blob | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)

  // 처리
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const busy = status !== ''

  const toggleAttendee = (name: string) => {
    set참석자((current) => current.includes(name)
      ? current.filter((member) => member !== name)
      : [...current, name])
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: mr.mimeType })
        recordedBlob.current = blob
        setRecordedUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      recorder.current = mr
      // 이전 녹음의 object URL은 여기서 놓아준다. 다시 녹음을 반복하면 쌓인다.
      setRecordedUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return null
      })
      recordedBlob.current = null
      setElapsed(0)
      setRecording(true)
      setError('')
      timer.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    } catch {
      // alert()은 이후 처리를 막아서 카드 안 오류 줄로 대신 알린다.
      setError('마이크 권한이 필요합니다.')
    }
  }

  function stopRecording() {
    recorder.current?.stop()
    setRecording(false)
    if (timer.current) window.clearInterval(timer.current)
  }

  const canSubmit =
    !busy && !recording && (
      (tab === 'memo' && memo.trim().length > 0) ||
      (tab === 'upload' && file !== null) ||
      (tab === 'record' && recordedBlob.current !== null)
    )

  function currentInput(): MeetingInputResult | null {
    if (tab === 'memo' && memo.trim()) return { kind: 'memo', text: memo.trim() }
    if (tab === 'upload' && file) return { kind: 'upload', file }
    if (tab === 'record' && recordedBlob.current) return { kind: 'record', blob: recordedBlob.current }
    return null
  }

  /** 오디오는 16kHz 모노 WAV 조각으로 잘라 순서대로 전사한 뒤 이어붙인다. */
  async function toTranscript(input: MeetingInputResult): Promise<string> {
    if (input.kind === 'memo') return input.text

    setStatus('오디오를 변환하는 중…')
    const samples = await decodeToMono(input.kind === 'upload' ? input.file : input.blob)
    const wavChunks = splitIntoWavChunks(samples)

    const parts: string[] = []
    for (const [index, wav] of wavChunks.entries()) {
      setStatus(`받아쓰는 중… (${index + 1}/${wavChunks.length})`)
      parts.push(await transcribeChunk(wav))
    }

    const transcript = parts.filter(Boolean).join('\n').trim()
    if (!transcript) throw new Error('오디오에서 인식된 말이 없습니다.')
    return transcript
  }

  async function submit() {
    const input = currentInput()
    if (!input) return

    setError('')
    setStatus('준비하는 중…')
    try {
      const 텍스트 = await toTranscript(input)
      setStatus('회의록으로 정리하는 중…')
      onStructured(await structure({ 텍스트, 날짜, 참석자 }))
    } catch (submitError) {
      setError((submitError as Error).message)
    } finally {
      setStatus('')
    }
  }

  return (
    <section className="screen input-screen" aria-labelledby="input-title">
      <div className="screen-intro">
        <p className="eyebrow"><span>01</span> RAW MEMO</p>
        <h1 id="input-title">MEETING<br />NOTES</h1>
        <p className="lede">메모를 그대로 붙여넣거나, 회의 녹음을 올리거나, 바로 녹음하세요. 저장 전에는 반드시 사람이 검토합니다.</p>
      </div>

      <section className="meeting-form meeting-input-form" aria-label="회의록 입력">
        <div className="form-row metadata-row">
          <label className="field-label" htmlFor="mi-date">
            <span>회의 날짜</span>
            <input id="mi-date" type="date" value={날짜} onChange={(event) => set날짜(event.target.value)} />
          </label>
          <fieldset className="attendee-fieldset">
            <legend>참석자 <small>선택</small></legend>
            <div className="attendee-list">
              {TEAM_MEMBERS.map((name) => (
                <label className="attendee-chip" key={name}>
                  <input type="checkbox" checked={참석자.includes(name)} onChange={() => toggleAttendee(name)} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <section className="mi-source" aria-labelledby="input-mode-title">
          <div className="mi-source-heading">
            <div><h2 id="input-mode-title">원본 회의 메모</h2><p>입력 방식을 선택해 회의 내용을 남기세요.</p></div>
            <span>INPUT MODE</span>
          </div>
          <div className="mi-tabs" role="tablist" aria-label="회의 내용 입력 방식">
            {TABS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`mi-tab ${tab === item.id ? 'is-active' : ''}`} onClick={() => setTab(item.id)}>
                {item.id === 'record' && <i className={recording ? 'is-live' : ''} aria-hidden="true" />}{item.label}
              </button>
            ))}
          </div>

          <div className="mi-panel">
            {tab === 'memo' && <textarea id="meeting-text" className="mi-textarea" rows={12} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder={'예) 배포는 Netlify로 가기로 했다.\n오디오 업로드는 용량 문제를 더 확인한 뒤 다음 회의에서 결정한다.'} />}

            {tab === 'upload' && (
              <label className="mi-upload" htmlFor="audio-file">
                <input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                <span className="mi-upload-mark" aria-hidden="true">↥</span>
                <span><strong>{file ? file.name : '오디오 파일을 선택하세요'}</strong><small>{file ? '파일을 바꾸려면 다시 선택하세요.' : 'MP3 · WAV · M4A 파일을 회의록으로 전사합니다.'}</small></span>
              </label>
            )}

            {tab === 'record' && (
              <div className="mi-record">
                <div className="mi-record-meta"><span className={`mi-dot ${recording ? 'is-live' : ''}`} /><span>{recording ? '녹음 중' : recordedUrl ? '녹음 완료' : '녹음 대기'}</span><time>{formatTime(elapsed)}</time></div>
                <div className="mi-record-actions">
                  {!recording ? <button className="secondary-button" type="button" onClick={() => void startRecording()}>{recordedUrl ? '다시 녹음' : '녹음 시작'}</button> : <button className="record-stop" type="button" onClick={stopRecording}>녹음 정지</button>}
                  {recordedUrl && !recording && <audio className="mi-audio" src={recordedUrl} controls />}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="form-footer">
          <p className="privacy-note">{tab === 'memo' ? '입력한 원문은 정리 결과의 근거로 함께 보존됩니다.' : '오디오는 전사 후 회의록 검토를 위한 텍스트로 변환됩니다.'}</p>
          <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? '처리하는 중…' : '검토용 기록 만들기'} <span aria-hidden="true">→</span>
          </button>
        </div>

        {status && <p className="mi-status" role="status">{status}</p>}
        {error && <p className="form-error mi-error" role="alert">{error}</p>}
      </section>
    </section>
  )
}
