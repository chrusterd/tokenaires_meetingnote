# 회의록:기록

회의 메모 또는 녹음을 구조화하고, 사람이 검토한 뒤 Notion 회의록 DB에 저장하는 Netlify 앱입니다. 액션 아이템은 각 회의록 본문의 표에 함께 기록됩니다.

구조화에는 Groq `openai/gpt-oss-120b`와 JSON Schema 기반 구조화 출력을 사용합니다.
json_schema를 지원하는 Groq 모델은 gpt-oss 계열뿐입니다.
오디오 전사에는 Groq `whisper-large-v3-turbo`를 사용합니다. 브라우저에서 16kHz 모노 WAV
2분 조각으로 잘라 순서대로 보내는데, Netlify 동기 함수의 본문 상한(약 6MB)과 실행 시간
제한(10초)에 각각 맞추기 위해서입니다.

## 시작하기

```powershell
npm install
npm test
npm run build
```

로컬 함수까지 실행하려면 Netlify CLI에서 다음을 사용합니다.

```powershell
netlify dev
```

## 환경 변수

`.env.example`을 `.env`로 복사해 아래 값을 채웁니다. `.env`는 Git에 포함되지 않습니다.

```dotenv
GROQ_API_KEY=gsk_...
NOTION_TOKEN=ntn_...
NOTION_MEETINGS_DB=
```

`VITE_`로 시작하는 비밀 환경 변수는 사용하지 않습니다. Vite가 클라이언트 번들에 포함하기 때문입니다.

환경 변수 이름에 `GEMINI_API_KEY`처럼 Netlify가 AI Gateway 예약 이름으로 쓰는 값은
피합니다. Netlify가 자기 토큰으로 덮어써서 넣어 둔 실제 키가 함수까지 오지 않습니다.

무료 등급 한도(2026-07-28 실측): 전사는 시간당 오디오 7,200초 · 하루 2,000건으로
넉넉하지만, 구조화는 **분당 8,000토큰**이 걸립니다. 30분 회의 전사문이 약 8,000토큰이라
그보다 긴 회의는 413과 함께 안내 메시지가 나옵니다. 한도를 올리려면 Groq Dev Tier로
전환하면 되고, 코드 수정은 필요 없습니다.

## Notion 준비

회의록 DB에는 `회의명`(Title), `날짜`(Date), `내용`(Text)이 필요합니다. `상태`는 Notion DB의 기본값을 그대로 사용합니다.

회의록 본문에는 참석자, 결정사항, 액션 아이템 표, 논의 요약, 전사 전문이 함께 기록됩니다. 해당 회의록 DB만 Notion Integration에 연결하면 됩니다.

## 실제 왕복 확인

환경 변수를 채운 뒤 아래 명령을 실행하면 더미 회의록과 본문의 액션 아이템 표를 실제로 생성·확인합니다.

```powershell
npm run roundtrip
```

이 명령은 Notion에 테스트 레코드를 만들므로 확인 후 필요하면 Notion에서 삭제하세요.

## 배포

Netlify 사이트 환경 변수에 `GROQ_API_KEY`, `NOTION_TOKEN`, `NOTION_MEETINGS_DB`, `SITE_PASSWORD`를 등록한 뒤 배포합니다. 액션 아이템은 별도 DB가 아니라 각 회의록 본문의 표에 기록됩니다. 브라우저 환경 변수로 노출하지 마세요.
