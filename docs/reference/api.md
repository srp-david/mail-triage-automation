# API 계약

현재 계약 버전은 `1`이다. 완전한 OpenAPI 생성물이 아니라 실제 route와 핵심 입력·권한·재시도 규칙의 안내다. 필드의 최종 검증은 연결한 Zod/도메인 코드를 따른다.

## 1. 주소와 인증

| 구분 | 주소·호출자 | 인증 |
|---|---|---|
| 공용 API base | Supabase `https://PROJECT.supabase.co/functions/v1/history` 또는 일반 Node 서버 | 서버 간 요청. `/auth`와 `/api/v1` 아래 계약 헤더 |
| 자료 API | base + `/api/v1/...` | `X-Contract-Version: 1`, `Authorization: Bearer <access token>` |
| 인증 API | base + `/auth/...` | 계약 헤더, 경로별 비밀번호·refresh 또는 Bearer |
| Runner 호출 | claim/heartbeat/progress/result/recover 및 sync 실행 경로 | 사용자 인증 + `X-Device-Credential` + 경로별 lease |
| 로컬 UI API | `http://127.0.0.1:<port>/api/...` | 로컬 cookie, 쓰기 시 Origin·CSRF, 앱의 서버 세션 |
| 로컬 제어 | browser-ticket/app-stop/CLI 요청 | DPAPI 제어 자격과 `X-Local-Client: 1` 등 검사 |

공용 API는 Origin·cross-site·브라우저 navigation 요청을 거절한다. 웹 프론트에서 공용 서버를 직접 fetch하는 구성이 아니다. `HistoryClient`가 base URL과 `/api/v1`을 조합하므로 `historyUrl`에 `/api/v1`을 중복해서 넣지 않는다.

## 2. 인증·계정

| 메서드·경로 | 입력·결과 |
|---|---|
| `GET /health/live` | 인증 없이 프로세스 응답 확인 |
| `GET /health/ready` | 인증 없이 DB의 username migration 준비 여부 확인, 실패 503 |
| `POST /auth/login` | `{username,password}` → access/refresh, expires_in, subject, mustChangePassword |
| `POST /auth/refresh` | `{refresh_token}` → 새 access/refresh. 사용한 토큰 재사용 시 세션 폐기 |
| `POST /auth/logout` | `{refresh_token}` → 서버 세션 폐기 |
| `GET /auth/me` | Bearer → userId, role, mustChangePassword. 첫 변경 제한 세션 허용 |
| `POST /auth/password` | Bearer + `{currentPassword,newPassword}` → loginRequired |
| `GET /api/v1/me` | 현재 인증 주체 |
| `GET /api/v1/admin/users` | 팀 관리자 전용 계정 목록 |
| `POST /api/v1/admin/users` | `{username,displayName,role}` → id·username·일회성 임시 비밀번호 |
| `POST /api/v1/admin/users/:id` | `{displayName,role,active}`. 세션 폐기, 마지막 활성 admin 보호 |
| `POST /api/v1/admin/users/:id/reset` | 새 임시 비밀번호, 세션 폐기·첫 변경 필수 |

공개 가입·HTTP bootstrap은 없다. 최초 계정·기존 UUID 매핑·관리자 분실 복구는 [운영자 절차](../operations/supabase.md)를 따른다. 계정 영구 삭제 API는 제공하지 않는다.

## 3. 출처·장치·공유

`/api/v1` 기준 경로다.

| 메서드·경로 | 기능 |
|---|---|
| `GET /members`, `GET /sources`, `GET /runners` | 팀 구성원, 접근 가능한 출처, 본인 장치 |
| `POST /sources` | `{instanceId,displayName}`로 원본 출처 등록 |
| `POST /sources/:id/grants` | 소유자가 `{userId,permission: read|write|none}` 지정 |
| `POST /runners` | `{requestId,displayName,agents,sourceIds}` → id와 최초 장치 credential |
| `POST /runners/:id/revoke` | 본인 장치 비활성화 |
| `POST /users/:id/disable` | 팀 관리자의 사용자 비활성화 경로. 현재 관리 UI는 admin/users 경로도 사용 |
| `GET/POST /collections` | 기존 문서 collection 조회·생성 |
| `POST /collections/:id/grants` | collection 공유 권한 |
| `GET/POST /collections/:id/documents` | 권한 있는 문서 조회·명시적 import |

Runner 등록 응답에서 받은 credential은 로컬 보호 저장소에만 보관한다. 등록 응답을 잃은 경우 같은 requestId는 `REGISTRATION_ALREADY_EXISTS`다. 기존 비밀을 재발급하는 멱등 응답으로 가정하지 않는다.

## 4. 분석 작업

공용 `POST /api/v1/runs` 입력의 예시다. 아래 UUID·메일은 합성 placeholder이며 실제 작업 명령이 아니다.

```json
{
  "sourceId": "00000000-0000-4000-8000-000000000001",
  "mailId": 123,
  "messageId": "<sample@example.invalid>",
  "subject": "지정 사례",
  "requestId": "00000000-0000-4000-8000-000000000002",
  "runnerId": "00000000-0000-4000-8000-000000000003",
  "agent": "codex",
  "executorKind": "local",
  "verifiedAt": "2026-09-22T00:00:00.000Z"
}
```

추가 분석은 선택 필드 `parentId/answer`를 사용한다. `verifiedAt`은 실제 원본 재조회 시각으로 현재 기준 5분 이내여야 한다. 같은 requestId에 다른 입력이나 요청자는 충돌한다.

| 메서드·경로 | 기능 |
|---|---|
| `GET /runs?sourceId=...&offset=...&mailId=...&query=...` | source 범위 이력 검색 |
| `GET /runs/:id` | 보고서·리뷰·관련 메일 등 상세 |
| `POST /runners/:id/claim` | `{requestId}` → 작업 lease. 작업 없으면 204 |
| `POST /runs/:id/heartbeat` | lease → 갱신 기한·취소 요청 상태 |
| `POST /runs/:id/progress` | lease + event → 진행 기록 |
| `POST /runs/:id/result` | lease + requestId + result → 불변 결과 저장 |
| `POST /runs/:id/fail` | lease + 실패 코드 |
| `POST /runs/:id/cancel` | 권한 있는 사용자 취소 |
| `POST /runs/:id/recover` | 완료 입력 + verifiedAt/messageId → 별도 복구 결과 |
| `GET /runs/:id/export` | 리뷰 포함 Markdown, `X-Report-SHA256` |

lease는 `{runnerId,leaseToken,generation}`이다. 토큰을 로그나 URL에 넣지 않는다. claim 재전송과 result 재전송의 동작은 [복구 흐름](../workflows.md)에 있다.

결과는 `{outcome,project,report,question,knowledge,evidence}`다. outcome은 `completed/needs_input`, project는 `gg/gg-fac/d-code/unknown`, evidence 항목은 `{kind,reference,verified}`다. `needs_input`이면 비어 있지 않은 question이 필요하다. reportHash는 원 보고서, export 응답 hash는 리뷰를 포함한 전체 본문을 가리킬 수 있으므로 구분한다.

## 5. 리뷰·메일 연결·기존 문서

`POST /runs/:id/reviews`, `/handling`, `/related-mails`, `/related-mails/:linkId/unlink`가 리뷰·업무 처리·관련 메일을 관리한다. `/handling` 입력은 `{completed:boolean}`이다.

`POST /sources/:id/mail-analysis`는 `{mailIds}`의 상태 요약이다. `GET/POST /sources/:id/thread-links`, `POST .../detach`, `POST .../:linkId/unlink`는 표시용 수동 스레드 관계다. 메일 식별자나 분석 이력을 병합하지 않는다.

`GET /legacy/:id`, `POST /legacy/:id/link`, `GET /sources/:id/mails/:mailId/legacy`는 collection 권한 아래 기존 자료를 조회·연결한다. `POST /knowledge`, `GET /knowledge/:id`는 지식 제안을 다루며 ERP/지식 파일의 자동 적용 API가 아니다.

## 6. 동기화

`POST /sync-runs`로 등록하고 `GET /runners/:id/sync-next`로 대상을 찾는다. `GET /sync-runs/:id`, `GET /sources/:id/sync-latest`로 상태를 확인한다. 실행은 `POST /sync-runs/:id/claim`, `/heartbeat`, `/beginBatch`, `/batch`, 사용자 중지는 `/stop`이다. batch의 수행 여부 불확실과 결과 저장 응답 유실을 구분한다.

## 7. 로컬 API와 CLI

로컬 `/api/runs` 입력은 공용 입력과 다르다. `storeId`에 선택 source UUID를 넣고, 로컬 앱이 메일 원본의 현재 식별자·제목·Runner·Agent를 확인해 공용 계약으로 변환한다. UI가 보내는 필드를 공용 API로 그대로 전달하지 않는다.

`/api/mails`, `/api/mails/:id/body`, `/attachments/...`는 로컬 MCP를 이용한다. 공용 history 서버의 메일 원문 API가 아니다. `/api/settings`, `/api/runtime`, `/api/runtime/start|stop|recovery`가 로컬 선택·실행 상태를 관리한다. `/api/settings/reconnect/preview|apply`는 원본 재연결 대조 경로다.

직접 CLI는 `scripts/history-v1.mjs`로 실행 중 로컬 앱의 제어 채널을 이용한다. CLI 자체에 DB 자격이나 별도 refresh 저장소를 만들지 않는다.

## 8. 오류·재시도

오류 기본 응답은 `{code,message,requestId}`이며 `X-Request-ID`로 서버 로그와 연결한다. SQL·raw stack·비밀을 응답하지 않는다. 400 입력 오류, 401 인증/세션, 403 권한, 404 자료 없음/비공개, 409 계약/상태/중복 충돌, 413 크기, 429 인증 제한, 5xx 처리 실패를 구분한다.

네트워크 실패에서 쓰기 요청을 새 requestId로 다시 보내지 않는다. 멱등 계약이 있는 동작만 같은 입력·ID로 재전송하며, 권한·lease·동기화 불확실은 복구 판단이 필요하다.

근거: [공용 앱](../../apps/history-api/src/username-app.ts), [기본 API](../../apps/history-api/src/app.ts), [run](../../apps/history-api/src/run-routes.ts), [sync](../../apps/history-api/src/sync-routes.ts), [로컬 route](../../apps/local-app/src/ui-routes.ts), [공유 이력](../../apps/history-api/src/shared-history-routes.ts), [기존 문서](../../apps/history-api/src/shared-archive-routes.ts).

## 9. 아직 제공하지 않는 계약

인증된 업데이트 조회·설치 전 정책 재확인·로컬 다운로드/updater API는 미구현이다. 경로/필드 제안은 [Release 업데이트 계획](../operations/releases.md)에 있으며 위 현재 API 목록에 포함하지 않는다. 구버전 앱의 인증/업데이트 탈출 경로와 새 API 호환 정책을 함께 구현해야 한다.

지속 대화·명시적 보고서 반영·`expectedVersion` 저장, 구현 작업 시작/업무 등록부도 미구현이다. [통합 계획](../implementation-plan.md) 6.1절과 8절에 따라 보고서 revision 충돌과 요청 멱등성, 업무 단위 활성 작업 제약을 각각 설계한다. 기존 `/runs`의 추가 답변·메일 분석 잠금으로 이 계약을 대신하지 않는다.
