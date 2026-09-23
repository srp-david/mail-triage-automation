# 개발·검증 안내

현재 사용자명 인증 v1 코드 기준이다. 아래 명령은 저장소 루트에서 실행한다. `npm start`와 `npm run worker`는 기존 v0이며 팀용 API/로컬 앱을 대신 실행하지 않는다.

## 1. 준비와 빌드

Node.js 24와 npm이 필요하다. Windows 패키지 빌드는 Windows x64·Node v24.16.0 고정이다. Docker는 격리 DB/Edge 검사에, Chrome은 브라우저 검사에 사용한다. 로컬 앱의 DPAPI는 Windows 전용이다.

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd run build
node scripts/build-edge.mjs
node scripts/verify-build-compat.mjs
```

`check`는 React ESLint → Prettier 검사 → TypeScript 타입 검사 순서다. `build`는 TypeScript → 기존 dist 경로 호환 파일 → Office viewer → Markdown → React UI 순서다. Edge 번들은 별도 명령이다. 빌드가 실행 중 Docker API나 Supabase 함수를 자동 교체하지 않는다.

### React 코드 스타일과 포맷

메인 UI(`packages/ui/ui`)와 Office 뷰어(`packages/ui/viewer`)에 ESLint flat config와 Prettier를 적용한다. ESLint는 TypeScript 권장 규칙과 React Hooks 호출/의존성을 검사하고, `eslint-config-prettier`로 포맷 규칙 충돌을 방지한다. React Compiler 전용 규칙은 사용하지 않는다. Prettier는 TS/TSX/JS/CSS/JSON/HTML에 공백 2칸·100자 기준·세미콜론·JS 작은따옴표·JSX 큰따옴표·후행 쉼표·LF를 적용한다. `.gitattributes`로 Windows checkout에서도 이 범위의 LF를 유지한다.

```powershell
npm.cmd run lint          # React ESLint 검사, 경고도 실패 처리
npm.cmd run lint:fix      # 자동 수정 가능한 린트 항목 수정
npm.cmd run format        # React 소스 포맷 적용
npm.cmd run format:check  # 파일을 수정하지 않고 포맷 검사
npm.cmd run typecheck     # 타입 검사만 실행
npm.cmd run check         # lint + format:check + typecheck
```

현재 `typescript-eslint`는 TypeScript 7의 새 API를 지원하지 않으므로 `typescript` 6.0.3은 린트용 API로 사용한다. 기존 빌드·타입 검사 컴파일러는 npm 별칭 `@typescript/native`로 고정한 **TypeScript 7.0.2**다. `build:types`가 해당 실행 파일을 명시적으로 호출하므로 직접 `npx tsc` 대신 위 npm 명령을 사용한다. `npm run build:types -- --version`으로 확인할 수 있다. 런타임 의존성이나 ERP 코드/DB에는 영향을 주지 않는다.

IDE에서는 프로젝트의 `eslint.config.mjs`와 `.prettierrc.json`을 사용한다. 백엔드·기존 `public` 코드·생성 산출물·비밀 설정은 이 React 포맷 명령의 대상이 아니다. 첨부 캐시를 메일별로 새로 만드는 두 `useMemo`는 의도적인 캐시 경계여서 해당 줄에만 사유와 함께 Hooks 의존성 예외를 기록했다.

### 폼과 입력 검증

로그인·비밀번호 변경·관리자 계정 생성/수정·출처/실행 설정·출처/문서 모음/장치 등록은 React Hook Form과 Zod resolver를 사용한다. 공통 스키마는 `packages/ui/ui/src/forms/schemas.ts`에 둔다. 서버의 인증·권한·입력 검증은 그대로 최종 기준이다. 검색 조건과 보고서 답변 초안 등 저장 수명이 다른 UI 상태는 기존 방식을 유지한다.

필드 오류를 입력 아래에 표시하고 제출 중 버튼을 잠근다. 공통 Form은 같은 시점의 중복 제출과 한글 IME 확정 Enter를 막는다. 로그인 실패/완료 및 비밀번호 변경 뒤에는 비밀번호만 지우며 비밀번호 공백을 자동 제거하지 않는다. Zod는 strict CSP에서 동적 함수 생성이 발생하지 않도록 `jitless`로 설정한다.

### 테스트 실행

유닛·React 컴포넌트·서버 통합 검증은 Vitest로 실행한다. React Testing Library와 user-event는 jsdom에서 입력과 접근 가능한 화면 동작을 검사한다. 브라우저 검증은 Playwright Test가 실행기·worker 격리·HTML 보고서·trace를 관리한다.

```powershell
npm.cmd test                     # DB 없이 유닛 + React 컴포넌트
npm.cmd run test:watch           # 위 범위를 변경 감시
npm.cmd run test:integration     # 일회용 PostgreSQL에서 API/DB 통합 검사
npm.cmd run test:all             # 유닛 + React + API/DB
npm.cmd run test:coverage        # .runtime/coverage
npm.cmd run build                # E2E가 사용하는 UI/Office/Markdown 빌드
npm.cmd run test:e2e             # Playwright 전체: UI 16종 + 실제 인증 API/DB
npm.cmd run test:e2e:report       # .runtime/playwright-report
```

DB 검사는 Docker의 `postgres:17`을 loopback 임의 포트와 tmpfs로 실행하고 종료 시 해당 임시 컨테이너만 제거한다. Vitest의 integration 프로젝트를 직접 실행할 때는 전용 `TEST_DATABASE_URL`이 필요하며 앱의 `.env`를 자동 사용하지 않는다. 기존 erp-manager CLI 계약 검사는 `TRIAGE_CLI_SOURCE`에 해당 CLI 파일을 지정한 뒤 `npm run test:external`로 별도 실행한다. 기본 테스트에서 이 외부 저장소 의존성을 숨겨 건너뛰지 않는다.

Playwright는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 지정값, Windows 기본 설치 Chrome, Playwright 관리 Chromium 순서로 선택한다. 관리 Chromium이 필요하면 `npx playwright install chromium`을 한 번 실행한다. Office 합성 fixture 생성에는 Python 3 표준 라이브러리를 사용한다. 인증 E2E에는 Docker가 필요하다. 기존 `node scripts/verify-react-suite.mjs manual-threads` 명령도 Playwright 실행기로 연결된다.

기존 16종은 모의 API 또는 합성 메일 공급자를 사용하는 브라우저 회귀이고, `auth-database.spec.ts`는 브라우저 티켓 → React 로그인 → local-app → 실제 사용자명 API → 임시 PostgreSQL → 비밀번호 변경/로그아웃을 통과한다. 개인 MCP·Agent·운영 Supabase의 종단 검증과는 구분한다. trace와 화면은 합성 자료만 사용하며 `.runtime`에 보관한다.

## 2. 공용 API의 개발 실행

운영 DB가 아닌 명시적으로 준비한 개발 DB를 사용한다. `DATABASE_URL_FILE`, `HISTORY_SCHEMA`, 필요한 CA를 운영자 전용 개발 설정에서 로드하고 schema를 먼저 만든 뒤 migration을 수행한다.

```powershell
node dist/apps/history-api/src/main.js --migrate
```

서버 실행에는 `AUTH_ISSUER`, `AUTH_AUDIENCE`, `TEAM_ID`, `AUTH_SIGNING_KEY_FILE`과 DB 연결이 필요하다. 처음에는 팀·최초 관리자도 준비해야 하므로 [운영자 절차](../operations/supabase.md)를 따른다. 비밀을 명령 인자·Git에 넣지 않는다.

```powershell
node dist/apps/history-api/src/main.js
```

기본 bind는 `127.0.0.1:3081`이다. 루트 v0의 `/api`와 달리 자료는 `/api/v1`, 인증은 `/auth`다. Auth0의 namespace/company domain/clientId를 이 실행 경로에 넣지 않는다.

## 3. 로컬 앱 설정과 실행

아래는 실제 값이 없는 설정 예시다. `PROJECT`, 실행 파일·자료 경로를 본인 환경에 맞게 바꿔 `<TRIAGE_LOCAL_HOME>/config/settings.json`에 저장한다. `auth`는 현재 키만 허용한다.

```json
{
  "localPort": 43180,
  "historyUrl": "https://PROJECT.supabase.co/functions/v1/history",
  "auth": {
    "mode": "username",
    "issuer": "https://PROJECT.supabase.co/history-auth",
    "audience": "mail-triage"
  },
  "mailMcpUrl": "http://127.0.0.1:17082/mcp",
  "agents": {
    "codex": {
      "executable": "C:/approved/node.exe",
      "prefix": ["C:/approved/codex.js"]
    }
  },
  "evidenceRoots": {"gg": "C:/approved-readonly/erp-gg"}
}
```

mailMcpUrl·agents는 선택 항목이다. 미설정 상태에서도 서버 로그인은 가능하지만 원본 조회·분석에는 해당 연결이 필요하다. evidenceRoots 기본값은 `{}`다. Agent 실행 경로는 제공자 프로그램을 자동 설치하거나 로그인시키지 않는다. DB provider는 현재 진입점에 연결되어 있지 않다.

개발용 앱을 전경 실행하려면 별도 설정 폴더를 만들고 다음을 실행한다. 기존 설치본과 같은 포트/폴더를 동시에 사용하지 않는다.

```powershell
$env:TRIAGE_LOCAL_HOME = 'C:\work\mail-triage-dev'
node dist/apps/local-app/src/main.js
```

다른 PowerShell에서 같은 `TRIAGE_LOCAL_HOME`을 지정한 뒤 브라우저를 연다. 단순 URL 탐색은 로컬 세션을 만들지 못한다.

```powershell
$env:TRIAGE_LOCAL_HOME = 'C:\work\mail-triage-dev'
node scripts/history-v1.mjs open
```

설치 후보의 시작·종료는 [Windows 안내](../operations/windows.md)의 lifecycle 도구를 사용한다. `app.lock`을 삭제해 실행 중복이나 업데이트 차단을 우회하지 않는다.

## 4. 직접 CLI

실행 중 로컬 앱이 토큰 갱신을 소유한다. CLI는 DPAPI 제어 채널로 같은 API를 이용한다.

```powershell
node scripts/history-v1.mjs sources
node scripts/history-v1.mjs settings
node scripts/history-v1.mjs get RUN_UUID
node scripts/history-v1.mjs progress RUN_UUID
```

쓰기 동작은 `begin INPUT_JSON`, `cancel RUN_UUID`, `review RUN_UUID INPUT_JSON`, `handling RUN_UUID true|false`, `runner start analysis|sync`, `runner stop`, `sync start|stop`, `recovery show|deliver|recover|deliver-sync|archive-analysis|archive-sync`다. 실제 자료·작업을 바꾸므로 지정된 시험 범위에서만 실행한다. begin에는 `storeId`(source UUID), mailId/messageId, 고정 requestId와 선택 parentId/answer를 사용한다.

## 5. 검증 수준

| 명령 | 확인 대상·전제 |
|---|---|
| `npm.cmd run check` | 타입·UI 컴파일 검사. 실제 서버 검증 아님 |
| `npm.cmd run build` | 배포 가능한 코드 생성. 서비스 배포 아님 |
| `npm.cmd run test:all` | 독립 PostgreSQL Docker의 서버 통합 + 유닛 + React 검사 |
| `node --import tsx scripts/verify-supabase.mjs --browser` | 로컬 Edge·DB·합성 인증·Chrome·Runner·복원. hosted=false |
| `node scripts/verify-windows-lifecycle.mjs PAYLOAD` | 검증 후보의 설치·기동·중지·개인 상태 보존 |
| `node --import tsx scripts/verify-dpapi.mjs` | Windows DPAPI 합성 검사 |
| 실제 팀 파일럿 | 두 사용자·두 PC·개인 Agent/MCP·지정 업무. 별도 기록 |

전체 backend에는 기존 erp-manager CLI를 읽는 호환 검사도 있다. 해당 checkout을 사용할 때 실제 파일을 지정한다.

```powershell
$env:TRIAGE_CLI_SOURCE = 'C:/path/to/erp-manager/tools/triage-history.mjs'
npm.cmd run test:external
```

`npm test`는 DB에 연결하지 않는다. DB 검사는 격리 스크립트로 실행하고 테스트 로그의 실제 대상 DB를 확인한다. 실 Agent 검증은 비용과 제공자 자격을 사용하므로 일반 타입 검사와 구분한다.

## 6. 오류와 변경 기준

API 오류의 requestId·`X-Request-ID`와 stderr JSON 로그를 대조한다. 로컬 로그에 upstreamRequestId가 있으면 같은 원격 ID를 찾는다. 본문·토큰·SQL·raw stack을 로그에 추가하지 않는다. 설치 launcher는 stdio를 자동 파일로 수집하지 않으므로 수집 방식은 별도로 준비한다.

schema 변경은 새 migration과 grants·복원 검증을 함께 다룬다. 계약 변경은 공용 API/HistoryClient/로컬 UI/Runner를 함께 확인한다. 실제 수행 결과는 [검증 일지](../validation.md), 현재 수용 범위는 [현재 상태](../current-status.md)에 남긴다.
