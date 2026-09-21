# 공용 이력 서버 리허설과 전환

이 문서는 원본의 이전 Auth0/VM 리허설 기록이다. 최신 순서는 **AWS 공용 API·선택한 DB + 팀원 로컬 MCP/AI → 팀 배포·안정화 → 원격 자동화**다. [통합 구현 계획 v3.0](implementation-plan.md) 4~6절이 현재 배포 준비의 기준이다. Supabase PoC `8303d52`는 로컬 완료 보고/원본 미병합이며 hosted 운영 완료가 아니다. 아래 Auth0/SMTP·관리자 subject와 자체 DB Compose 명령을 새 AWS/RDS 배포에 그대로 사용하지 않는다.

M1에서 이 문서의 명령을 갱신하기 전에 확인할 항목:

- `cvslog`는 사용자가 확인한 `srp-rds-maria` 내부 DB다. MariaDB 10.11.16이므로 현재 PostgreSQL 앱의 이식 또는 PostgreSQL 유지 선택이 먼저다. 기존 업무 DB에 migration을 바로 실행하지 않는다.
- API 호스트·RDS/DB 대상·앱 전용 영역·runtime/migration 계정·TLS/CA·네트워크 접근을 확정한다. 인증은 사용자명 PoC의 일반 Node 경로를 통합/검증한다.
- RDS 자동 백업 보존은 조회 시 0일이었다. 별도 백업 확인과 보존·복원·장애 담당을 정한다. 설정 변경은 아직 수행하지 않았다. 공유 인스턴스 전체 롤백으로 다른 DB를 되돌리지 않는다.
- 서명키/관리자 bootstrap·복제 DB migration/복원·기존 writer 전환/롤백·두 PC 검증 후 아래 과거 명령을 실제 검증된 절차로 교체한다. 현재 후보는 팀 배포 승인본이 아니다.

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
