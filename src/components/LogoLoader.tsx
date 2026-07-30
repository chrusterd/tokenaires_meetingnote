import './LogoLoader.css'

/** 모든 대기 구간이 같은 로고 영상을 쓴다. 표시 크기는 감싼 쪽 CSS가 정한다. */
export function LogoLoader() {
  return <video className="logo-loader" src="/logo-loading.webm" autoPlay muted loop playsInline aria-hidden="true" />
}

/** ratio를 주면 실제 진행률, 없으면 끝을 모르는 대기를 뜻한다. */
export function LoadingBar({ ratio }: { ratio?: number }) {
  if (ratio === undefined) return <div className="loading-bar is-indeterminate"><span /></div>

  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  return (
    <div className="loading-bar is-determinate" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${Math.max(4, percent)}%` }} />
    </div>
  )
}

/** 버튼 안에서 쓰는 가장 작은 대기 표시. */
export function DotPulse() {
  return <span className="dot-pulse" aria-hidden="true"><i /><i /><i /></span>
}

/** 화면 전체를 덮는 대기 표시. 화면이 바뀌어도 이 요소는 계속 붙어 있어야 영상이 다시 시작하지 않는다. */
export function LoadingOverlay({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="loading-overlay">
      <div className="loading-overlay-card" role="status" aria-live="polite">
        <LogoLoader />
        <h2>{title}</h2>
        <p>{detail}</p>
        <LoadingBar />
      </div>
    </div>
  )
}

/** 목록을 처음 불러오는 동안 실제 행과 같은 자리를 잡아둔다. */
export function SkeletonList({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <ul className="skeleton-list" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <li className="skeleton-item" key={index}>
          <span className="skeleton-line" />
          <span className="skeleton-lines"><span className="skeleton-line is-title" /><span className="skeleton-line is-half" /></span>
          <span className="skeleton-line" />
        </li>
      ))}
    </ul>
  )
}
