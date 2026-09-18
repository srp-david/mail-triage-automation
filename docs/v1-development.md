# v1 개발 실행 경계

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

설정 화면에서 source/collection 선택, 현재 MCP 출처 등록, 실행 장치 등록·폐기, 사용자별 공유 권한을 관리한다. 개인 source instance와 사용자별 선택은 DPAPI에 보존한다. 다른 출처의 원본 연결을 임의로 가정하지 않고 공용 이력 조회만 제공한다. 분석 admission/관련 메일/수동 링크는 로컬 MCP의 현재 식별자를 재조회한다. 실행/중지/미전송 복구도 설정에서 관리한다. 일반 AI adapter 검증 전이므로 현재 후보의 분석 실행은 차단된다. sync는 명시적으로 켠 로컬 loop가 처리한다.

직접 명령은 `node scripts/history-v1.mjs` 뒤에 `sources`, `settings [JSON_FILE]`, `get RUN`, `progress RUN`, `export RUN`, `begin JSON_FILE`, `cancel RUN`, `review RUN JSON_FILE`, `handling RUN true|false`, `runner start analysis|sync`, `runner stop`, `recovery show|deliver|recover|deliver-sync|archive-analysis|archive-sync`, `sync start|stop [ID]`를 사용한다. begin 입력은 UI와 같은 source UUID인 `storeId`, 메일 `mailId/messageId`, 고정 `requestId`와 선택적 `parentId/answer`다. 메일 원문이나 자격은 입력 파일에 넣지 않는다.

Runner는 사용자 token + 장치 credential + 실행 lease/generation을 사용한다. DB 자격은 필요하지 않다. requestId는 같은 논리 작업의 재전송 동안 고정한다. claim 응답 유실은 같은 claim requestId로 회수하며 이전 generation은 무효화된다. 결과 저장 응답이 유실되면 outbox의 같은 requestId/결과를 재전송한다. running receipt로 재시작한 경우 원본 재확인 후 복구가 필요하다. 잠금 파일은 소유 프로세스가 종료된 것을 확인한 뒤에만 별도 정리한다.

새 source와 기존 store/legacy 연결은 아직 자동 이관하지 않는다. 미연결 legacy를 삭제하거나 임의 소유자로 공개하지 않는다. 운영 DB에 migration을 실행하거나 기존 서비스를 교체하는 단계는 아직 수행하지 않았다.
# 후속 로컬 세션 설정

- `settings.json`의 `auth.refreshMode` 기본값은 `rotating`이다. 이 모드는 갱신 응답에 새 refresh token이 없으면 재로그인을 요구한다. 테넌트에서 회전을 사용하지 않는다고 확인한 경우에만 `static`을 명시하면 성공 응답에 token이 생략될 때 기존 값을 유지한다. 두 모드 모두 교환 응답 유실/저장 실패 시 옛 token을 자동 재사용하지 않는다.
- 로컬 브라우저는 `TRIAGE_LOCAL_HOME`을 설정한 실행기의 `node scripts/history-v1.mjs open`으로 연다. 직접 URL을 열었는데 로컬 세션이 없으면 실행기를 다시 사용해야 한다. 발급된 ticket은 60초/1회용이며 기록하거나 공유하지 않는다.
- v1 export의 `X-Report-SHA256`은 리뷰를 포함한 내려받기 본문 전체 hash다. run 조회의 `reportHash`는 변경되지 않은 보고서 본문만 가리킨다.
# 개인 agent 설정

`settings.json`의 `agents.codex` / `agents.claude`에 `{ "executable": "절대 실행 파일 경로", "prefix": [] }`를 지정하면 분석 Runner를 설정 화면에서 명시적으로 시작할 수 있다. Codex Node 설치는 executable을 node.exe, prefix를 설치된 codex.js 경로로 지정한다. 현재 검증 버전은 Codex 0.154.0, Claude 2.1.276이다. 버전 변경은 합성 adapter 재검증 후 반영한다.

`evidenceRoots`는 `{ "gg": "승인된 ERP 소스 경로" }` 형태다. 지정 경로의 코드 읽기만 허용하며 개인 home/config나 자격 저장 디렉터리를 지정하지 않는다. 설치 기본값은 비어 있다. `query_evidence`는 코드로 주입한 사전 정의 provider만 실행하고 임의 SQL을 받지 않는다. 실제 DB provider를 배치하려면 D5에서 읽기 전용 계정과 도구 구성을 확인해야 한다.
