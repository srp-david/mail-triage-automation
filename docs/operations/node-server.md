# 일반 Node 서버와 후속 호스팅

현재 운영 중인 공용 API는 Supabase다. 이 문서는 동일한 사용자명 API를 일반 Node 서버에서 실행하는 코드 경로를 설명한다. AWS 자원 생성·DNS/TLS·실운영 배포 완료를 뜻하지 않는다.

## 구성

- 진입점: `dist/apps/history-api/src/main.js` → `username-main.js`.
- `--migrate`는 별도 migration 자격으로만 실행한다. 일반 서버 시작은 schema checksum을 검사한다.
- `AUTH_SIGNING_KEY_FILE`로 ES256 JWK 파일을 읽는다. Edge의 `AUTH_SIGNING_JWK`와 전달 방식이 다르다.
- DB 접속, issuer/audience, teamId와 권한 로직은 공용 계약을 유지한다.
- [Dockerfile.history](../../deploy/Dockerfile.history), [compose.server.yaml](../../deploy/compose.server.yaml), [환경변수 예시](../../deploy/server.env.example)는 자체 호스팅 참고 구성이다.

Compose에는 PostgreSQL·Node API·Caddy가 있으며 DB 네트워크와 외부 proxy 네트워크를 나눈다. API의 read-only root filesystem, 임시 `/tmp`, capability 제거·비루트 사용자 설정을 갖는다. 구성 파일만으로 실제 방화벽·인증서·백업·운영 권한 검증이 끝난 것은 아니다.

## 이전 시 유지할 계약

1. 사용자/source/Runner/보고서 UUID·ACL과 불변 이력을 보존한다.
2. PostgreSQL의 SQL·extension·권한과 migration checksum을 복제본에서 검증한다.
3. writer/Runner 중지, 최종 백업, 새 DB 결과 대조 후 API 주소를 전환한다.
4. issuer/API 변경으로 로컬 세션이 달라질 수 있으므로 세션 폐기·재로그인을 수행한다.
5. 전환 후 새 결과를 옛 dump로 덮어쓰는 DB 롤백을 하지 않는다. 앱 버전 롤백과 구분한다.

AWS RDS `cvslog`는 MariaDB로 확인된 별도 대상이며 현재 PostgreSQL과 엔진이 다르다. DB 주소만 바꿔 연결하는 이전이 아니다. 상세 판단과 원격 Runner 단계는 [통합 계획](../implementation-plan.md)에서 관리한다.

옛 Auth0·SMTP·VM 리허설 명령은 [보존본](../archive/server-runbook-2026-09-22.md)에 남아 있다. 현재 서버에는 그 인증 설정을 적용하지 않는다.
