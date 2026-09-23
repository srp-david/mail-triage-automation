# 제품·실행 스펙

2026-09-22 저장소 구현 기준이며 운영 SLA가 아니다. 실제 검증 여부는 [현재 상태](current-status.md), 후속 요구사항은 [통합 계획](implementation-plan.md)을 따른다.

## 1. 기능 범위

| 영역 | 구현 내용 | 경계 |
|---|---|---|
| 계정 | 관리자 생성·역할 변경·비활성화·임시 비밀번호 초기화, 첫 변경 | 공개 가입·인증 이메일·MFA 미제공 |
| 메일 | 검색·본문·HTML/CID·첨부, 헤더 기반 스레드·수동 링크 | 현재 PC의 Mail MCP 연결 필요. 제목 기반 자동 병합 없음 |
| 분석 | 지정 Agent/Runner, 진행 상태, 취소, 완료/추가 확인 결과 | 개인 PC 실행, 실제 배포 환경의 Agent 연결은 별도 |
| 후속 분석 | 추가 답변과 이전 보고서 맥락으로 새 실행 | 기존 보고서 덮어쓰기 없음 |
| 이력·공유 | source별 ACL, 보고서·리뷰·처리 상태·관련 메일·export | 관리자 역할 자체는 타인 자료 열람권이 아님 |
| 기존 자료 | collection별 문서·공유·근거 있는 메일 연결·지식 제안 | 임의 귀속·자동 적용·미확정 자료 삭제 없음 |
| 동기화 | 명시적 실행, batch·중지·재개·불확실 상태 | 분석 시 자동 동기화하지 않음 |
| 복구 | 결과 outbox 재전송, 원본 재검증 후 복구, 설치 롤백 | 모든 오류를 자동 재실행하지 않음 |
| 설치 | manifest·checksum, 버전 전환·진단·정상 종료·상태 보존 | 간편 배포 묶음·서명·Release 조회/알림·버튼 설치 미구현. 완전 자동 설치는 후속 후보 |

## 2. 기술 구성

수치는 현재 package.json/빌드 코드의 값이다. 지원되는 최신 버전 전체를 의미하지 않는다.

| 영역 | 현재 기준 |
|---|---|
| 로컬 실행 | Windows x64, 패키지 Node v24.16.0, CurrentUser DPAPI |
| 일반 서버 | Node.js 24 + Express 5.2.1. Dockerfile.history는 Node 24.21.0 이미지 고정 |
| 클라우드 | Supabase Edge Functions의 `history`, PostgreSQL 17.6 배포 확인 |
| UI | React 19.3.0, Material UI 9.4.0 / Emotion, TypeScript 7.0.2, Vite 8.3.0, TanStack React Query 5.103.1 |
| DB 드라이버 | pg 8.23.0, PostgreSQL jsonb·advisory lock·부분 unique index |
| 인증 | jose 6.2.12의 ES256 JWT, hash-wasm 4.12.0의 Argon2id |
| MCP | SDK 1.30.0, Streamable HTTP |
| Agent adapter | 저장소 고정 검사값 Codex 0.154.0 / Claude 2.1.276. 다른 버전은 재검증 필요 |
| Office 뷰어 | `@extend-ai/react-docx` 0.9.2 / react-pptx 0.2.1 / react-xlsx 0.16.4 |
| Markdown | marked 18.0.13 + DOMPurify 3.4.15, 로컬 번들 |

현재 패키지의 개인 Agent·MCP 설치·로그인은 포함되지 않는다. 공용 DB나 Docker도 팀원 PC 설치 구성에 포함되지 않는다. 개발·격리 검증에는 별도 Docker가 필요하다.

## 3. 로컬 설정

설정 화면의 기본 탭은 **개인 연결**이다. 메일, AI 도구·실행 장치, ERP 읽기 자료, 저장·실행 순서로 안내한다. 출처·장치 등록 입력은 각 단계에 있고, 공유·장치 관리 및 중단 작업 복구는 별도 탭이다. 비밀번호 변경은 설정 하단 접힘 영역에 있다. 로그아웃은 상단 바 오른쪽에 있으며 모바일 메뉴가 닫혀 있거나 최초 비밀번호 변경 중에도 사용할 수 있다.

`GET /api/settings`의 선택적 `environment`에는 Mail MCP 주소 설정 여부, 설정된 Agent 종류, 읽기 자료 경로 개수, DB provider 연결 여부만 반환한다. 주소·실행 경로·자격은 반환하지 않으며 메일·AI에 진단 요청을 보내지 않는다. UI는 설정 존재와 실통신 성공을 구분한다. 선택을 바꾸면 이전 실행 상태를 무효화하고 저장 전 실행 및 공유 변경을 막는다. 실행을 켜려면 저장 후 실행 상태도 다시 확인해야 한다.

설정 위치는 `<TRIAGE_LOCAL_HOME>/config/settings.json`이다. 전체 예시는 [개발 안내](guides/development.md)에 있다.

| 키 | 형식·기본값 | 의미 |
|---|---|---|
| `localPort` | 1024~65535, 기본 3080 | 후보 예시는 43180 |
| `historyUrl` | HTTPS 공용 API base URL | Supabase에서는 함수 경로까지 포함 |
| `auth.mode` | `username` | 현재 유일한 실행 인증 모드 |
| `auth.issuer` | HTTPS URL | 서버 JWT issuer와 정확히 일치 |
| `auth.audience` | 문자열 | 서버 JWT audience와 일치 |
| `mailMcpUrl` | 선택 URL | HTTPS 또는 `http://127.0.0.1`; 사용자정보·query·fragment 금지 |
| `agents.codex/claude` | `{executable, prefix?}` | 실행 파일 경로, prefix 최대 5개 |
| `evidenceRoots` | 이름→절대 경로 또는 `{path, files}` | 기본 `{}`. 허용 자료 경로만 명시 |

이전 Auth0 `clientId`·`refreshMode`·회사 도메인 설정을 현재 `auth`에 추가하지 않는다. 현재 스키마는 알 수 없는 auth 키를 거절한다. `dbMcpUrl` 키나 자유 SQL 설정도 제공하지 않는다.

## 4. 서버 설정

| 키 | 용도 |
|---|---|
| `DATABASE_URL` 또는 `DATABASE_URL_FILE` | 서버 전용 PostgreSQL runtime 접속. 실제 비밀은 Git 밖에 보관 |
| `HISTORY_SCHEMA` | Supabase `triage_private`. schema는 migration 전에 준비 |
| `HISTORY_POOL_MAX` | 기본 8, 현재 Edge 2 |
| `HISTORY_DB_CA_BASE64` | 공식 CA PEM의 base64. 설정 시 CA·호스트 검증 유지 |
| `AUTH_ISSUER`, `AUTH_AUDIENCE`, `TEAM_ID` | 앱 인증·팀 식별 |
| `AUTH_SIGNING_JWK` | Edge의 비공개 ES256 JWK JSON |
| `AUTH_SIGNING_KEY_FILE` | 일반 Node 서버의 비공개 JWK 파일 경로 |
| `PORT`, `HISTORY_BIND` | 일반 Node 기본 3081, 127.0.0.1. Edge 실행값과 구분 |

CA를 지정할 때 URL의 `sslmode`는 생략하거나 `verify-full`이어야 한다. 약한 모드·SSL 덮어쓰기 옵션은 거절한다. `verify_jwt=false`는 Supabase 기본 JWT 검사를 대신해 앱의 자체 JWT·DB 세션 검사를 사용하기 위한 설정이다. 인증을 제거했다는 의미가 아니다.

## 5. 코드에 고정된 제한

| 항목 | 값·행동 | 근거 |
|---|---|---|
| 사용자명 | 3~32 ASCII 문자, 영문 시작, 영문/숫자/`_.-`, 소문자 정규화 | `password.ts` |
| 비밀번호 | 최소 12 JS 문자열 길이, UTF-8 최대 128 bytes | `password.ts` |
| 해시 | Argon2id m=19456 KiB, t=2, p=1, 16-byte salt | `password.ts` |
| access token | 5분 | `username-auth.ts` |
| 일반/첫 변경 세션 | 30일 / 10분, 서버 상태를 매 요청 확인 | `username-auth.ts` |
| 임시 비밀번호 | 24시간 유효, 첫 변경 필수 | `username-auth.ts` |
| 로그인 제한 | 15분 창, 이름 bucket 10회·전체 300회. 실패만 세는 값이 아님 | `username-auth.ts` |
| 로컬 ticket·cookie | ticket 60초/1회, 브라우저 세션 8시간 | `browser-app.ts` |
| 분석 동시성 | Runner당 1개, 팀당 2개, 메일당 queued/running 1개 | `runs.ts`, baseline SQL |
| 분석 기한 | 대기 24시간, 실행 최대 30분, lease 120초 | `runs.ts` |
| heartbeat | 기본 30초, 일시 실패 재시도와 lease 기한 적용 | `runner.ts`, `lease-heartbeat.ts` |
| Runner 조회 | local-app에서 기본 5초, idle/실패 backoff 최대 60초 | `runtime.ts`, `scheduler.ts` |
| 서버 호출 | 인증·HistoryClient 기본 timeout 15초 | `username-login.ts`, `history-client` |
| DB | connect/idle 10초, transaction statement timeout 10초 | `db.ts` |
| 공용 JSON | 본문 파서 2 MB | `app.ts` |
| 보고서 | 최대 1,000,000 문자열 길이, evidence 최대 300개 | `schema.ts` |
| 추가 답변·질문 | 각각 최대 20,000 문자열 길이 | `v1.ts`, `schema.ts` |
| 근거 파일 | 파일당 1,000,000 bytes, 파일명/내용·경로 제한 | `evidence.ts` |
| Mail MCP 본문 | 30,000 단위 페이지, 전체 문자열 최대 5,000,000 | `source-client.ts` |
| 첨부 다운로드 | 파일당 최대 5 MiB, 요청 메일·첨부 식별자 재검사 | `attachments.ts` |

이 값은 팀 운영 수용량·가용성 보장이 아니다. Edge CPU·메모리·요금제·제공자 제한은 별도이며 해당 환경의 실측이 필요하다.

## 6. 미구현·운영 대기

지속 대화·명시적 보고서 반영/revision·`expectedVersion` 편집 충돌 처리, 구현 작업 시작·업무 등록부는 미구현이다. 현재 후속 분석과 메일당 활성 분석 제한을 이 기능의 완료로 해석하지 않는다. [계획서 6.1·8절](implementation-plan.md)의 설계와 출시 범위를 따른다.

GitHub Release 배포·인증된 업데이트 조회·stable/test·사용자별 제공/중단·API 호환 검사·다운로드·별도 updater의 버튼 설치는 미구현이다. 현재는 로컬 payload로 수동 설치/업데이트한다. public 우선·private 전환과 서명/복구 계약은 [Release 업데이트 계획](operations/releases.md)에 있으며 완전 자동 설치는 후속 안정화 대상이다.

공용 웹 접속, PC 종료 후 원격 실행, 실제 ERP DB provider, SR 코드 수정·빌드·PR 발행, 팀원용 간편 설치도 미완료다. 백업·2PC 업무 수용·장기 관찰은 별도이며 백업은 사용자 요청으로 보류 중이다. 자동 merge·운영 배포·ERP DB 쓰기는 후속 미완료 기능이 아니라 제외 범위다. 외부 플랫폼 변경만으로 이 항목들이 해결되지는 않는다.
