# 회의록:기록

텍스트 회의 메모를 구조화하고, 사람이 검토한 뒤 Notion의 회의록·액션 아이템 DB에 저장하는 Netlify 앱입니다.

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
GROQ_API_KEY=
NOTION_TOKEN=ntn_...
NOTION_MEETINGS_DB=
NOTION_ACTIONS_DB=
```

`VITE_`로 시작하는 비밀 환경 변수는 사용하지 않습니다. Vite가 클라이언트 번들에 포함하기 때문입니다.

## Notion 준비

회의록 DB에는 `제목`(Title), `날짜`(Date), `참석자`(Multi-select), `안건 태그`(Multi-select), `핵심 요약`(Text), `진행 상태`(Rollup)가 필요합니다.

액션 아이템 DB에는 `할 일`(Title), `담당자`(Multi-select), `기한`(Date), `완료`(Checkbox), `회의`(회의록 DB와 양방향 Relation), `출처`(Select)가 필요합니다. `진행 상태` Rollup은 역방향 `액션 아이템` relation의 `완료`를 `Percent checked`로 계산합니다.

두 DB 모두 해당 Notion Integration에 연결해야 합니다. 속성 이름은 코드와 정확히 일치해야 합니다.

## 실제 왕복 확인

환경 변수를 채운 뒤 아래 명령을 실행하면 더미 회의록과 연결된 액션 아이템을 실제로 생성·조회합니다.

```powershell
npm run roundtrip
```

이 명령은 Notion에 테스트 레코드를 만들므로 확인 후 필요하면 Notion에서 삭제하세요.

## 배포

Netlify 사이트 환경 변수에 `GROQ_API_KEY`, `NOTION_TOKEN`, `NOTION_MEETINGS_DB`, `NOTION_ACTIONS_DB`를 등록한 뒤 배포합니다. 브라우저 환경 변수로 노출하지 마세요.
