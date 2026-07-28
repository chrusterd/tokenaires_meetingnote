import { describe, expect, it } from 'vitest'
import { parseModelResponse, SYSTEM_PROMPT } from '../netlify/functions/_lib/structure-prompt'

describe('parseModelResponse', () => {
  it('맨 JSON을 파싱한다', () => {
    expect(parseModelResponse('{"결정사항":[]}')).toEqual({ 결정사항: [] })
  })

  it('json 코드펜스를 벗겨낸다', () => {
    expect(parseModelResponse('```json\n{"결정사항":["a"]}\n```')).toEqual({ 결정사항: ['a'] })
  })

  it('언어 표시 없는 코드펜스도 벗겨낸다', () => {
    expect(parseModelResponse('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('앞뒤에 설명이 붙어도 JSON 부분만 뽑는다', () => {
    expect(parseModelResponse('아래와 같이 정리했습니다.\n{"a":1}\n도움이 되었길 바랍니다.')).toEqual({ a: 1 })
  })

  it('중괄호가 문자열 안에 있어도 바깥 JSON을 파싱한다', () => {
    expect(parseModelResponse('설명 { 무시 }\n{"요약":"{문자열}"}\n끝')).toEqual({ 요약: '{문자열}' })
  })

  it('JSON이 아예 없으면 예외를 던진다', () => {
    expect(() => parseModelResponse('죄송합니다')).toThrow()
  })
})

describe('SYSTEM_PROMPT', () => {
  it('한국어 계약 키를 그대로 담고 있다', () => {
    for (const key of ['핵심_요약', '결정사항', '액션아이템', '논의_요약']) {
      expect(SYSTEM_PROMPT).toContain(key)
    }
  })

  it('추론 금지 규칙을 담고 있다', () => {
    expect(SYSTEM_PROMPT).toContain('미정')
    expect(SYSTEM_PROMPT).toContain('추론하지 않는다')
  })
})
