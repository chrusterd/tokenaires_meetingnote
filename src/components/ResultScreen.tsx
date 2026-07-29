import type { ActionItem, MeetingRecord } from '../../shared/contract'

export function ResultScreen({
  pageUrl,
  record,
  onNew,
  onOpenHistory,
}: {
  pageUrl: string
  record: MeetingRecord
  onNew: () => void
  onOpenHistory: () => void
}) {
  const byAssignee = record.액션아이템.reduce<Record<string, ActionItem[]>>((groups, item) => {
    ;(groups[item.담당자] ??= []).push(item)
    return groups
  }, {})

  return (
    <section className="screen result-screen" aria-labelledby="result-title">
      <div className="result-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">검토된 기록을 저장했습니다</p>
      <h1 id="result-title">회의록이<br />기록되었습니다.</h1>
      <p className="lede">회의록 안의 액션 아이템 표와 함께 Notion에 기록했습니다.</p>

      {pageUrl && <a className="notion-link" href={pageUrl} target="_blank" rel="noreferrer">Notion에서 회의록 열기 <span aria-hidden="true">↗</span></a>}

      <section className="assignment-board">
        <div className="section-heading"><h2>담당자별 다음 일</h2><span className="section-caption">이번 회의에서 확정</span></div>
        <div className="assignment-grid">
          {Object.entries(byAssignee).map(([assignee, items]) => (
            <section className="assignment-card" key={assignee}>
              <h3>{assignee}</h3>
              <ul>{items.map((item, index) => <li key={`${item.할일}-${index}`}><span>{item.할일}</span><small>{item.기한}</small></li>)}</ul>
            </section>
          ))}
          {record.액션아이템.length === 0 && <p className="empty-inline">이번 회의에서 저장한 액션 아이템이 없습니다.</p>}
        </div>
      </section>

      <div className="screen-actions">
        <button className="secondary-button" type="button" onClick={onNew}>새 회의록 만들기</button>
        <button className="secondary-button" type="button" onClick={onOpenHistory}>사이트의 회의 기록</button>
      </div>
    </section>
  )
}
