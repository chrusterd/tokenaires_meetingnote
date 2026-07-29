import { useState } from 'react'
import { unlockSite } from '../api'

export function AccessGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsChecking(true)
    setError('')
    try {
      await unlockSite(password)
      onUnlocked()
    } catch (unlockError) {
      setError((unlockError as Error).message)
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <main className="access-shell">
      <section className="access-card" aria-labelledby="access-title">
        <span className="access-mark" aria-hidden="true"><img src="/tokenaires-logo.png" alt="" /></span>
        <p className="eyebrow">Shared meeting room</p>
        <h1 id="access-title">회의 기록을<br />함께 봅니다.</h1>
        <p>공용 회의록 공간입니다. 팀 비밀번호를 입력하면 모든 사람이 저장한 기록을 함께 볼 수 있습니다.</p>
        <form onSubmit={submit}>
          <label htmlFor="site-password">입장 비밀번호
            <input id="site-password" type="password" inputMode="numeric" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="primary-button" type="submit" disabled={isChecking || !password}>{isChecking ? '확인 중…' : '회의록 열기'} <span aria-hidden="true">→</span></button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  )
}
