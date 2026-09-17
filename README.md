# 메일 분석실
별도 Docker 웹 앱과 erp-manager 직접 스킬이 같은 이력 API를 사용하는 초기 구현이다.
세부 범위와 미완료 항목은 [구현 계획](docs/implementation-plan.md), 실행한 검증은 [검증 기록](docs/validation.md)에 기록한다.

## 실행
Node.js 24, Docker Compose가 필요하다. 기존 mail MCP(17082)와 DB MCP(17080)를 먼저 실행한다.
```powershell
node scripts/setup.mjs
# .env의 경로와 MCP 저장소 식별자를 확인한다.
docker compose up -d --build api
# Codex 인증 파일 경로 확인 후 분석 Worker 시작
docker compose --profile analysis up -d worker
```
http://localhost:3080 에 접속하고 .env의 TRIAGE_TOKEN으로 로그인한다.
API/DB만 실행해도 직접 스킬에서 공용 이력을 사용할 수 있다. 웹 화면은 API 서버가 제공한다.
인증 파일은 이미지/Git에 넣지 않으며, Worker가 최초 실행 시 읽기 전용 seed에서 전용 codex 볼륨으로 복사한다.
토큰 갱신은 전용 볼륨에 저장되며 Orca의 원본 인증 파일은 수정하지 않는다.
인증 만료 시 해당 볼륨의 Codex 인증을 다시 설정한다. 계정의 사용량 제한과 비용은 기존 인증 방식에 따른다.

## MCP와 파일
- 앱 → mail MCP/DB MCP는 Streamable HTTP를 사용한다.
- Docker Desktop의 host.docker.internal로 호스트 MCP에 연결한다.
- 기존 mail MCP는 localhost Host 헤더만 허용한다. 신뢰된 로컬 백엔드 연결에 MAIL_MCP_HOST_HEADER를 지정한다.
- 본문 내 이미지 표시는 mail MCP의 `get_email_html` 도구가 필요하다. 해당 기능이 포함된 mail MCP 이미지를 빌드·반영한다. ERP DB 설정은 그대로 사용한다.
- ERP 코드와 erp-manager는 Worker에 읽기 전용으로 연결된다.
- erp-nav는 ERP_MANAGER_ROOT/ERP_GG_ROOT/ERP_GGFAC_ROOT/ERP_DCODE_ROOT 환경변수를 지원한다.
- Docker 호스트를 다른 서버로 옮기면 경로·접속·인증을 별도로 설정해야 한다.

## 웹 사용
상단 메뉴를 **메일함 / 분석 이력 / 이전 이력**으로 나누어 사용한다. 메뉴를 바꿔도 메일함의 검색 조건과 선택한 메일은 유지된다.
메일 상세의 **이 메일 분석 이력**을 누르면 해당 메일에 연결된 분석·이전 이력이 레이어로 열린다. 보고서도 레이어에서 읽고 **이력 목록으로** 돌아갈 수 있다. **닫기/Escape**로 닫으면 읽던 메일로 돌아온다. 전체 이력 메뉴의 보고서와 이전 문서도 레이어로 표시한다.
메일 검색 → 메일 선택 → 본문/첨부 확인 → 이 메일 분석 → 공용 분석 이력에서 결과 확인.
동기화 버튼은 별도 동작이며 분석할 때 자동 sync하지 않는다.
동기화는 요청당 최대 30회 × 100건의 순차 배치다. 실패/진전 없음/한도 도달 시 일부 미완료로 기록하며 사용자가 재실행한다.
메일 상세 상단의 첨부파일 목록은 기본으로 접혀 있다. 첨부파일 제목을 클릭하거나 키보드 Enter/Space로 펼치고 접으며, 펼치면 파일명·형식·크기와 다운로드 버튼을 확인한다. ZIP·DOCX·PPTX·XLSX를 포함한 원본 파일을 다운로드하며, 이미지도 목록에 포함한다. 현재 mail MCP 원본 전달 한도에 따라 파일당 5 MiB까지 다운로드한다. 큰 파일도 목록에 표시하고 제한을 안내한다.
DOCX·PPTX·XLSX 첨부는 목록의 **미리보기** 버튼으로 읽기 전용으로 확인한다. 뷰어에서 닫기(Escape 포함), 다시 시도, 원본 다운로드를 제공한다. 문서 링크와 외부 이미지/폰트 요청은 차단하며 문서 바이트와 뷰어/WASM은 로컬 앱에서 처리한다. 미리보기에도 기존 5 MiB 다운로드 한도가 적용된다. 손상·암호화된 파일이나 지원되지 않는 서식은 원본 다운로드를 이용한다. Office와 완전히 동일한 서식 재현은 보장하지 않는다. ZIP 내부, 구형 DOC/PPT/XLS 및 매크로 형식은 이번 미리보기 대상이 아니다. Excel/PDF 상세 분석은 Worker의 MCP 문서 도구가 담당한다.
메일 본문의 문단·표와 CID 첨부 이미지를 원래 순서로 표시한다. 스크립트·스타일·외부 이미지는 제거하고, 표시용 요소만 다시 만든다. 본문에서 참조하지 않은 이미지는 아래 첨부 영역에 표시한다.
HTML이 없는 메일이나 HTML 조회 실패 시 전체 텍스트와 이미지 목록으로 표시한다. 기존 메일도 재동기화 없이 지원한다.
직접/웹 분석 완료는 고객 업무 해결을 뜻하지 않는다.
웹에서는 Claude 리뷰가 실행되지 않는다.

## 직접 스킬 연결
erp-manager/.claude/mail/history.local.json 파일을 다음 형식으로 설정한다. 이 파일은 Git 제외 대상이다.
```json
{"url":"http://localhost:3080","token":"TRIAGE_TOKEN 값","storeId":"local-mail-v1"}
```
erp-manager에서:
```powershell
node tools/triage-history.mjs status
node tools/triage-history.mjs list 123
node tools/triage-history.mjs begin 123
node tools/triage-history.mjs keepalive <run-id>
node tools/triage-history.mjs complete <run-id> <result.json>
node tools/triage-history.mjs export <run-id> <새 보고서.md>
```
공용 모드의 전체 절차는 erp-manager/.claude/mail/shared-history.md를 따른다.
keepalive는 분석 중 별도 프로세스로 실행한다. API 장애 때 신규 분석은 시작하지 않는다.
15분 안에 heartbeat가 없으면 실행이 만료된다. 만료 결과는 자동으로 다른 실행에 덮어쓰지 않는다.
성공한 보고서는 불변이며 재분석은 새 run ID다. 리뷰는 별도 API 기록이다.
기존 Markdown 33건은 원본 해시와 대조하여 **이전 이력**에 보존했다. 메일별 식별 연결은 남아 있으므로 과거 로그도 함께 확인한다. Worker에서도 원본 처리 로그를 읽기 전용으로 참조한다.
Outlook 예외 등록, 원본 해시 기반 이관, 지식 제안의 단일 반영, 결과 재등록 절차는 [운영 도구 안내](docs/maintenance.md)를 따른다. 실제 지식 문서는 제안 내용을 검토한 뒤 별도로 반영한다.

## 검증
```powershell
npm run check
npm run build
python scripts/create-preview-fixtures.py
node --import tsx scripts/verify-preview.mjs
node scripts/verify-inline-images.mjs
node scripts/verify-downloads.mjs
docker compose --profile verification run --no-deps --rm tests
node --import tsx scripts/verify-maintenance-ui.mjs
node --import tsx scripts/verify-markdown.mjs
node --import tsx scripts/verify-mail-analysis.mjs
node --import tsx scripts/verify-sync-refresh.mjs
node scripts/verify-recovery.mjs
docker compose exec -T api npm run diagnose
docker compose exec -T worker codex login status
```
통합 테스트는 이미 실행 중인 DB의 임의 이름 전용 PostgreSQL schema를 만들고 종료 시 해당 schema만 제거한다. `--no-deps`로 기존 DB의 Compose 설정 반영/재생성을 막는다. recovery 검증은 별도 Docker 프로젝트와 합성 데이터로 백업·복원, 프로세스 강제 종료, DB 재시작을 검사한다.
미리보기 검증은 합성 OOXML 파일과 임시 로컬 서버/모의 API를 사용하며 DB·MCP·고객 메일에 접근하지 않는다. `viewer/`의 React 코드는 Vite로 `public/preview/`에 빌드하며 생성물은 Git에서 제외한다. Docker 빌드에도 이 과정이 포함된다. 사용 패키지는 [react-docx](https://github.com/extend-hq/react-docx), [react-pptx](https://github.com/extend-hq/react-pptx), [react-xlsx](https://github.com/extend-hq/react-xlsx)이다.
운영 이력 테이블을 초기화하지 않는다. diagnose는 메일 한 건과 SR DB SELECT 1만 읽는다.
실제 동기화 버튼으로 신규 3건 수집/실패 0건/남음 0건을 확인했다. 2026-09-17 사용자 지정 메일 한 건으로 실제 Worker 분석·저장·웹/직접 CLI 동일 결과 조회도 확인했다. 업무 문제 해결이나 모든 메일 유형의 분석 품질을 검증했다는 의미는 아니다.

## 데이터 보존
메일 동기화는 미수집 메일을 100개씩 끝까지 수집한다(3,000개 제한 없음). 진행 상황과 목록을 10초마다 갱신하며 수집 중에도 메일을 조회·분석할 수 있다. **중지**는 현재 묶음 종료 후 적용하고, **이어서 동기화**는 저장된 UIDL을 건너뛰는 새 실행을 만든다. API/PC 재시작 후에는 일시 중지 상태로 복구하며 사용자가 재개한다. 일시 오류는 최대 3회 지연 재시도하고 실제 실패·무진행은 중단한다. 검색 조건/선택한 메일 상세는 유지하고 종료 시 첫 페이지를 조회한다. 건수 의미와 제한은 [운영 안내](docs/maintenance.md)를 따른다.

메일 목록은 공용 이력에 완료 기록이 있으면 **✓ 분석 완료**를 표시한다. 최신 실행이 대기·진행·확인 필요·실패 상태이면 함께 구분하며, 연결이 확정된 과거 문서는 **이전 이력 N건**으로 표시한다. 웹/직접 실행을 모두 포함하고 업무 해결 여부와는 별개다. 미연결 문서는 제목 등으로 추측해 표시하지 않는다. 목록 표시 중 상태는 10초마다 갱신하며 이력 조회 실패 시 **이력 확인 불가**로 표시하고 자동 재시도한다.

분석 이력의 보고서·업무 지식 제안·리뷰와 이전 Markdown 문서는 서식을 적용해 표시한다. 각 문서의 **원문 보기 / 문서 보기**로 전환할 수 있고 기존 Markdown export를 유지한다. 제목·강조·표·목록·체크 목록·인용·코드 블록을 지원하며 표와 코드는 좁은 화면에서 가로 스크롤한다. 문서 안의 HTML은 문자로 표시하고 이미지는 설명만 표시한다. 링크는 HTTP(S)만 새 창으로 열며 코드 실행·구문 강조·Mermaid 렌더링은 제공하지 않는다.

`viewer/markdown.js`는 [marked](https://marked.js.org/)와 [DOMPurify](https://github.com/cure53/DOMPurify)로 Markdown을 변환·정제한다. `npm run build:markdown`으로 `public/markdown/viewer.js`에 번들하며 전체/Docker 빌드에도 포함한다. CDN이나 외부 변환 서버는 사용하지 않는다.

history 볼륨은 DB/보고서/리뷰, work 볼륨은 Worker 산출물/실패 로그, codex 볼륨은 인증과 실행 정보를 보존한다.
일반 종료에는 `docker compose down`을 사용한다. `down -v`는 데이터를 삭제하므로 사용하지 않는다.
백업은 DB 컨테이너 안에서 `pg_dump -U triage -Fc triage -f /tmp/triage.dump` 후 `docker compose cp db:/tmp/triage.dump ./triage.dump`로 복사한다.
복원은 별도 검증 DB에서 먼저 `pg_restore`하고 건수/보고서를 대조한다. 메일 원본은 기존 mail MCP 저장소에서 별도 백업해야 한다.
이 앱을 팀 공유 서비스로 운영하기 전에는 계정별 인증·권한과 HTTPS를 추가한다. 사용자 요구에 맞춘 **Auth0 이메일·비밀번호 → 개인 PC 파일럿 → 상시 VM 운영** 순서와 Vercel 비교는 [팀 인증·배포 계획](docs/team-deployment-plan.md)에 기록했다. 현재는 계획 단계이며 기존 토큰 로그인을 유지한다.

Docker의 namespace 제약으로 Codex 0.154.0의 읽기 전용 Landlock backend를 사용한다. sandbox를 해제하지 않으며 ERP 마운트도 읽기 전용이다. 해당 backend는 deprecated이므로 Codex 업데이트 시 파일 접근 검증을 다시 수행해야 한다.
