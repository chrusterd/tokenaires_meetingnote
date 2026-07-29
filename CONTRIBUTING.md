# 팀원 설정 가이드

이 저장소를 처음 받아서 로컬에서 돌리기까지의 절차입니다.

**이 저장소는 Public입니다.** 누구나 코드와 커밋 기록을 볼 수 있습니다. 아래 "비밀값 다루기"를 꼭 먼저 읽어주세요.

## 필요한 것

- Node.js 20 이상
- Netlify CLI — 이 저장소는 Netlify 서버리스 함수를 쓰기 때문에 `npm run dev`(Vite)만으로는 `/api/...` 호출이 동작하지 않습니다.

```powershell
npm install -g netlify-cli
```

## 처음 한 번만

```powershell
git clone https://github.com/chrusterd/tokenaires_claude.git
cd tokenaires_claude
npm install
copy .env.example .env
```

`.env`를 열어 값을 채운 뒤 실행합니다.

```powershell
netlify dev
```

동작 확인:

```powershell
npm test
```

## 비밀값 다루기

가장 중요한 부분입니다. 파일 세 개의 역할이 다릅니다.

| 파일 | 내용 | Git |
|---|---|---|
| `.env` | 실제 API 키·비밀번호 | **올라가지 않음** (`.gitignore`에 등록됨) |
| `.env.example` | 변수 이름만, 값은 전부 빈칸 | 올라감 |
| `.gitignore` | `.env`를 제외하는 규칙 | 올라감 |

`.env.example`은 **양식**입니다. "이런 이름의 변수들이 필요하다"만 알려주고, 값은 영원히 비어 있어야 합니다.

각자 `.env`를 만들어 자기 값을 넣습니다. `.env`는 각자 PC에만 존재하며 서로 만나지 않습니다.

### 절대 하지 말 것

- **`.env.example`에 실제 값을 적지 마세요.** 이 파일은 커밋 대상이라, 적는 순간 전 세계에 공개됩니다.
- **`.gitignore`에서 `.env` 줄을 지우지 마세요.**
- **키를 코드에 직접 적지 마세요.** 반드시 `process.env.이름`으로 읽습니다.

커밋 전에 확인하는 습관:

```powershell
git status
```

`.env`가 목록에 보이면 잘못된 것입니다. 커밋하지 말고 알려주세요.

## 환경 변수

`.env`에 넣어야 하는 값들입니다. **각자 달라도 되는 값과 팀 전체가 같아야 하는 값이 나뉩니다.**

| 변수 | 각자 / 공용 | 설명 |
|---|---|---|
| `GROQ_API_KEY` | **각자 발급** | 회의 내용 구조화와 음성 전사에 사용. 각자 무료 계정을 만드는 편이 낫습니다 — 사용량 한도를 따로 쓰게 되므로 서로 방해하지 않습니다. |
| `NOTION_TOKEN` | **공용** | 팀 공용 Notion에 접근하는 토큰. 사람마다 다르면 각자 다른 곳에 저장되므로 반드시 같은 값을 써야 합니다. |
| `NOTION_MEETINGS_DB` | **공용** | 회의록을 저장할 Notion 데이터베이스 ID. |
| `SITE_PASSWORD` | **공용** | 사이트 입장 비밀번호. 배포된 사이트와 값이 같아야 합니다. |

### GROQ_API_KEY 발급 (각자)

1. https://console.groq.com 가입
2. API Keys 메뉴에서 새 키 생성
3. `gsk_`로 시작하는 문자열을 `.env`의 `GROQ_API_KEY=`에 붙여넣기

키는 생성 직후 한 번만 보여줍니다. 놓치면 새로 만들면 됩니다.

무료 등급 한도(2026-07-28 실측): 전사는 시간당 오디오 7,200초로 넉넉하지만, 구조화는 **분당 8,000토큰** 제한이 있습니다. 30분 회의 전사문이 약 8,000토큰이라 그보다 긴 회의는 안내 메시지와 함께 실패합니다.

### 공용 값 받는 법

`NOTION_TOKEN`, `NOTION_MEETINGS_DB`, `SITE_PASSWORD`는 저장소에 넣을 수 없습니다. Public이라 넣는 순간 공개되기 때문입니다.

관리자에게 별도로 받아야 하며, **전달 경로에 주의해주세요.**

- 권장: 비밀번호 관리자 공유 기능(Bitwarden 등), 또는 1회용 링크 서비스
- 피할 것: 카카오톡, 이메일, Slack — 기록이 계속 남고 나중에 검색됩니다

**프론트엔드 화면만 수정한다면** Notion 토큰 없이도 작업할 수 있는 경우가 많습니다. 필요한 범위를 먼저 확인해보세요.

## 커밋 이메일 설정

**Public 저장소에서는 커밋에 기록된 이메일 주소를 누구나 볼 수 있습니다.** 커밋에는 파일 내용뿐 아니라 작성자 이름과 이메일이 함께 저장되고, 이 기록은 지워지지 않습니다. 수집 봇이 이를 긁어가 스팸에 쓰는 일이 흔합니다.

GitHub가 계정마다 제공하는 비공개 주소를 쓰면 됩니다. 잔디(컨트리뷰션 그래프)와 프로필 연결은 그대로 동작하므로 잃는 것이 없습니다.

**첫 커밋 전에** 설정해주세요. 이미 올린 뒤에 바꾸려면 히스토리를 다시 써야 하는데, 그때는 이미 복제된 사본에 남아 되돌리기 어렵습니다.

자기 주소 확인: GitHub → Settings → Emails → "Keep my email addresses private" 항목 아래에 `12345678+사용자명@users.noreply.github.com` 형태로 표시됩니다.

```powershell
git config --global user.name "본인 GitHub 사용자명"
git config --global user.email "12345678+사용자명@users.noreply.github.com"
```

같은 화면의 "Keep my email addresses private" 체크박스도 함께 켜두면 좋습니다.

## 알아둘 것

`netlify/functions/notion-query.ts`와 `notion-toggle.ts`, 그리고 `src/api.ts`의 `fetchActionItems` / `toggleActionItem`은 **현재 어디에서도 호출되지 않습니다.**

액션 아이템을 별도 Notion 데이터베이스에 저장하던 예전 구조의 흔적입니다. 지금은 각 회의록 페이지 본문의 표에 함께 기록하는 방식으로 바뀌었고, 화면은 `/api/meetings`로 동작합니다.

이 코드들이 참조하는 `NOTION_ACTIONS_DB` 환경 변수는 **설정할 필요가 없습니다.** `.env.example`에도 일부러 넣지 않았습니다.

코드를 읽다가 혼동하지 않도록 적어둡니다. 정리는 별도로 진행할 예정입니다.

## 자주 나오는 오류

**`Author identity unknown`**

Git에 이름과 이메일이 설정되지 않은 경우입니다. 위 "커밋 이메일 설정"을 따라주세요.

**`/api/...` 요청이 404**

`npm run dev`로 실행한 경우입니다. Vite만 띄우면 서버리스 함수가 함께 뜨지 않습니다. `netlify dev`를 사용하세요.

**입장 비밀번호가 틀렸다고 나옴**

`.env`의 `SITE_PASSWORD`가 비어 있거나 팀 공용 값과 다른 경우입니다.

**구조화 요청이 413으로 실패**

Groq 무료 등급의 분당 토큰 한도를 넘은 경우입니다. 회의가 30분을 넘으면 발생할 수 있습니다. 잠시 후 재시도하거나 더 짧은 내용으로 시험해보세요.

**환경 변수를 고쳤는데 반영되지 않음**

`.env`는 서버 시작 시 한 번 읽습니다. `netlify dev`를 껐다 다시 켜주세요.

## 작업 흐름

기본 브랜치는 `main`입니다. 작업은 별도 브랜치에서 진행한 뒤 Pull Request로 올려주세요.

```powershell
git checkout -b 작업이름
# 수정 후
npm test
git add -A
git commit -m "설명"
git push -u origin 작업이름
```

`main`에 직접 푸시하지 말아주세요.
