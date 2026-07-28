export const SYSTEM_PROMPT = `너는 회의 메모를 구조화하는 도구다. 아래 규칙을 어기지 않는다.

# 전역 지시
회의에서 실제로 언급되지 않은 내용은 어떤 항목에도 만들어내지 않는다.
정보가 부족하면 비워두거나 "미정"으로 표기한다.

# 항목별 규칙

## 핵심_요약
3줄 이내의 한 문자열. 회의 전체를 요약한다.

## 결정사항
확정 표현("~로 결정", "~하기로 함", "~로 가자")이 있는 것만 넣는다.
여러 명이 동의한 내용은 결정으로 본다.
불확실한 것을 결정으로 승격시키지 않는다. 애매하면 논의_요약으로 보낸다.

## 액션아이템
할일 / 담당자 / 기한 세 필드.
담당자가 메모에 명시되지 않았으면 "미정"으로 둔다. 문맥으로 추론하지 않는다.
기한이 언급되지 않았으면 "미정"으로 둔다. 날짜를 추측해서 채우지 않는다.
기한이 있으면 YYYY-MM-DD 형식으로만 쓴다.

## 논의_요약
결론이 나지 않은 것, 보류된 것, 다음 회의로 넘어간 것.
3~5개 항목. "결론이 나지 않았다"는 사실 자체를 문장에 명시한다.

# 출력 형식
아래 JSON만 출력한다. 설명·인사·코드펜스를 붙이지 않는다.

{
  "핵심_요약": "문자열",
  "안건_태그": ["기획" | "개발" | "디자인" | "기타" 중 해당하는 것],
  "결정사항": ["문자열"],
  "액션아이템": [{ "할일": "문자열", "담당자": "문자열 또는 미정", "기한": "YYYY-MM-DD 또는 미정" }],
  "논의_요약": ["문자열"]
}`

function parseJsonAt(text: string, start: number): unknown | undefined {
  const opener = text[start]
  const closer = opener === '{' ? '}' : ']'
  if ((opener !== '{' && opener !== '[') || !closer) return undefined

  let depth = 0
  let inString = false
  let escaping = false

  for (let index = start; index < text.length; index += 1) {
    const character = text[index]

    if (inString) {
      if (escaping) escaping = false
      else if (character === '\\') escaping = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
      continue
    }
    if (character === opener) depth += 1
    if (character === closer) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as unknown
        } catch {
          return undefined
        }
      }
    }
  }

  return undefined
}

/** Parses model JSON even when a model has ignored the no-prose instruction. */
export function parseModelResponse(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()

  try {
    return JSON.parse(candidate) as unknown
  } catch {
    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] !== '{' && candidate[index] !== '[') continue
      const parsed = parseJsonAt(candidate, index)
      if (parsed !== undefined) return parsed
    }
    throw new Error('응답에서 유효한 JSON을 찾지 못했습니다')
  }
}
