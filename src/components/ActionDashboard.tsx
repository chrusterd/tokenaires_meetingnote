import { useEffect, useMemo, useState } from 'react'
import { fetchActionItems, toggleActionItem, type DashboardItem } from '../api'

const TEAM_MEMBERS = ['소정', '하영', '해냄', '유진', '미정']

export function ActionDashboard() {
  const [items, setItems] = useState<DashboardItem[]>([])
  const [assignee, setAssignee] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await fetchActionItems())
    } catch (loadError) {
      setError((loadError as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleItems = useMemo(
    () => assignee ? items.filter((item) => item.담당자.includes(assignee)) : items,
    [assignee, items],
  )

  const complete = async (id: string) => {
    const previous = items
    setItems((current) => current.filter((item) => item.id !== id))
    setError('')
    try {
      await toggleActionItem(id, true)
    } catch (toggleError) {
      setItems(previous)
      setError(`완료 상태를 저장하지 못했습니다: ${(toggleError as Error).message}`)
    }
  }

  return (
    <section className="screen dashboard-screen" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div><p className="eyebrow">Notion과 동기화</p><h1 id="dashboard-title">오늘 남은 일</h1></div>
        <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>새로고침</button>
      </div>
      <div className="dashboard-controls">
        <label className="filter-label" htmlFor="assignee-filter">담당자
          <select id="assignee-filter" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">전체</option>
            {TEAM_MEMBERS.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <p>{loading ? '목록을 읽는 중…' : `${visibleItems.length}개의 미완료 항목`}</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && visibleItems.length === 0 ? (
        <div className="dashboard-empty"><span aria-hidden="true">✓</span><p>표시할 미완료 항목이 없습니다.</p></div>
      ) : (
        <ul className="dashboard-list">
          {visibleItems.map((item) => (
            <li key={item.id} className="dashboard-item">
              <button className="complete-button" type="button" onClick={() => void complete(item.id)} aria-label={`${item.할일} 완료 처리`}><span aria-hidden="true">✓</span></button>
              <div><h2>{item.할일 || '제목 없는 할 일'}</h2><p>{item.담당자.length ? item.담당자.join(' · ') : '담당자 미정'}</p></div>
              <time className={item.기한 ? '' : 'unset'} dateTime={item.기한 ?? undefined}>{item.기한 ?? '기한 미정'}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
