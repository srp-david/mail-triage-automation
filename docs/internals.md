# 내부 구조와 코드 탐색

현재 구현의 책임 분리와 수정 위치를 설명한다. 실행 배치는 [아키텍처](architecture.md), 상태 전이는 [주요 흐름](workflows.md)에 있다.

## 1. 저장소 지도

```text
apps/
  history-api/src/        공용 API·인증·권한·작업·보고서
  history-api/migrations/ 버전별 PostgreSQL migration
  local-app/src/          PC 진입점·브라우저 세션·MCP·CLI·실행 연결
packages/
  contracts/src/         요청·결과 스키마, 오류·HTTP 로그 계약
  history-client/src/    공용 API 클라이언트와 URL 규칙
  runner/src/            분석·동기화 큐 처리와 lease·outbox
  agent-adapters/src/    개인 CLI 프로세스와 읽기 근거 도구
  skills/                패키지에 포함할 분석 규칙
  ui/ui/                 React 메인 화면
  ui/viewer/             Office·Markdown 뷰어 빌드
installer/windows/       패키지 검증·설치·진단·실행·정상 종료
deploy/                  서버·Supabase 설정 예시와 권한 SQL
supabase/                Edge 설정과 로컬 검증 함수
src/                     기존 v0 및 공유·호환 모듈
scripts/                 빌드·패키지·운영자·검증 도구
test/                    단위·계약·통합 검사
public/                  정적 자산과 빌드 출력 위치
```

`src` 전체가 불필요한 이전 코드인 것은 아니다. v1도 기존 보고서·메일 관련 로직과 baseline migration을 재사용한다. `build-compat.mjs`는 기존 dist import 경로를 유지한다. 폴더 이름만 보고 제거하지 않는다.

## 2. 공용 API

| 코드 | 역할 |
|---|---|
| [main.ts](../apps/history-api/src/main.ts), [username-main.ts](../apps/history-api/src/username-main.ts) | Node 서버 진입, 명시적 migration, schema 확인, 키 파일 읽기 |
| [edge.ts](../apps/history-api/src/edge.ts) | Edge 경로 prefix·환경변수 키로 같은 앱 생성. 시작 시 migration 없음 |
| [username-app.ts](../apps/history-api/src/username-app.ts) | 인증·관리자·디렉터리·작업·공유 route 조합 |
| [username-auth.ts](../apps/history-api/src/username-auth.ts), [password.ts](../apps/history-api/src/password.ts) | 비밀번호·JWT·refresh·현재 DB 세션·계정 수명 |
| [directory.ts](../apps/history-api/src/directory.ts) | membership/source/장치 권한과 공유·등록 |
| [runs.ts](../apps/history-api/src/runs.ts) | 분석 등록·claim·lease·취소·불변 결과·복구 |
| [source-sync.ts](../apps/history-api/src/source-sync.ts) | 동기화 작업·batch·불확실 결과 관리 |
| [shared-history.ts](../apps/history-api/src/shared-history.ts) | 권한 있는 보고서·리뷰·처리 상태·관련 메일 |
| [shared-archive.ts](../apps/history-api/src/shared-archive.ts) | collection별 기존 문서·연결·지식 제안 |
| [db.ts](../apps/history-api/src/db.ts), [db-connection.ts](../apps/history-api/src/db-connection.ts) | pool, 트랜잭션 schema, CA/TLS 옵션 |
| [migrations.ts](../apps/history-api/src/migrations.ts) | SQL checksum ledger, 중복 적용·변조 거절 |

route 모듈은 입력을 검증하고 도메인 메서드를 호출한다. 주요 쓰기는 트랜잭션 안에서 현재 권한과 작업 식별자를 다시 검사한다. schema 범위 advisory lock을 여러 작업에서 공유하므로 대규모 병렬 부하를 검증한 설계로 해석하지 않는다.

## 3. 로컬 앱

| 코드 | 역할 |
|---|---|
| [main.ts](../apps/local-app/src/main.ts) | settings 검증, 세션·클라이언트·profile·runtime 조립, loopback bind |
| [browser-app.ts](../apps/local-app/src/browser-app.ts) | 로컬 cookie/CSRF/CSP, ticket, 로그인·비밀번호·로그아웃, 제어 요청 |
| [session.ts](../apps/local-app/src/session.ts), [username-login.ts](../apps/local-app/src/username-login.ts) | 서버 인증 호출, 토큰 보존과 단일 refresh 처리 |
| [protected-store.ts](../apps/local-app/src/protected-store.ts) | Windows CurrentUser DPAPI·디렉터리 ACL |
| [profile.ts](../apps/local-app/src/profile.ts) | 사용자별 source/Runner 선택, 장치 등록, 원본 재연결 대조 |
| [ui-routes.ts](../apps/local-app/src/ui-routes.ts) | UI API를 로컬 원본 조회와 공용 이력 API로 분배 |
| [source-client.ts](../apps/local-app/src/source-client.ts) | Mail MCP 연결·페이지별 전체 본문·첨부·동기화 |
| [runtime.ts](../apps/local-app/src/runtime.ts) | 분석/sync loop의 명시적 시작·중지·복구 |
| [executor.ts](../apps/local-app/src/executor.ts) | 메일 식별 재검증, 추가 답변 맥락, Agent 실행과 임시 폴더 정리 |
| [cli.ts](../apps/local-app/src/cli.ts), [control-client.ts](../apps/local-app/src/control-client.ts) | 직접 CLI 명령과 실행 중 앱의 인증된 제어 채널 |
| [shutdown.ts](../apps/local-app/src/shutdown.ts) | Runner→HTTP→제어 정보→인스턴스 잠금 정리 |

`LocalRuntime`에 executor가 없으면 분석 시작을 거절한다. `agents` 설정이 비어 있는데 UI만 보인다는 이유로 분석 가능하다고 판단하지 않는다. 분석 loop와 동기화 loop는 별개로 켠다.

## 4. Runner·Agent·공유 계약

- [Runner](../packages/runner/src/runner.ts): 장치당 실행 중복 방지, claim requestId·generation, heartbeat, 결과 receipt/outbox 저장·재전송.
- [Scheduler](../packages/runner/src/scheduler.ts): 반복 조회·backoff·복구 필요 상태. UI가 닫혀도 앱이 살아 있고 loop를 켰다면 동작 가능하다.
- [SyncRunner](../packages/runner/src/sync-runner.ts): 메일 sync batch의 시작·결과 저장. upstream 결과가 불확실하면 무작정 재실행하지 않는다.
- [AgentAdapter](../packages/agent-adapters/src/index.ts): 지원 CLI 버전 검사, 제한된 환경·도구, 프로세스 취소, 공통 결과 검증.
- [evidence.ts](../packages/agent-adapters/src/evidence.ts): 지정 메일·맥락·허용 코드·사전 정의 조회만 제공. Agent에 기존 MCP 전체 도구를 그대로 넘기지 않는다.
- [contracts](../packages/contracts/src/v1.ts): 계약 버전 1, run/lease/result/실패 코드. [resultSchema](../packages/contracts/src/schema.ts)는 v0와 공유한다.
- [HistoryClient](../packages/history-client/src/index.ts): 요청 timeout·헤더·응답 오류를 관리한다.

현재 DB provider는 `LocalExecutor`의 기본 빈 `queries` 상태다. 임의 ERP SQL이나 DB MCP 자동 탐색 기능을 구현된 것으로 문서화하지 않는다.

## 5. UI·설치·로컬 저장

React 화면은 `packages/ui/ui/src`에서 메일·이력·설정·사용자명 인증으로 나뉜다. 공용 UI를 v0와 local-app이 사용하지만 서버 API와 인증 경로는 서로 다르다. TanStack Query 캐시, IME-safe 검색, 헤더 기반 스레드와 수동 링크, Office 미리보기는 기존 검증을 보존한다.

화면은 MUI 9와 Emotion을 사용한다. `theme.ts`는 한국어 글꼴·색상·작은 입력 크기를, `components/Controls.tsx`는 native 이벤트를 보존하는 MUI 입력과 패널을 정의한다. `layout.css`는 분할/반응형 배치만 담당하며 메인 화면은 기존 `public/style.css`를 로드하지 않는다. 메일·Markdown 본문 서식은 `document-content.css`로 분리했다. 스레드 펼침은 MUI `styled`와 native disclosure를 함께 사용한다.

React 메일 연결/해제 드래그는 `@hello-pangea/dnd` 18.0.1의 `DragDropContext`·`Draggable`·`Droppable`로 처리한다. 대화별 영역과 하단 해제 영역 사이의 이동을 기존 `/thread-links` API에 전달하며 정렬 순서는 변경하지 않는다. 마우스·터치·키보드 센서를 사용하고, 키보드는 Space로 시작/놓기, 위아래 방향키로 대상 변경, Escape로 취소한다. 접힌 대화 안의 메일은 드래그 측정 대상에서 제외하고 펼치면 등록한다. 동일 대화·외부 드롭, 다른 저장소나 갱신된 목록에서 끝난 드래그는 쓰기 요청을 만들지 않는다. `DragDropContext`에는 기존 요청별 CSP nonce를 전달한다.

보고서와 첨부 미리보기는 MUI Dialog로 표시한다. 본문 정화·CID 해석과 Office 파서는 유지하며 Markdown 도구, 이미지 재시도, XLSX 시트/확대·축소 제어도 MUI로 표시한다. `packages/ui/security.ts`는 HTML 응답에 요청별 CSP nonce를 주입한다. Windows 패키지는 이 서버 모듈도 포함해야 한다. `scripts/verify-mui-ui.mjs`는 합성 local-app 로그인·설정·관리자·IME·nonce·모바일 회귀를 검사한다.

| 설치 경로 | 내용·갱신 방식 |
|---|---|
| `releases/<version>` | manifest 해시 검증 대상 코드·Node·의존성·UI. 같은 버전의 다른 내용을 덮어쓰지 않음 |
| `active.json` | 활성·직전 버전. 설치 진단 성공 후 전환 |
| `staging` | 해당 설치 시도만의 임시 복사 경로 |
| `config/settings.json` | 연결·Agent·자료 경로. 서버 비밀을 넣지 않음 |
| `secrets` | DPAPI 세션·장치 자격·개인 선택·로컬 제어 정보 |
| `work` | DPAPI 작업 receipt·저장 결과·재전송 상태 |
| `scratch` | 작업별 근거 도구 설정·규칙. 실행 후 해당 임시 경로 정리 |
| `logs` | 설치 홈에 마련한 폴더. 모든 로그가 자동 수집되는 것은 아님 |

시작 도구는 현재 자식 앱의 stdio를 무시한다. HTTP 오류 로거는 stderr에 쓰므로 자동 파일 로그가 있다고 가정하지 않는다. 실제 수집은 실행 방식별로 구성해야 한다.

## 6. 수정 시 함께 확인할 위치

| 변경 | 함께 확인 |
|---|---|
| 인증·역할 | username-auth, directory, LocalSession, 사용자 UI, auth/session 검사 |
| 분석 등록·결과 | contracts, runs, HistoryClient, Runner, resultSchema, 계약·복구 검사 |
| MCP·자료 | source-client, LocalProfile, evidence, AgentAdapter, 경로·원본 식별 검사 |
| 설치·실행 | release/lifecycle/diagnose, package-windows, DPAPI·installer 검사 |
| DB schema | baseline/버전 SQL, ledger, private-grants, 격리 migration·복원 검사 |

검증과 실행 명령은 [개발 안내](guides/development.md), 데이터 관계는 [데이터 모델](reference/data-model.md)을 본다.
