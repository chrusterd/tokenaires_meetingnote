import type { SavedMeeting } from '../meeting-history'
import { DotPulse, SkeletonList } from './LogoLoader'

type MeetingHistoryProps = {
  meetings: SavedMeeting[]
  isLoading: boolean
  onOpen: (meeting: SavedMeeting) => void
  onDelete: (meeting: SavedMeeting) => void
  deletingId: string
}

export function MeetingHistory({ meetings, isLoading, onOpen, onDelete, deletingId }: MeetingHistoryProps) {
  return (
    <section className="screen history-screen" aria-labelledby="history-title">
      <div className="dashboard-heading">
        <div><p className="eyebrow">NOTION SYNC</p><h1 id="history-title">기록된 회의</h1></div>
        <p className="history-count">최근 {meetings.length}개</p>
      </div>

      {isLoading && meetings.length === 0 ? (
        <SkeletonList label="회의록을 불러오는 중" />
      ) : meetings.length === 0 ? (
        <div className="history-empty">
          <span aria-hidden="true">+</span>
          <p>아직 사이트에 보관된 회의록이 없습니다.</p>
          <small>Notion에 저장을 완료한 회의는 이곳에도 함께 표시됩니다.</small>
        </div>
      ) : (
        <ul className="history-list">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="history-item">
              <time dateTime={meeting.record.날짜}>{meeting.record.날짜}</time>
              <div className="history-summary">
                <h2>{meeting.record.핵심_요약 || '제목 없는 회의록'}</h2>
                <p>{meeting.record.참석자.length ? meeting.record.참석자.join(' · ') : '참석자 미정'} <span>·</span> 액션 아이템 {meeting.record.액션아이템.length}개</p>
              </div>
              <div className="history-actions">
                {meeting.pageUrl && <a href={meeting.pageUrl} target="_blank" rel="noreferrer">Notion ↗</a>}
                <button className="secondary-button" type="button" onClick={() => onOpen(meeting)}>열기</button>
                <button
                  className="history-delete-button"
                  type="button"
                  onClick={() => onDelete(meeting)}
                  disabled={deletingId === meeting.id}
                  aria-label={`${meeting.record.날짜} 회의록 삭제`}
                >
                  {deletingId === meeting.id ? <>삭제 중<DotPulse /></> : '삭제'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
