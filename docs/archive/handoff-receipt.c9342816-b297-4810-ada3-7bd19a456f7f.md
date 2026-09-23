# mail-triage-web 인수 확인 결과

> 2026-09-16 인수 당시 결과를 보존한 역사 문서다. 인수 확인은 전체 구현 완료가 아니며 현재 범위와 단계는 [통합 구현 계획](../implementation-plan.md)을 따른다.

- 요청 ID: c9342816-b297-4810-ada3-7bd19a456f7f
- 확인일: 2026-09-16 18:28 KST
- 결과: 인수 확인 완료. succeeded는 이번 인수 확인의 완료이며 전체 구현 계획이나 백로그 완료를 뜻하지 않는다.
- 후속 작업 위치: C:/Users/david/IdeaProjects/mail-triage-web

## 인수 기준과 소유권

AGENTS.md, docs/implementation-plan.md, docs/work-summary.md, docs/validation.md, README.md 및 요청서를 읽었다. 기존 계획서와 검증 기록을 기준으로 이 프로젝트에서 이후 개발을 이어받는다. 계획서를 재작성하거나 erp-manager 사본을 만들지 않았다.

ERP 코드와 ERP DB는 읽기 전용이다. 메일 발송/삭제/읽음 처리, 웹 Worker의 자동 sync/Outlook/Claude·Orca 리뷰는 포함하지 않는다. 직접 실행의 기존 리뷰 흐름과 공용 이력 등록 계약을 유지한다. 비밀/메일 원문/.runtime 캡처를 커밋하지 않는다.

## 이번에 직접 확인한 상태

- mail-triage-web은 master의 최초 커밋 전 상태이며 프로젝트 파일은 미추적이다. commit/push를 수행하지 않았다.
- Docker 조회: API와 PostgreSQL, mail MCP, DB MCP가 healthy이며 Worker는 running이다. Worker의 업무 분석 완료나 현재 ready 여부까지 검증한 것은 아니다.
- http://localhost:3080/health 는 HTTP 200 및 {"ok":true}, 웹 루트는 HTTP 200이다. health 구현은 이력 DB SELECT 1을 수행한다.
- API는 127.0.0.1:3080에 게시되어 있다. Compose에서 ERP/reference/auth seed 마운트의 read_only 설정을 확인했다. 실행 중 마운트 속성을 별도로 재검증한 것은 아니다.
- API와 Worker의 이미지 ID는 다르며 Worker가 더 먼저 기동된 상태다. 문서의 API 최신 반영/Worker 초기 기동 유지 설명과 부합한다. 소스와 실행 이미지 전체의 일치 여부는 재검증하지 않았다.
- erp-manager: 공용 스킬/명령, .gitignore, erp-nav 수정과 shared-history.md/triage-history.mjs 미추적 상태를 확인했다.
- mail-mcp: main이 origin/main보다 1커밋 앞서 있으며 HTML 관련 파일은 미커밋 상태다. .gitattributes는 AM, gradlew는 수정 상태로 기존 변경을 보존했다.
- erp-manager/.claude/settings.local.json은 존재하며 현재 Git 제외 대상이다. 문서의 미추적 표현과 달리 일반 status에는 표시되지 않는다. history.local.json도 제외 대상이다.
- 프로젝트 .env 및 Codex auth.json의 존재만 확인했다. 내용은 열거나 복사하지 않았다. .env/.runtime/dist/node_modules의 Git 제외를 확인했다.
- scripts/verify-ui.mjs는 여전히 '#detail pre'만 기다리며 public/mail-body.js는 '.mail-body'를 생성한다. 선택자 보완이 필요하다는 인계 사항을 정적 확인했다. 스크립트를 실행하여 최신 실패를 재현한 것은 아니다.

## 인수한 구현과 기존 검증 기록

다음은 문서에 기록된 구현/검증이며 이번 인수에서 전체 재실행한 결과가 아니다.

- Docker 웹/API/Worker, 공용 PostgreSQL 이력, 직접 CLI 연동, 불변 보고서/리뷰/재분석, lease/heartbeat와 요청 멱등성.
- 메일 검색/목록/본문, 분석과 파란 이력 버튼, HTML/CID 원래 위치 표시, 실패 재시도와 텍스트 대체.
- 기본 접힘 첨부 목록, 클릭/Enter/Space 조작, 파일명/형식/크기/다운로드. 다운로드 5 MiB 한도 및 초과 파일 목록 유지. ZIP 내부/Office 내용 미리보기는 확정 범위에 없다.
- 전체 웹 테스트 14개 및 실제 브라우저 본문 이미지/다운로드/모바일/접힘 검증 통과 기록을 인수했다. 실제 다운로드는 첨부 1건 바이트 일치, 네 문서 확장자의 UI 검증은 합성 응답이었다.
- MCP/Codex/ERP 파일 읽기 연결과 합성 자료 기반 공유 이력 검증을 인수했다. 이는 실제 고객 메일 전체 분석부터 보고서 저장까지의 종단 검증과 구분한다.

## 남은 작업과 다음 순서

1. scripts/verify-ui.mjs의 본문 대기 조건을 HTML '.mail-body'와 텍스트 대체 표시 모두에 맞게 보완하고 UI 검증한다.
2. 사용자가 지정한 메일 한 건으로 Worker 전체 분석 → 근거 검토 → 보고서 저장 → 웹/직접 CLI 양쪽 이력을 검증한다. 이번 요청에는 대상 메일이 없으므로 임의로 선정하지 않았다.
3. 실제 POP3 sync와 중단/재시작/lease 복구를 검증한다. 단순 연결 성공과 원본 신규 수집을 구분한다.
4. 과거 Markdown 이력의 읽기 전용 preview, 출처/해시 기반 중복 방지와 확실한 식별자 연결을 구현한다. 불확실한 이력은 legacy로 보존한다.
5. Outlook 단건 예외 식별/등록, 지식 제안 단일 반영기와 원본 버전/해시 대조를 완성한다.
6. 별도 테스트 DB/볼륨에서 백업 복원·강제 중단을 검증하고 공용 전환 대조를 수행한다.

취소 UI, 상세 진행 표시, 다중 사용자 인증/HTTPS는 후속 확장 사항이다. 다운로드 한도 확대나 외부 공개는 이번 확정 범위가 아니다.

## 이번 실행 범위와 도구 제한

문서/소스 일부/Git 상태/컨테이너 상태와 HTTP health만 읽기 전용으로 확인했다. 고객 메일 조회·분석, POP3 sync, 이력 이관, 재초기화, 서비스 재시작/재빌드, 전체 테스트 및 브라우저 검증은 실행하지 않았다. 기존 코드와 세 저장소의 변경은 보존했다. 이번 작성 대상은 인수 결과 초안과 완료 도구가 발행하는 결과 파일이다.

Docker 및 외부 저장소 상태 확인은 초기 샌드박스 접근 제한 후 승인된 읽기 전용 승격으로 완료했다. orca skills get orca-cli --json은 'orca'를 실행 가능한 명령으로 인식하지 못해 실패했으며 다른 CLI로 대체하지 않았다. 요청된 handoff 완료 스크립트의 --complete 경로는 Orca RPC/CLI 호출 전에 파일로 결과를 확정하도록 구현되어 있어 요청서의 명령을 그대로 사용한다. 완료 증거는 해당 명령이 발행하는 completion.json의 요청 ID/상태/바이트 수/SHA-256이다.