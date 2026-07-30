import { useMemo, useState } from 'react'
import {
  SCHEDULE_KINDS,
  scheduleKindOf,
  scheduleStatusOf,
  UNSET,
  type ActionItem,
  type ScheduleKind,
} from '../../shared/contract'
import type { SharedActionPatch } from '../api'
import type { SavedMeeting } from '../meeting-history'
import { DotPulse, SkeletonList } from './LogoLoader'

type ScheduledAction = ActionItem & {
  id: string
  meetingId: string
  meetingDate: string
  pageUrl: string
}

type ActionDashboardProps = {
  meetings: SavedMeeting[]
  isRefreshing: boolean
  mutatingId: string
  onRefresh: () => void
  onUpdateAction: (meetingId: string, actionId: string, patch: SharedActionPatch) => void
  onDeleteAction: (meetingId: string, actionId: string) => void
}

type EditDraft = {
  할일: string
  담당자: string
  기한: string
  유형: ScheduleKind
}

const TEAM_MEMBERS = [UNSET, '소정', '하영', '해냄', '유진']

function dueLabel(date: string) {
  if (!date || date === UNSET) return '기한 미정'
  const today = new Date().toISOString().slice(0, 10)
  if (date === today) return '오늘'
  return date.slice(5).replace('-', '/')
}

function sortByDue(left: ScheduledAction, right: ScheduledAction) {
  const leftDue = left.기한 === UNSET ? '9999-12-31' : left.기한
  const rightDue = right.기한 === UNSET ? '9999-12-31' : right.기한
  return leftDue.localeCompare(rightDue)
}

function ScheduleCard({
  item,
  isMutating,
  onUpdate,
  onDelete,
}: {
  item: ScheduledAction
  isMutating: boolean
  onUpdate: (patch: SharedActionPatch) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditDraft>({
    할일: item.할일,
    담당자: item.담당자,
    기한: item.기한 === UNSET ? '' : item.기한,
    유형: scheduleKindOf(item),
  })
  const completed = scheduleStatusOf(item) === '완료'

  const openEditor = () => {
    setDraft({
      할일: item.할일,
      담당자: item.담당자,
      기한: item.기한 === UNSET ? '' : item.기한,
      유형: scheduleKindOf(item),
    })
    setEditing(true)
  }

  const saveEditor = () => {
    const 할일 = draft.할일.trim()
    if (!할일) return
    onUpdate({
      할일,
      담당자: draft.담당자 || UNSET,
      기한: draft.기한 || UNSET,
      유형: draft.유형,
    })
    setEditing(false)
  }

  return (
    <li className={`schedule-card ${completed ? 'is-complete' : ''}`} aria-busy={isMutating}>
      <button
        className="schedule-check"
        type="button"
        onClick={() => onUpdate({ 상태: completed ? '진행' : '완료' })}
        disabled={isMutating}
        aria-label={`${item.할일} ${completed ? '진행 중으로 되돌리기' : '완료 처리'}`}
      >
        <span aria-hidden="true">{completed ? '✓' : ''}</span>
      </button>
      <div className="schedule-card-main">
        <div className="schedule-card-meta">
          <span className="schedule-meeting-date">{item.meetingDate}</span>
          <span className={item.기한 === UNSET ? 'schedule-due is-unset' : 'schedule-due'}>{dueLabel(item.기한)}</span>
        </div>
        <h3>{item.할일}</h3>
        <p><strong>{item.담당자 === UNSET ? '팀 전체' : item.담당자}</strong><span>·</span>{scheduleKindOf(item)}</p>
      </div>
      <div className="schedule-card-actions">
        {item.pageUrl && <a href={item.pageUrl} target="_blank" rel="noreferrer">회의록 ↗</a>}
        <button type="button" onClick={openEditor} disabled={isMutating}>수정</button>
        <button className="schedule-delete" type="button" onClick={onDelete} disabled={isMutating}>삭제</button>
      </div>

      {editing && (
        <form
          className="schedule-editor"
          onSubmit={(event) => {
            event.preventDefault()
            saveEditor()
          }}
        >
          <label>일정
            <input value={draft.할일} onChange={(event) => setDraft({ ...draft, 할일: event.target.value })} autoFocus />
          </label>
          <label>구분
            <select value={draft.유형} onChange={(event) => setDraft({ ...draft, 유형: event.target.value as ScheduleKind })}>
              {SCHEDULE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label>담당자
            <select value={draft.담당자} onChange={(event) => setDraft({ ...draft, 담당자: event.target.value })}>
              {TEAM_MEMBERS.map((member) => <option key={member} value={member}>{member === UNSET ? '팀 전체 / 미정' : member}</option>)}
            </select>
          </label>
          <label>기한
            <input type="date" value={draft.기한} onChange={(event) => setDraft({ ...draft, 기한: event.target.value })} />
          </label>
          <div className="schedule-editor-actions">
            <button className="secondary-button" type="button" onClick={() => setEditing(false)} disabled={isMutating}>취소</button>
            <button className="primary-button" type="submit" disabled={isMutating || !draft.할일.trim()}>{isMutating ? <>반영 중<DotPulse /></> : '변경 저장'}</button>
          </div>
        </form>
      )}
    </li>
  )
}

function ScheduleSection({
  title,
  description,
  items,
  mutatingId,
  onUpdateAction,
  onDeleteAction,
}: {
  title: string
  description: string
  items: ScheduledAction[]
  mutatingId: string
  onUpdateAction: ActionDashboardProps['onUpdateAction']
  onDeleteAction: ActionDashboardProps['onDeleteAction']
}) {
  return (
    <section className="schedule-section" aria-labelledby={`schedule-${title}`}>
      <div className="schedule-section-heading">
        <div><h2 id={`schedule-${title}`}>{title}</h2><p>{description}</p></div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="schedule-empty-line">아직 이 구분의 일정이 없습니다.</p>
      ) : (
        <ul className="schedule-list">
          {items.map((item) => {
            const itemKey = `${item.meetingId}:${item.id}`
            return (
              <ScheduleCard
                key={itemKey}
                item={item}
                isMutating={mutatingId === itemKey}
                onUpdate={(patch) => onUpdateAction(item.meetingId, item.id, patch)}
                onDelete={() => {
                  if (window.confirm(`“${item.할일}” 일정을 삭제할까요?\n사이트와 Notion 회의록의 액션 아이템 표에서 함께 삭제됩니다.`)) {
                    onDeleteAction(item.meetingId, item.id)
                  }
                }}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function ScheduleBoard({
  meetings,
  isRefreshing,
  mutatingId,
  onRefresh,
  onUpdateAction,
  onDeleteAction,
}: ActionDashboardProps) {
  const items = useMemo<ScheduledAction[]>(() => meetings
    .flatMap((meeting) => meeting.record.액션아이템.map((item, index) => ({
      ...item,
      id: item.id ?? `${meeting.id}:${index}`,
      meetingId: meeting.id,
      meetingDate: meeting.record.날짜,
      pageUrl: meeting.pageUrl,
    })))
    .sort(sortByDue), [meetings])

  const activeItems = items.filter((item) => scheduleStatusOf(item) === '진행')
  const completedItems = items.filter((item) => scheduleStatusOf(item) === '완료')
  const today = new Date().toISOString().slice(0, 10)
  const dueToday = activeItems.filter((item) => item.기한 === today).length

  const personalItems = activeItems.filter((item) => scheduleKindOf(item) === '개인 일정')
  const teamItems = activeItems.filter((item) => scheduleKindOf(item) === '팀 일정')
  const plannedItems = activeItems.filter((item) => scheduleKindOf(item) === '다음 계획')

  return (
    <section className="screen schedule-screen" aria-labelledby="schedule-title">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow"><span aria-hidden="true">S</span> MEETING FOLLOW-UP</p>
          <h1 id="schedule-title">ACTION ITEMS</h1>
          <p className="schedule-lede">회의 뒤에 남은 행동과, 팀이 함께 확인할 다음 계획입니다.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? <>불러오는 중<DotPulse /></> : '새로고침'}
        </button>
      </div>

      <div className="schedule-overview" aria-label="일정 요약">
        <p><strong>{activeItems.length}</strong>개의 일정이 남아 있습니다.</p>
        <span>{dueToday ? `오늘 마감 ${dueToday}개` : '오늘 마감 없음'}</span>
        <span>완료 {completedItems.length}개</span>
      </div>

      {isRefreshing && items.length === 0 ? (
        <SkeletonList label="회의록의 일정을 불러오는 중" />
      ) : items.length === 0 ? (
        <div className="schedule-empty"><span aria-hidden="true">+</span><p>아직 정리된 일정이 없습니다.</p><small>회의록을 저장하면 담당자와 기한이 이곳에 자연스럽게 모입니다.</small></div>
      ) : (
        <>
          <ScheduleSection title="개인 일정" description="담당자가 정해진 다음 행동" items={personalItems} mutatingId={mutatingId} onUpdateAction={onUpdateAction} onDeleteAction={onDeleteAction} />
          <ScheduleSection title="팀 일정" description="함께 진행하거나 담당자를 정할 일" items={teamItems} mutatingId={mutatingId} onUpdateAction={onUpdateAction} onDeleteAction={onDeleteAction} />
          <ScheduleSection title="다음 계획" description="다음 회의 전 확인할 방향과 시점" items={plannedItems} mutatingId={mutatingId} onUpdateAction={onUpdateAction} onDeleteAction={onDeleteAction} />

          <details className="schedule-completed">
            <summary>완료됨 <span>{completedItems.length}</span></summary>
            {completedItems.length ? <ul className="schedule-list">{completedItems.map((item) => {
              const itemKey = `${item.meetingId}:${item.id}`
              return <ScheduleCard key={itemKey} item={item} isMutating={mutatingId === itemKey} onUpdate={(patch) => onUpdateAction(item.meetingId, item.id, patch)} onDelete={() => {
                if (window.confirm(`“${item.할일}” 일정을 삭제할까요?\n사이트와 Notion 회의록의 액션 아이템 표에서 함께 삭제됩니다.`)) onDeleteAction(item.meetingId, item.id)
              }} />
            })}</ul> : <p className="schedule-empty-line">아직 완료한 일정이 없습니다.</p>}
          </details>
        </>
      )}
    </section>
  )
}
