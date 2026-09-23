# 검증 기록

> 날짜별 실제 검증 일지다. 과거 미완료 항목은 후속 기록과 함께 읽는다. 최신 구현 계획은 [통합 구현 계획](implementation-plan.md), 문서별 역할은 [문서 안내](README.md)를 따른다.

## 2026-09-23 Release·Windows 설치 소스와 로컬 후보 검증 진행

- Agent adapter의 고정 CLI 버전 일치 검사를 제거하고, 서명 update 메타데이터·인증 update API·로컬 다운로드/updater·업데이트 버튼 소스를 추가했다. self-extracting Windows setup.exe 빌더와 실행/작업 중지/앱 종료 shortcut 스크립트도 추가했다. 이는 소스 구현 상태다.
- candidate.7까지의 개발 세션에서 check/build/Edge bundle이 통과했고, `0.3.0-candidate.7` setup.exe로 한글 경로 설치·기동·작업 중지·앱 종료·업그레이드를 로컬 검증했다. 이후 UI를 조정한 candidate.9의 회귀 결과와 구분한다. 이전 candidate.5의 설치/해시 기록과도 구분한다.
- 업데이트 안내 배너가 상단 로그아웃을 가리지 않도록 UI를 조정하고 `candidate.9`를 최종 배포 후보로 선택했다. candidate.7 수명주기 통과는 이전 후보의 증거로 보존하며 candidate.9 패키징·설치·UI 회귀 통과로 간주하지 않는다. candidate.8은 중간 후보로 남긴다.
- 현재 기록 시점에는 candidate.9 검증, GitHub push/Release 게시, hosted API 갱신, 게시 asset 다운로드·실사용 업데이트, 실제 Mail MCP/Agent 분석·저장·재조회, 깨끗한 팀 PC/2PC 수용이 완료되지 않았다. `releaseApproved=false`를 유지한다.
- 실행 순서는 Release 계약·패키징 → 설치 파일·앱 업데이트 검증 → 검토된 소스 push·검증된 파일 Release 게시 → 새 설치본 실분석으로 갱신했다. ERP 코드/DB는 읽기 전용이며 공개 전 소스·Git 이력·설치 파일·문서/변경 내역의 비밀·메일 원문·업무 자료를 검토한다.

## 2026-09-22 GitHub 대상 저장소 확인과 작업 순서 보완

- 사용자가 생성한 `srp-david/mail-triage-automation`을 GitHub CLI로 읽기 전용 조회했다. visibility=PUBLIC, isEmpty=true, 기본 branch 이름 없음 확인. 로컬 remote는 미설정이다. 웹 조회 실패와 sandbox의 CLI 설정 접근 제한 후 권한 있는 읽기 전용 CLI 조회로 확인했으며 인증 정보는 출력하지 않았다.
- 계획/현재 상태/Release 안내에 저장소 확정을 반영하고 D13의 공개 범위·서명·게시 정책 등 남은 결정을 구분했다. 개인 연결/실분석 → Release 배포 기반·metadata 계약 → 간편 설치/앱 업데이트 → 파일럿 순서로 보완했다. 저장소 생성과 Release 게시/업데이트 기능 완료는 구분한다.
- 문서만 변경하며 remote 설정·commit/push·Release 게시·제품 배포는 수행하지 않았다.

## 2026-09-22 계획 v3.2 · Release 업데이트와 보고서 협업 문서 통합

- 사용자 제공 Release 업데이트 인수인계를 읽고 `implementation-plan.md`를 v3.2로 갱신했다. public 우선·GitHub Release 보관·인증된 버전/채널/호환 조회 방향, 직접 다운로드/버튼 설치 기본안, D13의 저장소/공개 범위·서명/게시·private 전환 결정을 구분했다.
- `operations/releases.md`에 현재 재사용 코드·제안 API/메타데이터·서명 신뢰/키 교체·drain/updater·정상 종료/재시작/롤백·개인 상태 보존·구버전 호환·public→private 전환과 수용표를 추가했다. package 스크립트의 candidate 전용/승인 false, 로컬 설치의 app.lock 검사, CI 예시의 이전 테스트 명령/게시 부재를 정적으로 대조했다. GitHub Release/asset·공개 범위 변경 및 Supabase Edge 공식 문서를 확인했다.
- 보고서 지속 대화·명시적 반영/새 revision·`expectedVersion` 낙관적 락을 C1~C3로 추가하고 M3 확장 배치안/D14로 표시했다. 구현 작업 시작·brief 고정·업무별 등록부/중복 방지는 M5로 유지했다. 현재 추가 답변 재분석·메일 분석 잠금과 구분한다.
- 13절에 남은 작업 ID·상태·의존 단계·완료 근거를 통합했다. 현재 상태/스펙/API·데이터 모델/보안·Windows/팀 파일럿·Supabase/문서 사이트 안내를 맞추고 오래된 candidate.3의 현재형 안내를 candidate.5와 역사 증거로 구분했다. Auth0 시절 파일럿 검사기 정합화는 T1의 미구현 작업으로 남겼다.
- 문서 정적 빌드와 내부 링크 검사 통과. 기존 문서 Playwright **6/6 통과**: 탐색·한국어 검색·모바일 메뉴/가로 넘침·현재/보존 문서 Mermaid 렌더링·pageerror 없음. Windows 테스트 서버의 종료가 지연되어 이 검사가 만든 4175 서버의 부모/자식 관계를 확인하고 정리한 뒤 실행기 exit 0·6 passed를 확인했다. 결과/trace 위치는 `.runtime/docs-test-results`, `.runtime/docs-test-report`다. `git diff --check` 통과.
- 문서만 변경했다. 제품 기능/테스트·DB migration·기존 파일럿 검사기 수정, 저장소 생성/공개·push·Release 게시, 서버/Windows 재배포, 실제 Agent/MCP/ERP 실행은 수행하지 않았다. 백업 보류와 `releaseApproved=false`를 유지한다. 이 기록은 새 업데이트/대화 기능의 실행 검증이 아니다.

## 2026-09-22 로그아웃 상단 이동

- 개인 앱의 로그아웃을 상단 오른쪽으로 통합했다. 사이드 메뉴와 최초 비밀번호 변경 본문의 중복 버튼을 제거했다. 모바일 메뉴를 열지 않아도 사용할 수 있고, 로그아웃 후 세션·초안·연결 상태·펼친 메뉴를 정리한다.
- check·UI build, MUI/Native Chrome 회귀 통과. 모바일의 닫힌 메뉴 상태와 최초 비밀번호 변경 화면에서 상단 버튼 노출·로그아웃·로그인 화면 복귀를 검사했다. 가로 넘침·CSP 위반·pageerror 0.
- Windows candidate.5로 업데이트 후 재기동했다. config/secrets/work를 보존했고 설치본의 상단 버튼·사이드 메뉴 내 버튼 부재·제공 자산 해시를 확인했다. `.runtime/topbar-ui-install.json`, `.runtime/topbar-ui-installed-smoke.json`에 기록했다.
- Docker API만 반영하고 보고서 13건·이전 문서 33건·수동 연결·DB/Worker 컨테이너 보존을 확인했다. 실제 분석·동기화·ERP 변경 없이 검증했다. 정식 승인과 두 PC 수용은 별도다.

## 2026-09-22 개인 실행 환경 연결 UX

- 개인 연결을 메일 → AI 도구·실행 장치 → ERP 읽기 자료 → 저장·실행 카드로 구성했다. 다음 할 일·설정 상태·실행 상태를 구분하고, 출처/장치 등록을 해당 단계에 배치했다. 공유·장치 관리와 복구는 별도 탭, 비밀번호 변경은 하단 접힘 영역으로 이동했다.
- 저장하지 않은 선택으로 실행·공유 권한을 변경하지 못하게 하고, 선택 변경 뒤 늦게 도착한 실행 상태를 버린다. 출처 등록 후 다른 초안 선택을 유지한다. 실제 Scheduler의 idle/working/retrying 상태를 표시하고 이미 켜진 실행의 중복 시작을 막는다.
- local-app 설정 응답에는 주소·자격·파일 경로 없이 MCP 설정 여부·Agent 종류·읽기 자료 개수·DB 연결 여부만 추가했다. 설정 조회가 메일을 읽지 않는 것을 확인했다. 실제 연결 편집은 여전히 settings.json이며, ERP DB provider는 미연결이다.
- `npm.cmd run check`, 전체 build, `verify-build-compat.mjs`, UI **13/13**, 로컬 API facade **1/1** 통과. 첫 검사에서 MUI props 타입, 테스트의 label 중복/타입을 수정했고 최종 검사에서 통과했다. 기존 번들 크기 경고는 남는다.
- 합성 Chrome의 `verify-mui-ui.mjs`와 `verify-native-ui.mjs` 통과. 설정 저장·실행 전환·변경 후 상태 무효화·관리/복구 탭·기존 로그인/공유 이력·모바일 메뉴를 검사했다. 1440px/390px 화면 캡처를 확인했으며 가로 넘침·CSP 위반·pageerror 0. 화면은 `.runtime/mui/settings.png`, `.runtime/mui/설정-mobile.png`에 있다.
- 로컬 Docker API만 교체했다. 실제 제공 HTML/JS/CSS 해시, health, 메일/보고서 조회를 확인했다. 보고서 13건·이전 문서 33건·수동 연결 해시와 DB/Worker 컨테이너 ID가 유지됐다. 검증 결과는 `.runtime/react-deployment/after.json`이다.
- Windows candidate.4를 생성하고 중지 상태의 개발 PC candidate.3을 업데이트했다. 업데이트 전후 config/secrets/work 해시 동일, 이전 버전 보존, 설치본 자산과 빌드 해시 일치를 확인했다. 설치본 기동 후 기존 본인 세션으로 설정 화면·환경 요약을 읽기 전용 확인했고 pageerror 0이었다. `.runtime/settings-ui-install.json`, `.runtime/settings-ui-installed-smoke.json`에 기록했다. ZIP 식별자는 [현재 상태](current-status.md)에 있다.
- 새 MCP 주소·Agent·ERP 경로를 설정하거나 실제 분석·동기화·ERP 조회를 실행하지 않았다. hosted API/DB 변경·백업 재개·두 PC 업무 수용·정식 릴리스 승인은 포함하지 않으며 `releaseApproved=false`를 유지한다.

## 2026-09-22 메일 스레드 상태 배지

- 스레드의 `N개 메일` 옆에 분석 완료·처리 완료·분석 대기/중·확인 필요·실패·이전 이력 배지를 표시한다. 개별 메일과 같은 기준으로 집계하고 `분석 완료 2/6`처럼 현재 표시된 메일 중 해당 상태의 메일 수를 표시한다. 분석 실행 횟수나 이전 문서 수가 아닌 메일 수이며, 한 메일이 여러 상태에 포함될 수 있다.
- 접힌 대화에서도 확인 가능하며 이력 조회 실패 시 완료 배지 대신 `이력 확인 불가`를 표시한다. 모바일에서는 배지를 줄바꿈한다.
- `npm run check`, `build:ui` 통과. Playwright `mail-threads`, `manual-threads`, `handling-ui` **3/3 통과**: 접힌 대화의 상태별 집계, 개별 상태 유지, 접기/펼치기, 수동 연결/해제, 처리 완료/취소, 모바일 가로 넘침 및 브라우저 오류를 확인했다. 합성 화면은 `.runtime/mail-threads-desktop.png`, `.runtime/mail-threads-mobile.png`에 보관한다.
- 로컬 Docker API를 재빌드하고 `up -d --no-deps --wait api`로 반영했다. `/health` 200, 제공 JS/CSS의 SHA-256과 로컬 빌드 일치를 확인했다. DB/Worker 컨테이너는 유지했으며 hosted 서비스 및 Windows 설치본 갱신은 수행하지 않았다.

## 2026-09-22 Docusaurus 기술 문서 사이트

- `website/`의 별도 package/lockfile에 Docusaurus 3.10.2, Mermaid와 로컬 검색을 구성했다. 기존 `docs/` Markdown을 직접 사용하며 현재 제품·개발·운영·참조·검증·보존 메뉴로 구분한다. 문서 도구와 산출물은 제품 Docker 빌드에서 제외한다.
- `docs:build` 정적 빌드와 내부 링크 검사 통과. 검증 일지와 검증 목록의 중복 URL을 분리하고, migration 폴더 링크는 개별 SQL 링크로 바꿨다. 문서 밖 README와 직접 링크된 소스는 읽기용 파일로 제공한다. 비공개 runtime 디렉터리를 탐색하거나 포함하지 않는다.
- Playwright 문서 검사 **6/6 통과**: 한국어 검색 결과 이동, 문서 탐색, 모바일 메뉴/가로 넘침, 현재/보존 문서의 Mermaid 도표 **10개** 렌더링, 브라우저 오류 없음. 합성 화면은 `.runtime/docs-test-results`에 보관한다.
- `npm run check`, 제품 `npm run build` 통과. 문서의 로컬 정적 결과를 확인했으며 외부 게시·접근 인증·서비스 재배포는 수행하지 않았다. [문서 사이트 안내](guides/documentation.md)의 명령으로 재현한다.

## 2026-09-22 React Hook Form · Zod 전환

- 로그인·비밀번호·관리자 계정 생성/수정·설정 저장 및 등록 입력을 React Hook Form 7.88.0 + Zod resolver 5.9.1로 전환했다. MUI 오류 표시, 비밀번호 초기화, 한글 IME와 중복 제출 방지를 적용했다. 서버 API와 권한 검사는 유지한다.
- `npm run check`, `build:ui` 통과. `test:all` **137/137**(React 8개 포함) 통과. 비밀번호 길이/UTF-8 바이트 제한, 입력 오류 시 요청 차단, 계정 활성 체크박스, 출처 변경 시 장치 초기화 등을 검사했다.
- Playwright 실제 인증/임시 DB 및 기존 초안 보존 검사 통과. MUI 회귀에서 발견한 Zod의 동적 함수 탐지 CSP 위반은 `jitless` 설정 후 재검사 통과했다. CSP 정책은 완화하지 않았다.
- 앱 JS 번들 872.10 kB(gzip 271.47 kB)의 크기 경고가 남는다. 실행 중 서비스 재배포·Windows 설치본 갱신은 수행하지 않았다.

## 2026-09-22 Vitest · React Testing Library · Playwright Test 전환

- 기존 node:test 34개 파일의 검증을 Vitest 5.0.1로 이관하고, 실제 외부 erp-manager CLI가 필요한 1개 검증은 external 프로젝트로 분리했다. Runner 가상 시간은 Vitest fake timers와 테스트별 cleanup으로 이관했다. React Testing Library 16.3.3 + jsdom에 MUI native ref/입력/체크박스/선택 검증을 추가했다.
- `npm run test:all`: 유닛·React·독립 PostgreSQL 통합 **131/131 통과**. `TRIAGE_CLI_SOURCE`를 지정한 `test:external` **1/1 통과**. 최초 통합 실행의 외부 CLI 경로 누락 1건은 테스트 분류와 명시적 실행 명령으로 해결했다. 기존 DB/Worker/보고서/메일 데이터에 연결하지 않았다.
- 기존 Chrome 회귀 **16/16**을 `@playwright/test` 1.63.0으로 실행했다. 시나리오별 worker와 context를 분리하고 HTML 리포트와 trace를 `.runtime/playwright-*`에 보관한다. 기존 단독 진단 스크립트 진입점도 유지했다.
- 실제 사용자명 API와 임시 PostgreSQL을 사용하는 인증 E2E **1/1 통과**. 일회용 browser-ticket 발급, 최초 임시 비밀번호 로그인, 비밀번호 변경, 새 비밀번호 로그인, 로그아웃 후 토큰 거부를 검증했다. 실제 MCP/AI/ERP/운영 서비스 검증은 아니다.
- `npm run check` 통과. 서비스 재배포 및 Windows 후보 생성은 수행하지 않았다. 테스트 사용법은 [개발 안내](guides/development.md)를 따른다.

## 2026-09-22 React ESLint + Prettier 도입

- 메인 React UI와 Office 뷰어에 ESLint 10.11.0 flat config, typescript-eslint 8.70.1, React Hooks 7.1.1, Prettier 3.9.8, eslint-config-prettier 10.1.8을 적용했다. `lint`, `lint:fix`, `format`, `format:check`, `typecheck`를 추가했고 `check`는 lint → format:check → typecheck를 실행한다. React 소스와 CSS/JSON/HTML을 포맷하고 `.gitattributes`로 해당 범위의 LF를 유지한다.
- TypeScript 7 API와 린트 파서의 호환성 때문에 린트용 `typescript`는 6.0.3, 기존 컴파일러는 npm 별칭 `@typescript/native`의 7.0.2로 분리했다. `build:types`가 7.0.2 실행 파일을 명시한다. 별도 `.runtime/eslint-install-check`에서 새 lockfile로 `npm ci --ignore-scripts`를 통과하고, TypeScript 코드 린트·잘못된 Hooks 호출 검출·컴파일러 7.0.2·Prettier 버전을 확인했다.
- 미사용 import 제거, 설정 응답 타입 명시, Hooks의 안정된 콜백 참조와 의존성 정리, 오류 cause 보존을 적용했다. 메일별 첨부 캐시를 초기화하는 두 useMemo만 이유를 적어 해당 줄의 의존성 검사를 제외했다. 전역 Hooks 규칙은 유지하고 경고도 검사 실패로 처리한다.
- `npm.cmd run check` 오류/경고 0건, 전체 build, `verify-build-compat.mjs`, eslint-config-prettier 충돌 검사, `git diff --check` 통과. 기존 번들 크기 경고는 남아 있다.
- 전체 Chrome 회귀는 최초 15/16 통과했다. Office 미리보기에서 portal 생성 전 DOM 참조를 고정하면 iframe이 삽입되지 않는 문제를 확인하여, 비동기 삽입 시 현재 viewport를 사용하고 cleanup에서는 해당 effect의 frame만 제거하도록 수정했다. 이후 `preview`, `image-preview`, `related-mails` 3/3 재검사와 check/UI build를 통과하여 16종의 최종 통과 로그를 확보했다. 증거는 `.runtime/react-validation/react/*.log`다. 이는 합성 브라우저 검증이며 실제 고객 자료 변경은 하지 않았다.
- 개발 도구와 소스 정리 작업으로 로컬 Docker API·DB·Worker 및 Supabase를 재배포하지 않았다. Windows 설치 후보도 재생성하지 않았다. 사용 명령과 적용 범위는 [개발 안내](guides/development.md)에 기록했다.

## 2026-09-22 React 드래그앤드롭 라이브러리 전환

- `@hello-pangea/dnd` 18.0.1로 React 메일의 수동 연결/해제 드래그를 전환했다. 기존 API·되돌리기·실패 안내·목록 순서·스크롤 복원을 유지한다. 드래그 시작 시 저장소와 목록을 기록하고 종료 시 대조하며, 동일 대화·외부 드롭·수동 연결된 메일의 다른 대화 이동은 쓰지 않는다. 라이브러리 동적 스타일에 기존 CSP nonce를 전달한다.
- `npm.cmd run check`, UI build 및 Docker 내 전체 build 통과. 메인 JS 752.48 kB / gzip 233.98 kB이며 기존 번들 크기 경고는 남아 있다.
- 합성 Chrome에서 `manual-threads`, `mail-scroll`, `mail-threads`, `mui-ui` 4개 검사 통과. 마우스·키보드 연결/해제와 Escape 취소, CDP 터치 연결/해제, 개별 보기 전환 중 취소, 외부/자기 자신/연결된 메일의 잘못된 드롭, 새로고침·되돌리기·저장/해제/목록 갱신 실패, 읽기 위치·페이지·모바일 스크롤 유지, CSP 위반 0·pageerror 0을 확인했다. 접힌 대화는 숨겨진 Draggable을 등록하지 않아 키보드 드롭 대상이 되도록 했다. 터치 검증은 물리 기기 검증이 아닌 Chrome 에뮬레이션이다.
- `scripts/thread-dnd-browser.mjs`로 라이브러리 센서의 활성화와 프레임을 포함한 입력을 재현한다. 터치 자동 스크롤로 이동하는 하단 해제 영역의 좌표를 다시 읽도록 테스트를 보정했다. 증거는 `.runtime/react-validation/react/{manual-threads,mail-scroll,mail-threads,mui-ui}.log`와 합성 모바일 캡처다.
- 로컬 Docker API만 `--no-build --no-deps --wait`로 교체한 후 health, 제공 JS/CSS SHA-256, HTML nonce, 실제 메일·보고서 열기와 모바일 표시를 검증했다. 보고서 12건·이전 문서 33건·수동 연결 해시 및 DB/Worker 컨테이너 ID를 보존했다. `.runtime/react-deployment/after.json`에 결과를 기록했다. 실메일의 연결/해제 쓰기는 하지 않았고 Windows 설치 패키지와 Supabase 배포는 변경하지 않았다.

## 2026-09-22 전체 화면 MUI 전환

- 메일함·검색·상태·보고서·관련 메일·이전 이력·설정·로그인·관리자를 MUI 9.4.0 / Emotion 공통 테마로 전환했다. 기존 전역 CSS를 메인 앱에서 제거하고 배치와 문서 본문 서식을 분리했다. Dialog, Snackbar/Alert, Chip, CircularProgress, 버튼/입력/선택/체크박스와 MUI styled disclosure를 사용한다. 메일 본문 정화·CID·Office 파서는 유지하며 Markdown 도구·이미지 재시도·XLSX 시트/확대 제어도 MUI를 사용한다.
- Node API와 local-app HTML 응답에 매번 새 CSP nonce를 넣고 Emotion cache에 전달한다. script 정책은 유지하며 동적 스타일 속성만 별도로 허용한다. `/react/index.html` 우회 경로도 같은 헤더·nonce를 적용한다. Windows 패키징에 새 `packages/ui/security` 서버 모듈을 포함했다.
- `npm.cmd run check`, 전체 build, `verify-build-compat.mjs` 통과. 메인 JS는 657.51 kB / gzip 204.50 kB이며 MUI 및 기존 Office 번들의 크기 경고는 남아 있다.
- 합성 Chrome 회귀 **16/16 통과**: 검색/상태 필터, 스레드/수동 연결, 독립 스크롤·읽기 위치, 이미지·Office 3형식 미리보기/실패/재시도/닫기, 분석·처리 완료, 관련 메일, 이력, Markdown, 유지보수·동기화, native 로그인/로그아웃·설정 저장·관리자 입력·모바일 메뉴·IME Enter·nonce. `.runtime/react-validation/react/results.json`과 `.runtime/mui/`에 기록/합성 화면을 보관한다. 마지막 설정/관리자 CSS 범위 조정 후 `verify-mui-ui.mjs`를 재통과하고 캡처를 확인했다.
- 독립 임시 PostgreSQL에서 백엔드 **130/130 통과**: `.runtime/triage-free-tests-a34c0cd1/tests.log`. 최초 호스트 실행은 테스트 DB 미설정으로 9개 파일이 실행되지 않았고, 첫 독립 DB 실행은 이전 CSP 기대값 1개가 실패했다. nonce·스타일 속성 정책, 스크립트 제한, nonce 재발급을 검증하도록 갱신 후 전체 통과했다.
- 로컬 Docker API만 `--no-deps --no-build --wait`로 교체했다. `/health`, 제공 JS/CSS SHA-256 및 nonce를 제외한 HTML 일치, 실제 메일/보고서 읽기, 모바일 가로 넘침 없음, pageerror 0을 확인했다. 보고서 **12개**, 이전 문서 **33개**, 수동 연결 해시를 보존했고 DB/Worker 컨테이너 ID도 동일하다. `.runtime/react-deployment/after.json` 참조.
- 실제 고객 분석·동기화·메일 상태 변경은 실행하지 않았다. ERP 코드/DB 및 Supabase 서비스 변경 없음. 별도 Windows 파일럿(43180)은 실행 중이지 않아 기존 설치본을 갱신하지 않았으며 새 Windows 배포 후보 생성/설치 검증은 이번 범위 밖이다.

## 2026-09-22 문서 체계 정리와 현재 구조 명세

- 루트 README와 문서 안내를 현재 Supabase 공용 API·Windows local-app 기준으로 다시 작성했다. 아키텍처·내부 모듈·로그인/분석/동기화/복구 흐름·제품 스펙·API·데이터 모델·보안·개발/운영 절차를 분리했다.
- 과거 Auth0 계획·인계·완료 기록은 `docs/archive`, 기능별 과거 검증은 `docs/validation`, 현재 운영 절차는 `docs/operations`로 정리했다. 보존 대상 Markdown 18개의 본문은 상대 링크 수정 외 동일하고 과거 파일럿 JSON도 동일하다. `docs/implementation-plan.md`와 이 일지의 경로는 유지했다.
- 현재 구현과 계획을 구분했다. 실제 ERP DB provider 미연결, 개인 MCP/Agent·두 PC 수용 미완료, 후보 승인 false, 사용자 요청의 hosted 백업 보류를 명시했다. 계획서의 DPAPI 세션 저장 설명도 실제 구현에 맞췄다.
- Markdown 39개의 파싱·코드 fence·상대 링크 265개·JSON 예시 4개·기존 기록 보존·M1~M5 표·문서 변경 범위를 검사했다. 현재 문서 PowerShell 예시 22개는 실행하지 않고 구문 분석으로 확인했다. Mermaid 11개는 시작 구문만 검사했으며 실제 렌더링 검증은 수행하지 않았다.
- 증거는 Git 제외 `.runtime/docs-reorganization-20260922/audit.json`, `powershell-syntax.json`, `moves.json`과 원본 보존 폴더에 남겼다. 제품 코드·서비스·DB·배포본은 변경하지 않았고 앱 테스트/빌드·실행·재배포도 수행하지 않았다.

## 2026-09-22 Supabase 첫 hosted 배포와 개발 PC 연결

- 사용자 생성 프로젝트 `mail-triage-automation`과 CLI 로그인 확인 후 서울 Supabase PostgreSQL 17.6에 배포했다. 기존 사용자 테이블이 없는 것을 확인하고 `triage_private`에 checksum ledger 포함 6개 migration과 팀·최초 관리자 `david`를 생성했다. 기존 로컬 DB/Worker/MCP와 ERP 코드·DB는 변경하지 않았다. 기존 메일 원문/업무 이력 이관도 하지 않았다.
- runtime 역할은 DDL 불가, anon/authenticated는 private schema 접근 불가를 실제 확인했다. `history` Edge Function만 배포하고 앱 자체 ES256·현재 세션·ACL 인증을 적용했다. HTTPS live/ready 200, 인증 없는 자료 요청 401을 확인했다. CLI DB SSL enforcement 적용 성공도 확인했다.
- 초기 Node 접속의 `SELF_SIGNED_CERT_IN_CHAIN`을 Supabase 공식 CA 등록으로 해결했다. `HISTORY_DB_CA_BASE64`를 통해 CA/호스트 이름 검증을 유지하고, pg URL 옵션이 명시적 CA를 덮어쓰지 않도록 `verify-full`만 파싱 후 제거한다. 약한 TLS·충돌 옵션은 거절한다. 실제 클라이언트 TLS encrypted/authorized=true. pooler 내부 DB 연결의 `pg_stat_ssl.ssl=false`는 별도 관측값이며 전체 내부 구간 TLS 보장으로 보고하지 않는다.
- 사용자가 Dashboard Data API 비활성화를 확인했다. publishable key의 `/rest/v1/` 요청은 401 `Secret API key required`였다. 공개 키 접근 거절 증거이며 모든 관리 키까지 차단됐다는 검증은 아니다. 앱/클라이언트에는 Supabase service_role/secret key를 사용하지 않는다.
- `npm.cmd run check`, 전체 build 및 Edge bundle 통과. TLS 설정 검사 3개 추가 후 독립 DB의 전체 backend **130/130 통과**: `.runtime/triage-free-tests-7f7bf86b/tests.log`.
- 실제 hosted HTTPS **7군 통과**: health/인증 거절, 최초 비밀번호 변경 제한, 합성 관리자·analyst 생성/권한 분리, private source·보고서 ACL 및 멱등 실행, 실제 local Runner의 DPAPI outbox·응답 유실·다른 계정 재전송 거절·Agent 재실행 없는 복구, refresh 경합과 family 폐기, 로그아웃 즉시 JWT 폐기. `.runtime/supabase-deploy-20260922/hosted-verification.json`에 31개 요청과 결과를 기록했다. 합성 계정 2개는 비활성화했으며 실제 AI/MCP 업무 수행은 아니다.
- Windows `0.3.0-candidate.3`을 이 PC의 별도 `LocalAppData/MailTriagePilot`에 설치하고 43180 포트로 기동했다. 설치된 앱을 실제 Chrome으로 열어 hosted `david` 로그인→첫 비밀번호 변경 화면→로그아웃을 확인했다. 비밀번호는 변경하지 않았고 pageerror 0이다. 후보 승인 값은 false이며 `start-pilot.ps1`로 명시적 파일럿 실행한다. 개인 MCP/Agent는 미설정이다.
- 최초 관리자 임시 비밀번호(24시간 만료)·DB/서명키는 사용자/SYSTEM 전용 ACL의 Git 제외 보호 폴더에 저장했다. 클라이언트 설정에는 API 주소·issuer/audience만 넣었다. 상세 증거는 `.runtime/supabase-deploy-20260922/`의 `runtime-check.json`, `data-api-check.json`, `installed-browser-verification.json`, `local-install.json`에 있다.
- hosted backup 시도는 runtime의 `worker_state` SELECT 권한 부족으로 실패했다. 별도 읽기 전용 백업 역할 생성은 자동 승인 검토에서 차단됐고, 이후 사용자가 **백업 설정은 나중에 진행**하도록 지시했다. 새 백업 역할과 성공한 hosted 백업은 없다. 기존 로컬 합성 복원 통과를 실제 hosted 복원으로 대체 보고하지 않는다.
- 남은 경계: 실제 두 PC·서로 다른 사용자·개인 MCP/AI를 통한 지정 사례 분석/공유, 정기 외부 백업과 복원, hosted pause/resume, 장기 사용량/부하. 따라서 M1 운영 준비·M2 팀 수용 완료나 정식 릴리스로 판정하지 않는다.

## 2026-09-21 Supabase 우선 v3.1 통합과 배포 후보

- 사용자 결정: Supabase로 먼저 팀 배포·피드백·안정화, AWS 이전과 MariaDB 이식은 후속으로 분리. 사용자가 프로젝트 미생성이라고 확인했다.
- 이전 PoC 작업 폴더/브랜치는 현재 없지만 Git 객체 `8303d52`와 인계 결과가 남아 있음을 확인했다. Orca 터미널/저장소 상태를 읽어 동시 제품 수정이 없음을 확인한 뒤 제품 커밋 `af7ee97`, `056f8fa`, `1f8d11d`를 `602e5aa`, `f3e32fe`, `1c45518`로 통합했다. 문서 제외 제품 diff는 `8303d52`와 동일하다. 예전 계획 문서는 덮어쓰지 않았다.
- `npm.cmd run check`, 전체 build, Edge bundle, `verify-build-compat.mjs` 통과. 고정 의존성 `hash-wasm`을 설치했다. Office 번들의 크기 경고는 남아 있으나 빌드 오류는 없다.
- 독립 PostgreSQL 컨테이너의 전체 백엔드 **127/127 통과**: `.runtime/triage-free-tests-9614695f/tests.log`. 첫 실행은 기존 CLI 테스트의 `TRIAGE_CLI_SOURCE` 누락 1건 실패였고, erp-manager의 실제 CLI 파일을 읽기 전용 경로로 지정한 뒤 전체 재실행했다. ERP 코드/DB 변경 없음.
- `node --import tsx scripts/verify-supabase.mjs --browser` **12군 통과**: `.runtime/triage-free-77ac1c23/result.json`, `hosted=false`. 실제 로컬 Edge Runtime·PostgreSQL·Chrome·DPAPI Runner를 사용해 첫 변경/관리자/ACL, 응답 유실 outbox·다른 사용자 재전송 거절, refresh 경합/재사용 폐기, 계정 비활성화, 로그인 제한, private schema 거절, dump/restore 내용 hash·세션 폐기를 검사했다. Agent 출력은 합성 fixture이며 실메일/ERP/실AI 검증은 아니다.
- Windows `0.3.0-candidate.3` 재생성: Node v24.16.0, 3,723파일, ZIP 45,160,414 bytes. SHA-256 `87624689ca2c711564dfd5c4b358149efd082a68cac27f3d5bedb01ca073272d`. Git 제외 `.runtime/packages/0.3.0-candidate.3.zip`, manifest `authentication=username`, `releaseApproved=false`.
- `verify-windows-lifecycle.mjs` 통과: `.runtime/lifecycle/한글 설치-oXcWYA`. 한글 경로 설치·일반 후보 실행 거절·명시적 후보 기동·browser ticket·바로가기·정상 중지·설정 보존 제거. 이 개발 PC의 검증이며 깨끗한 두 PC나 실제 인증 완료가 아니다.
- Supabase CLI `2.117.0` 실행 확인. `projects list`는 `LegacyPlatformAuthRequiredError / Access token not provided`로 실패했다. 프로젝트/로그인이 없으므로 hosted 배포, 서버 비밀 등록, 운영 DB 생성/이관, 최초 관리자 발급, 팀 배포는 실행하지 않았다. 기존 API/DB/Mail MCP healthy 및 Worker 실행 상태를 보존했다.
- v3.1 계획·운영/설치 안내·[Supabase 배포 및 피드백 안내](operations/supabase.md)를 정리했다. 문서 검사 9개·로컬 링크 90개·M1~M5 표·v2.1 원문 보존 통과, `git diff --check` 통과. 과거 검증 기록은 보존했다. Git push 없음.

## 2026-09-21 팀 배포 우선 v3.0 재정리와 AWS 읽기 확인

- 사용자 결정에 따라 공용 API·DB와 각 PC의 MCP/AI로 먼저 팀 배포하고, 피드백·안정화 후 원격 SR 자동화를 진행하는 M1~M5로 계획을 재구성했다. AWS API를 우선 검토하되 DB 엔진 선택은 분리했다. 원본 제품/PoC checkout·실행 서비스는 수정하지 않았다.
- Codex 리뷰 4건과 완료 ID/hash를 확인한 Claude 리뷰 14건을 종합했다. 최신 계획 11절에 항목별 처리와 구현 시점을 기록했다. 구조화 brief, SR 중복/열린 PR 정책, 불변 bundle, service 권한 수명, 테스트 약화/CI 권한, 외부 PR 복원을 후속 단계에 반영했다. 매번 사람 승인 강제와 미확인 Supabase 사설망/도메인 전제는 확정안으로 채택하지 않았다.
- 기존 `6ceecf2` 계획 본문은 [v2.1 보존본](archive/implementation-plan-history-2026-09-21-v2.1.md)에 그대로 보존했고 현재 기준이 아님을 표시했다. 최신 문서는 통합 계획 하나이며 안내/개발/서버/팀 배포 안내도 맞췄다. 과거 검증 내용은 삭제하지 않았다.
- 사용자의 AWS CLI 확인 지시로 기존 로그인 환경에서 `sts get-caller-identity`, 서울 리전 `rds describe-db-instances`, 대상의 `cloudwatch get-metric-data`를 읽기 전용 수행했다. 비밀/endpoint/계정 식별자를 Git에 넣지 않았다. RDS/보안 그룹/IAM/백업 설정 변경이나 SQL 접속은 하지 않았다.
- 사용자가 `cvslog`는 `srp-rds-maria` 내부 DB라고 확인했다. 실조회: MariaDB 10.11.16 / db.t3.micro / Single-AZ / 20 GiB gp2 / 암호화·비공개 / 자동 백업 보존 0일 / 삭제 보호 꺼짐. 별도 백업·DB 내부 권한/테이블·앱 영역은 확인하지 않았다.
- 2026-09-14T05:55:44Z~2026-09-21T05:55:44Z의 시간별 집계가 지표별 168개, Complete로 반환됐다. CPU Maximum 최대 26.48%, FreeableMemory Minimum 최저 142,995,456 bytes(약 136 MiB), FreeStorageSpace 최저 17,957,457,920 bytes(약 16.7 GiB), 연결 Maximum 최대 9개, CPU credit Minimum 최저 288. 추가 앱의 실제 부하·수용량이나 메모리 압박을 확정한 검증은 아니다. 원자료: Git 제외 `.runtime/aws-cvslog-review/{queries,metrics}.json`.
- 현재 소스의 `pg`, jsonb, advisory lock, 부분 unique index, ON CONFLICT/RETURNING과 PoC 일반 Node 진입점을 확인했다. AWS RDS 사용과 PostgreSQL→MariaDB 이식은 다른 작업이며 기존 RDS에 연결 주소만 바꾸는 배포는 불가하다고 계획에 기록했다. MariaDB 이식·새 PostgreSQL 자원 생성은 수행하지 않았다.
- `node .runtime/remote-sr-doc-audit.mjs`: 대상 7문서의 Markdown/fence·로컬 링크·M1~M5 표 구조 검사 및 `git show 6ceecf2:docs/implementation-plan.md`와 역사 본문 대조 통과. `git diff --check` 통과. 문서만 변경했으므로 제품 빌드/테스트·배포·실데이터 이관은 실행하지 않았다.

## 2026-09-21 원격 SR→PR 목표 문서 정합화

- 요청 `77f729a6-a9c3-4b53-9fe5-4dca3deee69f`, 원본 기준 `23863ab`. 착수 시 원본 Git clean과 Orca 터미널 소유 경계를 확인했다. 기존 continuation 체크포인트는 이전 실행 기록으로 보존하고 변경하지 않았다.
- 통합 계획 v2.1에 원격 최종 구성/과도기 로컬 구성, S1~S7 의존성과 수용 기준, 분석/구현/PR 권한 분리, stage/attempt/lease·보고서/repo/base/head·재시도/PR 중복 방지 계약, D8~D11 외부 입력과 비용 경계를 정리했다. 문서 안내 및 개발/서버 안내의 현재 범위도 맞췄다.
- 별도 PoC 요청 `b8a5c5dd-8809-4031-8a4f-40ae6a16496d`의 결과/완료 표시에서 ID·succeeded·10,263 bytes·SHA-256 `70fb2381fe6fc1a4d5f0a07994173d36b44d47894dc95f3e50905477fc206225` 일치를 확인했다. 해당 checkout HEAD `8303d52`와 clean 상태도 확인했다. 이는 완료 보고의 무결성 확인이며 보고된 backend 127/127·Edge 등 12군을 이번에 재실행한 것이 아니다. checkout 수정/병합 없음.
- Mail MCP README를 읽어 Java 21/POP3/SQLite·TLS/UIDL·원격 미지원·자체 MCP 인증 없음의 현재 문서상 경계를 확인했다. MCP 실행/배포 검증은 하지 않았다. Supabase 공식 요금/함수 제한/일시정지/백업 문서를 재확인했으며 출처와 수치는 통합 계획 18.5절에 기록했다.
- `node .runtime/remote-sr-doc-audit.mjs`: 변경 대상 5문서의 Markdown 파싱, 코드 fence 짝, 로컬 링크/절 링크, S1~S7 표 구조, 폐기한 P8 보류 문구 검사 통과. 검사 스크립트는 Git 제외 로컬 증거다. `git diff --check` 통과. 과거 검증 본문은 보존했다.
- 문서만 변경했다. 제품 빌드/테스트, hosted Supabase, 원격 MCP/AI, 실메일/ERP, 웹→PR 종단, 배포/실데이터 이관/push는 실행하지 않았다. 기존 DB/Worker/reports/legacy/개인 AI·MCP·SES 설정 및 ERP 읽기 전용 지침을 변경하지 않았다.

## 2026-09-17 P1 전 UI·UX 보완

- 사용자 지정 우선순위대로 추가 답변 초안, 상태별 분석 행동, 메일 선택/모바일 복귀, 상태 안내, 검색/이전 문서 표시를 개선했다. 현재 API 계약·서버·DB·Worker는 변경하지 않았다.
- `public/answer-drafts.js`는 출처/분석별 초안을 sessionStorage와 메모리에 보관한다. 화면 이동·보고서/브라우저 새로고침·같은 단일 토큰 세션의 재로그인 후 복원, 실패 시 보존, 성공/명시적 삭제 시 제거를 확인했다. 전송 중 입력을 비활성화하고 뒤늦은 성공 응답이 새로 작성된 다른 초안을 지우지 않도록 제출값을 대조한다. 저장소 차단 시 메모리 보존과 새로고침 제한을 안내한다. localStorage·서버에 초안을 추가 저장하지 않는다.
- 기본 분석 버튼을 상태에 맞춰 바꾸고 새 분석 등록 전 메일별 기존 실행을 재조회한다. 이미 진행 중이면 해당 실행을 열며 최종 중복 방지는 기존 서버 제약에 맡긴다. 처리 완료는 실행 중 숨기고 분석 종료와 실제 업무 처리를 분리해 안내한다. 등록 알림 대신 현재 진행 화면을 사용하며 일부 작업 실패/연결 지연은 경고색, 전체 실패는 별도 상태로 표시한다.
- 메일 선택 강조/aria-current, 모바일 상세와 목록 복귀의 검색·스크롤·포커스 유지, 조건 초기화/빈 결과/조회 오류 재시도, 이전 문서 경로·해시 기본 접힘을 확인했다. 첨부 기본 접힘과 기존 HTML 정제/미리보기 동작은 유지한다.
- `npm.cmd run check`, 변경 브라우저 JavaScript와 실제 실행 검증 스크립트 구문 검사, `git diff --check` 통과.
- 합성 API를 제공하는 임시 로컬 서버에서 브라우저 검증 10개 통과: `verify-pre-p1-ux.mjs`, `verify-analysis-progress.mjs`, `verify-handling-ui.mjs`, `verify-history-ui.mjs`, `verify-mail-analysis.mjs`, `verify-status-filter.mjs`, `verify-maintenance-ui.mjs`, `verify-sync-refresh.mjs`, `verify-image-preview.mjs`, `verify-preview.mjs`. 신규 검증은 분석별 초안 분리·저장소 차단·재인증·실패 후 재전송·활성 실행 재확인·검색 실패 복구를 포함한다. 모든 검증에서 pageerror 없음. Office의 의도된 실패 응답/CSP 차단은 기존 테스트대로 확인했다.
- 기존 테스트의 이전 버튼 문구와 모바일 상세에서 바로 목록을 클릭하던 동작을 새 사용자 흐름에 맞췄다. `.runtime/pre-p1-desktop.png`, `pre-p1-mobile.png`, `analysis-progress-mobile.png`의 합성 화면을 육안 확인했다. 실제 고객 메일·ERP·MCP 요청, 실제 분석/동기화, DB 통합 테스트, 실행 중 Docker 서비스 반영은 수행하지 않았다. `verify-live-worker.mjs`는 선택자만 갱신하고 구문 검사했으며 실제 실행하지 않았다.
- README와 통합 계획 1.3절에 사용법·완료 범위·후속 계정별 초안 분리 과제를 기록했다. P1~P8은 여전히 구현 전이다.

### 후속 Docker 반영 및 작업별 커밋

- 사용자 요청으로 `docker compose build api` 후 활성 분석 0건·동기화 completed를 다시 확인하고 `docker compose up -d --no-build --no-deps --wait api`로 API만 교체했다. DB·Worker 컨테이너는 유지했다.
- 반영 후 API healthy 및 Worker ready/online 확인. 제공 중인 `app.js`, `answer-drafts.js`, `analysis-progress.js`, `index.html`, `style.css`의 SHA-256이 작업 파일과 일치한다. 기존 분석 6건의 결과·리뷰·처리 상태를 반영 전후 해시로 대조하여 보존을 확인했다.
- 배포된 localhost:3080의 정적 파일을 사용하는 합성 브라우저 검증에서 초안 보존·재로그인·전송 실패 복구·중복 분석 이동·검색/모바일/문서 정보 동작과 pageerror 0건을 확인했다. API 요청은 합성 응답으로 대체했으며 고객 분석·실제 동기화는 실행하지 않았다.
- 변경을 초안 보존, 상태별 분석/메일 이동, 검색/이전 문서 표시, 통합 검증/문서의 네 작업 단위로 분리한다. `.runtime`의 배포 비교 자료·임시 분리 도구·합성 캡처는 Git에서 제외한다.

## 2026-09-17 문서 정리와 통합 구현 계획

- `implementation-plan.md`를 회사 이메일 인증·공용 이력 API/PostgreSQL·개인 PC의 웹/AI/MCP 기준으로 통합했다. 기술 스택·패키지 경계, 인증/자료 권한, DB·API 계약, 실행 배정·동기화·복구, Windows 설치·업데이트, 서버 사양·백업·이관·롤백, P0~P8 산출물·완료 기준·대략적 공수와 결정 대기 항목을 명시했다. 설계값과 이미 구현/검증된 사실을 구분했다.
- 기존 구현 계획과 배포 제안의 통합 직전 본문을 각각 `implementation-history-2026-09-17.md`, `team-deployment-proposal-2026-09-17.md`에 보존했다. 정리 중 추가된 메일 검색 상태 필터 기록도 최신 원본에 포함해 보존했다. 이전 원문은 바꾸지 않고 역사 자료 안내만 앞에 추가했다.
- `docs/README.md`에 모든 문서의 역할과 우선순위를 정리했다. 기존 배포 계획 경로는 통합 안내로 유지하고 README/작업 요약/운영/인계 문서에서 현재 사양과 당시 기록을 구분했다. README의 이미지 첨부·이전 이력 연결 설명도 기존 검증 기록에 맞췄다.
- 문서 검사: 로컬 Markdown 링크·코드 fence·문자 인코딩, 계획 필수 주제, 문서 목록 누락 없음. 보존한 두 계획 본문이 통합 직전 원본 bytes와 일치함을 확인했다. 기존 검증·운영·인계 본문도 안내 추가 외에 보존했다. `git diff --check -- README.md docs` 통과.
- 문서 갱신 직전/직후 앱·소스·스크립트·테스트·viewer·구성 106개 파일 hash 일치. 작업 폴더의 별도 미커밋 앱 변경은 수정하지 않았다. 문서 검사 증거는 Git 제외 `.runtime/docs-consolidation-20260917/verification.json`에 보존한다.
- 이번 검증은 문서 정합성 검사다. 앱 테스트 재실행, 실제 Auth0 가입, DB 이관, 고객 분석, 서비스 재시작, 외부 배포·게시·커밋은 수행하지 않았다. 현재 앱의 운영 검증을 다시 완료했다고 주장하지 않는다.

검증일: 2026-09-16

## 2026-09-17 분석 작업 이벤트와 경과 시간

- Worker의 `item.completed` 중 MCP 호출과 로컬 명령 종료를 고정된 작업 종류/성공 여부로 변환한다. 시작 및 결과 저장 시작은 Worker가 직접 기록한다. 모델 텍스트·reasoning·도구 인수·결과·SQL·경로는 진행 기록에 포함하지 않는다. 로컬 명령은 실제 코드/파일 확인을 단정하지 않고 `분석 도구 실행`으로 표시한다.
- 실행별 `progress_events`는 최근 20건으로 제한하며 저장 시각은 DB가 부여한다. 유효한 실행 소유권/lease/running 상태에서만 저장하고 종료 후 기록을 바꾸지 않는다. heartbeat는 별도 시각이며 작업 진척과 구분한다. 진행 기록 저장 실패는 보고서 저장을 막지 않고 고정 오류 코드만 남긴다. 기존 실행에 없는 이벤트는 만들어내지 않는다.
- 분석 및 재분석 요청 후 진행 화면을 열고 경과 시간을 초 단위로 갱신한다. 상태는 3초 간격으로 조회하며 최종 상태에서는 자동으로 보고서/질문/실패 사유를 표시하고 조회를 종료한다. 작업 기록은 접어서 제공하고 다시 열어도 서버 기록을 조회한다. 응답 지연과 상태 조회 실패를 별도 표시하며 갱신 실패를 분석 실패로 단정하지 않는다. 직접 실행은 경과 시간/heartbeat만 제공하고 상세 이벤트 미제공을 안내한다.
- `npm.cmd run check`, JSON 이벤트 분류 단위 테스트, `docker compose --profile verification run --no-deps --rm tests`: 전체 38개 통과. 기록 상한/시각/소유권/만료/종료 후 쓰기 금지/heartbeat 독립성/보고서 보존 검증 포함. 격리 테스트 스키마를 사용했다.
- `node --import tsx scripts/verify-analysis-progress.mjs`: 대기→분석, 시간 갱신, 작업 실패와 실행 실패 구분, heartbeat 지연, 상태 조회 실패/재시도, 완료/확인 필요/실패 자동 전환, 새로고침 후 기록 유지, 닫은 뒤 늦은 응답 무시, 이력 복귀 시 타이머 정리, 모바일 가로 넘침 없음, 동작 줄이기 및 pageerror 0개 확인. 합성 모바일 스크린샷을 확인했다.
- 기존 `verify-handling-ui.mjs`, `verify-history-ui.mjs` 회귀 검증 통과. 새 분석 진행 화면으로 바로 이동하는 변경에 맞춰 재분석 테스트의 이력 복귀 동작을 보완했다. 실제 고객 분석·동기화·ERP 변경은 수행하지 않았다. 실제 Codex 분석으로 신규 이벤트까지 확인하는 검증은 미실행이다.
- 로컬 반영: 대기/실행 중 분석 및 동기화가 0건임을 재확인하고 `docker compose --profile analysis up -d --no-deps --wait api worker`로 API/Worker만 교체했다. API healthy, Worker ready/online, 인증된 실행 조회의 progress/heartbeat 필드, 제공 중인 app.js/analysis-progress.js/style.css와 로컬 파일의 SHA-256 일치 확인. 기존 보고서 4건의 통합 내용 해시가 반영 전후 동일하다. DB 컨테이너/볼륨은 재생성하지 않았다.

## 2026-09-17 미커밋 UI 변경 정리

- 남은 변경을 이미지 첨부 미리보기, 분석 완료 후 추가 답변, 상단 헤더 간소화로 분리했다. 공유 app.js/style.css와 계획/검증 문서는 변경 부분만 나누어 커밋하고, 원본 작업 파일의 기능은 유지했다. 들여쓰기와 BOM을 정리하고 텍스트 대체 화면의 이미지 영역 검증을 현재 DOM 조회로 보완했다.
- 현재 소스 기준 `npm run check`, 이미지·다운로드 단위 테스트 4개, 합성 이미지 미리보기/Office 세 형식/처리 완료·추가 답변/관련 메일 UI 검증 통과. 모바일 가로 넘침과 pageerror 없음. Office의 오류·외부 요청 차단 테스트에서 발생한 예상 콘솔 메시지는 통과 결과와 구분했다.
- 헤더의 설명 문구를 제거하고 제목/연결 상태 및 반응형 여백을 정리했다. 관련 메일 기본 접힘, 건수, 마우스/키보드 펼침과 다시 열 때 초기화도 기존 합성 검증에 포함되어 있다.
- 이번 정리는 로컬 소스·검증·커밋 작업이다. 실제 고객 분석·동기화·상태 변경, 서비스 재시작이나 원격 push는 수행하지 않았다. 이전 섹션의 배포/실메일 검증은 해당 작업 당시 기록이다.

## 2026-09-17 분석 완료 후 추가 답변과 재분석

- 기존 화면은 `needs_input`일 때만 답변 입력란을 표시하여 `completed` 결과에는 추가 의견을 전달할 수 없었다. 미처리 `completed` 보고서에도 입력란과 `답변하고 다시 분석` 버튼을 제공한다. 이전 실행 ID와 답변을 전달하는 기존 API/Worker 경로를 재사용하며 원본 결과를 수정하지 않는다.
- `node --import tsx scripts/verify-handling-ui.mjs` 통과. 질문 없는 완료 결과의 입력란, 빈 답변 차단, 새 요청의 메일 식별자/parentId/answer, 기존 보고서 보존, 처리 완료 후 숨김, 실행 중 숨김, Outlook 직접 실행 안내, 완료/취소/충돌 회귀, 모바일 가로 넘침 및 pageerror 0개를 확인했다. 새 분석 등록은 합성 API로만 검증했다.
- 수정한 `app.js`만 실행 중인 로컬 API에 복사하고 응답 파일 해시 일치를 확인했다. 지정 메일의 실제 보고서에서 추가 답변과 재분석 버튼 표시를 읽기 전용 브라우저로 확인했다. 기존 보고서 해시, 분석 완료 상태, 미처리 상태 보존. 실제 재분석/처리 완료/동기화 요청은 실행하지 않았다.
- `docker compose build api` 성공. 컨테이너 재생성 때도 수정이 유지되도록 로컬 이미지에 포함했다. 실행 중인 API/DB/Worker는 재시작하지 않았다. JS 구문 검사와 `git diff --check` 통과.

## 2026-09-17 실행 중에만 동기화 아이콘 표시

- 서버 수집 건수가 있으면 종료 후에도 남던 progress 요소를 제거했다. running/stopping 동안 회전 아이콘과 서버 건수/비율을 표시하고 retrying은 회전을 멈춘 대기 표시로 구분한다. 집계 전에는 이번 실행 저장 건수만 표시한다. completed/partial/failed/paused에서는 표시와 진행 문구를 숨기고 마지막 결과 텍스트를 유지한다.
- `verify-sync-refresh.mjs` 확장 및 로컬/배포 환경 합성 검증 통과. 완료 데이터에 serverStored가 남아 있어도 숨김, 진행 건수/비율, 중지/재시도, 동작 줄이기, 모바일 가로 넘침, 기존 목록 자동 갱신과 실패 재시도 확인. 실제 메일 동기화 호출 없이 검증했고 pageerror 0개. 데스크톱 캡처 육안 확인.
- API 갱신 후 동기화 표시 기능을 배포 환경에서 확인했다. 최종 시점에는 동시에 진행된 이미지 미리보기 수정도 런타임에 반영되어 전체 파일이 공유 작업 폴더와 일치했다. 이번 커밋은 동기화 표시 관련 부분만 포함하며 별도 이미지 변경은 보존했다. DB/Worker 변경이나 통합 DB 테스트 재실행은 필요하지 않은 화면 수정이다.

## 2026-09-17 관련 메일 검색·선택 화면과 로컬 반영

- 보고서 상단의 관련 메일 영역에서 검색어/발신자 검색, 후보 20건씩 페이지 이동, 텍스트 본문 확인 후 명시적 연결, 여러 건 열기/해제를 제공한다. 현재 분석 메일과 이미 연결한 후보는 선택할 수 없다. 선택 취소는 저장하지 않고, 연결 해제는 기존 메일·보고서·처리 상태에 영향을 주지 않는다.
- `verify-related-mails.mjs` 합성 검증 통과: 본문 확인 전 변경 요청 없음, 식별 충돌 후 재시도, 여러 건 연결, 중복/자기 자신 차단, 페이지 이동, 원본 조회 실패 시 연결 보존, 개별 해제, 완료 취소 후 연결 유지, 검색 실패 재시도, 취소 후 늦은 본문 응답 무시, 텍스트의 HTML 비실행, 390px 가로 넘침 없음/pageerror 0개. API 요청은 명시적인 연결/해제만 발생하고 분석·동기화 요청은 없었다.
- 기존 `verify-handling-ui.mjs`, `verify-history-ui.mjs`, `verify-markdown.mjs` 회귀 검증 통과. `.runtime/related-mails-mobile.png`를 육안 확인했다. README에 사용법을 추가하고 이미 제거된 동기화 30묶음 상한 설명도 현재 구현에 맞게 정정했다.
- Docker 빌드 및 API 단독 `--no-build --no-deps --wait` 반영 성공. 배포된 세 파일(app.js/style.css/related-mails.js)과 로컬 소스 일치, 실제 조회의 `relatedMails` 응답, 기존 보고서 해시 보존, Worker online/ready 확인. 배포 환경에서도 합성 관련 메일 UI 검증 통과. MCP의 실제 메일 메타데이터 형식을 읽기 전용으로 대조했으며 고객 메일의 처리 상태·연결·분석 실행은 변경하지 않았다.

## 2026-09-17 관련 메일 연결 API

- 계획서에 수동 검색/본문 확인/선택 연결, 메일 단위 공유, 완료 취소 후 연결 보존과 검증 기준을 먼저 추가했다. 별도 `related_mail` 테이블은 식별자와 제목/발신자/수신자/날짜만 저장하며 본문을 복사하지 않는다.
- 통합 테스트 36개 및 TypeScript 검사 통과. 신규 3개 시나리오에서 완료 전 등록 거부, 동시 중복 연결, 분석 버전 간 공유, 보고서/상태/실행 수 보존, 자기 자신/저장소/Message-ID 불일치, 다른 메일의 연결 해제 방지, 완료 취소와 등록의 경쟁, 인증/출처/입력 검증, 원본 불일치·조회 실패 시 연결 보존을 검증했다.
- 실제 MCP/고객 데이터에 연결을 만들지 않고 격리 임시 스키마와 합성 메일로 검증했다. 화면 및 로컬 API 반영은 후속 작업에서 진행한다.

## 2026-09-17 Markdown 파일 버튼과 로컬 반영

- 보고서 끝의 Markdown 링크를 제목 바로 아래 문서 도구 영역의 `Markdown 파일 열기 ↗` 버튼 모양 링크로 이동했다. 새 탭에서 원본 파일을 여는 기존 export 경로를 유지하며 본문의 원문 전환과 구분했다. 키보드 포커스, 상단 배치, Markdown 렌더링/안전한 링크/원문 보존, 390px 모바일을 검증했다.
- `verify-markdown.mjs`, `verify-history-ui.mjs`, `verify-handling-ui.mjs`, `verify-mail-analysis.mjs` 통과. 새 버튼과 처리 완료/취소 흐름의 모바일 캡처를 육안 확인했다. 배포 환경 검증 중 테스트 대기 조건이 잠시 비어 있는 제목을 참조하는 문제를 발견하여 null 안전하게 고쳤다.
- Docker 빌드 성공 후 API만 `--no-build --no-deps --wait`로 갱신했다. 실제 API의 처리 완료 필드 추가, 배포된 app.js/style.css/mail-analysis.js의 소스 일치, 기존 보고서 해시 보존, Worker online/ready를 확인했다. Worker/DB 재시작이나 실제 메일의 분석·처리 완료는 실행하지 않았다.

## 2026-09-17 메일 처리 완료

- `mail_identity.handled_at`에 메일 단위의 사용자 처리 완료 시각을 저장하고 취소할 수 있다. 기존 실행 상태/질문/보고서/해시를 변경하지 않으며 Worker나 MCP를 호출하지 않는다. 완료된 메일은 취소 후 재분석할 수 있고, 실행 등록과 같은 DB 잠금으로 동시 완료/분석 시작을 방지한다.
- 격리 임시 DB 스키마에서 통합 테스트 33개 통과. 보고서 보존, 실행 미생성, 반복 완료의 동일 시각, 저장소 분리, 취소 후 분석, 실행 중 완료 거부, 동시 등록, 인증/출처/입력 검사 및 MCP 미호출을 확인했다. 실제 고객 메일의 처리 상태는 변경하지 않았다.
- `verify-handling-ui.mjs` 합성 브라우저 검증 통과: 완료/취소, 목록과 이력 갱신, 기존 질문 보존, 새로고침 후 상태 유지, 중복 클릭 방지, API 오류 복구, 실행 중 버튼 비활성, 390px 모바일 가로 넘침 없음/pageerror 0개. `.runtime/handling-mobile.png` 육안 확인.
- `npm run check` 및 변경 JS 구문 검사 통과. API 반영은 다음 문서 버튼 작업과 함께 진행한다.

## 2026-09-17 연속 동기화·중지·이어받기

- 계획서에 범위/완료 기준을 먼저 추가한 뒤 구현했다. 정상 MCP partial(오류 없음/실패 0/잔여 있음/저장 진전)을 다음 묶음으로 이어가며 30회/3,000개 제한을 제거했다. `sync_run`에 묶음/재시도/다음 시도/집계 불확실 여부를 추가했다. HTTP 등록은 DB 저장만 하고 API 내부의 독립 스케줄러가 한 묶음씩 처리한다.
- 중지는 현재 MCP 묶음 반환 후 적용한다. 진행 결과는 이미 저장된 메일과 함께 보존하며, API 재시작은 `paused`로 복구한다. 이어받기는 새 실행이며 MCP UIDL 중복 제외를 사용한다. 저장 응답 유실 시 집계 불확실 안내를 표시한다. 상태와 예약은 영속화했지만 현재 처리기 수명은 API에 종속되므로 팀 다중 인스턴스/서버리스 작업은 별도다.
- transient 오류는 최대 3회(5/15/30초) 재시도하며 인증/TLS/저장소/영구 메일 오류, 무진행/잘못된 응답은 종료한다. 실패 시도는 누적 횟수로 표시한다. MCP의 남음은 실패 메일을 제외하므로 실패/오류 0인 최종 응답까지 완료로 표시하지 않는다. 재시도에서 실패가 해결되면 과거 실패 횟수는 유지한 채 완료할 수 있다.
- 통합 테스트 **30개 통과**. 현재 DB의 무작위 전용 schema에서 정상 partial을 포함한 3,200개/32묶음 수집, 요청/처리기 중복 방지, 중지 전/중/재시도 대기 상태, 과거 결과 보존, 지연 예약·최대 재시도, 영구 오류/무진행, 응답 유실·재시작, 잠금 연결 상실 시 오래된 결과 기록 차단, 인증된 시작/중지 API를 검증했다. 테스트가 자신의 schema에 해당하는 advisory-lock 연결만 종료했고 schema도 종료 시 정리했다. POP3 오류 코드 숫자(POP3) 분류 누락을 초기 테스트에서 발견해 수정 후 전체 통과했다.
- `verify-sync-refresh.mjs` 브라우저 검증 통과: 기존 빠른 완료/종료 갱신 회귀, 진행 저장 건수 변화에 따른 목록 갱신, 진행률, 중지/중지 요청 중 버튼, paused/서버 재시작 안내, 명시적 이어받기, 재시도 표시, 불확실 집계, 모바일. API는 합성 응답이며 실제 수신을 호출하지 않았다. `.runtime/sync-progress-desktop.png`, `sync-progress-mobile.png` 육안 확인 완료.
- 분석 배지·이력 레이어·Markdown·Office 미리보기 회귀 및 TypeScript/JS 검사 통과. 별도 Docker 프로젝트에서 기존 백업/복원 대조와 프로세스 KILL/DB restart 후 동기화 paused 복구를 검증하고 해당 프로젝트/볼륨만 정리했다. 실제 PC 재부팅이나 실제 POP3 중도 종료를 실행한 것은 아니다.
- 배포 전 실제 sync가 completed임을 읽기 전용으로 확인하고 API만 `--no-deps`로 갱신했다. 배포 app.js/style.css/index.html 해시 일치와 새 sync 컬럼 응답을 확인했다. 배포 환경 합성 UI 검증, 실제 목록 30건/완료 배지 2건/이전 이력 33건/모바일 및 기존 지정 메일 1130 보고서·직접 CLI 해시 대조 통과. Worker online/ready 유지. 실제 수집이나 새 고객 분석을 시작하지 않았다.

## 2026-09-17 동기화 후 목록 자동 갱신

- 기존 UI는 주기적 확인에서 `running → 종료` 전환을 관측했을 때만 목록을 갱신했다. 버튼 직후의 상태 조회는 이전 상태 변수에 반영하지 않았으며, 폴링 사이에 끝난 동기화도 놓칠 수 있었다.
- `public/app.js`에서 실행 ID/종료 상태/완료 시각을 기준으로 마지막 목록 반영 결과를 추적한다. 버튼 직후 및 10초 폴링이 같은 완료를 감지해도 중복 갱신하지 않는다. 목록 조회가 성공한 후에만 반영 완료로 기록하여 실패 시 재시도한다. 최초 로그인 때는 현재 목록을 한 번 조회하고 과거 동기화 때문에 반복 초기화하지 않는다.
- 갱신 시 검색어/발신자/날짜 조건과 선택 메일 상세는 유지하고 첫 페이지를 조회한다. 부분 완료/실패도 저장된 메일이 있을 수 있어 목록을 갱신한다. POST 대기 중 버튼을 즉시 비활성화하고, 진행 상태에 따라 비활성화를 유지한다.
- `scripts/verify-sync-refresh.mjs`의 합성 브라우저 검증 통과: 첫 폴링 이전 빠른 완료, 느린 목록 조회 중 중복 완료 감지, 일반 running→completed, 다른 탭의 completed→completed 실행 변경, 부분 완료/실패, 목록 조회 실패 후 동일 실행 재시도, 첫 페이지/필터/선택 상세 유지, 버튼 중복 클릭 방지. 모든 sync 응답은 모의 자료이며 실제 수신 요청은 실행하지 않았다.
- `npm.cmd run check`, app.js 구문 검사, 분석 배지 및 이력 레이어 회귀 검증 통과. 서버 API/DB/Worker 변경이 없어 DB 통합 테스트를 반복하지 않았다.
- API만 `--no-deps`로 반영했고 배포된 app.js 해시가 로컬 소스와 일치한다. 배포 환경에서도 모의 sync 완료/재시도 검증 통과. 실환경 읽기 전용 UI 검증은 목록 30건/완료 배지 2건/이전 이력 33건, 모바일 가로 넘침 및 pageerror 없음. Worker online/ready 유지. 실제 POP3 동기화는 이번 검증에서 재실행하지 않았다.

## 2026-09-17 메일 목록 분석 이력 배지

- 목록에 초록색 `✓ 분석 완료`와 최신 대기/진행/확인 필요/실패 표시를 추가했다. 이전 완료 후 재분석 실패/진행 중이면 완료 이력과 최신 상태를 함께 표시한다. 확정 연결된 이전 문서는 별도 건수로 표시하고 미연결 문서를 임의 연결하지 않는다.
- 인증된 `GET /api/mail-analysis?mailIds=...`는 현재 MCP 저장소와 최대 100개의 숫자 ID로만 집계한다. 웹/직접 실행을 모두 포함하고 본문·보고서를 반환하지 않는다. 현재 페이지당 단일 DB 조회이며 `analysis_by_mail` 인덱스를 추가했다. 기존 10초 폴링은 배지만 갱신하고 목록/검색/선택/스크롤을 유지한다. 늦은 이전 페이지 응답은 무시하고 조회 실패는 이력 없음과 구분한다.
- 통합 테스트 **23개 통과**: 별도 임시 PostgreSQL schema에서 동일 숫자 ID의 저장소 분리, 완료+실패 재분석, 대기/확인 필요, 확정 legacy 연결, 미연결 제외, 100건 초과 집계, 인증/입력 제한, 추가 MCP 호출 없음 검증. 테스트 종료 시 해당 schema만 제거했다.
- `verify-mail-analysis.mjs` 합성 브라우저 검증 통과: 일괄 조회, 모든 상태 배지, 기존 완료 보존, 이력 없는 메일 무표시, 10초 갱신/검색·선택 유지, 조회 실패/회복, 페이지 이동/늦은 응답 무시, 모바일. API 변경 요청 0건/pageerror 0건. 합성 캡처는 `.runtime/mail-analysis-*.png`에 보존했다.
- `verify-history-ui.mjs`, `verify-maintenance-ui.mjs`, `verify-markdown.mjs`, `verify-preview.mjs`, TypeScript 및 변경 JS 구문 검사 통과.
- API 컨테이너만 `--no-deps`로 반영하고 배포 정적 파일의 해시 일치를 확인했다. 배포 환경 합성 배지 검증 및 실환경 읽기 전용 UI 검증 통과: 현재 목록 30건 중 완료 배지 2건이 API 집계와 일치, 이전 이력 33건, 모바일 가로 넘침/pageerror 없음. 지정 메일 1130과 직접 분석 메일 1133의 완료 이력도 확인했다. Worker online/ready 유지. 실제 sync나 신규 고객 분석은 실행하지 않았다.

## 2026-09-17 Markdown viewer

- 분석 보고서·지식 제안·리뷰·이전 문서를 Markdown 서식으로 렌더링한다. 제목, 강조, 취소선, 표, 목록/읽기 전용 체크 목록, 인용, 코드 블록을 지원한다. 각 문서의 원문/문서 전환과 기존 export를 유지하며 저장된 내용을 변경하지 않는다.
- `marked@18.0.13`과 `dompurify@3.4.15`를 고정하고 `viewer/markdown.js`를 `public/markdown/viewer.js`로 번들한다. [marked 공식 문서](https://marked.js.org/)의 정제 권고에 따라 [DOMPurify](https://github.com/cure53/DOMPurify)의 제한된 태그/속성 목록을 적용한다. HTML은 DOM 생성 전에 escape하고 이미지 토큰은 설명 문자로 변환한다. HTTP(S)만 새 창 링크로 허용하고 상대 경로/앱 hash/javascript/file 링크, 폼, 스타일, SVG, iframe은 실행하지 않는다. CSP 완화 없음.
- `scripts/verify-markdown.mjs`의 합성 브라우저 검증 통과: 서식, 지식/리뷰/이전 문서, 원문 정확 일치, export 링크 유지, 위험 HTML/URL/이미지 비실행, 외부 및 예상 외 내부 요청 0건, API 변경 요청 0건, pageerror 0건. 390px 모바일에서 페이지 가로 넘침 없이 표/코드 내부 스크롤 확인. `.runtime/markdown-desktop.png`, `markdown-mobile.png` 육안 확인 완료.
- `verify-history-ui.mjs`, `verify-maintenance-ui.mjs`, `verify-preview.mjs` 회귀 검증 통과. 메뉴/레이어/포커스/늦은 응답/인증 만료, 기존 상태 문구, Office 세 형식/다운로드/실패 재시도 유지.
- `npm.cmd run check`, 변경 JavaScript 구문 검사 통과. API/DB 계약 변경이 없어 DB 통합 테스트를 재실행하지 않았다. Mermaid/코드 실행·구문 강조·문서 이미지 로드는 이번 범위에 포함하지 않는다.
- Docker API만 `--no-deps`로 갱신했다. 배포된 Markdown 합성 검증과 실제 UI 읽기 전용 검증(메일 목록 30건·이전 이력 33건·모바일·pageerror 0건)이 통과했다. 기존 지정 메일 1130 보고서의 기본 렌더링 및 원문 전환을 확인했고 웹/직접 CLI/저장 보고서 해시가 일치했다. 새 고객 분석이나 sync는 실행하지 않았다.

## 완료한 구현
- 별도 Git 프로젝트 mail-triage-web 생성 및 Docker Compose 구성.
- 웹/API, PostgreSQL 공용 이력, Codex Worker 실행.
- 메일 목록/검색/본문/이미지·텍스트 첨부 조회, 동기화 버튼, 분석 큐, 이력/보고서/질문 답변 화면.
- 공용 이력 API: 실행 등록, 요청 멱등성, 동일 메일 동시 실행 차단, lease/heartbeat, 불변 결과, 재분석, 리뷰, Markdown export.
- erp-manager CLI 및 스킬 분기 추가, history.local.json 설정으로 공용 모드 연결.
- ERP 경로 환경변수 지원. Worker는 업무 자료와 ERP 코드만 읽기 전용으로 마운트.
- API 인증 정보는 Worker의 모델 subprocess 환경과 업무 자료 마운트에서 제외.
- 웹에서는 자동 sync/Outlook/Orca/Claude 리뷰를 요청하지 않고 mail MCP sync 도구도 비활성화.
- 업무 지식은 report result의 knowledge 제안으로 저장. docs 자동 반영은 미구현.

## 실제 실행 결과
1. TypeScript 타입 검사 통과.
2. Docker의 전용 임시 PostgreSQL 스키마 통합 테스트 9개 통과.
   - 동시 등록과 요청 재전송
   - 결과 불변성과 재분석 버전
   - 만료된 실행의 저장 차단
   - Message-ID 단독 병합 방지와 저장소 구분
   - Worker claim 배타성과 질문 답변의 새 실행
   - 리뷰 재전송 중복 방지
   - sync 일부 실패와 진전 없음 판정
   - API 인증/Origin/잘못된 UUID 처리
   - 실제 직접 CLI와 웹 API의 양방향 보고서 공유
3. 호스트와 Docker에서 실제 mail MCP 연결 성공. 검증 당시 저장 메일 1,130건, 한 건 조회 성공.
4. Docker에서 실제 DB MCP의 SR DB SELECT 1 AS CONNECTION_OK FROM DUAL 성공.
5. Codex 0.154.0 인증 상태: ChatGPT 로그인 확인.
6. 실제 Codex 호출 이벤트: mail.search_emails, mail.get_email(id=1130), db.execute_query가 completed이며 isError=false.
7. 실제 Codex shell에서 /reference/tools/erp-nav.mjs와 /erp/gg/src/main/webapp 존재 확인 exit 0.
8. Headless Chrome 검증: 로그인, 목록 30건, 본문, 페이지 이동, 모바일 390px 가로 넘침 없음, pageerror 없음.
9. erp-manager CLI status 연결 성공. 공용 운영 이력 list는 빈 배열이며 모의 테스트 기록은 운영 이력에 남지 않았다.
10. Codex 스킬 quick_validate.py UTF-8 검증 통과. erp-manager git diff --check 통과.
11. Docker API/DB healthy, Worker ready 상태 확인.

## 해결한 환경 차이
- mail MCP는 Host=localhost:17082만 허용한다. Node fetch는 Host override가 적용되지 않아 API 프로세스의 loopback-only 고정 대상 HTTP 어댑터를 사용한다. Codex MCP 클라이언트는 명시적 Host 헤더로 연결한다. 기존 MCP 서버 설정은 변경하지 않았다.
- Codex 기본 bubblewrap가 Docker의 비특권 namespace 제한으로 shell 실행에 실패했다. 지원되는 use_legacy_landlock backend를 활성화하고 sandbox=read-only를 유지해 파일 접근을 확인했다.
- Landlock backend는 deprecated이므로 Codex를 0.154.0으로 고정했다. Codex/Docker 업그레이드 시 다시 검증해야 한다.
- 최초 smoke는 모델의 요약 문자열을 검사했으나 표현이 부정확할 수 있어 실제 MCP/명령 이벤트를 검사하도록 수정했다.

## 아직 실행하지 않았거나 미완료인 사항
- 고객 메일 한 건의 전체 업무 분석 → 보고서 저장까지 실제 Worker 종단 검증.
  현재 실제 MCP/AI/파일 접근은 검증했고, 이력 저장 흐름은 합성 메일/보고서로 검증했다.
- 실제 sync 버튼으로 신규 POP3 메일을 수집하는 검증. 부분 실패 판정은 테스트 데이터로 검증했다.
- 기존 Markdown 로그/보고서의 preview·식별자 대조·가져오기.
- MCP에 없는 Outlook 단건 예외의 공용 식별 및 등록.
- 업무 지식 제안의 단일 자동 반영기와 원본 해시 대조.
- 사용자 요청 취소 UI, 보다 상세한 실시간 단계 표시.
- DB 재시작/프로세스 강제 중단을 동반한 복구·백업 복원 실험.
- 사내 다중 사용자 인증/HTTPS. 현재는 localhost 전용 단일 사용자 토큰 방식.

## 실행 상태와 사용
주소: http://localhost:3080
로그인: 프로젝트 .env의 TRIAGE_TOKEN. 비밀 값은 이 문서/Git/로그에 기록하지 않는다.
기존 erp-manager Markdown 이력은 삭제하거나 이관하지 않았다. 새 공용 이력과 함께 확인한다.
프로젝트를 Git commit/push하지 않았다.

## 2026-09-16 이미지 자동 표시 수정
- 원인: 메일 상세에서 본문 텍스트만 즉시 표시하고 이미지는 첨부 버튼을 눌러야 조회하도록 구현되어 있었다.
- 수정: 메일을 열면 본문 아래 이미지 목록을 자동 조회·표시한다. 동시에 최대 3개를 조회하고 이미지별 실패 안내와 재시도를 제공한다.
- MCP image 및 embedded resource 이미지 형식을 지원한다. 메일 HTML을 실행하거나 원문 내 이미지 위치를 추정해 바꾸지는 않는다.
- 검증: 실제 메일의 이미지 3개(622×106, 969×145, 789×143)가 버튼 없이 표시됨. 조회 실패 모의 응답 후 재시도 성공, 중복 카드 없음.
- 이미지 응답 처리 회귀 테스트 2개 통과. TypeScript 검사 통과. Chrome desktop/mobile 390px 가로 넘침과 pageerror 없음.
- 로컬 Docker API 재빌드·반영 완료, healthy 상태 확인.

## 2026-09-16 본문 내 이미지 표시
- 위의 본문 아래 자동 이미지 목록 방식을 확장했다. mail MCP `get_email_html`이 저장 원본의 HTML과 CID 연결을 읽으며 기존 텍스트 API와 DB는 유지한다.
- 문단·표·인용문 안의 이미지 위치에 같은 메일의 첨부를 표시한다. 본문에서 반복 참조한 서명 이미지는 원래 위치마다 표시하며 미참조 첨부만 하단에 남긴다.
- 서버에서 스크립트·스타일·외부 이미지 등을 제거하고 웹에서 다시 허용 요소만 생성한다. CID 중복·미확인 참조는 임의 이미지로 연결하지 않는다.
- MCP Docker Gradle 전체 build/test 통과. HTML 선택·CID 경로·유해 콘텐츠 제거·첨부 메일 분리 테스트 3개와 새 도구 HTTP 스키마/조회 검증 포함.
- 웹 TypeScript 및 Docker 테스트 11개 통과. 실제 Chrome에서 이미지 3종이 본문 5곳(서명 반복 포함)에 로드됨. 별도 이미지 목록 0개.
- 브라우저 검증: 문장 사이 위치, CID 반복/중복 처리, 외부 요청·실행 요소 없음, 본문 내 실패 후 재시도, HTML 조회 장애 시 전체 텍스트 대체, 390px 가로 넘침 없음, pageerror 없음.
- 반복 CID 이미지의 실패가 여러 위치에 남는 문제를 재시도 회귀 검증에서 확인해 보완했다. 한 곳에서 재시도하면 같은 첨부의 모든 표시 위치가 함께 복구된다. 보완 후 verify-inline-images.mjs와 verify-images.mjs 모두 통과.
- 초기 브라우저 실행은 MCP 재시작 중 목록 조회 시간 초과가 발생했고, healthy 확인 후 재실행하여 통과했다.
- mail MCP와 웹 API의 Docker 재빌드·컨테이너 반영 완료. 메일 재동기화나 분석 실행은 하지 않았다.
- 검증 스크립트: scripts/verify-inline-images.mjs. 화면 캡처는 Git 제외 .runtime에만 저장한다.

## 2026-09-16 첨부파일 목록과 다운로드
- 사용자 선택 범위: 파일 목록·다운로드. ZIP 내부 목록이나 문서 내용 미리보기는 추가하지 않았다.
- 본문 위 첨부 목록에 파일명·형식·크기·다운로드 버튼을 표시한다. 이미지 포함 전체 첨부를 나열한다.
- 동일 메일/첨부 식별자를 검증하고 인증된 API에서 원본 바이트를 attachment로 전달한다. 파일명 경로/제어 문자 제거, octet-stream 응답을 적용했다.
- 기존 MCP 전달 한도 5 MiB를 그대로 적용한다. 큰 파일이나 식별자가 없는 첨부도 목록에 표시하고 다운로드 제한을 설명한다.
- TypeScript 및 Docker 테스트 14개 통과. 다운로드 인증, 원본 바이트 보존, 잘못된 응답/파일 크기 경계를 검증했다.
- 실제 메일 첨부 3개 목록과 첨부 1개(7,672바이트)의 다운로드 결과가 MCP 원본과 동일함을 확인했다.
- ZIP·DOCX·PPTX·XLSX 이름/형식 표시와 다운로드는 합성 응답으로 검증했다. 문서 파싱이나 해당 형식의 실제 고객 문서 검증을 수행한 것은 아니다.
- 실패 후 다운로드 재시도, 긴 파일명/HTML 문자 처리, 390px 모바일 가로 넘침 없음, pageerror 없음. 기존 본문 이미지 표시 검증도 통과했다.
- 웹 API Docker 재빌드·반영 완료. mail MCP 코드나 한도는 변경하지 않았다.
## 2026-09-16 최종 UI와 인수인계
- 분석 이력 버튼을 분석 버튼 옆 파란색 버튼으로 배치. 데스크톱/390px 모바일의 배치·색상·이력 GET 요청 정상 확인.
- 첨부 목록은 details/summary로 기본 닫힘. 클릭·Enter·Space·모바일 조작, 메일 재선택 시 닫힘, 펼친 후 실제 다운로드를 확인했다.
- 마지막 검증에서 기본 접힘 확인과 verify-downloads.mjs가 통과했다. 위 전체 테스트 14개 이후 이 작은 UI 변경은 실제 브라우저로 검증했다.
- 계획서 완료 표시를 확인된 범위에 맞추고 docs/work-summary.md에 세 저장소 변경·제약·미완료 검증·후속 순서를 정리했다.

## 2026-09-16 Office 미리보기 추가

- 인수 후 사용자 요청으로 DOCX/PPTX/XLSX 미리보기를 범위에 포함했다. 사용 라이브러리: `@extend-ai/react-docx@0.9.2`, `@extend-ai/react-pptx@0.2.1`, `@extend-ai/react-xlsx@0.16.4`. 각 공식 GitHub README와 설치 패키지 타입/Worker/WASM 구성을 확인했다.
- 첨부 목록의 미리보기 버튼, 읽기 전용 모달, 닫기/Escape 및 포커스 복원, 로딩·실패·60초 타임아웃·재시도, 원본 다운로드를 구현했다. 모달을 닫거나 메일을 바꾸면 요청을 취소하고 프레임을 제거한다.
- 기존 인증 다운로드 API의 원본 바이트와 5 MiB 제한을 재사용한다. ZIP/미지원 확장자에는 미리보기 버튼을 표시하지 않으며 초과 크기/식별자 누락은 비활성화한다.
- `viewer/` React 앱은 Vite로 `public/preview/`에 빌드한다. 형식별 코드/Worker/WASM은 로컬에서 필요 시 로드한다. 별도 프레임의 CSP만 WASM/인라인 스타일을 허용하며 외부 fetch/이미지/폰트, 하위 프레임, 폼 전송을 차단한다. 문서 링크는 클릭/키보드/중간 클릭 탐색을 막는다. 프레임은 같은 출처의 신뢰된 뷰어 코드를 실행하므로 별도 출처의 보안 격리 환경이라는 의미는 아니다.
- XLSX Worker 방식에서는 `workbook` 객체가 없어도 표시가 가능하므로 로딩 종료와 탭 목록으로 완료를 판정했다. 읽기 전용 시트 전환 및 확대/축소 UI를 제공한다.
- `npm.cmd run check`, `npm.cmd run build:viewer` 통과. WASM 및 문서 렌더러 특성상 500 kB 초과 번들 경고가 있으며 형식별 지연 로딩을 적용했다.
- `docker compose --profile verification run --rm tests`: **15개 통과**. 기존 인증/다운로드/이력 통합 테스트 및 메일 화면 CSP를 완화하지 않고 뷰어에만 WASM을 허용하는 회귀 검증을 포함한다. 전용 임시 PostgreSQL schema를 사용하며 운영 이력은 변경하지 않았다.
- `python scripts/create-preview-fixtures.py` 및 `node --import tsx scripts/verify-preview.mjs` 통과. 실제 OOXML 구조의 합성 DOCX 본문/표, PPTX 두 슬라이드, XLSX 두 시트 전환과 읽기 전용 상태를 브라우저에서 확인했다. HTML/이미지 응답을 문서처럼 꾸민 검증이 아니라 세 라이브러리가 문서 바이트를 파싱하고 렌더링한 결과다.
- 같은 스크립트를 `PREVIEW_BASE_URL=http://localhost:3080`으로 실행해 Docker에 반영된 정적 파일과 응답 CSP에서도 통과했다. 이 미리보기 검증의 API는 모두 브라우저 모의 응답이며 고객 메일/DB/MCP를 사용하지 않는다.
- 데스크톱/390px 모바일, 로드 실패 후 재시도, 원본 다운로드 바이트 일치, 401 인증 만료, 세 형식 손상 파일, 외부 fetch/이미지/링크 차단, Escape/포커스 복원 확인. API 변경 요청 0개, pageerror 0개. 502/401 및 CSP 콘솔 메시지는 의도한 실패·차단 검증에서 발생했다.
- `.runtime/preview-{docx,pptx,xlsx}[-mobile].png`를 저장하고 주요 데스크톱/모바일 화면을 육안 검토했다. 검토 중 XLSX 배율 표시를 100%로 보완했고 재검증했다. 합성 문서/캡처와 빌드 생성물은 Git 제외다.
- `scripts/verify-ui.mjs`의 본문 선택자를 HTML/텍스트에 모두 맞게 보완했다. Docker 반영 후 로그인, 목록 30건, 상세, 페이지 이동, 모바일 가로 넘침 없음과 pageerror 없음 확인.
- `scripts/verify-downloads.mjs`는 미리보기 버튼 추가 후 다운로드 버튼을 명시적으로 선택하도록 보완했다. Docker 반영 후 실제 첨부 한 건 7,672바이트 원본 일치, 합성 확장자 표시/재시도/제한/모바일 검증 통과.
- `docker compose up -d --no-build --no-deps --wait api`로 API만 반영했다. API/DB healthy, Worker running을 확인했다. ERP/mail MCP 코드 변경, 고객 메일 분석, POP3 sync, 이관, commit/push는 수행하지 않았다.

제한: 실제 고객 DOCX/PPTX/XLSX 문서의 복잡한 서식·차트·폰트·암호화 호환성 전체를 검증한 것은 아니다. DOCX 내장 폰트 로드는 끄고 로컬 대체 폰트를 사용한다. 원본 Office 프로그램과 렌더링이 다를 수 있으며 ZIP 내부, 구형/매크로 형식 및 편집은 이번 범위 밖이다. 기존 실제 Worker 전체 분석/POP3/이관/백업 복원 미완료 항목은 그대로 남아 있다.

## 2026-09-16 viewer 이후 계획서 후속 검증

위 viewer 시점의 미완료 항목 중 이관/동기화/격리 복구 검증을 이번 작업에서 진행했다.

- `npm.cmd run check` 통과. `docker compose --profile verification run --no-deps --rm tests`: **22개 통과**. 기존 15개에 legacy 동시 가져오기/해시/명시적 연결, Outlook mailbox 범위 식별, 만료 결과 재등록/멱등성, API 장애 시 Worker admission 차단, 실제 합성 파일 지식 반영/완료 저장 실패 후 재전송/원본 충돌, BOM/CRLF 보존 이관 CLI, 순차 sync/중복 배제/부분 실패/중단 복구를 추가했다.
- `scripts/verify-recovery.mjs` 통과. 격리 프로젝트 `triage-recovery-20c6f81d`에서 합성 DB를 `pg_dump -Fc`로 백업하고 별도 DB에 복원한 뒤 7개 테이블/4행 해시 일치를 확인했다. 단일 Worker 잠금 소유 프로세스 강제 종료와 실제 DB 컨테이너 재시작 각각에서 잠금 재획득, 오래된 owner 거부, 대기 작업 완료, 중단 sync 실패 전환을 확인했다. 생성한 테스트 프로젝트/볼륨만 정리했다. 실제 Codex 프로세스나 운영 고객 분석을 강제 종료한 검증은 아니다.
- 실제 이력 preview `.runtime/legacy-preview-20260916.json`: 보고서 32건+로그 1건. import 결과 `imported=33, existing=0, verified=33, linked=0`. 동일 manifest 재실행 결과 `imported=0, existing=33, verified=33`. API에서 모든 내용/해시 대조 완료, 원본 수정 없음. receipt `.runtime/legacy-import-20260916.json`. 확정할 수 없는 메일 연결을 만들지 않았으며 고객 완료 상태를 재분류하지 않았다.
- 실제 POP3 수집은 웹 동기화 버튼을 한 번 눌러 수행했다. 결과 `completed, saved=3, failed=0, remaining=0`. mail MCP 구현의 POP3 폴더 READ_ONLY/close(false)를 확인했고 메일 발송·삭제·읽음 처리나 AI 분석은 수행하지 않았다. 첫 브라우저 스크립트는 갱신 직전 화면을 검사하여 실패했으나 API 작업은 성공했다. 화면 대기 코드를 보완하고 재수집 없이 읽기 전용 UI 검증으로 최종 건수를 확인했다. `.runtime/live-sync-validation.json` 및 `.runtime/live-ui-validation.json` 참조.
- `scripts/verify-maintenance-ui.mjs`: legacy 목록/메일별 명시적 필터, 원문을 HTML로 실행하지 않음, Outlook 질문의 직접 실행 안내, 긴 파일명/모바일 통과. 모의 API만 사용, 변경 요청 0개/pageerror 0개.
- 실제 이관 자료로 모바일 검증 시 긴 파일명이 가로로 넘치는 문제를 발견하고 버튼 최소 폭/줄바꿈을 보완했다. 배포 후 `scripts/verify-ui.mjs`에서 로그인/메일 30건/상세/페이지/이관 33건/동기화 최종 건수 표시/390px 가로 넘침 없음/pageerror 없음 통과.
- Docker 배포 자산에서 Office 세 형식 합성 parser/Worker/WASM 렌더링 회귀 검증 통과. 의도된 401/502/CSP 차단 메시지 외 pageerror 없음.
- 첫 통합 테스트 때 Compose의 새 restart 설정으로 기존 DB 컨테이너가 재생성되었고 이전 API/Worker가 연결 오류로 종료됐다. 영구 볼륨을 유지하고 API/Worker를 재시작하여 복구했다. 그 후 통합 테스트에 `--no-deps`를 사용하고 강제 종료/DB 재시작 실험을 별도 프로젝트로 분리했다. 새 코드에는 pool idle 오류 처리와 Worker 잠금 소실 시 중단을 추가했고 서비스는 `unless-stopped`로 설정했다.
- API/Worker는 `--no-build --no-deps`로 새 이미지에 반영했다. 실제 고객 전체 Worker 분석과 Outlook COM 수집, 실제 업무 지식 문서 적용은 하지 않았다. 수직 검증용 mail MCP ID는 사용자 답변 대기다. ERP 코드·ERP DB 변경 및 commit/push 없음.
- 직접 실행의 `erp-manager/.claude/mail/shared-history.md`만 기존 내용을 보존하여 새 운영 절차와 연결했다. 미구현 안내를 수정하고 미연결 이력/기존 완료 상태 보존 및 운영 도구 문서 링크를 추가했다. ERP 소스·인증 설정은 변경하지 않았다.
- 이관 후 실제 앱 이력 DB를 `.runtime/triage-after-maintenance-20260916.dump`로 백업했다. 297,522바이트, SHA-256 `862de96ce67d810639621621d33ed9761d64e86b9efdc080e2d9683970cbd8d0`. 이 실제 백업 파일 자체의 복원은 수행하지 않았으며 위 복원 실험은 격리 합성 데이터다.
- 최종 상태: API/DB healthy, Worker online/ready, 실행 이력 0건/활성 작업 0건, legacy 33건, 실제 sync completed(3/0/0). `.runtime` 및 dump는 Git 제외를 확인했다.

## 2026-09-17 사용자 지정 메일의 실제 Worker 전체 분석

- 제목 검색 결과 정확히 한 건, MCP ID 1130과 Message-ID를 대조했다. 기존 공용 실행 0건을 확인한 뒤 실제 브라우저의 **이 메일 분석** 버튼으로 한 번 등록했다. 임의 고객 메일 선정, sync, 메일 발송은 하지 않았다.
- 실행 ID `b3c3523b-7828-43a0-b393-9072945d79e7`. 10:38:18~10:43:29 KST, 310.958초, `queued → running → completed`. API 실행 오류 없음.
- Worker의 `tool-calls.json`과 Codex 실행 세션을 함께 확인했다. 지정 ID의 `get_email` 성공, DB SELECT 13회 중 12회 성공, DB 목록·스키마 조사 및 파일 읽기 명령을 확인했다. 쓰기 쿼리, sync, Outlook, Claude 리뷰 호출은 없었다. 14개 근거 항목을 갖는 구조화된 최종 보고서가 저장됐다.
- 조회 실패는 메타데이터 4건과 문자열 조회 1건이었다. 후자는 일반 문자열 SELECT로 재조회 성공했고, 메타데이터 접근 제한·운영 프로시저 미검증·로그/배포본 미확인은 보고서에 기록됐다. 도구 완료 수만으로 모든 조회가 성공했다고 판단하지 않았다.
- 주요 집계·상태·감지 조건·발송 이력 네 가지를 실제 MCP 결과와 보고서 문장 사이에서 대조했다. 과거 보고서와 현재 조회의 차이를 별도로 표시하고 실제 발생 경로를 미확정으로 남긴 점을 확인했다. 고객 처리 상태나 ERP 데이터를 변경하지 않았다.
- `scripts/verify-live-worker.mjs verify --mail-id 1130 --direct-cli C:/Users/david/IdeaProjects/erp-manager/tools/triage-history.mjs` 통과. 웹 본문, 직접 CLI result JSON, API 보고서 및 Worker 파일의 보고서 해시가 모두 일치했다. 390px 가로 넘침 없음/pageerror 0개.
- 보고서 SHA-256: `be4019d855c65c95ee8d73ff891d6de9a05ae82df1ae898e9077be9c0a430050`. Worker `recovery.json` 상태 `registered`. 결과 JSON 해시 `810da6701324b0353fea1e06dc58fa2ebc2c88652d3b1c6c4d636ee0445e364e`.
- 해시 검증 export 성공. Git 제외 `.runtime/worker-e2e-1130-report.md`(보고서 사본), `worker-e2e-1130-result.json`(API 결과), `worker-e2e-1130-validation.json`(화면/CLI 검증), `worker-e2e-1130.json`(실행 receipt)에 보존했다. 원본 업무 문서나 기존 보고서를 덮어쓰지 않았다.
- 실제 실행에서 `/reference/.claude/mail/triage-log.md` 연결 누락을 발견했다. 해당 보고서는 로그 미대조를 정확히 제한으로 표시했다. 호스트의 대상 로그를 직접 대조하여 기존 처리 분류와 보고서의 일치를 확인한 뒤, 완료된 실행을 보존하고 `compose.yaml`에 원본 로그 read-only bind를 추가했다. `docker compose --profile analysis up -d --no-build --no-deps worker`로 Worker만 반영했다. 파일 읽기 성공과 `/proc/self/mountinfo`의 `ro` 옵션 확인. API/DB 재시작이나 전체 분석 재실행은 하지 않았다.
- 최종 Worker online/ready 확인. 이번 수정은 Compose의 읽기 전용 참조 추가 및 검증 스크립트/문서이며, 이 범위는 실제 마운트와 브라우저/CLI 검사로 검증했다. 기존 통합 테스트 22개를 이번 실행에서 재실행하지 않았다.

## 2026-09-17 팀 인증·배포 계획 추가

- 사용자 요청으로 Auth0 ID/비밀번호와 팀 내부 운영, Vercel 및 Docker 서버 대안을 검토했다. 추가 답변인 회사 SSO 불필요·기존 상시 서버 없음/개인 PC만 보유를 계획서에 반영했다.
- 현재 인증·이력·sync·Worker·Compose 코드를 확인했다. 단일 공용 토큰, 요청자 미기록, 응답 후 sync, 상시 Worker/로컬 볼륨, 개인 PC MCP 연결을 팀 전환 작업으로 분리했다.
- Auth0 로그인/Express/Device Flow/요금표, Vercel Functions 제한·Hobby 범위, Render Background Worker, Entra OIDC 공식 문서를 조회했다. Entra는 비교 후 이번 범위에서 제외했다. 플랫폼 사실과 이 앱에 대한 설계 판단을 `team-deployment-plan.md`에 구분하고 근거 링크를 기록했다.
- 권장 순서: Auth0 이메일·비밀번호/앱 권한 → 개인 PC의 제한된 팀 파일럿 → ERP망 연결 가능한 상시 VM의 Docker 운영. Vercel 웹만 올려도 PC의 Worker/MCP 의존은 해소되지 않으며, 클라우드 ERP 접근이 불가하면 내부 상시 호스트 확보가 선행 조건이다.
- 계획서·README·작업 정리·검증 기록만 변경했다. 런타임 코드/인증 설정/네트워크/DB/실행 중 서비스 변경 없음. 문서 링크와 최종 요구 반영을 확인했으며 문서 변경이므로 빌드·통합 테스트를 재실행하지 않았다.

## 2026-09-17 메뉴 분리와 메일별 이력 레이어

- 사용자 피드백에 따라 하단에 쌓이던 메일별 이력을 native dialog 레이어로 옮겼다. 해당 메일의 분석 이력/확인 연결된 이전 이력을 조회하고, 보고서와 이전 문서를 같은 레이어에서 읽는다. 목록 복귀, 새로고침, 닫기/Escape, 포커스 복원, 배경 스크롤 유지, 모바일 전체 화면을 제공한다.
- 상단 메뉴를 메일함/분석 이력/이전 이력으로 분리했다. hash 경로로 메뉴를 선택하고 메일함 검색·선택 DOM을 유지한다. 메일별 레이어의 필터·페이지와 전체 이력 메뉴의 상태를 분리하여 서로 영향을 주지 않게 했다.
- `scripts/verify-history-ui.mjs`의 합성 API/브라우저 검증 통과: 메뉴 표시 분리, 검색·메일 선택 유지, 정확한 mail/store 필터, 100건 이후 추가 조회, 보고서 목록 복귀, Escape/포커스/스크롤, 실패 재시도, 늦은 응답 무시, 빈 이력, 긴 보고서/390px 모바일, 인증 만료 시 레이어 닫기. API 변경 요청 0건/pageerror 0건. 합성 데스크톱·모바일 캡처를 `.runtime/history-*.png`로 남기고 육안 확인했다.
- `scripts/verify-maintenance-ui.mjs`는 새 메뉴/레이어 구조에 맞게 갱신하고 통과했다. 기존 문서의 HTML 비실행, 고객 완료 상태 문구 보존, Outlook 직접 답변 안내, 긴 경로 줄바꿈을 확인했다.
- `scripts/verify-preview.mjs` 통과. Office 세 형식 파싱/Worker/WASM·모바일·실패/재시도·다운로드·인증 만료·외부 요청 차단·Escape 동작 유지. 의도된 실패/CSP 콘솔 메시지를 제외한 pageerror 없음.
- `npm.cmd run check` 및 변경 JavaScript 구문 검사 통과. 서버 API/DB 계약은 변경하지 않아 DB 통합 테스트는 재실행하지 않았다. 실제 sync/새 AI 분석을 검증 목적으로 실행하지 않았다.
- 기존 실환경 검증 스크립트는 메뉴 이동/레이어 선택자에 맞게 갱신했다. sync 검증은 숨겨진 전체 이력 새로고침 버튼 대신 실제 동기화 표시 갱신을 기다리도록 수정했다.
- Docker API만 `--no-build --no-deps --wait`로 반영했고 배포된 app.js/style.css/index.html의 해시가 최종 로컬 소스와 일치함을 확인했다. 배포 환경의 합성 이력 레이어 검증도 통과했다.
- 실환경 읽기 전용 검증 통과: 메일 목록 30건/본문/페이지 이동/이전 문서 33건/동기화 표시/모바일 가로 넘침 없음/pageerror 0개. 기존 메일 1130의 보고서를 새 레이어에서 열어 직접 CLI 결과와 본문·해시 일치를 재확인했다. 새 분석은 만들지 않았으며 기존 Worker는 online/ready 상태를 유지했다.

## 2026-09-17 이미지 첨부 미리보기

- 본문 CID 이미지는 원래 위치에 유지하고, 본문 아래 자동 첨부 이미지 영역만 제거했다. 첨부 목록의 이미지 미리보기는 기존 Office dialog와 인증 다운로드 API를 재사용하며 PNG/JPEG/GIF/WebP/BMP/AVIF를 지원한다. 미리보기 버튼을 눌렀을 때만 별도 이미지 파일을 요청한다.
- `node --import tsx scripts/verify-images.mjs`는 이제 합성 전용 `verify-image-preview.mjs`를 실행한다. 본문 위치 보존, 하단 영역 제거, 목록 기본 접힘, 클릭 전 별도 첨부 요청 없음, MIME 미지정 PNG, 5 MiB/식별자 제한, 손상 파일/실패 후 재시도, 다운로드 바이트 일치, Escape/포커스 복원, 닫은 후 늦은 응답, HTML 실패 대체, 인증 만료, 모바일 검증 통과. 고객 메일/DB/MCP 조회 없음.
- `node --import tsx scripts/verify-preview.mjs` Office 세 형식 회귀 검증, `npm.cmd run check`, 기존 이미지 단위 테스트 2개 통과. 합성 이미지 미리보기 데스크톱/모바일 캡처를 `.runtime/image-preview-*.png`에 저장하고 모바일 레이아웃을 육안 확인했다.
- 같은 작업 폴더에서 별도 동기화 진행 UI 변경이 동시에 발견되어 실행 중 API 재생성은 수행하지 않았다. 위 검증은 수정 소스를 제공하는 임시 로컬 서버 기준이다.

## 2026-09-18 React 메인 화면 전환 R0~R6

- 계획을 먼저 작성하고 지정 Orca 터미널의 선행 작업 완료 및 기준 커밋 `97525f6`을 확인한 뒤 구현했다. `ui/`에 React + TypeScript + Vite 메인 앱을 만들고 Express의 기본 `/`와 Docker 빌드에 연결했다. API·토큰 인증·DB·Worker는 기존 계약을 유지한다.
- 검색·선택·스레드·수동 연결·스크롤·모바일·동기화·분석 진행·답변 초안·처리 상태·관련 메일·이력 레이어를 React 상태로 이관했다. 기존 CSS와 HTML/Markdown 정제, Office iframe, 초안 저장 모듈은 재사용하고 대체된 DOM 파일 8개는 제거했다.
- `npm run check`, 전체 빌드, `npm run verify:ui`의 합성 브라우저 검사 **15개 통과**. 추가 상태 검사와 `--strict-dev` 개발 React/StrictMode 검사도 통과했다. 기존 기준선에서 발견한 두 브라우저 조작 누락은 팝오버 닫기·모바일 메뉴 열기를 추가하여 기존 UI에서도 통과함을 확인했다.
- 1,000개 합성 목록 비교, 초기 Office/WASM 요청 0건, 데스크톱·모바일 캡처 육안 확인. React 초기 JS/CSS 크기는 증가했으며 측정 조건·수치·제한을 별도 기록했다.
- React 및 기존 UI 복귀 이미지를 운영 데이터 없이 임시 컨테이너에서 검증했다. 유휴 상태 확인 후 최종 API만 `--no-build --no-deps --wait`로 교체했다. Docker 엔진 및 기존 메일 MCP의 중단 상태는 기존 컨테이너를 재기동해 복구했다.
- 실제 `/health`, React HTML/JS/CSS 해시, 토큰 로그인, 메일 목록/상세, 기존 보고서, 390px 모바일 확인 통과. pageerror 0건, 변경 요청은 로그인뿐. 분석 6건·이전 문서 33건·리뷰·처리·관련 메일·수동 연결 해시 및 DB/Worker 컨테이너 ID 유지. Worker online/ready.
- 최종 이미지 `mail-triage-web:react-r6-20260918`와 기존 화면 이미지 `mail-triage-web:pre-react-97525f6`를 로컬 보존했다. 이미지 ID·기능 대응표·명령·복귀 절차는 [React 전환 검증](validation/react-transition-validation.md)에 기록했다.
- 실제 새 AI 분석·동기화·ERP 변경은 수행하지 않았다. 비밀·실메일 원문·생성물·`.runtime`은 Git에 추가하지 않는다. P1~P8 팀 인증·Runner 작업은 미착수로 유지한다.

## 2026-09-18 React Query와 스레드 조회 성능 개선

- `@tanstack/react-query` 5.103.1을 정확한 버전으로 설치했다. 공식 npm 메타데이터의 React 18/19 호환·MIT 라이선스를 확인했고 추가된 의존성은 react-query/query-core 두 개다. npm audit 보고 취약점 0개.
- 메일 목록은 `QueryClientProvider`와 `fetchQuery`를 사용한다. 출처·보기·검색·분석 상태·페이지를 key로 구분하고 15초간 fresh, 미사용 캐시는 60초 뒤 제거한다. 서버 결과 캐시는 QueryClient가 관리하고 화면 선택·스크롤 및 요청 세대 판정은 기존 로직을 유지한다. AbortSignal을 전달하여 이전 조회 취소를 유지한다.
- 명시적 검색·수동 연결·동기화 변화 시 전체 목록 캐시를 무효화한다. 분석 시작·추가 답변·처리 변경 때도 관련 목록을 무효화하며 적용 중인 분석 상태 필터는 다시 조회한다. 401은 QueryClient를 비운다. 실패 자동 재시도·창 포커스 재조회·브라우저 디스크 저장은 사용하지 않는다. 기존 초안은 그대로 보존한다.
- 서버 `ThreadSearchCache`는 출처·검색 조건별 완전한 검색 결과를 15초간 보관한다. 동시에 들어온 동일 검색은 Promise를 공유하고 오류/불완전한 검색은 보관하지 않는다. 최대 8개·직렬화 크기 합계 16 MiB로 보존량을 제한한다. 페이지 번호와 분석 상태는 원본 검색 키에서 제외하되, 매번 최신 DB의 연결·분석 상태를 적용하고 전체 그룹을 만든 뒤 페이지를 자른다.
- DB의 최신 sync 실행 ID/상태/저장 수/배치 수/종료 시각을 매 요청 확인하여 변화 시 서버 캐시를 비운다. `refresh=1`로 명시적 검색도 캐시를 비우며 전체 upstream 조회에는 한 MCP 세션을 재사용한다. 앱 밖에서 MCP 자료가 바뀌면 TTL 뒤 다음 조회에 반영되며 프런트/서버 캐시 시간이 겹치면 약 30초 늦을 수 있다. **검색** 버튼으로 즉시 다시 읽을 수 있다.
- `npm run check` 및 전체 Docker 빌드 통과. 기존 Office 대형 번들 경고는 유지. 메인 JS gzip은 이전 113.61 kB에서 121.00 kB로 약 7.4 kB 증가했다.
- Docker 격리 schema 통합/단위 테스트 **54개 통과**. 새 검사 5개는 동시 요청 공유, TTL/동기화/명시적 갱신, 실패·응답 역전, 용량·LRU 제한, 인증, 상태·연결 재계산 및 페이지 정확성을 검증한다. 기존 운영 schema를 초기화하지 않았다.
- 합성 UI 회귀 **15개 모두 통과**. 스레드 합성 서버 3개는 새 동기화 버전 의존성을 mock 주입하도록 변경했다. 최초 DB 연결 실패는 이 테스트 설정 누락을 수정한 뒤 통과했다.
- `verify-query-cache.mjs`: 페이지 왕복 시 추가 목록 요청 없음, 개별/스레드 캐시 분리, 15초 만료 후 재조회, 동기화 시 다른 페이지까지 무효화, 401 후 이전 캐시 제거 통과. `verify-react-state.mjs --strict-dev`: 실제 개발 React/StrictMode의 요청 경합·폴링 정리·재인증·CSP 검사 통과.

동일 로컬 API·메일 1,162개/542개 대화·페이지 크기 30으로 `measure-thread-api.mjs`를 실행했다. 아래는 API 응답 시간이며 화면 렌더링을 포함하지 않는다.

| 조회 | 적용 전 | 적용 후 재측정 |
|---|---:|---:|
| 캐시 없는 전체 스레드 조회 — 2회 | 2,046 / 1,962 ms | 2,460 / 1,965 ms |
| 다음 페이지 — 2회 | 1,939 / 2,544 ms | 20 / 15 ms |
| 첫 페이지 반복 조회 — 1회 | 1,865 ms | 13 ms |

- API 기동 직후 첫 측정은 캐시 없는 조회가 4,926/3,690 ms, 재사용 조회가 18~33 ms였다. `.runtime/query-cache/after-startup.json`으로 따로 보존하고 안정된 환경에서 위 표를 재측정했다. 최초 조회가 항상 빨라졌다고 주장하지 않는다.
- 동일 실행 중 컨테이너에서 원본 전체 스캔만 기존 연결/세션 재사용/세션 재사용/기존 연결 순서로 교차 측정했다. 페이지별 연결 2,594/2,767 ms, 세션 재사용 2,104/1,730 ms로 관찰했다. 작은 표본이며 장기 부하 검증은 아니다. 전체 메일을 읽는 최초 비용은 남고, 이번 개선의 큰 효과는 반복 전체 스캔 제거다.
- `.runtime/query-cache/before.json`, `after.json`, `browser.json`과 `.runtime/react-validation/`에 결과를 보존했다. 원문·실제 화면 캡처는 커밋하지 않는다.
- 유휴 상태를 확인하고 API만 `--no-build --no-deps --wait`로 적용했다. `/health`, 배포 자산 해시, 실제 로그인·메일 목록/상세·기존 보고서·390px 모바일·pageerror 0건 확인. 분석 6건·이전 문서 33건·리뷰·처리·관련 메일·수동 연결 해시 및 DB/Worker 컨테이너 ID 유지, Worker online.
- 적용 이미지 `mail-triage-web:query-cache-20260918`, ID `sha256:2482a5f984e040b4bd41edd494130dc529989d347194119bf4dcc1f59a7f6e3a`. 직전 React 이미지 `mail-triage-web:react-r6-20260918`를 보존했다. 필요 시 해당 이미지를 local 태그로 지정한 후 API만 `--no-build --no-deps`로 교체한다. 새 실메일 분석·sync·ERP 변경은 실행하지 않았다.

## 2026-09-18 P1 서비스 경계 분리

- `apps/history-api`, `apps/local-app`, `packages/contracts`, `packages/history-client`, `packages/ui` npm workspace 추가. 이력/DB와 로컬 메일 구현을 이동하고 `src` re-export와 기존 실행 경로를 유지했다.
- 인증 주입형 `/api/v1` HTTP 계약과 DB 자격이 없는 클라이언트 구현. 계약 검사는 메모리 repository 합성이며 실제 PostgreSQL v1 종단 검증과 v0 화면 전체의 v1 전환은 후속 작업이다.
- `npm run check`, `npm run build`, 격리 schema 백엔드 55개, 전체 UI 합성 15개 통과.
- 최초 Docker 검사는 Windows node_modules 마운트로 esbuild 플랫폼 오류가 발생했다. 소스 디렉터리만 read-only 마운트하고 컨테이너의 Linux 의존성을 사용해 해결했다.
- 기존 서비스/운영 schema/고객 메일은 변경하지 않았다. Office 기존 대용량 번들 경고는 남는다.

## 2026-09-18 P2 인증·권한 기반

- jose 6.2.12(MIT)를 직접 의존성으로 고정했다. RS256/JWKS, issuer/audience/exp/iat, namespace 이메일 인증 claim, 정확한 회사 도메인을 검사한다. Auth0 가입/로그인 Action 템플릿과 Native PKCE state/nonce/일회성 callback 검증을 추가했다.
- numbered migration/checksum ledger, 사용자/membership/source/ACL/Runner/폐기/비활성화를 구현했다. 기존 legacy는 소유권을 추정하지 않으며 v1 collection 연결이 없으면 노출되지 않는다. v0에는 기존 운영 경로가 남아 있으므로 v1과 공개 서비스로 함께 운영하지 않는다.
- 타입 검사와 격리 DB 백엔드 59개 통과. 합성 서명 토큰, audience/만료/변조/미인증/유사 도메인, PKCE state/nonce/replay, migration 재실행/변조, 타인 출처/등록 충돌/읽기 grant/폐기/비활성 사용자 차단을 검증했다.
- Auth0 실계정·실메일 인증, 로컬 로그인 화면/세션·refresh rotation·로그아웃·재설정의 전체 연결은 아직 미완료다. 모듈 단위 성공을 P2 전체 완료로 표시하지 않는다.
- 공식 근거: [Auth0 PKCE](https://auth0.com/docs/api/authentication/authorization-code-flow-with-pkce/authorize-with-pkce), [jose JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md).
- `node --import tsx scripts/verify-dpapi.mjs` 통과: Windows DPAPI CurrentUser 왕복, 암호문에 합성 토큰 평문 없음, 사용자 전용 디렉터리 ACL 적용. 다른 Windows 사용자 복호화 거부는 별도 PC/사용자 검증 대기.

## 2026-09-18 P3 큐·Runner·출처별 sync 기반

- 기존 mail_identity/analysis_run/report_version에 v1 메타데이터를 연결했다. 사용자/source/Runner 권한 재검사, 지정 Runner·메일·팀 동시성 제한, claim generation 회전, 120초 lease/30분 상한, 취소·진행 20건·불변 결과 멱등 저장을 구현했다.
- DB 자격 없이 HTTP 클라이언트가 실제 격리 PostgreSQL에 실행 등록→claim→결과 저장→조회했다. 기존 저장소 ID를 새 설치 식별자로 재사용하지 않는다.
- 보호 저장소 인터페이스 기반 Runner/outbox, 앱 단일 인스턴스 잠금, v1 직접 CLI 초안을 추가했다. 완료 응답 유실 후 동일 결과만 재전송하고 중단된 running receipt는 자동 재분석하지 않는다.
- 출처별 sync 등록/claim/heartbeat/배치 시작·저장/중지, 불확실 배치 보존을 추가했다. 100건×32회 및 배치 재전송 시 3,200건만 집계됨을 확인했다. 구 sync의 실패 지연 재시도·UI 재개를 새 로컬 실행 경로까지 통합하는 작업은 남았다.
- `npm run check`, 전체 빌드, 격리 DB 백엔드 64개 통과. 동시 등록/claim, 서로 다른 source의 같은 숫자/Message-ID, 타인 export 거부, generation fencing, cancel/lease 만료/ACL 회수, outbox 재시작 검증 포함.
- 실제 PC 절전·프로세스 트리 종료·두 agent 실행 및 기존 전체 UI의 v1 연결은 미검증/미완료다. P1/P2/P3 전체 완료로 표시하지 않는다.

## 2026-09-18 P4 adapter·공통 스킬 합성 검증

- `probe/prepare/execute/cancel/normalizeEvent/validateResult` adapter, 공통 skill SHA-256 manifest, 자식 프로세스 환경 allowlist, 180초 합성 실행 제한, Windows process-tree 취소를 추가했다. 현재 adapter는 synthetic=true만 허용하며 releaseApproved=false다. DB/API/device 자격은 자식 환경에서 제외한다.
- 설치된 Codex 0.154.0, Claude Code 2.1.276 도움말과 공식 [Codex noninteractive](https://developers.openai.com/codex/noninteractive), [Claude headless](https://code.claude.com/docs/en/headless)를 대조했다. 개인 인증/설정을 수정하거나 중앙으로 복사하지 않았다.
- Claude 실제 합성 실행: 제한된 Read/Glob/Grep/Skill, 빈 MCP 설정, shell/write 도구 제외. 읽기 이벤트, 스킬 표식, 12×3=36 구조화 결과와 원본 파일 보존 검증 통과(강화 재검증 약 18.5초).
- Codex 실제 합성 실행: read-only/approval never/개인 config 제외. 3회 모두 파일을 읽지 못했다는 needs_input, evidence 없음으로 반환하여 검증 실패. 마지막 약 15.1초. 모델 응답만으로 OS 차단 원인이나 스킬 적용을 확정하지 않는다. sandbox를 완화해 통과시키지 않았다.
- 두 agent의 실제 ERP/MCP 도구 조회·쓰기 시도 거부, Windows process-tree 취소, Runner 전체 연결은 미완료다. Claude의 합성 읽기 성공은 이 항목의 대체 증거가 아니다.

## 2026-09-18 P5 서버 후보·복제 DB 리허설

- 별도 history API Dockerfile, DB 비공개 Compose/Caddy, Auth0 SMTP 예시, runtime DML grants, secret-file DB 연결과 운영 runbook 추가. Node 24.21.0 이미지 digest 고정. PostgreSQL/Caddy digest·실제 DNS/운영 설정은 배포 전에 고정해야 한다.
- `docker compose --env-file deploy/server.env.example -f deploy/compose.server.yaml config --quiet` 통과. `mail-triage-history:p5-candidate` 빌드 통과. 네트워크 없는 컨테이너에서 v1 모듈 import와 AI CLI 미포함 확인.
- `node scripts/verify-v1-restore.mjs` 통과. 기존 DB read-only dump를 독립 `triage-v1-restore-67eddc4a` DB에 복원→numbered migration→두 번째 복원. 11개 기존 테이블의 전체 행 내용 hash와 건수 동일. mail_identity 34, analysis/report 각 6, sync 15, related 3, legacy 33/연결 30 보존. 실제 이관/쓰기 전환은 수행하지 않았다.
- 전체 약 9.3초, 두 번째 복원·대조·migration 확인 약 1.9초. 로컬 작은 DB의 실측이며 공용 운영 RTO 보장이 아니다. 자신이 만든 컨테이너와 volume만 정리했고 dump/hash 증거는 Git 제외 `.runtime`에 보존했다.
- VM/DNS/외부 두 환경·TLS·SMTP 실수신·다른 위치 암호화 백업·운영 계정 분리의 실환경 검증은 D1~D4 대기다. runtime 역할 SQL은 작성했고 실제 운영 역할 provisioning은 하지 않았다.

## 2026-09-18 P6 Windows 후보 패키지

- portable Node v24.16.0(공식 SHA-256 대조)/라이선스, local-app·Runner·adapter·UI·공통 스킬, production 의존성만 포함한 `0.2.0-candidate.2.zip` 생성. 3,702개 파일 manifest/hash 검증. DB 드라이버/history-api·개인 자료 제외. ZIP/checksum은 `.runtime/packages`에만 보존했다.
- 비ASCII 경로에 실제 후보 설치 후 포함된 node.exe 버전, 로컬 앱/MCP 모듈 import, 전체 파일 hash 검증 통과. 설정/secret/outbox 보존·업데이트·롤백·진단 실패 시 활성 버전 유지·변조/잠금 거부 합성 테스트 통과.
- 최초 설치 테스트에서 디렉터리 선생성 후 cp의 EEXIST가 발견되어 파일별 독점 복사로 수정했다. 최초 패키지 후보는 로컬 Node LICENSE 부재로 중단했고 공식 버전별 라이선스/checksum을 확인하도록 고쳤다.
- local 모듈의 config와 공통 HttpError를 분리해 로컬 배포물에 DB 설정/연결 모듈이 들어가지 않게 했다. 기본 v0 API 동작은 같은 HttpError 클래스를 유지한다.
- installer 관리 CLI·진단·후보 시작 차단, 비활성 Actions 초안 추가. `releaseApproved=false`이며 실제 팀 배포·자동 바로가기/완전한 제거 UI·개인 CLI/MCP 진단·깨끗한 PC 실인증/분석은 미완료다.

## 2026-09-18 P3 후속 검토: 오프라인 만료 정리

- Runner가 완전히 오프라인이면 다음 claim이 없어 만료 상태가 남을 수 있어 API의 30초 정리기를 추가했다. 만료된 v1 run만 실패/취소로, 만료된 sync만 paused/uncertain으로 바꾼다. 활성 작업 전체 복구나 자동 재분석은 수행하지 않는다.
- 격리 DB 전체 백엔드 66개 통과. lease 만료 후 정리기를 호출해 failed 상태로 전환되는 검사를 추가했다.

## 2026-09-18 P7 준비·P8 보류

- 실제 두 PC·agent별 설치·격리·장애·백업·실메일 관찰을 구분하는 파일럿 실행표와 익명 기록 양식을 추가했다. `check-pilot-record.mjs`는 비어 있는 예시를 readyForHumanReview=false로 판정한다. 이는 계획대로 미착수를 표시하는 결과다.
- v1 계약에서 executorKind=service 입력 거부 검사를 추가했다. P7/D8 결정 없이 공용 실행 계정이나 비용/권한을 만들지 않았다.
- 현장 파일럿, 실제 두 PC, 지정 실메일은 실행하지 않았다. 실메일 분석·고객 원문 수정·운영 서비스 교체·Git push/Release 게시도 수행하지 않았다.

## 2026-09-18 최종 후보 검토

- local facade의 Host/Origin/세션 거부와 no-store를 합성 HTTP로 검증했다. 패키지 생성기가 최초 출력 부모 디렉터리도 생성하도록 보완했다.
- 추가 Host 검사의 첫 실행은 Node fetch에서 Host 재정의가 전달되지 않아 200으로 실패했다. 실제 Host 헤더를 전송하는 node:http로 검증 도구를 수정했으며 실패 기록을 보존한다.
- 최종 타입 검사·전체 빌드 통과. UI 소스 자체는 P1 이동 후 추가 변경하지 않았으며 UI 15개 회귀는 P1 검증 결과다. 이후 전체 백엔드 66개와 local facade 추가 1개를 각각 확인했다.
- 생성된 `0.2.0-candidate.2.zip`과 `p5-candidate` 이미지의 검증 시점은 각 항목과 같다. 이후 lease 정리/no-store 등 후속 소스 수정이 있으므로 최종 Git HEAD와 동일한 배포물이라고 해석하지 않는다. 외부 배포·정식 release 전 새 버전으로 다시 빌드해야 한다.

### 2026-09-18 지속 작업: P1 HTTP 리뷰 반영

- Claude P1 리뷰를 HEAD 9ac10e6과 대조했다. 이전 리뷰의 result 무검증/실제 DB 테스트 부재는 P3에서 해소됐으며, 공통 completionSchema로 HTTP/repository 검증을 통일했다.
- JSON 파싱/용량 초과를 400/413으로 분류하고, 안전한 message/requestId와 no-store를 파서 이전부터 적용했다. 임의 error.status/오류 본문은 노출하지 않는다. 상류 ApiError 401/409 의미는 유지한다.
- local run UUID 검증, 직접 navigate/document 차단, device credential 전달 assertion, 후속 라우트가 최종 404에 가려지지 않는 검사를 추가했다.
- npm run check 성공. node --import tsx --test test/v1-contract.test.ts test/local-app.test.ts: 4/4 통과.
- orca 명령이 현재 PowerShell PATH에서 발견되지 않아 Claude 현재 작업 여부 확인은 못 했다. build-compat 소유권 겹침 가능 범위는 별도 보류했다. 실제 배포나 고객 분석은 수행하지 않았다.

### 2026-09-18 P1 공용 이력 ACL 기능 연결

- SharedHistory에 이력 조회/검색/리뷰/처리 상태/관련 메일/수동 링크/메일별 집계를 연결했다. 권한 확인과 데이터 접근은 동일 트랜잭션 및 v1 ACL lock에서 수행한다. 리뷰 author는 인증 actor로 정한다.
- 매핑된 기존 store의 v0 이력을 읽되 과거 agent/requester는 unknown/null로 유지한다. 다른 source 및 기본 비공개 legacy 건수를 집계하지 않는다. 원본은 중앙에서 조회하지 않으며 링크 입력의 원본 재확인은 후속 local facade 연결 대상이다.
- npm run check 성공. 격리 Docker 백엔드 전체 70/70 통과. 두 사용자 read-only grant/회수/검색/집계/리뷰 멱등성/연결 해제/불변 보고서 포함.
- legacy collection 공유/지식 제안 ACL 및 전체 local UI 연결은 계속 구현한다. 기존 운영 서비스 미교체.

### 2026-09-18 P1 legacy collection 및 지식 제안 ACL

- 004 migration은 collection별 명시적 read/write grant만 추가한다. 기존 문서는 자동 귀속하지 않는다. 새 import는 불변 hash 확인 후 해당 collection에 연결하며 기존 미분류/타 collection 문서를 재import로 획득하지 못한다.
- collection 목록/본문/검색/메일 연결/메일별 legacy 목록과 집계가 collection 및 source 권한을 각각 확인한다. grant 회수 즉시 차단한다.
- 지식 제안은 인증된 source 쓰기 사용자만 생성, 읽기 사용자만 조회한다. 원본 보고서 hash 및 제안 멱등성을 유지하고 owner credential을 반환하지 않는다. ERP 파일 쓰기 실행 경로는 제공하지 않는다.
- check 성공, 격리 백엔드 전체 71/71 통과. 실데이터 자동 매핑/이관/운영 migration 없음.

### 2026-09-18 P2 로컬 Native 세션 경계

- PKCE 결과는 /me로 사용자 확인 후 보호 저장에 성공해야 세션으로 공개한다. 브라우저에는 access/refresh/device 토큰을 반환하지 않고 HttpOnly SameSite cookie와 별도 CSRF 값을 사용한다.
- 동시 refresh는 직렬화하고 교체 전 intent를 저장한다. 응답 유실/재시작 시 과거 rotating token을 자동 재사용하지 않는다. logout은 로컬 저장을 먼저 비우고 제공자 revoke를 시도한다. 로그인 도중 logout은 epoch로 새 세션 발행을 차단한다.
- Host/Origin 검증, PKCE callback 전용 Lax 일회용 cookie, cookie/CSRF rotation, 안전한 오류를 구현했다. 앱 main/UI 연결은 다음 작업이다.
- npm run check 성공, local-session + v1-auth 합성 5/5 통과. 실제 Auth0 발급·refresh·메일 가입 검증은 D1/D3 대기.

### 2026-09-18 P1/P2 local-app와 React 통합

- main은 DB 없는 HistoryClient+NativeLogin+LocalSession+LocalProfile로 기동한다. 브라우저에는 장치/AI/OIDC 토큰을 보내지 않는다. 설정에 실제 Auth0/API 값이 있어야 실행 가능하며 기본 v0 서비스는 유지했다.
- React의 Native 로그인/로그아웃, source·collection·장치 선택/등록/공유/폐기와 사용자별 답변 초안을 연결했다. 기존 v0 모드는 서버가 Native 표식을 주지 않으면 그대로 사용한다.
- local facade는 메일/첨부를 명시적으로 바인딩된 MCP에서만 조회하며 분석/연결 직전 Message-ID·fetchedAt을 재확인한다. 원본 없는 경우 공유 보고서는 계속 조회하고 원본 조회만 제한한다.
- check/build 성공. 격리 backend 75/75, 기존 Playwright UI 회귀 15/15 통과. 실제 Chrome Native 합성에서 로그인/출처 선택/원본 없는 이력/사용자 A→B 초안 격리/로그아웃 통과. 외부 Auth0와 실제 메일은 사용하지 않았다.
- PowerShell→Python 파이프의 비ASCII 손상은 커밋 전 확인하고 apply_patch로 수정했으며 빌드와 실제 UI를 다시 확인했다.
- 지속 Runner/sync loop는 아직 연결 전이며 status는 등록만으로 online을 표시하지 않는다. 팀 배포 승인 후보로 승격하지 않았다.

### 2026-09-18 P3 지속 실행·sync 및 명시적 복구

- 직렬 polling Scheduler와 로컬 Runtime을 연결했다. 설정 변경/로그아웃/정상 종료는 진행 중 작업에 중지 신호를 전달한다. 중단 receipt는 자동 재실행하지 않으며 미전송 결과와 복구 동작을 설정 화면에서 구분한다.
- 만료 result는 동일 장치·이전 lease/generation·현재 ACL 및 원본 재확인을 확인한 뒤 새 불변 이력으로 복구한다. 재전송 requestId는 유지하며 과거 보고서를 덮어쓰지 않는다.
- sync는 지정 Runner가 HTTP로 claim 후 순차 100개 batch를 수행한다. 확정된 transient 응답만 5/15/30초 최대 3회 지연 재시도한다. 응답 유실은 outbox 재전송, MCP 응답 불확실은 자동 재수집 금지다. 시작/중지/복구 UI가 있다.
- 백엔드 80/80 통과: 실제 HTTP SyncRunner 3,200건, source 동시 실행 차단, bounded retry, 결과 복구, 중지 신호, 응답 유실 포함. check/build 및 Native Chrome 합성 재확인 성공.
- 일반 agent adapter는 아직 synthetic-only이므로 분석 Runtime start를 차단한다. 실제 PC 강제 종료·agent 프로세스 트리 검사와 직접 CLI 연결은 후속 작업이다. 실메일 sync/분석·운영 배포 없음.
- Claude 후속 리뷰 초안은 .runtime/continuation/review-p2-brief.md에 보존. dry-run이 spawn orca ENOENT로 실패해 새 요청을 전송하지 않았다.

### 2026-09-18 P3 직접 CLI 연결

- history-v1 CLI는 OIDC token을 직접 읽지 않고 DPAPI 로컬 제어 자격으로 실행 중 앱을 호출한다. refresh rotation 소유자는 앱 하나다. localhost Host와 브라우저 Origin/CSRF 경계는 유지하며 CLI capability는 브라우저에 반환하지 않는다.
- get/progress/export/begin/cancel/review/handling, 설정 조회·변경, Runner 실행·중지, 결과 복구와 sync 명령 연결. 실제 agent 실행 gate는 동일하게 유지한다.
- 처음 합성 검사는 Node fetch가 자동 부착하는 Sec-Fetch-Mode: cors로 401을 반환하여 실패했다. Origin/Fetch-Site 없는 인증된 Node 호출의 cors만 허용하고 브라우저 Origin과 잘못된 토큰 차단을 다시 검증했다.
- check 성공, local-cli/local-session 5/5 통과. 실제 개인 세션/실메일 명령은 실행하지 않았다.

### 2026-09-18 P1 빌드 호환 회귀 수정

- 동일 orca 명령이 승인된 접근에서는 실행됨을 확인했다. 기본 샌드박스의 ENOENT만으로 설치 부재를 판단하지 않는다. 기존 Claude terminal read에서 P1 리뷰 완료/대기 및 미제출 draft를 확인했고 실제 build-compat 구현은 시작되지 않았다.
- build-compat에 schema/db/history/archive/sync의 기존 dist 경로를 복구하고 모든 shim을 export *로 생성해 server.createApp을 재노출한다.
- node scripts/build-compat.mjs 및 verify-build-compat.mjs 성공. NODE_ENV=test에서 모듈 exports와 실제 HTTP root를 검증했으며 DB/MCP/운영 복구 명령은 실행하지 않았다.
- 사용자 draft를 보존한 새 Claude 터미널에 70385c1 snapshot 읽기 전용 P1/P2 리뷰를 전달했다. f7a4fdb0-18ed-44f5-966f-ecef831949d1은 accepted이며 리뷰 완료는 별도 확인 대상이다.
# 2026-09-18 P4 읽기 전용 증거 broker

- Codex 0.154.0 / Claude 2.1.276 각각 실제 CLI로 지정 스킬·합성 메일·fixture를 MCP로 조회하고 공통 결과의 합계 36 및 스킬 marker를 확인했다. 실제 고객 메일/ERP 접근 없음.
- broker HTTP 합성 검사: 브라우저 Origin/무인증 차단, 쓰기 도구 부재, 임의 SQL·경로 이탈·비밀 파일·다른 root 거부. 결과의 verified reference는 실제 성공한 도구 기록과 대조한다. CLI에는 수명 한정 broker capability만 전달한다.
- Codex shell 경로는 Windows sandbox setup marker/1223로 실패했다. read-only sandbox를 유지하고 shell/unified_exec를 끈 MCP 경로가 성공한 것이며, OS sandbox 쓰기 거부나 실제 ERP DB 계정 권한을 검증한 것은 아니다. Claude는 strict MCP와 도구 allowlist를 사용한다.
- `npm.cmd run check`, `node --import tsx --test test/evidence.test.ts` 통과. 일반 Runner 연결 및 프로세스 취소 검증은 후속 작업이다.
# 2026-09-18 교차 리뷰 C-1 로컬 진입 권한 수정

- Claude 고정 스냅샷 리뷰 결과의 completion/bytes/SHA-256을 확인했다. 인증 없는 loopback `/api/session` 호출이 cookie/CSRF를 받던 결함을 재현 테스트로 차단했다.
- DPAPI cli-control을 가진 실행기만 60초 일회용 browser-ticket을 발급한다. 사용/오류 ticket과 잘못된 cookie로 세션을 받을 수 없다. `node scripts/history-v1.mjs open`은 ticket을 콘솔에 출력하지 않고 브라우저로 전달한다.
- 로그아웃 후 회사 세션과 이전 cookie/CSRF는 폐기하고 같은 브라우저의 로컬 진입 권한만 회전한다. 답변 초안 Map/sessionStorage도 정리한다. callback 교환 실패는 로그인 화면으로 돌린다.
- check/UI build, local session+CLI 5개, 실제 Chrome Native 합성 로그인·출처 선택·원본 없는 공유 조회·로그아웃 통과. 다른 Windows 사용자 현장 검증은 미실행.
# 2026-09-18 교차 리뷰 후속 C-2~C-8

- v1 API/로컬 facade export는 리뷰를 포함한 실제 본문 hash를 헤더에 넣는다. 작성자 저장 ID는 유지하고 조회/화면/export는 이메일 표시를 제공한다. 과거 이름형 리뷰는 유지한다.
- 읽기 이력·collection 조회는 공유 advisory lock을 사용하고 ACL 변경은 같은 key의 배타 lock을 유지한다. 두 동시 reader와 writer 차단/해제 검사를 추가했다. collection 소유자 membership 비활성 상태는 조회에서 제외하고 복수 활성 membership은 임의 선택하지 않고 거부한다.
- non-rotating refresh는 명시 설정에서만 지원한다. 기본 rotating 정책 및 불확실 응답 시 재로그인은 유지한다. logout 초안 제거는 앞선 C-1 커밋에 포함됐다.
- 실제 Auth0/팀 부하/다른 Windows 사용자 검증은 별도 대기다.
# 2026-09-18 P4 Runner 연결과 Windows 취소

- LocalExecutor를 설정된 개인 CLI에 연결했다. 메일 identity를 AI 시작 전/도구 호출마다 다시 확인하고 승인된 코드 root만 제공한다. 일반 결과도 broker 관찰과 대조한 뒤 기존 Runner의 DPAPI outbox로 넘어간다.
- agent 설정이 없으면 분석 실행은 계속 비활성이다. main에는 DB query provider를 기본 제공하지 않으며 실제 ERP DB 읽기 계정/사전 정의 query 구성은 D5 확인 대상이다. 근거가 부족한 실행은 needs_input을 반환해야 한다.
- `scripts/verify-agent-cancel.mjs`에서 직접 만든 Windows Node 부모/자식 프로세스를 중단하고 둘 모두 종료됨을 확인했다. 실제 PC 전원 종료 검증과 구분한다. identity 변경 시 AI 미기동/매번 재확인/임시 디렉터리 제거 테스트와 check 통과.
# 2026-09-18 P5 명시적 매핑과 DML 권한

- 운영자 전용 `map-v1-legacy.mjs`의 preview/hash/apply를 구현했다. 초기 비공개 source와 collection에 명시한 store/document ID만 연결하며, 원래 메일/run/report/리뷰/관계/처리 상태는 수정하지 않는다. 중간 데이터 변경·타 출처 귀속·공유된 대상·활성 writer가 있으면 거부한다.
- 격리 합성 DB에서 미리보기 후 변경 시 거부, 명시 매핑 적용 및 역사 데이터 hash 보존, 미연결 문서 유지 검증을 통과했다. 실제 이력의 소유자를 임의로 정하거나 실제 전환을 수행하지 않았다.
- 임시 NOLOGIN runtime 역할에 배포 GRANT를 적용해 DML 성공/DDL·ledger 변경 거부를 확인했다. 실제 배포 계정 적용과 외부 백업/TLS는 대기다.
- check 및 전체 backend88/88 통과. 첫 병렬 실행은 Docker scandir ENOMEM으로 실패했고 재실행 성공했다. 이후 검사 안정성을 위해 파일 동시성4와 최신 package.json read-only mount를 명시했다.
# 2026-09-18 P6 설치 수명주기

- 실행/일회용 브라우저 열기/DPAPI 정상 중지/명시적 오래된 lock 복구/바로가기와 기본 보존 제거·확인 후 완전 제거를 구현했다. 개인 AI 설치/계정은 건드리지 않는다.
- 후보3 실행은 기존 v0의 3080 점유를 정확히 거부했다. 기존 서비스를 중지하지 않고 `localPort`와 정확한 PKCE callback 결합을 구현했다. 기본3080 유지, 외부/비정상 callback 거부 회귀 포함.
- 후보4(3,717파일) 실제 설치를 별도 한글 경로+빈 loopback 포트에서 수행했다. 미승인 일반 실행 차단, packaged main 시작, 무인증401·일회용 진입, .lnk 생성, 정상 중지 후 lock 제거, 앱 제거 후 설정 보존 통과. 실인증/메일/ERP 연결 없음.
- check/build 및 전체 backend90/90 통과. 최신 package.json mount의 concurrency4 적용 확인. 최신 진단 추가분은 최종 후보를 다시 빌드할 때 포함한다.
# 2026-09-18 P2 기존 원본 연결 복구

- 설정 화면에 원본 저장소 대조/확인/복구를 추가했다. 접근 가능한 기존 이력 최대10개의 mail ID·Message-ID·제목을 대조하고, 같은 저장소/복원본이라는 사용자의 명시 확인 후에만 해당 source instance를 로컬 DPAPI에 연결한다. 적용 직전 다시 대조하고 5분 ticket을 소모한다. 이전 binding은 DPAPI 보관한다.
- 일치 표본이 없거나 달라지면 거부하며 표본 일치를 전체 저장소 동일성 증명으로 표시하지 않는다. upstream MCP가 동일 endpoint에서 바뀐 저장소의 안정적 instance ID를 제공하는지는 D5 현장 확인이 필요하다. 중앙 이력/source/store ID는 변경하지 않는다.
- MCP 주소 변경 시 원본 없는 이력/설정 화면은 계속 열 수 있다. 명시적 새 출처 등록은 새 로컬 instance를 만들어 옛 이력과 자동 병합하지 않는다.
- check 및 합성 재연결 테스트(확인 없음/대조 불일치/적용/재사용 거부) 통과.
# 2026-09-18 Windows DPAPI 반복 저장 회귀

- 실제 Runner 종단 검사에서 두 번째 receipt 저장 시 fresh descriptor를 사용한 PowerShell Set-Acl이 `SeSecurityPrivilege`를 요구해 실패했다. 기존 첫 저장만 검사한 결과로는 발견하지 못했던 회귀다.
- Directory.GetAccessControl(Access)/SetAccessControl로 DACL만 변경한다. 상속을 차단하고 현재 사용자 FullControl만 유지하며 SACL/소유자 권한을 요구하지 않는다. 보호 강도를 낮추지 않았다.
- 같은 폴더에서 DPAPI write/read 3회 성공 후 두 CLI의 실제 Runner 종단이 성공했다. 시스템 관리자 권한을 추가하거나 다른 Windows 사용자에게 권한을 부여하지 않았다. [Microsoft Directory.SetAccessControl](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.setaccesscontrol?view=netframework-4.8.1)의 변경된 접근 제어 영역만 반영하는 동작을 따른다.
# 2026-09-18 실제 개인 CLI → Runner → HTTP API → DB 합성 종단

- `verify-agent-e2e.mjs`가 전용 일시 컨테이너·무작위 DB schema·합성 bearer·합성 메일/fixture만 사용했다. Windows DPAPI receipt를 쓰는 실제 Runner와 LocalExecutor에서 Codex/Claude 개인 CLI를 각각 실행하고 공용 API에서 완료 결과/합계36/실제 읽기 evidence/진행 범주를 조회했다.
- Codex0.154.0: 34,442ms, Claude2.1.276: 42,012ms. 두 결과 모두 completed. 실메일·ERP DB·실Auth0 실행은 아니다. 종료 시 전용 schema와 컨테이너를 정리했다.
- 추가 답변 실행은 parent가 같은 source/mail identity인지 확인한 후 기존 보고서와 사용자 답변을 `read_context`로 제공한다. 과거 분석을 새 ERP 증거로 표현하지 않도록 구분했다.
- 최신 원본 DB 복제 리허설 `triage-v1-restore-33f4ef3b`: 기존11테이블의 건수/hash가 migration 후와 재복원 후 일치, 총9,494ms/재복원 검증2,028ms. 실제 source/collection 귀속 변경 및 서비스 전환 없음.
# 2026-09-18 P456 교차 리뷰 H1/L2/L3

- 완료 파일 ID3479b686·25,834bytes·SHA256 a2bcc12f70d2883ee2d3bda124be19c0846fcb210a22d0a20f2f5502bf9f699b를 확인했다. 고정82d91ab의 리뷰이며 이후 커밋과 대조해 반영한다.
- 기본 증거 확장자에서 json/yaml/yml/properties를 제외했다. 예외는 root별 정확한 파일명에만 허용하고 설정 파일명/민감 키 할당/실제 경로/링크 검사를 추가했다. appsettings·application·context·평문 credential 코드·안쪽 alias 우회를 거부하는 회귀 검사 통과.
- evidenceRoots는 절대 실디렉터리만 허용하고 home 또는 설치 데이터와 겹치는 경로를 거부한다. agent scratch와 DPAPI work를 분리했다. 검사로 임의 비밀을 모두 식별한다고 주장하지 않으며 운영자는 비밀 없는 root를 승인해야 한다.
# 2026-09-18 교차 리뷰 H2/H3/H4/H7/H8 및 L1/L8

- SyncRunner archive에도 배타 실행을 적용하고, 명시적 재시작은 해당 recovery loop만 중지/재개한다. 동기화는 분석 복구 때문에 함께 중지하지 않는다. outbox 일시 저장 실패 뒤 결과가 있으면 원격 run을 실패 확정하지 않는다.
- mapping은 queued sync도 정지 조건으로 검사한다. 감사/보고서/리뷰/legacy 원문은 runtime role에서 SELECT/INSERT만 허용하고 기존 UPDATE/DELETE 권한을 회수한다. 상태 테이블 DELETE도 제외했다.
- sync가 일부 저장/실패 수량을 반환했다면 자동 재시도하지 않는다. 개별 mail receipt 없이 같은 실패 수량을 중복 집계하는 것을 방지한다. 처리 건수가 없는 명확한 transient 응답만 제한 재시도한다.
- 직접 CLI는 안전한 고정 오류 코드와 사용법을 표시한다. callback URI는 userinfo나 정규화 전 우회 경로 없이 정확한 loopback 문자열만 허용한다.
# 2026-09-18 교차 리뷰 H5/L6: 종료 실패와 로컬 listener 검증

- 종료 시 Worker·HTTP 중지와 자격 정리·lock 해제를 독립적으로 시도한다. 자격 정리 실패만으로 종료된 앱의 lock을 남기지 않는다. Worker나 서버가 중지되지 않았다면 lock을 보존하며 고정 오류 코드로 표시한다. 비동기 종료 rejection을 처리한다.
- cli-control에 PID를 저장하고 제어 토큰을 보내기 전에 무작위 challenge의 HMAC으로 listener를 확인한다. 이전 포트를 다른 프로세스가 점유해도 capability를 보내지 않는 합성 검사를 추가했다. 실제 브라우저 ticket/CSRF 경계는 유지한다.
- 로컬 CLI/session 8개 검사 통과. DPAPI timeout/임의 프로세스에 토큰 전달을 실제 고객 환경에서 유발하지 않았다.
# 2026-09-18 교차 리뷰 H6 및 L4/L5

- 설치는 고유 staging에 복사·hash·진단을 마친 뒤 원자 rename으로 공개한다. 복사 중 실패·diagnostics 실패 뒤 같은 버전 재시도, hard-exit 잔여 staging이 있을 때 재설치, 이전 불완전 비활성 버전의 정확한 경로 확인 후 제거 검사가 통과했다. 개인 상태와 활성·직전 버전 보호를 유지한다.
- Codex `windows.sandbox="elevated"`는 Windows sandbox 구현 선택이다. 별도의 `--sandbox read-only`와 `approval_policy="never"`를 유지하며 실제 evidence 경로에서는 shell/unified_exec를 끈다. 관리자가 sandbox 설정을 완료했다거나 OS 파일 쓰기 거부를 검증했다고 주장하지 않는다. [공식 Windows sandbox 설명](https://learn.chatgpt.com/docs/windows/windows-sandbox)을 따른다.
- manifest 파일 hash는 전송/파일 집합 검증이다. manifest 자체를 신뢰하는 사용자 배포 경로·코드 서명은 D6 결정/실검증 대상으로 남긴다.

# 2026-09-18 최종 로컬 검증 및 후보6

- 최종 결과는 [로컬 완료 기록](archive/local-completion-2026-09-18.md)에 모았다. check/build/compat, backend98/98, 기존 UI15/15와 Native Chrome 합성, 최신 파일 정책의 실제 두 CLI→Runner→API→DB 저장 종단을 통과했다. 최종 종단 소요는 Codex30,548ms/Claude55,937ms다.
- 후보5 실제 한글 설치에서 DPAPI ACL helper의 console code page 문제가 드러났다. 경로를 ASCII base64로 전달하고 UTF8로 복원해 해결했다. 한글 폴더 반복write/read3회·현재user-only DACL·평문부재와 후보6 실제 설치/기동/진입/바로가기/정상중지/설정보존 제거가 통과했다. 이는 같은 개발 PC 검증이며 깨끗한 팀 PC 검사와 구분한다.
- 후보6 3,719파일/Nodev24.16.0/contract1, releaseApproved=false 유지. ZIP hash `8e5c45c9439af96cb7d3e2b53a463541ae73796ec1783efdd32755ce88fa7222`. 기존 v0 API/DB healthy·Worker running과 3080 유지 확인. Git push·Release 게시·운영 이관 없음.
- 실제 Auth0/회사 메일·호스트/TLS·외부 암호화 백업·ERP 읽기 계정/provider·OS 쓰기 거부·두 PC 파일럿은 D1~D7 입력/현장 검증 대기. P8은 P7/D8 이후다. 이 한계를 완료로 바꾸지 않았다.

# 2026-09-21 보완 1: v1 스레드 검색

- v1 `/api/mails?view=threads`에도 전체 검색 캐시(15초/8개/16MiB)와 동시 요청 합치기를 연결했다. 사용자·source·MCP instance/endpoint를 구분하며 캐시 hit에도 source 접근 권한, sync 상태, 수동 연결과 분석 상태를 새로 확인한다. 명시적 refresh와 sync revision 변경은 원본 재조회, 실패한 검색은 캐시하지 않는다.
- 실제 SDK를 사용한 loopback 합성 MCP와 HTTP facade 검사: 205개/3개 원본 페이지를 첫 조회에서 읽고 다음 페이지는 추가 조회 0회, 동시 페이지 요청도 scan 1회. 실제 MCP initialize는 scan당 1회다. 새 계정·source·instance, sync batch 변경, refresh, 권한 회수와 실패 후 재시도를 검사했다.
- `node --import tsx --test test/local-thread-cache.test.ts test/source-client.test.ts test/local-profile.test.ts test/local-ui.test.ts test/thread-cache.test.ts test/mail-threads.test.ts`: 15/15 통과. 기존 cache 검사에서 TTL·크기 상한·늦은 응답·필터/연결 정확성도 확인했다. `npm.cmd run check` 통과.
- 실메일·ERP·운영 DB를 사용하지 않았다. 기존 v0 서비스 교체나 candidate.6 패키지 재생성은 수행하지 않았다.

# 2026-09-21 보완 2: Runner heartbeat 복구와 실패 사유

- heartbeat의 네트워크 오류·요청 timeout·HTTP 408/429/500/502/503/504는 5·15·30초로 제한 재시도한다. 성공하면 재시도 횟수를 초기화하고, 실패 응답은 마지막 확인 lease를 연장하지 않는다. 독립 deadline은 lease 1초 전에 실행을 중지한다. 권한 거절·lease 충돌·명시 취소는 즉시 중지한다.
- 완료/중지 시 타이머와 진행 중 heartbeat HTTP를 함께 정리한다. 늦게 도착한 응답은 타이머를 다시 등록하지 않는다. 진행 이벤트 응답의 일시 유실은 분석을 중단하지 않으며, 멱등 키가 없는 이벤트를 재전송하지 않는다. 이벤트 전송의 권한 오류는 즉시 중지한다.
- 보호된 receipt와 `/fail`에 `NETWORK_ERROR`, `AUTH_REJECTED`, `LEASE_EXPIRED`, `APP_STOPPED`를 구분하고 기존 `CANCELLED`, `TIMEOUT`, `SOURCE_CHANGED`, `AGENT_FAILED`를 유지했다. 사용자 취소만 cancelled, 다른 사유는 failed로 저장한다. 기한이 지났거나 권한이 회수돼 서버가 저장을 거절하면 receipt를 보존하고 기존 서버 만료 처리에 맡긴다.
- 가상 시계로 5/15/30초 재시도, 기한 내 중지, 성공 후 backoff 초기화, pending HTTP 중지, 종료 후 늦은 응답, 권한 거절과 취소를 검사했다. Runner 통합에서 heartbeat 1회/진행 이벤트 유실에도 agent 실행 1회·결과 저장 1회를 확인했다.
- `node scripts/test-backend.mjs`: PostgreSQL 임시 스키마를 사용하는 전체 백엔드 110/110 통과. 이후 실행 TypeError를 통신 오류와 구분하는 보완을 포함해 `node --import tsx --test test/runner-heartbeat.test.ts test/runner.test.ts test/v1-contract.test.ts` 17/17 및 `npm.cmd run check` 통과. 실제 AI·메일 동기화·ERP 조회는 실행하지 않았다.

# 2026-09-21 보완 3: 오류 요청 추적 및 최종 회귀

- v1 공용 API와 로컬 앱의 공통 `requestContext`/`jsonError`에서 오류 요청당 stderr JSON 한 줄을 기록한다. 응답의 `requestId`/`X-Request-ID`와 같은 서버 생성 UUID를 쓰며, 요청 메서드·등록 경로 템플릿·상태·고정 오류 코드/종류·처리 시간·응답 완료 여부를 포함한다. 공용 API의 오류를 로컬 앱이 전달할 때 검증된 `upstreamRequestId`로 두 로그를 연결한다.
- 요청 본문·토큰·cookie·query/실제 경로 매개변수·오류 message/stack·SQL/DB detail은 기록하지 않는다. 알려진 코드 목록에 없는 upstream 오류 코드는 로그에서 `REQUEST_FAILED`로 대체한다. DB 오류는 허용된 SQLSTATE만 기록한다. parser/auth 이전 오류는 등록 경로를 알 수 없어 `<unmatched>`로 표시한다.
- 부분 응답 후 오류는 연결을 종료하고 안전한 로그 한 줄만 남긴다. 원시 오류를 Express 기본 stack logger로 넘기지 않는다. sink가 예외를 던져도 HTTP 응답이 변하지 않는다.
- HTTP 로그 신규 검사 5개, 기존 계약·local-app·session과 함께 13/13 통과. 합성 비밀을 header/body/query/URL/오류 name/message/stack/DB detail에 주입해 로그에서 제외됨을 확인했다. 로컬→공용 API 요청 ID 연결과 완료/close 중복 방지를 확인했다.
- 최종 `node scripts/test-backend.mjs` **116/116**, `npm.cmd run check`, `npm.cmd run build`, `node scripts/verify-build-compat.mjs` 통과. 실제 Chrome에서 `node scripts/verify-react-suite.mjs query-cache native-ui` **2/2** 통과: Query 캐시/무효화와 Native 로그인·출처 선택·원본 없는 공용 이력·계정 간 초안 격리·로그아웃을 검사했다. Auth0와 메일은 합성 fixture다.
- 로컬 상세 로그: `.runtime/20260921-backend.log`, `.runtime/20260921-build.log`, `.runtime/20260921-browser.log`. 실행 중 v0 서비스, 기존 DB/Worker, 개인 AI 설정을 교체하지 않았고 배포 ZIP/Release/실서비스 배포는 이번 수정에 포함하지 않았다.

# 2026-09-21 관련 메일 본문 서식 통일

- 원인: 메일함은 `/mails/:id/body`의 HTML을 안전한 본문 renderer로 표시하지만, 관련 메일 연결 전/후 미리보기는 `mail.body` 텍스트만 `<pre>`에 넣어 표시했다. upstream 텍스트에서 문단 구분이 소실된 HTML 메일은 한 줄로 이어져 보일 수 있었다.
- `MailContent`를 공통화하고 관련 메일의 기존 식별 검사를 통과한 뒤 HTML을 조회한다. 문단·줄바꿈·표·CID 이미지가 메일함과 같은 방식으로 표시된다. HTML 조회 실패 시 전체 텍스트의 줄바꿈을 유지하고 안내한다. 외부 이미지·스크립트·위험 링크 차단은 기존 renderer를 그대로 사용한다. 관련 본문의 중첩 세로 스크롤을 제거하고 보고서 대화상자 안에서 읽도록 정리했다.
- `npm.cmd run check`, `npm.cmd run build:ui` 통과. `node scripts/verify-react-suite.mjs related-mails image-preview mail-scroll history-ui`: Chrome **4/4** 통과. 합성 메일의 연결 전/후 본문 DOM이 메일함 본문과 동일함, 문단 높이·표·br·CID 이미지·모바일 폭·텍스트 fallback을 확인했다. 원본 조회 실패 시 HTML 후속 조회 없음, 닫힌 미리보기의 늦은 HTML 응답 무시, 연결/해제·처리 취소·중복 방지·이미지/스크롤/이력 회귀도 확인했다.
- 합성 모바일 화면 `.runtime/related-mails-html-mobile.png`를 육안 확인했다. 외부 이미지 요청 0, pageerror 0, 분석/동기화 실행 0. 상세 로그는 `.runtime/20260921-related-ui.log`, `.runtime/react-validation/react/related-mails.log`에 로컬 보존한다.
- 기존 로컬 서비스에 적용: 진행 중 분석/동기화 0건을 확인하고 `docker compose build api`, `docker compose up -d --no-build --no-deps --wait api` 실행. API healthy, 배포된 HTML/JS/CSS와 검증 빌드의 SHA-256 일치, 분석 이력 7건의 보고서/리뷰/처리 상태/관련 메일 및 이전 문서 33건·수동 스레드 연결의 전후 hash 일치를 확인했다. DB/Worker 컨테이너 ID 유지, Worker online, 실제 브라우저 메일/보고서 읽기·모바일 폭·pageerror 0 확인. 로그인 외 변경 요청 없이 검증했다. 전후 증거는 `.runtime/related-body-deployment-20260921/`에 보존한다. 이는 기존 로컬 v0 API 화면 반영이며 팀용 v1 실서비스 배포나 Windows 후보 ZIP 갱신은 아니다.

# 2026-09-21 검색 입력과 배치 마무리

- 기존 미커밋 변경 2개 파일을 검토했다. 검색어/발신자 Enter는 폼 제출로 연결하고 `isComposing` 또는 keyCode 229인 조합 이벤트는 검색하지 않는다. 검색 버튼의 submit 타입을 명시했다. 데스크톱 입력 폭을 280/220px로 제한하고 모바일 규칙을 유지했다.
- `npm.cmd run check`, `npm.cmd run build:ui` 통과. `node scripts/verify-react-suite.mjs pre-p1-ux query-cache native-ui` Chrome 3/3 통과.
- Git 제외 `.runtime/verify-search-entry.mjs`로 검색어·발신자 Enter 후 API 조건, 조합 이벤트 동안 추가 검색 0회, 조합 완료 후 검색, 실제 입력 폭 280/220px, 390px 화면 가로 넘침 없음, pageerror 0 확인. 초기 검증 스크립트의 발신자 파라미터명을 `from`에서 실제 API 계약 `from_address`로 정정한 뒤 통과했다. 합성 데스크톱/모바일 스크린샷을 육안 확인했다.
- 증거: `.runtime/search-entry-result.json`, `.runtime/search-entry-desktop.png`, `.runtime/search-entry-mobile.png`, `.runtime/react-validation/react/` 로그. 실제 OS IME 수동 입력 검증과는 구분한다. 기존 실행 중 Docker 서비스·DB·Worker 및 Windows 후보 ZIP은 변경하지 않았다.

# 2026-09-21 실제 이메일 인증 연결 준비

- `docs/auth0-setup.md`에 D1/D3 입력 양식, Native/PKCE·callback·API audience·Action·메일 발송 설정 대응, 최초 관리자 subject 지정 시점, 실검증 시나리오를 작성했다. Auth0 공식 문서와 현재 코드를 대조했다. `deploy/auth0/local-settings.example.json`은 기존 v0와 분리한 43180 포트·실값 없는 예시다.
- 실제 Action 파일을 불러와 정확한 회사 도메인만 가입 허용, 미인증/외부 도메인/누락 설정 차단, 허용된 Action claim을 서명해 API verifier까지 연결하는 합성 검사 2개를 추가했다. `node --import tsx --test test/v1-auth.test.ts test/local-session.test.ts` 9/9 및 `npm.cmd run check` 통과.
- 앞선 검색 작업에서 Native 브라우저 합성 로그인·출처 선택·초안 격리·로그아웃 회귀도 통과했다. 이는 실제 Auth0 검증이 아니다. 회사 도메인·최초 관리자·팀·Auth0 테넌트·발송 서비스 입력을 요청한 상태이며 계정 생성, 인증메일 발송, 실로그인, 기존 서비스의 v1 전환은 수행하지 않았다.
- 최초 관리자는 새 membership을 만들기 전에 `ADMIN_SUBJECT`를 지정해야 한다. 기존 analyst를 환경변수 변경만으로 승격하지 않는다. 현재 인증메일 재발송은 Auth0 관리자 절차이며 앱 내 셀프서비스는 미구현이다. 실메일 수신·재발송·만료·재설정·실토큰 갱신은 입력 후 별도 검증한다.
