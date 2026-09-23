# mail-triage-web 작업 정리 및 후속 작업
작성일: 2026-09-16
작업 소유권: erp-manager에서 시작한 구현을 mail-triage-web 프로젝트의 Codex로 이전한다.
이 문서는 인계·작업 당시의 기록이다. 2026-09-17 문서 통합 이후 앞으로의 작업·기술 선택·단계는 [통합 구현 계획](../implementation-plan.md)에서만 관리한다. 구현·검증 근거는 [검증 기록](../validation.md), 전체 문서는 [문서 안내](../README.md)를 따른다. 아래의 현재/미완료/다음 순서는 기록 당시 기준이다.

## 작업 당시 요약 — viewer 이후 계획서 후속 구현

- 2026-09-17 연속 동기화 구현: 정상 partial은 100개씩 계속 처리하고 3,000개 제한을 제거했다. DB에 실행을 먼저 저장하고 API 내부 스케줄러가 묶음별로 처리한다. 중지/일시 중지/명시적 이어받기, API 재시작 복구, 5·15·30초 제한 재시도, 실패·무진행 중단, 진행률/목록 갱신을 추가했다. 3,200개 합성 수집을 포함한 통합 테스트 30개, 브라우저 UI 및 별도 프로세스 종료/DB 재시작 복구 검증 통과. 실제 전체 수집은 실행하지 않았다. 팀 다중 API/서버리스용 처리기 분리는 계획으로 유지한다.
- 2026-09-17 동기화 후 목록 갱신 누락 수정. 10초 폴링에서 running을 관측한 경우에만 갱신하던 조건을 실행 ID/종료 결과 비교로 바꿨다. 버튼 직후 빠른 완료와 폴링 간 완료, 다른 탭의 동기화도 감지한다. 검색 조건/선택 상세는 유지하고 목록은 첫 페이지로 이동한다. 부분 실패 후 저장된 메일 조회와 목록 실패 재시도, POST 중 버튼 비활성화도 포함한다.
- 2026-09-17 메일 목록에 분석 배지 추가. 웹/직접 공용 이력의 완료가 있으면 초록색 `✓ 분석 완료`, 최신 대기/진행/확인 필요/실패 상태는 별도 표시한다. 확정 연결된 과거 보고서는 `이전 이력 N건`으로 구분한다. 목록의 MCP ID들을 현재 저장소 기준 한 번에 집계하며 기존 목록을 다시 만들지 않고 10초마다 갱신한다.
- 2026-09-17 Markdown viewer: 분석 보고서·업무 지식 제안·리뷰·이전 문서를 제목/표/목록/코드 서식으로 표시하고 원문 보기/문서 보기 전환을 제공한다. 원문·export·DB 내용은 유지한다. HTML은 문자로 표시하고 자동 이미지 요청을 막으며 HTTP(S) 링크만 허용한다. 로컬 번들, 모바일 표/코드 가로 스크롤과 합성 보안/기존 UI 검증 완료.
- 2026-09-17 화면 개선: 메일함/분석 이력/이전 이력 메뉴를 분리하고 메일별 이력 버튼은 레이어를 연다. 보고서/이전 문서도 레이어에서 읽고 목록 복귀·닫기/Escape를 제공한다. 검색·메일 선택·배경 스크롤 유지, 100건 추가 조회, 오류 재시도·늦은 응답 무시·인증 만료·모바일 및 Office 회귀 검증을 추가했다. Auth0/팀 권한은 별도 계획 단계다.

- API/Worker 배포 완료. Office viewer와 기존 메일 UI 유지, 이관 문서 조회/긴 경로 모바일 줄바꿈 추가.
- 기존 보고서 32건과 로그 1건을 읽기 전용 preview 후 공용 DB에 보존. 33건 원본 내용/SHA-256 일치, 재가져오기 신규 0건. 연결 미확정 상태를 그대로 유지한다.
- 실제 동기화 버튼으로 저장 3건, 실패 0건, 남음 0건. UI에서 최종 건수와 이관 33건 확인.
- Outlook 예외 등록/직접 실행 CLI, 검토한 보고서 해시 기반 export, 지식 제안 prepare/apply, Worker 실패 결과 재등록 도구 추가. 실제 Outlook 고객 분석/업무 지식 적용은 수행하지 않았다.
- API 중단 시 대기 작업을 시작하지 않는 Worker gate, 잠금 연결 소실 시 Worker 종료, DB 연결 오류 처리, 서비스 재시작 정책 추가.
- DB 통합 테스트 22개, 합성 Office/운영 UI 검증, 격리된 백업/복원·강제 종료·DB 재시작 복구 통과. 실제 Codex 전체 분석의 장애 재현과는 구분한다.
- 첫 테스트 중 새 Compose 재시작 설정 때문에 기존 DB 컨테이너가 재생성되고 이전 API/Worker가 종료됨. 볼륨을 보존한 채 재기동했으며 이후 테스트는 `--no-deps` 또는 격리 프로젝트에서 수행했다.
- 상세 사용법: [운영 도구](../operations/legacy-maintenance.md). 결과 manifest/receipt/화면 캡처는 Git 제외 `.runtime/`에 보존한다.
- erp-manager의 공용 이력 계약 문서를 새 도구에 맞게 갱신했다. 현재 앱 이력 DB 백업은 `.runtime/triage-after-maintenance-20260916.dump`에 보존했다. 실제 백업의 복원 검증과 합성 복원 검증은 구분한다.

2026-09-17 후속 검증: 사용자가 제목으로 지정한 메일을 MCP ID 1130으로 확정했다. 실제 웹 버튼→Worker 분석→보고서 저장→직접/웹 조회 및 핵심 근거 대조를 완료했다(약 5분 11초). 누락된 기존 처리 로그를 Worker에 읽기 전용으로 연결했고, 원본 처리 상태와 이번 보고서 분류도 대조했다. 결과 사본은 `.runtime/worker-e2e-1130-report.md`, 검증 JSON은 `.runtime/worker-e2e-1130-validation.json`이다. 남은 것은 메일별 과거 이력 연결과 최종 공용 전환이다. 원본 문서와 기존 완료 상태는 보존한다. 커밋/푸시는 수행하지 않았다.

## 먼저 읽을 파일
- 최신 계획: [implementation-plan.md](../implementation-plan.md) — 공용 이력 API·PostgreSQL, 회사 이메일 인증, 팀원별 로컬 실행과 설치 프로그램. 이전 중앙 실행형 제안은 [역사 자료](team-deployment-proposal-2026-09-17.md)에 보존한다.
- 계획서: C:/Users/david/IdeaProjects/mail-triage-web/docs/implementation-plan.md
- 검증 기록: C:/Users/david/IdeaProjects/mail-triage-web/docs/validation.md
- 실행 안내: C:/Users/david/IdeaProjects/mail-triage-web/README.md
- 프로젝트 규칙: C:/Users/david/IdeaProjects/mail-triage-web/AGENTS.md

## 사용자 확정 요구사항
1. erp-manager와 별도 프로젝트인 Docker 웹 앱으로 운영한다.
2. mail MCP와 DB MCP를 모두 사용한다. ERP 코드와 ERP DB는 읽기 전용이다.
3. erp-manager 직접 mail-triage 실행과 웹 분석은 공용 API/PostgreSQL 이력을 공유한다.
4. 웹 분석에서는 Orca/Claude 2차 리뷰를 실행하지 않는다. 직접 실행의 기존 리뷰 흐름은 유지한다.
5. 웹의 동기화 버튼은 AI 없이 mail MCP sync를 호출한다. 분석이 자동 동기화하지 않는다.
6. 본문 이미지는 CID 연결을 이용해 문단·인용문 안의 원래 위치에 표시한다.
7. '이 메일 분석 이력' 버튼은 '이 메일 분석' 옆이며, 분석은 초록색·이력은 파란색이다.
8. 첨부는 목록·다운로드를 기본 제공한다. 인수 이후 2026-09-16 사용자 추가 요청으로 DOCX/PPTX/XLSX 읽기 전용 미리보기를 추가한다. ZIP 내부 목록은 제외한다.
9. 첨부 목록은 기본으로 접혀 있다. 제목 '첨부파일 · N개'를 클릭하거나 Enter/Space로 펼치고 접는다.
10. 이후 개발은 mail-triage-web 프로젝트에서 진행한다. 커밋/푸시 요청은 없었으며 아직 수행하지 않았다.

## 현재 구조와 실행 상태
- Express/TypeScript API 및 정적 웹, PostgreSQL 17 이력 DB, Codex Worker를 Docker Compose로 실행.
- 웹 주소: http://localhost:3080
- 현재 API/DB/mail MCP 컨테이너 healthy, Worker 컨테이너 실행 중을 인계 준비 시 확인했다. Worker의 실제 업무 분석 완료를 뜻하지 않는다.
- mail MCP: http://host.docker.internal:17082/mcp, db MCP: http://host.docker.internal:17080/mcp (컨테이너 관점).
- mail MCP Host 검증 때문에 API는 loopback 고정 대상 프록시로 Host를 localhost:17082로 전달한다.
- Worker는 Codex 0.154.0, 기본 모델 gpt-6-astra, read-only sandbox와 use_legacy_landlock를 사용한다.
- 기본 bubblewrap는 Docker의 namespace 제약으로 실패했다. Landlock backend는 deprecated이므로 버전 변경 시 실제 파일 접근을 재검증한다.
- Worker가 읽는 마운트: /reference의 ERP 지식/도구/스킬 문서, /erp/gg, /erp/gg-fac, /erp/d-code. 관련 원본 폴더만 선택해 읽기 전용 연결한다.
- /codex 전용 볼륨은 Codex 인증, /work는 실행 산출물, history 볼륨은 DB 이력이다. down -v를 실행하지 않는다.
- .env의 TRIAGE_TOKEN은 setup.mjs가 crypto.randomBytes(32).toString('hex')로 생성했다. 비밀 값은 문서/프롬프트/로그/커밋에 복사하지 않는다.
- .env, erp-manager의 history.local.json, 인증 파일은 로컬 설정이다. 인계는 경로 안내로만 하고 원문을 다른 문서에 넣지 않는다.
- API/DB는 최신 UI 변경까지 반영했다. Worker 컨테이너는 최초 기동 후 유지 중이다. Worker 코드를 변경한다면 별도로 rebuild/recreate가 필요하다.

## 완료한 구현
- 메일 검색/페이지 이동/전체 본문, 동기화 버튼과 상태, 분석 대기열, 이력/보고서, 질문 답변 후 새 분석.
- 실행 멱등성, 같은 메일 동시 실행 방지, lease/heartbeat/만료, 불변 결과, 별도 리뷰, Markdown export.
- 저장소 ID + mail ID를 기본 식별로 사용하며 Message-ID만으로 이력을 병합하지 않는다.
- 직접 CLI와 웹 API의 양방향 이력 공유. 모의 기록은 임시 DB schema에만 만들고 정리했다.
- Worker 최종 JSON 스키마 검증 및 선택한 메일 get_email 성공 이벤트가 있어야 완료 저장.
- 웹 Worker의 sync 도구 비활성화, DB 조회 도구 allowlist, 모델 shell 환경에서 이력 DB/API 비밀 제외.
- HTML/CID 표시: 서버 sanitization + 웹 허용 요소 재생성, 외부 이미지 자동 요청 없음, 중복 CID 임의 연결 없음.
- 이미지 동시 조회 최대 3개. 같은 CID 반복 위치의 재시도는 함께 복구된다. HTML 실패 시 텍스트와 이미지 목록으로 대체.
- 첨부 목록: 파일명/형식/크기, 이미지 포함 전체 첨부, 인증된 원본 다운로드.
- 다운로드는 현재 mail MCP의 5 MiB 한도를 유지한다. 더 큰 파일도 목록에는 표시하고 제한을 안내한다.
- 접기/펼치기: native details/summary, 기본 닫힘, 메일을 다시 열어도 닫힘, 마우스/키보드/모바일 검증.

## 변경 파일과 Git 상태
### mail-triage-web — 이후 기본 수정 대상
새 저장소로 아직 HEAD 커밋이 없다. 아래 파일과 디렉터리는 모두 미커밋이다.
- C:/Users/david/IdeaProjects/mail-triage-web/src/server.ts — 인증, 메일/본문/첨부/다운로드/이력 HTTP API.
- C:/Users/david/IdeaProjects/mail-triage-web/src/history.ts — 공용 실행/결과/리뷰/만료 저장.
- C:/Users/david/IdeaProjects/mail-triage-web/src/migration.sql — 이력/실행/동기화/Worker 테이블.
- C:/Users/david/IdeaProjects/mail-triage-web/src/db.ts — 연결·마이그레이션.
- C:/Users/david/IdeaProjects/mail-triage-web/src/schema.ts — 입력과 분석 결과 검증.
- C:/Users/david/IdeaProjects/mail-triage-web/src/config.ts — 환경 설정.
- C:/Users/david/IdeaProjects/mail-triage-web/src/mcp.ts — MCP 연결, 본문 페이지 수집, 첨부 조회.
- C:/Users/david/IdeaProjects/mail-triage-web/src/mail-proxy.ts — 로컬 mail MCP Host 어댑터.
- C:/Users/david/IdeaProjects/mail-triage-web/src/attachments.ts — 다운로드 응답/ID/원본 검증, 안전한 파일명.
- C:/Users/david/IdeaProjects/mail-triage-web/src/sync.ts — 동기화 배치와 일부 실패 판정.
- C:/Users/david/IdeaProjects/mail-triage-web/src/worker.ts — Codex 실행, 증거/결과 확인, heartbeat.
- C:/Users/david/IdeaProjects/mail-triage-web/src/diagnose.ts — 실제 MCP 연결 진단.
- C:/Users/david/IdeaProjects/mail-triage-web/public/app.js — 화면 동작, 이력 버튼, 다운로드 연결.
- C:/Users/david/IdeaProjects/mail-triage-web/public/attachment-list.js — 기본 접힘 목록과 다운로드 상태.
- C:/Users/david/IdeaProjects/mail-triage-web/public/attachments.js — 이미지 응답/재시도.
- C:/Users/david/IdeaProjects/mail-triage-web/public/mail-body.js — 허용 HTML 요소와 CID 위치 렌더링.
- C:/Users/david/IdeaProjects/mail-triage-web/public/index.html — 화면 구조.
- C:/Users/david/IdeaProjects/mail-triage-web/public/style.css — 반응형/버튼/첨부/본문 스타일.
- C:/Users/david/IdeaProjects/mail-triage-web/Dockerfile — Node/Codex 이미지.
- C:/Users/david/IdeaProjects/mail-triage-web/compose.yaml — API/DB/Worker/tests, 포트 및 읽기 전용 마운트.
- C:/Users/david/IdeaProjects/mail-triage-web/package.json, C:/Users/david/IdeaProjects/mail-triage-web/package-lock.json, C:/Users/david/IdeaProjects/mail-triage-web/tsconfig.json — 의존성/빌드.
- C:/Users/david/IdeaProjects/mail-triage-web/.env.example, C:/Users/david/IdeaProjects/mail-triage-web/.gitignore, C:/Users/david/IdeaProjects/mail-triage-web/.dockerignore — 로컬 설정 예시와 비밀 제외.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/setup.mjs — 최초 로컬 설정 생성. 이미 있으면 보존.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/connect-manager.mjs — 직접 실행 연결 설정.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/verify-codex.mjs — 실제 Codex/MCP/파일 접근 smoke.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/verify-ui.mjs — 초기 UI smoke; 아래 후속 보완 참고.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/verify-images.mjs — 이미지/재시도 회귀 확인.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/verify-inline-images.mjs — 본문 위치/보안/재시도/대체 표시.
- C:/Users/david/IdeaProjects/mail-triage-web/scripts/verify-downloads.mjs — 실제 다운로드/합성 형식/모바일 확인. 접힘 UI에서 제목을 먼저 누르도록 갱신.
- C:/Users/david/IdeaProjects/mail-triage-web/test/attachments.test.ts, C:/Users/david/IdeaProjects/mail-triage-web/test/downloads.test.ts, C:/Users/david/IdeaProjects/mail-triage-web/test/history.test.ts — 이미지/다운로드/API/이력 테스트.
- C:/Users/david/IdeaProjects/mail-triage-web/docs/implementation-plan.md, C:/Users/david/IdeaProjects/mail-triage-web/docs/validation.md, C:/Users/david/IdeaProjects/mail-triage-web/docs/work-summary.md, C:/Users/david/IdeaProjects/mail-triage-web/README.md, C:/Users/david/IdeaProjects/mail-triage-web/AGENTS.md — 계획/근거/인수인계/운영 규칙.

### erp-manager — 공유 규칙 원본, 기존 변경은 보존
이 프로젝트에서 완료한 공용 연동 변경이다. 이후 웹 개발의 주 작업 위치가 아니다.
- C:/Users/david/IdeaProjects/erp-manager/tools/triage-history.mjs — 공용 이력 CLI, 미추적.
- C:/Users/david/IdeaProjects/erp-manager/.claude/mail/shared-history.md — 공용 저장 계약, 미추적.
- C:/Users/david/IdeaProjects/erp-manager/.agents/skills/mail-triage/SKILL.md — 직접/웹 실행 분기, 수정됨.
- C:/Users/david/IdeaProjects/erp-manager/.claude/commands/mail-triage.md — 공용 계약 참조, 수정됨.
- C:/Users/david/IdeaProjects/erp-manager/tools/erp-nav.mjs — ERP 경로 환경변수, 기본 경로 유지, 수정됨.
- C:/Users/david/IdeaProjects/erp-manager/.gitignore — 로컬 연결/실패 보존 자료 제외, 수정됨.
- C:/Users/david/IdeaProjects/erp-manager/.claude/mail/history.local.json — 기존 연결 비밀 파일, Git 제외. 값을 출력/복사하지 않는다.
- .claude/settings.local.json은 기존 사용자 미추적 파일이다. 이번 구현 산출물로 간주하거나 덮어쓰지 않는다.
- 공통 스킬/업무 규칙 변경이 꼭 필요할 때만 이 저장소와 계약을 함께 검토한다. ERP 업무 자료와 과거 보고서를 임의 수정하지 않는다.

### mail-mcp — 본문 표시를 위해 추가한 외부 의존성
현재 웹을 재현하려면 이 변경도 보존해야 한다. UI 작업만으로 서버를 재빌드할 필요는 없다.
- C:/Users/david/IdeaProjects/mail-mcp/src/main/java/com/srpinfotec/mailmcp/mail/HtmlBodyParser.java — 저장된 원본 MIME에서 안전한 HTML/CID 추출, 새 파일.
- C:/Users/david/IdeaProjects/mail-mcp/src/main/java/com/srpinfotec/mailmcp/mail/QueryService.java — getHtml 추가.
- C:/Users/david/IdeaProjects/mail-mcp/src/main/java/com/srpinfotec/mailmcp/mcp/MailTools.java — get_email_html 읽기 도구.
- C:/Users/david/IdeaProjects/mail-mcp/src/main/java/com/srpinfotec/mailmcp/mcp/MailToolConfiguration.java — 입력/출력 스키마.
- C:/Users/david/IdeaProjects/mail-mcp/src/test/java/com/srpinfotec/mailmcp/mail/HtmlBodyParserTests.java — 새 테스트.
- C:/Users/david/IdeaProjects/mail-mcp/src/test/java/com/srpinfotec/mailmcp/mcp/McpIntegrationTests.java — 8개 도구와 HTML 조회 검증.
- C:/Users/david/IdeaProjects/mail-mcp/README.md — 추가 도구 문서.
- 모두 미커밋이다. .gitattributes와 gradlew 변경은 HTML 작업 시작 전부터 존재하던 변경으로 보존한다.
- 기존 get_email 텍스트 계약과 DB/원본은 유지했다. 메일 재동기화나 데이터 마이그레이션은 필요 없다.

## 검증 완료와 실제 검증 범위
- 최신 전체 웹 테스트: Docker 테스트 14개 통과. 이후 버튼/접힘 UI 변경은 실제 브라우저에서 확인했다.
- TypeScript 검사, 다운로드 바이트/인증/Origin/한도/파일명/오류 테스트 통과.
- mail MCP Docker Gradle 전체 build/test 통과. HTML 파서 3개 테스트와 HTTP 신규 도구 검증 포함.
- 실제 메일: 첨부 3종이 CID 참조 5곳에 표시(반복 서명 포함), 실패 재시도·텍스트 대체·모바일 통과.
- 실제 첨부 한 건 7,672바이트를 다운로드해 MCP 원본과 동일함을 확인했다.
- ZIP/DOCX/PPTX/XLSX 이름/형식/다운로드는 합성 응답으로 검증했다. 해당 형식 실제 고객 문서 내용은 열지 않았다.
- 접힘: 기본 닫힘, 클릭/Enter/Space, 모바일, 메일 재선택 시 닫힘, 펼친 후 다운로드 검증 통과.
- 실제 Codex가 mail MCP/DB MCP/ERP 파일을 읽은 것은 확인했으나 전체 고객 업무 분석→보고서 저장의 실제 종단 검증은 미실행이다.
- 실제 POP3 신규 수집 버튼 검증은 미실행. 부분 실패 판정은 합성 데이터로 검증.
- .runtime 캡처는 로컬 검증 산출물이며 고객 정보가 포함될 수 있어 Git 제외를 유지한다.

## 남은 작업과 권장 순서
1. 인수 직후: 세 문서를 읽고 현재 상태를 확인한다. 불필요한 초기화·재수집·전체 분석은 하지 않는다.
2. scripts/verify-ui.mjs의 본문 대기를 '#detail > pre, #detail > .mail-body'로 보완했다. 검증 결과는 validation.md에 기록한다.
3. 지정한 메일 한 건으로 Worker 전체 업무 분석→증거 검토→보고서 저장→웹/직접 CLI 이력 조회를 확인한다. 이번 인계는 고객 메일 ID를 지정하지 않으므로 대상 임의 선정 금지.
4. 실제 sync 동작과 서비스 중단/재시작/lease 복구를 검증한다. 원본 수집과 단순 연결 테스트를 구분한다.
5. 기존 Markdown 보고서/triage-log의 읽기 전용 preview, 출처/해시 멱등성, 확실한 식별만 연결하는 이관기를 구현한다. 미확정은 legacy로 남기고 원본을 보존한다.
6. MCP에 없는 Outlook 단건 예외의 공용 식별/등록을 완성한다.
7. knowledge 제안의 단일 반영기와 원본 버전/해시 대조를 구현한다. 현재 두 실행 경로 모두 즉시 docs에 쓰지 않고 제안으로 저장한다.
8. 백업 복원/강제 중단 실험은 별도 테스트 DB/볼륨에서 먼저 검증한다.
9. 취소 UI·상세 진행 표시·사내 계정별 인증/HTTPS는 현재 미구현 확장 사항이다. 개인 localhost 범위를 유지하며 우선순위는 사용자와 정한다.
- ZIP 내부 보기, 다운로드 한도 확대, 신규 외부 공개는 현재 확정 범위가 아니다. DOCX/PPTX/XLSX 미리보기는 인수 이후 사용자 요청으로 포함했다.

## 실행 명령과 주의점
프로젝트 cwd: C:/Users/david/IdeaProjects/mail-triage-web
```powershell
npm.cmd run check
docker compose --profile verification run --rm tests
node scripts/verify-inline-images.mjs
node scripts/verify-downloads.mjs
docker compose --progress quiet up -d --build api
```
- 브라우저 스크립트는 현재 Windows Chrome 설치 경로를 사용하고 .env 토큰을 읽는다. 토큰을 출력하지 않는다.
- UI/static 변경은 이미지 COPY 방식이라 api 재빌드가 필요하다. 이번 대화의 최신 변경은 이미 반영했다.
- Dockerfile에서 앱 COPY 뒤 Codex/apt 설치가 있어 UI 변경도 빌드가 다소 길어질 수 있다. 캐시 개선은 후속 선택 사항이다.
- PowerShell npm.ps1 실행 정책 문제 시 npm.cmd 사용. 파이프 한글은 인코딩에 주의하고 문서는 UTF-8로 저장한다.
- 전체 테스트는 임시 PostgreSQL schema를 사용한다. 운영 이력/원본/볼륨을 테스트 용도로 초기화하지 않는다.
- 이후 코드/테스트/문서 작업은 인계받은 Codex가 이 프로젝트에서 수행한다.

## 인수 후 추가 구현: Office viewer (2026-09-16)

사용자 추가 요청에 따라 DOCX/PPTX/XLSX 읽기 전용 미리보기를 구현하고 localhost Docker API에 반영했다. 전체 테스트 15개와 세 형식 합성 OOXML 브라우저 검증, 기존 UI/실제 다운로드 회귀 검증이 통과했다. 자세한 범위와 제한은 validation.md의 Office 미리보기 항목을 따른다.

- `viewer/main.tsx`, `viewer/viewer.css`, `viewer/index.html`, `viewer/vite.config.ts`, `viewer/tsconfig.json`: 요청한 Extend React 뷰어/Worker/WASM과 읽기 전용 표시, 로컬 번들.
- `public/office-preview.js`: 모달, 파일 요청/전달, 실패/재시도/닫기, 크기·형식 확인.
- `public/attachment-list.js`, `public/app.js`, `public/style.css`: 첨부 버튼 및 모달 연결, 기존 다운로드 재사용.
- `src/server.ts`: `/preview/`에만 별도 CSP 적용.
- `package.json`, `package-lock.json`, `Dockerfile`, `.gitignore`, `.dockerignore`: 의존성/빌드/생성물 제외.
- `scripts/create-preview-fixtures.py`, `scripts/verify-preview.mjs`: 합성 OOXML 생성 및 독립 서버/배포 서버 검증. 운영 API 호출은 모의 응답으로 대체한다.
- `scripts/verify-ui.mjs`, `scripts/verify-downloads.mjs`, `test/history.test.ts`: 본문/다운로드 선택자 보완과 CSP 회귀 검증.
- 이후 실제 고객 문서의 서식 확인은 별도 검증이다. ERP 및 두 외부 저장소는 수정하지 않았다. 모든 변경은 미커밋이다.
