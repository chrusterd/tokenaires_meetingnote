import { useState } from 'react'
import type { MeetingRecord } from '../../shared/contract'
import { structure } from '../api'

const TEAM_MEMBERS = ['소정', '하영', '해냄', '유진']

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

export function InputScreen({ onStructured }: { onStructured: (record: MeetingRecord) => void }) {
  const [텍스트, set텍스트] = useState('')
  const [날짜, set날짜] = useState(todayInKorea)
  const [참석자, set참석자] = useState<string[]>([])
  const [로딩, set로딩] = useState(false)
  const [오류, set오류] = useState('')

  const toggleAttendee = (name: string) => {
    set참석자((current) => current.includes(name)
      ? current.filter((member) => member !== name)
      : [...current, name])
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    set로딩(true)
    set오류('')
    try {
      onStructured(await structure({ 텍스트, 날짜, 참석자 }))
    } catch (error) {
      set오류((error as Error).message)
    } finally {
      set로딩(false)
    }
  }

  return (
    <section className="screen input-screen" aria-labelledby="input-title">
      <div className="screen-intro">
        <p className="eyebrow"><span>01</span> RAW MEMO</p>
        <h1 id="input-title">MEETING<br />NOTES</h1>
        <p className="lede">메모를 그대로 붙여넣으면 핵심 내용과 할 일을 정리합니다. 저장 전에는 반드시 사람이 검토합니다.</p>
      </div>

      <form className="meeting-form" onSubmit={submit}>
        <div className="form-row metadata-row">
          <label className="field-label" htmlFor="meeting-date">
            <span>회의 날짜</span>
            <input id="meeting-date" type="date" value={날짜} onChange={(event) => set날짜(event.target.value)} required />
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

        <label className="field-label source-field" htmlFor="meeting-text">
          <span>원본 회의 메모</span>
          <span className="field-hint">발언, 결정, 미결 사항을 자유롭게 적으세요.</span>
          <textarea
            id="meeting-text"
            rows={15}
            value={텍스트}
            placeholder={'예) 배포는 Netlify로 가기로 했다.\n오디오 업로드는 용량 문제를 더 확인한 뒤 다음 회의에서 결정한다.'}
            onChange={(event) => set텍스트(event.target.value)}
            required
          />
        </label>

        <div className="form-footer">
          <p className="privacy-note">입력한 원문은 정리 결과의 근거로 함께 보존됩니다.</p>
          <button className="primary-button" type="submit" disabled={로딩 || !텍스트.trim()}>
            {로딩 ? '메모를 정리하는 중…' : '검토용 기록 만들기'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
        {오류 && <p className="form-error" role="alert">{오류}</p>}
      </form>
    </section>
  )
}
