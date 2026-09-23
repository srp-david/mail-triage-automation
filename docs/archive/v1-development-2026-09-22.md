# v1 개발 실행 경계

> 2026-09-21: Supabase PoC의 사용자명 인증·관리자·Edge·로컬 Runner를 원본에 통합했다. 최신 실행/배포 절차는 [Supabase 배포 안내](../operations/supabase.md), 단계는 [통합 계획 v3.1](../implementation-plan.md)을 따른다. 아래는 이전 Auth0 개발 기록이다. 인증 환경 변수와 PKCE 실행법을 새 배포에 적용하지 않는다. 기본 v0 서비스는 그대로 보존한다.


현재 기본 `npm start`와 Docker 서비스는 기존 단일 사용자 v0 앱이다. v1 local-app은 Native 세션과 React UI를 연결한 별도 개발 경로다. 공용 서버에는 v0를 노출하지 않는다.

- 빌드: `npm run build`
- 별도 개발 DB에만 migration: `node dist/apps/history-api/src/main.js --migrate`
- v1 API: `node dist/apps/history-api/src/main.js`
- 격리 회귀: `node scripts/test-backend.mjs` (Docker 접근 권한 필요)
- 보호 저장 검사: `node --import tsx scripts/verify-dpapi.mjs` (Windows)
- 로컬 앱: `TRIAGE_LOCAL_HOME` 지정 후 `node dist/apps/local-app/src/main.js` (Windows, 127.0.0.1:3080)
- Native UI 합성 검증: `node --import tsx scripts/verify-native-ui.mjs` (실 Auth0 대신 합성 세션)
- 직접 CLI: `node scripts/history-v1.mjs sources`, `get RUN_UUID`, `begin - INPUT_JSON`, `cancel RUN_UUID`

API에는 DATABASE_URL, AUTH_ISSUER(끝 `/` 포함), AUTH_AUDIENCE, AUTH_NAMESPACE, COMPANY_DOMAINS(정확한 도메인), TEAM_ID가 필요하다. 운영자가 migration 뒤 팀을 명시적으로 생성해야 한다. 최초 관리자는 ADMIN_SUBJECT로 지정하며 첫 가입자를 관리자로 승격하지 않는다. runtime DB 계정은 DML만, migration 계정은 별도로 둔다. v1 기본 bind는 127.0.0.1:3081이다.

CLI는 `TRIAGE_LOCAL_HOME` 아래 DPAPI `cli-control`로 실행 중인 로컬 앱에 연결한다. OIDC token/refresh는 앱 한 프로세스가 소유하므로 CLI와 rotation이 경쟁하지 않는다. 먼저 로컬 앱을 실행하고 회사 계정으로 로그인한다. 토큰을 command line, Git, UI 저장소에 넣지 않는다.

로컬 앱의 `<TRIAGE_LOCAL_HOME>/config/settings.json`에는 `historyUrl`, `auth: {issuer, clientId, audience}`, 선택적 `mailMcpUrl`을 설정한다. 실제 회사 설정은 D1/D3 확인 후 넣는다. 비밀을 이 파일에 넣지 않는다.

설정 화면에서 source/collection 선택, 현재 MCP 출처 등록, 실행 장치 등록·폐기, 사용자별 공유 권한을 관리한다. 개인 source instance와 사용자별 선택은 DPAPI에 보존한다. 다른 출처의 원본 연결을 임의로 가정하지 않고 공용 이력 조회만 제공한다. 분석 admission/관련 메일/수동 링크는 로컬 MCP의 현재 식별자를 재조회한다. 실행/중지/미전송 복구도 설정에서 관리한다. 아래 개인 agent가 설정된 경우 분석 loop를 명시적으로 시작할 수 있다. agent 미설정 시에는 분석을 거부하며 sync는 별도 명시적으로 켠 loop가 처리한다.

원본 저장소 주소가 바뀌었으면 설정의 대조/복구 절차를 따른다. 최대10개 기존 이력의 mail ID·Message-ID·제목을 다시 비교하고 사용자가 같은 저장소/복원본임을 확인해야 연결한다. 표본 일치가 전체 저장소 동일성을 증명하지는 않는다. 근거가 없으면 새 출처를 등록하고 기존 공유 이력은 원본 없는 상태로 보존한다.

직접 명령은 `node scripts/history-v1.mjs` 뒤에 `sources`, `settings [JSON_FILE]`, `get RUN`, `progress RUN`, `export RUN`, `begin JSON_FILE`, `cancel RUN`, `review RUN JSON_FILE`, `handling RUN true|false`, `runner start analysis|sync`, `runner stop`, `recovery show|deliver|recover|deliver-sync|archive-analysis|archive-sync`, `sync start|stop [ID]`를 사용한다. begin 입력은 UI와 같은 source UUID인 `storeId`, 메일 `mailId/messageId`, 고정 `requestId`와 선택적 `parentId/answer`다. 메일 원문이나 자격은 입력 파일에 넣지 않는다.

Runner는 사용자 token + 장치 credential + 실행 lease/generation을 사용한다. DB 자격은 필요하지 않다. requestId는 같은 논리 작업의 재전송 동안 고정한다. claim 응답 유실은 같은 claim requestId로 회수하며 이전 generation은 무효화된다. 결과 저장 응답이 유실되면 outbox의 같은 requestId/결과를 재전송한다. running receipt로 재시작한 경우 원본 재확인 후 복구가 필요하다. 잠금 파일은 소유 프로세스가 종료된 것을 확인한 뒤에만 별도 정리한다.

새 source와 기존 store/legacy 연결은 아직 자동 이관하지 않는다. 미연결 legacy를 삭제하거나 임의 소유자로 공개하지 않는다. 운영 DB에 migration을 실행하거나 기존 서비스를 교체하는 단계는 아직 수행하지 않았다.
# 후속 로컬 세션 설정

- `settings.json`의 `auth.refreshMode` 기본값은 `rotating`이다. 이 모드는 갱신 응답에 새 refresh token이 없으면 재로그인을 요구한다. 테넌트에서 회전을 사용하지 않는다고 확인한 경우에만 `static`을 명시하면 성공 응답에 token이 생략될 때 기존 값을 유지한다. 두 모드 모두 교환 응답 유실/저장 실패 시 옛 token을 자동 재사용하지 않는다.
- 로컬 브라우저는 `TRIAGE_LOCAL_HOME`을 설정한 실행기의 `node scripts/history-v1.mjs open`으로 연다. 직접 URL을 열었는데 로컬 세션이 없으면 실행기를 다시 사용해야 한다. 발급된 ticket은 60초/1회용이며 기록하거나 공유하지 않는다.
- v1 export의 `X-Report-SHA256`은 리뷰를 포함한 내려받기 본문 전체 hash다. run 조회의 `reportHash`는 변경되지 않은 보고서 본문만 가리킨다.
# 개인 agent 설정

`settings.json`의 `agents.codex` / `agents.claude`에 `{ "executable": "절대 실행 파일 경로", "prefix": [] }`를 지정하면 분석 Runner를 설정 화면에서 명시적으로 시작할 수 있다. Codex Node 설치는 executable을 node.exe, prefix를 설치된 codex.js 경로로 지정한다. 현재 검증 버전은 Codex 0.154.0, Claude 2.1.276이다. 버전 변경은 합성 adapter 재검증 후 반영한다.

`evidenceRoots`는 `{ "gg": "승인된 ERP 소스의 절대 경로" }` 형태다. 개인 home/설치 데이터와 겹치는 경로를 시작 시 거부한다. 기본 허용은 java/jsp/xml/sql/md/txt/ts/js이며 설정·자격 파일명, symlink 및 일반적인 자격 지정 구문은 거부한다. 예외 자료는 `{ "path": "절대 경로", "files": ["검토한 비밀 없는 fixture.json"] }`처럼 정확한 상대 파일명으로만 추가한다. 명시해도 자격 파일명/내용 검사는 유지된다. 이 검사는 임의 비밀의 완전한 탐지를 보장하지 않으므로 배포 담당자는 비밀 없는 증거 경로만 승인해야 한다. 설치 기본값은 비어 있다.

`query_evidence`는 코드로 주입한 사전 정의 provider만 실행하고 임의 SQL을 받지 않는다. 실제 DB provider를 배치하려면 D5에서 읽기 전용 계정과 도구 구성을 확인해야 한다. agent scratch는 DPAPI receipt 폴더와 분리되어 있다.
# 기존 이력의 명시적 매핑

실전환 전 writer 중지·백업·복제 리허설을 먼저 수행한다. 운영자가 migration 자격의 `MIGRATION_DATABASE_URL`을 설정하고 `node scripts/map-v1-legacy.mjs .runtime/mapping-plan.json`으로 미리보기한다. 검토한 `previewHash`를 `--confirm HASH`로 전달해야 적용된다. 이 명령은 runtime HTTP에 노출하지 않는다.

입력은 `{ "actorId": "확인된 관리자 UUID", "teamId": "팀 UUID", "sources": [{ "sourceId": "등록한 비공개 출처 UUID", "storeId": "기존 store 문자열" }], "documents": [{ "documentId": "기존 문서 UUID", "collectionId": "비공개 collection UUID", "sourceHash": "기존 문서 SHA256" }] }`다. 현재 사용자를 과거 실행 actor로 채우지 않으며, 미확정 문서는 목록에 넣지 않는다. source/collection 공유는 이관을 확인한 뒤 별도로 부여한다. runtime role은 `deploy/runtime-grants.sql`을 따른다.

# 오류 요청 추적

v1 API와 로컬 앱은 HTTP 오류를 stderr에 `event=http_error`인 JSON 한 줄로 출력한다. 호출자가 받은 JSON의 `requestId` 또는 응답 헤더 `X-Request-ID`를 해당 프로세스 로그에서 찾는다. 로컬 앱 항목에 `upstreamRequestId`가 있으면 그 값으로 공용 API 로그의 `requestId`를 찾아 원격 오류 분류를 확인한다. 클라이언트가 전달한 요청 ID는 사용하지 않는다.

`route`는 `/api/v1/runs/:id` 같은 등록 템플릿이며, parser/auth 단계나 없는 경로에서는 `<unmatched>`다. `status`, `code`, `errorType`, `durationMs`, `responseCompleted`로 실패 종류와 소요 시간을 확인한다. `responseCompleted=false`는 응답 전송 중 오류로 연결을 종료한 경우를 포함한다. DB 오류는 알려진 SQLSTATE만 `databaseCode`로 기록하며 SQL이나 detail을 기록하지 않는다.

메일/보고서 본문, 인증 header/cookie, 실제 URL/query 값, 오류 message/stack은 수집하지 않는다. 신규 API 오류 코드를 진단에 사용하려면 `packages/contracts/src/http-log.ts`의 고정 목록에 추가한다. 미등록 코드는 로그에서 `REQUEST_FAILED`로 처리한다. 기본 저장 위치는 실행 환경이 수집하는 stderr이며 별도 외부 수집 서비스는 요구하지 않는다.
