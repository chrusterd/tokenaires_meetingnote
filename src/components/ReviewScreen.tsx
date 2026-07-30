import { useState } from 'react'
import type { ActionItem, MeetingRecord } from '../../shared/contract'
import { MEETING_STATUSES, scheduleKindOf, SCHEDULE_KINDS, shortDate, UNSET } from '../../shared/contract'

const TEAM_MEMBERS = [UNSET, '소정', '하영', '해냄', '유진']
type ReviewedActionItem = ActionItem & { 포함: boolean }

function StringListEditor({
  title,
  items,
  setItems,
  caption,
}: {
  title: string
  items: string[]
  setItems: (items: string[]) => void
  caption?: string
}) {
  return (
    <section className="review-section">
      <div className="section-heading">
        <div><h2>{title}</h2>{caption && <p className="section-caption">{caption}</p>}</div>
        <button className="text-button" type="button" onClick={() => setItems([...items, ''])}>+ 항목 추가</button>
      </div>
      <div className="line-editor-list">
        {items.length === 0 && <p className="empty-inline">정리된 항목이 없습니다. 필요하면 직접 추가하세요.</p>}
        {items.map((item, index) => (
          <div className="line-editor" key={`${title}-${index}`}>
            <textarea
              rows={2}
              aria-label={`${title} ${index + 1}`}
              value={item}
              onChange={(event) => setItems(items.map((line, lineIndex) => lineIndex === index ? event.target.value : line))}
            />
            <button className="remove-button" type="button" onClick={() => setItems(items.filter((_, lineIndex) => lineIndex !== index))} aria-label={`${title} 삭제`}>×</button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ReviewScreen({
  record,
  onApprove,
  onBack,
  isSaving,
}: {
  record: MeetingRecord
  onApprove: (edited: MeetingRecord) => void
  onBack: () => void
  isSaving: boolean
}) {
  const [제목, set제목] = useState(record.제목)
  const [상태, set상태] = useState(record.상태)
  const [핵심요약, set핵심요약] = useState(record.핵심_요약)
  const [결정사항, set결정사항] = useState(record.결정사항)
  const [논의기록, set논의기록] = useState(record.논의_기록)
  const [항목들, set항목들] = useState<ReviewedActionItem[]>(
    record.액션아이템.map((item) => ({ ...item, 포함: true })),
  )

  const editAction = (index: number, patch: Partial<ReviewedActionItem>) => {
    set항목들((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  const approve = () => {
    onApprove({
      ...record,
      제목: 제목.trim(),
      상태,
      핵심_요약: 핵심요약.trim(),
      결정사항: 결정사항.map((item) => item.trim()).filter(Boolean),
      논의_기록: 논의기록.map((item) => item.trim()).filter(Boolean),
      액션아이템: 항목들
        .filter((item) => item.포함 && item.할일.trim())
        .map(({ 포함: _included, ...item }) => ({ ...item, 할일: item.할일.trim() })),
    })
  }

  return (
    <section className="screen review-screen" aria-labelledby="review-title">
      <div className="review-header">
        <div>
          <p className="eyebrow">검토 단계</p>
          <h1 id="review-title">회의 정리</h1>
        </div>
        <div className="source-badge"><span aria-hidden="true">●</span> 원문 연결됨</div>
      </div>

      <section className="review-section summary-section">
        <div className="section-heading"><h2>제목</h2><span className="section-caption">Notion 회의명에 "[{shortDate(record.날짜)}] {제목 || '제목'}"으로 저장됩니다</span></div>
        <input type="text" value={제목} onChange={(event) => set제목(event.target.value)} aria-label="제목" />
        <label className="field-label" htmlFor="review-status">
          <span>상태</span>
          <select id="review-status" value={상태} onChange={(event) => set상태(event.target.value as MeetingRecord['상태'])}>
            {MEETING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      </section>

      <section className="review-section summary-section">
        <div className="section-heading"><h2>핵심 요약</h2><span className="section-caption">Notion 회의록에 저장됩니다</span></div>
        <textarea rows={4} value={핵심요약} onChange={(event) => set핵심요약(event.target.value)} aria-label="핵심 요약" />
      </section>

      <StringListEditor title="결정사항" items={결정사항} setItems={set결정사항} />

      <section className="review-section action-section">
        <div className="section-heading">
          <div><h2>액션 아이템</h2><p className="section-caption">체크 해제한 항목은 저장하지 않습니다.</p></div>
          <button className="text-button" type="button" onClick={() => set항목들([...항목들, { 할일: '', 담당자: UNSET, 기한: UNSET, 유형: '팀 일정', 상태: '진행', 포함: true }])}>+ 할 일 추가</button>
        </div>
        <div className="action-list">
          {항목들.length === 0 && <p className="empty-inline">추출된 할 일이 없습니다. 필요하면 직접 추가하세요.</p>}
          {항목들.map((item, index) => (
            <div className={`action-editor ${item.포함 ? '' : 'is-excluded'}`} key={`action-${index}`}>
              <label className="include-check">
                <input type="checkbox" checked={item.포함} onChange={(event) => editAction(index, { 포함: event.target.checked })} />
                <span className="sr-only">{item.할일 || '새 할 일'} 저장 여부</span>
              </label>
              <input value={item.할일} onChange={(event) => editAction(index, { 할일: event.target.value })} placeholder="할 일" aria-label="할 일" />
              <select value={item.담당자} onChange={(event) => editAction(index, { 담당자: event.target.value })} aria-label="담당자">
                {TEAM_MEMBERS.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <select value={scheduleKindOf(item)} onChange={(event) => editAction(index, { 유형: event.target.value as ActionItem['유형'] })} aria-label="일정 구분">
                {SCHEDULE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
              <label className="due-date"><span>기한</span><input type="date" value={item.기한 === UNSET ? '' : item.기한} onChange={(event) => editAction(index, { 기한: event.target.value || UNSET })} /></label>
              <button className="remove-button" type="button" onClick={() => set항목들(항목들.filter((_, itemIndex) => itemIndex !== index))} aria-label="할 일 삭제">×</button>
            </div>
          ))}
        </div>
      </section>

      <StringListEditor title="논의 기록" items={논의기록} setItems={set논의기록} caption="안건별 근거와 보류 내용까지 확인해 저장합니다." />

      <details className="source-details">
        <summary>원본 회의 메모 보기</summary>
        <pre>{record.전사문}</pre>
      </details>

      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onBack} disabled={isSaving}>메모로 돌아가기</button>
        <button className="primary-button" type="button" onClick={approve} disabled={isSaving}>
          {isSaving ? 'Notion에 기록하는 중…' : '검토 완료, Notion에 기록'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
