# v1 개발 실행 경계

현재 기본 `npm start`와 Docker 서비스는 기존 단일 사용자 v0 앱이다. 분리된 v1은 신규 로컬 개발 경로이며 기존 UI 전체 기능과 인증 세션 연결은 진행 중이다. 공용 서버에는 v0를 노출하지 않는다.

- 빌드: `npm run build`
- 별도 개발 DB에만 migration: `node dist/apps/history-api/src/main.js --migrate`
- v1 API: `node dist/apps/history-api/src/main.js`
- 격리 회귀: `node scripts/test-backend.mjs` (Docker 접근 권한 필요)
- 보호 저장 검사: `node --import tsx scripts/verify-dpapi.mjs` (Windows)
- 직접 CLI: `node scripts/history-v1.mjs sources`, `get RUN_UUID`, `begin - INPUT_JSON`, `cancel RUN_UUID`

API에는 DATABASE_URL, AUTH_ISSUER(끝 `/` 포함), AUTH_AUDIENCE, AUTH_NAMESPACE, COMPANY_DOMAINS(정확한 도메인), TEAM_ID가 필요하다. 운영자가 migration 뒤 팀을 명시적으로 생성해야 한다. 최초 관리자는 ADMIN_SUBJECT로 지정하며 첫 가입자를 관리자로 승격하지 않는다. runtime DB 계정은 DML만, migration 계정은 별도로 둔다. v1 기본 bind는 127.0.0.1:3081이다.

CLI는 TRIAGE_V1_URL과 TRIAGE_SECRET_DIR의 DPAPI `session` 레코드에서 accessToken을 읽는다. 현재 로그인 연결/refresh 자동 갱신은 미완료이므로 일반 팀원 설치 사용법으로 배포하지 않는다. 토큰을 command line, Git, UI 저장소에 넣지 않는다.

Runner는 사용자 token + 장치 credential + 실행 lease/generation을 사용한다. DB 자격은 필요하지 않다. requestId는 같은 논리 작업의 재전송 동안 고정한다. claim 응답 유실은 같은 claim requestId로 회수하며 이전 generation은 무효화된다. 결과 저장 응답이 유실되면 outbox의 같은 requestId/결과를 재전송한다. running receipt로 재시작한 경우 원본 재확인 후 복구가 필요하다. 잠금 파일은 소유 프로세스가 종료된 것을 확인한 뒤에만 별도 정리한다.

새 source와 기존 store/legacy 연결은 아직 자동 이관하지 않는다. 미연결 legacy를 삭제하거나 임의 소유자로 공개하지 않는다. 운영 DB에 migration을 실행하거나 기존 서비스를 교체하는 단계는 아직 수행하지 않았다.
