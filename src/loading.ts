import { useEffect, useState } from 'react'

/**
 * 값이 사라진 뒤에도 holdMs 동안 마지막 값을 유지한다.
 * 비밀번호 확인처럼 순식간에 끝나는 대기에서 로더가 번쩍이고 사라지는 것을 막는다.
 */
export function useHeldValue<T extends string>(value: T | null, holdMs = 900): T | null {
  const [held, setHeld] = useState<T | null>(value)

  useEffect(() => {
    if (value !== null) {
      setHeld(value)
      return
    }
    const timer = window.setTimeout(() => setHeld(null), holdMs)
    return () => window.clearTimeout(timer)
  }, [value, holdMs])

  return held
}

/** 대기가 시작된 뒤 흐른 초. 분 단위로 걸리는 전사 구간에서 멈춘 것과 구분해준다. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  return seconds
}
