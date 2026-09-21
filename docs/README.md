# 문서 안내

갱신일: 2026-09-21. **공용 API·DB + 팀원 PC의 MCP·AI Agent를 먼저 팀에 배포하고, 피드백과 안정화 후 원격 SR 자동화로 확장한다.** 공용 API는 AWS 배치를 우선 검토한다. 기존 `srp-rds-maria/cvslog`는 MariaDB이므로 현재 PostgreSQL 앱의 DB 재사용 여부는 엔진 이식·권한·부하·백업을 평가한 뒤 결정한다.

## 먼저 읽을 문서

1. [통합 구현 계획 v3.0](implementation-plan.md): 현재 우선순위와 M1~M5, AWS/DB 판단, 팀 배포·안정화 기준, 두 리뷰 반영 결과의 단일 기준.
2. [프로젝트 README](../README.md): 현재 단일 사용자 Docker 앱의 사용법. 계획 중인 AWS 팀 서비스의 배포 명령이 아니다.
3. [검증 기록](validation.md): 실제 확인한 사실·대상·결과와 미검증 경계.
4. [운영 안내](maintenance.md): 기존 이관·동기화·복구 도구. 새 코드/배포 환경 검증 전에는 기존 실행 경로로만 해석한다.

## 계획 읽는 순서

| 궁금한 내용 | 통합 계획 위치 |
|---|---|
| 지금 할 일·완료된 것 | 1~3절: 팀 배포 우선, 현재 소스/PoC 경계, M1~M5 |
| AWS와 기존 RDS 사용 판단 | 4절: 로컬 실행 구성, 실조회 결과, PostgreSQL 유지와 MariaDB 이식 비교 |
| 첫 팀 배포의 구현/검증 | 5~6절: PoC 통합, 인증·로컬 Runner, 설치/복원, 파일럿/피드백 |
| 안정화 이후 원격 자동화 | 7~9절: 원격 자료/서비스 권한, brief·commit 전달·검증·PR·복원 |
| 필요한 입력과 리뷰 반영 | 10~11절: 결정 시점, Codex/Claude 항목별 처리 |

## 문서별 역할과 현재성

| 문서 | 역할/경계 |
|---|---|
| [implementation-plan.md](implementation-plan.md) | 최신 결정·범위·순서·수용 기준. 새 백로그는 여기서만 관리 |
| [team-deployment-plan.md](team-deployment-plan.md) | 통합 계획으로 가는 안내. 별도 계획을 유지하지 않음 |
| [v1-development.md](v1-development.md) | 원본의 개발 실행 경로. 자체 인증 PoC 미병합/AWS 미배포 경계 확인 |
| [server-runbook.md](server-runbook.md) | 기존 서버 리허설 기록과 새 AWS 배포 준비 시 갱신할 항목 |
| [windows-candidate.md](windows-candidate.md) | 기존 Windows 후보·설치/복귀. 과거 후보를 새 팀 배포 승인본으로 쓰지 않음 |
| [team-pilot.md](team-pilot.md) | 과거 파일럿 사례/양식. 최신 수용 기준은 통합 계획 6절 |
| [validation.md](validation.md) | 날짜별 실제 검증. 당시 상태를 최신 구현 상태로 읽지 않음 |
| [local-completion-2026-09-18.md](local-completion-2026-09-18.md) | P1~P6의 당시 로컬 완료 근거. 새 인증/AWS/원격 SR 완료 근거 아님 |
| [react-transition-validation.md](react-transition-validation.md) | React 전환·회귀·로컬 적용 근거 |
| [mail-threads-validation.md](mail-threads-validation.md) | 헤더 기반 스레드·수동 연결 및 화면 검증 |
| [legacy-link-validation.md](legacy-link-validation.md) | 기존 문서 연결/보존 근거 |
| [status-filter-validation.md](status-filter-validation.md) | 메일 검색 상태 필터 검증 |
| [implementation-plan-history-2026-09-21-v2.1.md](implementation-plan-history-2026-09-21-v2.1.md) | v2.1 전체 보존본. 옛 Supabase 우선안·P/A/S 단계는 현재 실행 기준이 아님 |
| [implementation-history-2026-09-17.md](implementation-history-2026-09-17.md) | 이전 구현 계획/완료 체크리스트 |
| [team-deployment-proposal-2026-09-17.md](team-deployment-proposal-2026-09-17.md) | 이전 배포 비교안 |
| [auth0-setup.md](auth0-setup.md) | 폐기한 Auth0 연결안의 역사 자료 |
| [work-summary.md](work-summary.md) | 당시 작업/인계 맥락. 최신 계획의 기준이 아님 |

별도 Supabase PoC `8303d52`의 로컬 완료 결과는 확인됐지만 원본 통합·AWS 운영·실제 팀 파일럿은 미완료다. 이번 v3.0 정리는 문서 작업이며 실배포가 아니다. 관리자 생성 사용자명 계정·JWT/자료 ACL을 유지하고 Auth0/인증 이메일/SES 연결은 제외한다.

현재 ERP 코드/DB 읽기 전용과 비밀/메일 원문 Git 제외 원칙을 유지한다. 원격 코드 수정·PR은 M5에서 repo/권한을 정한 후 진행한다. 자동 merge·운영 배포·운영 DB 쓰기는 범위 밖이다.
