# Supabase 팀 배포 안내

갱신: 2026-09-22. [통합 계획 v3.2](../implementation-plan.md)의 M1~M3 실행 안내다. **첫 hosted API·DB 배포 및 합성 검증 완료**, 실제 두 PC 업무 파일럿은 미완료다. Supabase Edge `history` + PostgreSQL, 각 팀원 PC의 local-app/MCP/AI Agent 구성이다. 백업 설정은 사용자 요청으로 보류했다. 기존 운영 서비스/DB는 유지한다.

## 1. 준비 상태와 배포 대상

- 이전 PoC `8303d52`의 제품 커밋 3개를 `602e5aa`, `f3e32fe`, `1c45518`로 통합했다. 옛 작업 폴더는 없어 이전 후보 파일을 배포본으로 재사용하지 않는다.
- API/DB는 PostgreSQL 기반이고 일반 Node 진입점도 유지한다. AWS 이전이나 MariaDB 이식은 첫 배포에 포함하지 않는다.
- 사용자가 만든 `mail-triage-automation` 프로젝트를 연결했다. 서울 `ap-northeast-2`, PostgreSQL 17.6, 상태 ACTIVE_HEALTHY 확인. 요금제·조직 합산 한도는 Dashboard에서 확인하며 유료 add-on은 추가하지 않았다.
- 사용자가 Supabase CLI 로그인을 완료했다. 비밀번호/PAT/DB URL/서명키는 채팅·Git에 전달하지 않는다.
- Supabase CLI `2.117.0` 실행 확인. 전역 설치 없이 다음 명령을 사용할 수 있다. 로그인은 사용자 대화형 터미널에서 완료한다. [CLI 설치](https://supabase.com/docs/guides/local-development/cli/getting-started), [배포](https://supabase.com/docs/guides/functions/deploy).
- 최초 v3.1 검증: check/build/Edge/compat, backend 130/130, 로컬 Edge·브라우저·Runner·복원 12군 통과. 당시 Windows `0.3.0-candidate.3` 설치 수명주기와 hosted 인증·ACL·보고서·Runner 재전송 7군을 검증했다. CA 변경은 서버 전용이었다. 이후 UI를 반영한 현재 후보는 candidate.5이며 ZIP/hash·설치 검증 범위는 [현재 상태](../current-status.md)를 따른다. 정식 승인과 실제 두 PC 업무 수용은 남아 있다.

```powershell
npx.cmd --yes supabase@2.117.0 login
npx.cmd --yes supabase@2.117.0 projects list
```

## 2. 로컬 검증 재현

Windows x64 Node v24.16.0, Docker, Chrome 및 기존 erp-manager CLI 읽기 경로가 필요하다. 아래 검증은 임시 PostgreSQL/Edge 컨테이너와 합성 자료만 사용하고 자신이 생성한 컨테이너만 정리한다.

```powershell
npm.cmd install --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd run build
node scripts/build-edge.mjs
node scripts/verify-build-compat.mjs
$env:TRIAGE_CLI_SOURCE = 'C:/Users/david/IdeaProjects/erp-manager/tools/triage-history.mjs'
node scripts/test-isolated.mjs
node --import tsx scripts/verify-supabase.mjs --browser
```

결과는 [검증 기록](../validation.md)에 실제 실행 단위로 남긴다. 로컬 Edge 통과는 hosted CPU/메모리·TLS·Supavisor·Data API 차단·일시정지 재개 완료를 뜻하지 않는다. AI/MCP는 PC에서 실행하므로 긴 분석을 Edge 요청 하나 안에서 실행하지 않는다. [Edge 제한](https://supabase.com/docs/guides/functions/limits).

## 3. 프로젝트 생성 후 운영자 작업

### 서버 준비와 키 경계

공식 CA가 필요한 Node migration/운영자 명령도 실행 전에 `HISTORY_DB_CA_BASE64`를 설정한다. 예: `$env:HISTORY_DB_CA_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('CA_FILE'))`. 인증서는 Dashboard Connect의 SSL 인증서를 사용하며, DB URL/비밀번호는 보호 파일에 유지한다. 서버 배포 시 같은 CA 값을 Edge secret에 넣는다.

1. 조직의 Free 프로젝트 여유·지역·관리 담당을 정한다. [공식 요금/한도](https://supabase.com/pricing)와 Dashboard에서 현재 DB/함수/egress 한도를 확인한다. `supabase-usage.mjs`의 수치는 계획 가정이며 실제 청구 계측이 아니다. 프로젝트·조직 합산 범위를 확인하고 유료 add-on을 켜지 않는다.
2. 서버 운영자만 접근하는 디렉터리를 준비한다(Windows는 사용자 전용 DACL, Linux는 0700). `node --import tsx scripts/username-operator.mjs keygen KEY_FILE`은 ES256 키를 새 파일에 생성한다. 이 CLI는 대화형 TTY만 허용한다. 키는 백업하고 PC 설치 패키지·Git·채팅에 넣지 않는다.
3. migration 계정으로 **비공개 `triage_private` schema**를 만들고 `HISTORY_SCHEMA=triage_private`, 서버 전용 DATABASE_URL_FILE로 `node dist/apps/history-api/src/main.js --migrate`를 실행한다. 기존 이관은 반드시 복제본에서 먼저 검사한다. 기존 UUID·보고서·source/Runner FK를 수정하는 자동 매핑은 없다.
4. 별도 `triage_runtime` LOGIN을 NOINHERIT/NOSUPERUSER/NOCREATEDB/NOCREATEROLE로 만들고 비밀번호를 운영자 secret 경로에서 설정한다. `deploy/supabase/private-grants.sql`을 migration 소유자로 적용한다. runtime에는 DDL/ledger 쓰기/보고서 수정 권한이 없다. Supabase Dashboard에서 **Data API를 끄고**, exposed schema에 `triage_private`를 넣지 않는다. private schema grants는 anon/authenticated/PUBLIC을 거절한다. 로컬 검증은 해당 역할의 실제 SQL 거절을 검사했으며 hosted PostgREST 검사는 별도다.
5. 운영자 전용 CONFIG JSON에 `databaseUrl`(관리 접속), `issuer`, `audience`, `teamId`, `teamName`, `signingKeyFile` 경로를 넣는다. DB/키 값을 명령 인자나 대화에 넣지 않는다. `node --import tsx scripts/username-operator.mjs bootstrap CONFIG USERNAME DISPLAY`로 첫 관리자를 생성한다. 출력 임시 비밀번호는 안전한 사내 전달 경로로 한 번 전달하고 첫 로그인에서 변경한다. 다시 실행해 관리자를 추가할 수 없다.
6. 기존 사용자는 `map-user CONFIG EXISTING_UUID USERNAME`으로 **정확한 UUID를 지정**한다. 이메일/표시 이름 자동 병합 없음. 기존 credential에는 덮어쓰기하지 않는다. 관리자 분실 복구는 `recover-admin CONFIG EXISTING_ADMIN_UUID`로 기존 admin만 복구하며 모든 기존 세션을 폐기한다. 사용자 영구 삭제는 제공하지 않는다.
7. Edge server secrets에 `DATABASE_URL`(runtime 접속), `HISTORY_SCHEMA=triage_private`, `HISTORY_POOL_MAX=2`, `AUTH_SIGNING_JWK`(키 JSON), `AUTH_ISSUER`, `AUTH_AUDIENCE`, `TEAM_ID`, `HISTORY_DB_CA_BASE64`를 보호 파일에서 등록한다. 마지막 값은 Supabase 공식 루트 인증서 PEM의 base64다. URL은 `sslmode=verify-full`을 사용하고 앱이 CA와 호스트 이름 검증을 유지한다. 약한 TLS 옵션이나 인증서 덮어쓰기 옵션은 거절한다. transaction pooler 6543의 실제 앱 접속과 session pooler 5432의 Node 접속을 확인했다. 앱은 트랜잭션마다 search_path를 고정하고 prepared statement 이름을 사용하지 않는다. 부하 한도·장기 안정성은 별도 관찰한다.
8. `node scripts/build-edge.mjs`로 생성한 bundle과 `supabase/config.toml`의 `history`만 배포 대상으로 검토한다. 대상 프로젝트 확인 후 명령은 `npx.cmd --yes supabase@2.117.0 functions deploy history --project-ref PROJECT_REF`. `verify_jwt=false`는 Supabase Auth JWT 검사를 대신해 앱의 ES256/DB session/ACL을 사용하기 때문이다. `local-gateway`/`local-benchmark`는 로컬 검증용이며 배포하지 않는다. Supabase service_role/secret key는 앱에서 사용하지 않는다.

7번의 서버 설정은 운영자 전용 env 파일에서 `npx.cmd --yes supabase@2.117.0 secrets set --project-ref PROJECT_REF --env-file SECURE_ENV_FILE`로 등록한다. 파일에는 위 8개 변수만 넣고 `AUTH_SIGNING_JWK`는 한 줄 JSON으로 저장한다. 로컬 `settings.json.auth.issuer/audience`와 서버 값을 일치시킨다. 값 자체를 명령 인자·로그로 출력하지 않는다. 최초 프로젝트를 생성했다고 기존 DB나 개인 자료를 자동 이관하지 않는다.

### 백업과 복원

**2026-09-22 현재 보류:** hosted DB dump를 runtime 계정으로 시도했으나 `worker_state` SELECT 권한 부족으로 실패했다. 새 백업 계정 생성은 자동 승인 검토에서 차단됐고, 사용자가 백업 설정을 나중에 진행하도록 지시했다. 백업 계정·성공한 hosted 백업·정기 작업은 없다. 아래는 향후 운영 절차이며 완료 증거가 아니다. 기존 로컬 합성 DB 복원 통과와 구분한다.

Free에는 유료 플랜의 일일 자동 백업을 전제로 하지 않는다. [공식 백업 안내](https://supabase.com/docs/guides/platform/backups)는 정기 외부 export를 권장한다. 운영자 PC/기존 사내 저장소에 매일 및 migration 직전 `pg_dump -Fc --schema=triage_private --file=BACKUP.dump`로 저장한다. PGHOST/PGDATABASE/PGUSER/PGPASSFILE은 운영자 보호 설정에서 읽고 비밀번호를 CLI 인자로 넣지 않는다. 서명키·역할 설정·앱 버전도 별도 보관한다.

종료 코드·시각·크기·SHA-256만 일지에 기록한다. dump에는 메일 메타데이터/보고서/credential hash가 들어 있으므로 조직이 승인한 암호화 저장소와 별도 복구 담당 접근권을 사용한다. 일간 14개/주간 8개는 제안이며 실제 담당/보관 장소/암호화 복구 테스트는 미확정이다. RPO 24시간 목표, RTO는 실제 복원 시간을 측정한 후 합의한다.

복구는 빈 **격리 DB**에 `pg_restore --no-owner --dbname=RESTORE_DB BACKUP.dump`로 먼저 수행한다. 기존 UUID/관계/보고서 내용 hash를 원본과 대조하고 runtime grants를 다시 적용한다. 공개 트래픽을 열기 전에 `UPDATE triage_private.auth_session SET revoked_at=now()`로 **전체 세션을 무효화**하고 서명키 교체·재로그인을 수행한다. 과거 폐기 refresh를 되살리지 않는다. 현재 테스트는 PostgreSQL 17에서 실제 dump→별도 DB restore→내용 hash 대조→전체 세션 폐기를 통과했으며 사내 암호화 보관 복구와는 구분한다.

운영 전환 전 writer/Runner를 정지하고 마지막 dump를 확보한다. 실패 시 새 DB 결과를 보존한 후 되돌린다. 앱 롤백은 DB 복원과 별개이며, 최신 결과를 옛 dump로 덮어쓰지 않는다. 기존 운영 DB 초기화, `docker compose down -v`, outbox 삭제는 금지한다.

### 일시정지·한도 초과·보존

Free는 [7일간 낮은 활동으로 일시정지될 수 있고](https://supabase.com/docs/guides/platform/free-project-pausing), 재개 가능한 기간/방식은 해당 프로젝트 Dashboard와 현재 공식 문서에서 확인한다. 무중단 SLA로 사용하지 않는다. 자동 keepalive를 추가하지 않는다. 오류 시 로컬 Runner 중지/receipt 보존, Dashboard 상태와 소유자 알림 확인, Resume 후 health·재로그인·ACL·작업 상태를 확인하고 명시적으로 Runner를 재시작한다. 로컬 장애/lease 회귀와 실제 hosted pause/resume는 다른 검증이다.

사용량은 Dashboard의 월 호출/egress, DB `pg_database_size`와 private table/index 크기를 주간 기록한다. 70%를 경고 기준으로 두고 초과 예상 시 불필요한 Runner를 중지하고 조회 간격/활동 시간을 조정한다. 자동 과금 업그레이드는 하지 않는다. `supabase-usage.mjs`의 인원·보고서 크기·활동 시간을 실제 집계로 갱신한다. 비용을 줄이려고 사용자별 ACL 확인을 생략하지 않는다.

보고서·메일 이력 자동 삭제는 구현하지 않았다. DB 증가가 빠르면 합의된 보존·암호화 외부 아카이브/조회 방식 또는 유료 전환을 별도 결정한다. 폐기 세션/refresh 정리도 보관 정책과 복원 검증을 확정한 뒤 운영자 작업으로 수행한다. 실제 Free 적합성은 팀 인원/사용량과 hosted 계측 전까지 확정할 수 없다.


## 4. 최초 설치와 팀 파일럿

2026-09-22 개발 PC의 `%LOCALAPPDATA%\MailTriagePilot`은 candidate.5로 업데이트했다. 기동/종료는 [Windows 안내](windows.md)의 활성 버전 기준 명령을 사용한다. 개발 PC의 `start-pilot.ps1`은 개인 보조 파일이며 팀 배포 묶음이 아니다. 단순 URL 대신 일회용 browser ticket으로 진입한다. 각 팀원은 발급 계정의 첫 비밀번호 변경 후 개인 MCP/Agent를 연결하며 팀 PC·실업무 검증은 아래 절차로 진행한다.


1. 소규모 파일럿은 서로 다른 사용자 최소 2명/2PC로 시작한다. 관리자·백업/복구 담당과 지정 업무 사례를 정한다. 기존 이력을 통째로 업로드하지 않고 신규 지정 사례부터 시작하며 이관은 source 귀속 확인 후 별도로 한다.
2. [로컬 설정 예시](../../deploy/supabase/local-settings.example.json)의 PROJECT를 실제 프로젝트로 바꾸고 개인 `config/settings.json`에 저장한다. `historyUrl`, `auth.issuer`, `auth.audience`는 서버와 일치해야 한다. API 주소와 issuer에 DPAPI 세션이 묶이므로 이전 시 재로그인한다. DB URL/서명키는 PC에 넣지 않는다.
3. 현재 운영 v0와 충돌하지 않도록 예시 포트 43180을 사용한다. 개인 Mail MCP URL·지원 Agent 실행 경로·ERP 읽기 자료 경로를 본인 환경에서 지정하고 기존 개인 설정은 보존한다.
4. 현재 candidate.5는 이미 생성되어 있다. 새 코드의 후보는 `node scripts/package-windows.mjs 새후보버전`으로 만들고 `node scripts/verify-windows-lifecycle.mjs .runtime/packages/새후보버전`으로 확인한다. 동일 번호를 덮어쓰지 않는다. 설치/후보 실행은 [Windows 안내](windows.md)를 따른다. 실제 팀 수용 전 manifest의 releaseApproved는 false다.
5. 첫 로그인 → 비밀번호 변경 → 본인 출처/Runner 등록 → 지정 실제 사례 분석 → 보고서 저장/공유를 확인한다. 다른 PC에 원본이 없으면 보고서만 조회됨을 확인한다. 별도 사용자 자료 접근 거절, 재로그인, 중단/재전송, 설정 보존 업데이트를 검사한다.
6. 초기 제안은 실제 업무 5일 관찰이다. 날짜/버전/실행 ID, 기대·실제 결과, 오류 코드, 재현 절차, 심각도, 담당/해결 버전만 기록한다. 비밀번호·토큰·메일 원문을 피드백 게시물에 붙이지 않는다. 기간/목표는 팀과 조정한다.

| 항목 | 완료 증거 | 상태 |
|---|---|---|
| hosted API·DB | health, 실제 TLS/pooler, runtime 권한, anon/private 접근 거절 | 배포 및 합성 검증 통과 |
| 계정/팀 권한 | 첫 변경, 사용자 관리, 타 사용자 자료 거절, 폐기/로그아웃 | hosted 합성 통과, 실제 두 PC 확인 필요 |
| 실제 업무 | 각 PC의 MCP·AI로 지정 사례 분석 및 저장/공유 | 미실행 |
| 복구/운영 | 암호화 백업 복원, 일시정지 재개, 응답 유실/재전송 | hosted 응답 유실/재전송 통과. 백업 보류, pause/resume 미검증 |
| 피드백 | 업무별 사용 기록·문제/개선·수정 후 재확인 | 파일럿 후 |

## 5. AWS 이전 시 보존할 계약

API 주소를 설정으로 분리하고 팀/사용자/source/보고서 UUID·ACL을 유지한다. Node 진입점과 Edge 어댑터를 분리하며 새 Supabase Auth/Storage/Realtime 의존성을 추가하기 전 이전 비용을 평가한다. PostgreSQL dump/restore·권한·extension 호환성과 실제 보고서 hash를 확인한 뒤 writer 정지/최종 복사/API 전환/세션 폐기/재로그인을 수행한다. 새 결과를 잃는 DB 롤백은 하지 않는다. MariaDB `cvslog` 재사용은 별도 이식 작업이다.

## 6. 앱 Release와 서버 배포의 구분

[Release 업데이트 계획](releases.md)은 미구현이다. 공용 API가 인증된 업데이트 조회·사용자 채널·호환성·중단 정책을 제공하고 public 파일은 GitHub에서 직접 내려받는 방식이 기본안이다. 이 문서 갱신에서 update route/catalog를 hosted에 배포하지 않았다.

API/DB 변경은 PC 앱과 별도 배포하며 구/신 앱의 지원 범위와 outbox 제출 호환성을 확인한다. 구버전이 업무 API에서 거절되더라도 인증/업데이트 또는 수동 복구로 이동할 경로가 필요하다. private 전환의 GitHub 인증은 서버에만 두고 중계 위치·대용량 전송 한도는 D13에서 정한다. Release 게시가 서버 migration이나 ERP 운영 배포를 실행하지 않는다.
