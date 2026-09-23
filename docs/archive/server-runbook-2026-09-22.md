# 공용 이력 서버 리허설과 전환

현재 배포 절차는 [Supabase 팀 배포 안내](../operations/supabase.md), 범위는 [통합 계획 v3.1](../implementation-plan.md) 4~6절을 따른다. Supabase PoC 소스는 원본에 통합했으며 hosted 배포·실제 팀 파일럿은 미완료다.

아래는 이전 Auth0/VM 리허설의 역사 기록이다. 현재 사용자명 인증/Edge 배포에서 Auth0·SMTP 설정을 사용하지 않는다. Compose는 Node 자체 운영 참고안이며 Supabase 배포 명령이 아니다. AWS 이전과 MariaDB 이식은 안정화 이후 별도 작업이다.

아래는 기존 리허설 절차 보존본이다.

1. 운영자는 별도 Linux VM에서 `deploy/server.env.example`를 Git 밖에 복사하고 실제 값을 채운다. Node/PostgreSQL/Caddy 이미지 digest를 배포 기록에 고정한다. Compose는 DB 포트를 공개하지 않는다. API·프록시만 외부 네트워크에 연결한다.
2. OS 사용자 전용 secret 경로에 db-password, runtime-database-url을 둔다. runtime은 superuser가 아닌 triage_runtime 계정이다. Auth0 Native callback은 `http://127.0.0.1:3080/auth/callback`, 회사 도메인·namespace·API audience를 일치시킨다. SMTP 실제 수신·재설정은 운영자가 확인한다.
3. `docker compose --env-file /secure/server.env -f deploy/compose.server.yaml build api`로 후보를 빌드한다. DB만 먼저 시작한다. migration 소유자의 별도 DATABASE_URL_FILE로 이미지의 `node dist/apps/history-api/src/main.js --migrate`를 실행한다. API 시작은 DDL을 수행하지 않는다.
4. 운영자가 최초 team UUID와 관리자 subject를 확정한다. runtime LOGIN 계정을 비밀 관리 절차로 만들고 `deploy/runtime-grants.sql`로 최소 DML을 부여한다. schema_migration은 조회만 허용한다. 권한/소유자 확인 없이 기존 store·legacy를 새 사용자의 자료로 공개하지 않는다.
5. API와 Caddy를 시작하고 두 외부 환경에서 인증·ACL·원본 없는 PC 이력 조회, TLS 갱신, 5432 비공개를 확인한다. 설정 파일 존재나 localhost 검증을 외부 운영 완료로 표시하지 않는다.

백업은 일 1회 및 migration 직전 `pg_dump -Fc`를 사용한다. 성공 exit code, dump 크기, SHA-256, 시작/종료 시각만 기록한다. 암호화한 다른 저장 위치에 일간 14개/주간 8개를 보관한다. 복원 검증 없이 기존 사본을 삭제하지 않는다. 인증 파일/MCP 저장소/로컬 outbox는 이력 DB와 별도 백업이다.

`node scripts/verify-v1-restore.mjs`는 기존 DB의 읽기 전용 dump를 Git 제외 `.runtime`에 받고 독립 Compose 프로젝트에 복원한다. 기존 이력 테이블의 건수·내용 hash를 migration 전후 대조하고 두 번째 복원본과 확인한다. 자신이 만든 프로젝트·volume만 정리한다. dump는 민감 자료이므로 로컬 접근 권한/보존 기간을 적용하며 외부 전송하지 않는다.

실제 전환 전에는 활성 분석/sync를 종료하고 쓰기를 중지한다. 마지막 dump와 건수/hash를 확인한 뒤 공용 API URL을 전환한다. 두 DB에 동시 쓰지 않는다. 쓰기 시작 전 실패하면 구 서버로 돌아가고, 쓰기 시작 후 실패하면 새 결과를 먼저 백업하고 writer를 정지한 다음 역이관한다. 오래된 dump로 최신 이력을 덮어쓰지 않는다. 앱 롤백은 DB 롤백과 별개다.

목표 RPO 24시간/RTO 4시간은 실측 전 보장이 아니다. 백업 나이 26시간, 디스크 70/85%, readiness·5xx·대기 지연을 운영자가 점검한다. 알림 수신처와 장애 담당자는 D4에 기록한다.
