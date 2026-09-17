# mail-triage-web

공용 PostgreSQL 이력과 읽기 전용 Codex Worker 기반 메일 분석 서비스.

`node scripts/setup.mjs`로 로컬 환경을 준비하고 `docker compose up -d --build`로 실행한다. ERP 코드와 DB는 읽기 전용이며 비밀값과 실제 메일 자료는 Git에서 제외한다.
