# 검증 기록

> 날짜별 실제 검증 일지다. 과거 미완료 항목은 후속 기록과 함께 읽는다. 최신 구현 계획은 [통합 구현 계획](implementation-plan.md), 문서별 역할은 [문서 안내](README.md)를 따른다.

## 2026-09-17 P1 전 UI·UX 보완

- 사용자 지정 우선순위대로 추가 답변 초안, 상태별 분석 행동, 메일 선택/모바일 복귀, 상태 안내, 검색/이전 문서 표시를 개선했다. 현재 API 계약·서버·DB·Worker는 변경하지 않았다.
- `public/answer-drafts.js`는 출처/분석별 초안을 sessionStorage와 메모리에 보관한다. 화면 이동·보고서/브라우저 새로고침·같은 단일 토큰 세션의 재로그인 후 복원, 실패 시 보존, 성공/명시적 삭제 시 제거를 확인했다. 전송 중 입력을 비활성화하고 뒤늦은 성공 응답이 새로 작성된 다른 초안을 지우지 않도록 제출값을 대조한다. 저장소 차단 시 메모리 보존과 새로고침 제한을 안내한다. localStorage·서버에 초안을 추가 저장하지 않는다.
- 기본 분석 버튼을 상태에 맞춰 바꾸고 새 분석 등록 전 메일별 기존 실행을 재조회한다. 이미 진행 중이면 해당 실행을 열며 최종 중복 방지는 기존 서버 제약에 맡긴다. 처리 완료는 실행 중 숨기고 분석 종료와 실제 업무 처리를 분리해 안내한다. 등록 알림 대신 현재 진행 화면을 사용하며 일부 작업 실패/연결 지연은 경고색, 전체 실패는 별도 상태로 표시한다.
- 메일 선택 강조/aria-current, 모바일 상세와 목록 복귀의 검색·스크롤·포커스 유지, 조건 초기화/빈 결과/조회 오류 재시도, 이전 문서 경로·해시 기본 접힘을 확인했다. 첨부 기본 접힘과 기존 HTML 정제/미리보기 동작은 유지한다.
- `npm.cmd run check`, 변경 브라우저 JavaScript와 실제 실행 검증 스크립트 구문 검사, `git diff --check` 통과.
- 합성 API를 제공하는 임시 로컬 서버에서 브라우저 검증 10개 통과: `verify-pre-p1-ux.mjs`, `verify-analysis-progress.mjs`, `verify-handling-ui.mjs`, `verify-history-ui.mjs`, `verify-mail-analysis.mjs`, `verify-status-filter.mjs`, `verify-maintenance-ui.mjs`, `verify-sync-refresh.mjs`, `verify-image-preview.mjs`, `verify-preview.mjs`. 신규 검증은 분석별 초안 분리·저장소 차단·재인증·실패 후 재전송·활성 실행 재확인·검색 실패 복구를 포함한다. 모든 검증에서 pageerror 없음. Office의 의도된 실패 응답/CSP 차단은 기존 테스트대로 확인했다.
- 기존 테스트의 이전 버튼 문구와 모바일 상세에서 바로 목록을 클릭하던 동작을 새 사용자 흐름에 맞췄다. `.runtime/pre-p1-desktop.png`, `pre-p1-mobile.png`, `analysis-progress-mobile.png`의 합성 화면을 육안 확인했다. 실제 고객 메일·ERP·MCP 요청, 실제 분석/동기화, DB 통합 테스트, 실행 중 Docker 서비스 반영은 수행하지 않았다. `verify-live-worker.mjs`는 선택자만 갱신하고 구문 검사했으며 실제 실행하지 않았다.
- README와 통합 계획 1.3절에 사용법·완료 범위·후속 계정별 초안 분리 과제를 기록했다. P1~P8은 여전히 구현 전이다.

### 후속 Docker 반영 및 작업별 커밋

- 사용자 요청으로 `docker compose build api` 후 활성 분석 0건·동기화 completed를 다시 확인하고 `docker compose up -d --no-build --no-deps --wait api`로 API만 교체했다. DB·Worker 컨테이너는 유지했다.
- 반영 후 API healthy 및 Worker ready/online 확인. 제공 중인 `app.js`, `answer-drafts.js`, `analysis-progress.js`, `index.html`, `style.css`의 SHA-256이 작업 파일과 일치한다. 기존 분석 6건의 결과·리뷰·처리 상태를 반영 전후 해시로 대조하여 보존을 확인했다.
- 배포된 localhost:3080의 정적 파일을 사용하는 합성 브라우저 검증에서 초안 보존·재로그인·전송 실패 복구·중복 분석 이동·검색/모바일/문서 정보 동작과 pageerror 0건을 확인했다. API 요청은 합성 응답으로 대체했으며 고객 분석·실제 동기화는 실행하지 않았다.
- 변경을 초안 보존, 상태별 분석/메일 이동, 검색/이전 문서 표시, 통합 검증/문서의 네 작업 단위로 분리한다. `.runtime`의 배포 비교 자료·임시 분리 도구·합성 캡처는 Git에서 제외한다.

## 2026-09-17 문서 정리와 통합 구현 계획

- `implementation-plan.md`를 회사 이메일 인증·공용 이력 API/PostgreSQL·개인 PC의 웹/AI/MCP 기준으로 통합했다. 기술 스택·패키지 경계, 인증/자료 권한, DB·API 계약, 실행 배정·동기화·복구, Windows 설치·업데이트, 서버 사양·백업·이관·롤백, P0~P8 산출물·완료 기준·대략적 공수와 결정 대기 항목을 명시했다. 설계값과 이미 구현/검증된 사실을 구분했다.
- 기존 구현 계획과 배포 제안의 통합 직전 본문을 각각 `implementation-history-2026-09-17.md`, `team-deployment-proposal-2026-09-17.md`에 보존했다. 정리 중 추가된 메일 검색 상태 필터 기록도 최신 원본에 포함해 보존했다. 이전 원문은 바꾸지 않고 역사 자료 안내만 앞에 추가했다.
- `docs/README.md`에 모든 문서의 역할과 우선순위를 정리했다. 기존 배포 계획 경로는 통합 안내로 유지하고 README/작업 요약/운영/인계 문서에서 현재 사양과 당시 기록을 구분했다. README의 이미지 첨부·이전 이력 연결 설명도 기존 검증 기록에 맞췄다.
- 문서 검사: 로컬 Markdown 링크·코드 fence·문자 인코딩, 계획 필수 주제, 문서 목록 누락 없음. 보존한 두 계획 본문이 통합 직전 원본 bytes와 일치함을 확인했다. 기존 검증·운영·인계 본문도 안내 추가 외에 보존했다. `git diff --check -- README.md docs` 통과.
- 문서 갱신 직전/직후 앱·소스·스크립트·테스트·viewer·구성 106개 파일 hash 일치. 작업 폴더의 별도 미커밋 앱 변경은 수정하지 않았다. 문서 검사 증거는 Git 제외 `.runtime/docs-consolidation-20260917/verification.json`에 보존한다.
- 이번 검증은 문서 정합성 검사다. 앱 테스트 재실행, 실제 Auth0 가입, DB 이관, 고객 분석, 서비스 재시작, 외부 배포·게시·커밋은 수행하지 않았다. 현재 앱의 운영 검증을 다시 완료했다고 주장하지 않는다.

검증일: 2026-09-16

## 2026-09-17 분석 작업 이벤트와 경과 시간

- Worker의 `item.completed` 중 MCP 호출과 로컬 명령 종료를 고정된 작업 종류/성공 여부로 변환한다. 시작 및 결과 저장 시작은 Worker가 직접 기록한다. 모델 텍스트·reasoning·도구 인수·결과·SQL·경로는 진행 기록에 포함하지 않는다. 로컬 명령은 실제 코드/파일 확인을 단정하지 않고 `분석 도구 실행`으로 표시한다.
- 실행별 `progress_events`는 최근 20건으로 제한하며 저장 시각은 DB가 부여한다. 유효한 실행 소유권/lease/running 상태에서만 저장하고 종료 후 기록을 바꾸지 않는다. heartbeat는 별도 시각이며 작업 진척과 구분한다. 진행 기록 저장 실패는 보고서 저장을 막지 않고 고정 오류 코드만 남긴다. 기존 실행에 없는 이벤트는 만들어내지 않는다.
- 분석 및 재분석 요청 후 진행 화면을 열고 경과 시간을 초 단위로 갱신한다. 상태는 3초 간격으로 조회하며 최종 상태에서는 자동으로 보고서/질문/실패 사유를 표시하고 조회를 종료한다. 작업 기록은 접어서 제공하고 다시 열어도 서버 기록을 조회한다. 응답 지연과 상태 조회 실패를 별도 표시하며 갱신 실패를 분석 실패로 단정하지 않는다. 직접 실행은 경과 시간/heartbeat만 제공하고 상세 이벤트 미제공을 안내한다.
- `npm.cmd run check`, JSON 이벤트 분류 단위 테스트, `docker compose --profile verification run --no-deps --rm tests`: 전체 38개 통과. 기록 상한/시각/소유권/만료/종료 후 쓰기 금지/heartbeat 독립성/보고서 보존 검증 포함. 격리 테스트 스키마를 사용했다.
- `node --import tsx scripts/verify-analysis-progress.mjs`: 대기→분석, 시간 갱신, 작업 실패와 실행 실패 구분, heartbeat 지연, 상태 조회 실패/재시도, 완료/확인 필요/실패 자동 전환, 새로고침 후 기록 유지, 닫은 뒤 늦은 응답 무시, 이력 복귀 시 타이머 정리, 모바일 가로 넘침 없음, 동작 줄이기 및 pageerror 0개 확인. 합성 모바일 스크린샷을 확인했다.
- 기존 `verify-handling-ui.mjs`, `verify-history-ui.mjs` 회귀 검증 통과. 새 분석 진행 화면으로 바로 이동하는 변경에 맞춰 재분석 테스트의 이력 복귀 동작을 보완했다. 실제 고객 분석·동기화·ERP 변경은 수행하지 않았다. 실제 Codex 분석으로 신규 이벤트까지 확인하는 검증은 미실행이다.
- 로컬 반영: 대기/실행 중 분석 및 동기화가 0건임을 재확인하고 `docker compose --profile analysis up -d --no-deps --wait api worker`로 API/Worker만 교체했다. API healthy, Worker ready/online, 인증된 실행 조회의 progress/heartbeat 필드, 제공 중인 app.js/analysis-progress.js/style.css와 로컬 파일의 SHA-256 일치 확인. 기존 보고서 4건의 통합 내용 해시가 반영 전후 동일하다. DB 컨테이너/볼륨은 재생성하지 않았다.

## 2026-09-17 미커밋 UI 변경 정리

- 남은 변경을 이미지 첨부 미리보기, 분석 완료 후 추가 답변, 상단 헤더 간소화로 분리했다. 공유 app.js/style.css와 계획/검증 문서는 변경 부분만 나누어 커밋하고, 원본 작업 파일의 기능은 유지했다. 들여쓰기와 BOM을 정리하고 텍스트 대체 화면의 이미지 영역 검증을 현재 DOM 조회로 보완했다.
- 현재 소스 기준 `npm run check`, 이미지·다운로드 단위 테스트 4개, 합성 이미지 미리보기/Office 세 형식/처리 완료·추가 답변/관련 메일 UI 검증 통과. 모바일 가로 넘침과 pageerror 없음. Office의 오류·외부 요청 차단 테스트에서 발생한 예상 콘솔 메시지는 통과 결과와 구분했다.
- 헤더의 설명 문구를 제거하고 제목/연결 상태 및 반응형 여백을 정리했다. 관련 메일 기본 접힘, 건수, 마우스/키보드 펼침과 다시 열 때 초기화도 기존 합성 검증에 포함되어 있다.
- 이번 정리는 로컬 소스·검증·커밋 작업이다. 실제 고객 분석·동기화·상태 변경, 서비스 재시작이나 원격 push는 수행하지 않았다. 이전 섹션의 배포/실메일 검증은 해당 작업 당시 기록이다.

## 2026-09-17 분석 완료 후 추가 답변과 재분석

- 기존 화면은 `needs_input`일 때만 답변 입력란을 표시하여 `completed` 결과에는 추가 의견을 전달할 수 없었다. 미처리 `completed` 보고서에도 입력란과 `답변하고 다시 분석` 버튼을 제공한다. 이전 실행 ID와 답변을 전달하는 기존 API/Worker 경로를 재사용하며 원본 결과를 수정하지 않는다.
- `node --import tsx scripts/verify-handling-ui.mjs` 통과. 질문 없는 완료 결과의 입력란, 빈 답변 차단, 새 요청의 메일 식별자/parentId/answer, 기존 보고서 보존, 처리 완료 후 숨김, 실행 중 숨김, Outlook 직접 실행 안내, 완료/취소/충돌 회귀, 모바일 가로 넘침 및 pageerror 0개를 확인했다. 새 분석 등록은 합성 API로만 검증했다.
- 수정한 `app.js`만 실행 중인 로컬 API에 복사하고 응답 파일 해시 일치를 확인했다. 지정 메일의 실제 보고서에서 추가 답변과 재분석 버튼 표시를 읽기 전용 브라우저로 확인했다. 기존 보고서 해시, 분석 완료 상태, 미처리 상태 보존. 실제 재분석/처리 완료/동기화 요청은 실행하지 않았다.
- `docker compose build api` 성공. 컨테이너 재생성 때도 수정이 유지되도록 로컬 이미지에 포함했다. 실행 중인 API/DB/Worker는 재시작하지 않았다. JS 구문 검사와 `git diff --check` 통과.

## 2026-09-17 실행 중에만 동기화 아이콘 표시

- 서버 수집 건수가 있으면 종료 후에도 남던 progress 요소를 제거했다. running/stopping 동안 회전 아이콘과 서버 건수/비율을 표시하고 retrying은 회전을 멈춘 대기 표시로 구분한다. 집계 전에는 이번 실행 저장 건수만 표시한다. completed/partial/failed/paused에서는 표시와 진행 문구를 숨기고 마지막 결과 텍스트를 유지한다.
- `verify-sync-refresh.mjs` 확장 및 로컬/배포 환경 합성 검증 통과. 완료 데이터에 serverStored가 남아 있어도 숨김, 진행 건수/비율, 중지/재시도, 동작 줄이기, 모바일 가로 넘침, 기존 목록 자동 갱신과 실패 재시도 확인. 실제 메일 동기화 호출 없이 검증했고 pageerror 0개. 데스크톱 캡처 육안 확인.
- API 갱신 후 동기화 표시 기능을 배포 환경에서 확인했다. 최종 시점에는 동시에 진행된 이미지 미리보기 수정도 런타임에 반영되어 전체 파일이 공유 작업 폴더와 일치했다. 이번 커밋은 동기화 표시 관련 부분만 포함하며 별도 이미지 변경은 보존했다. DB/Worker 변경이나 통합 DB 테스트 재실행은 필요하지 않은 화면 수정이다.

## 2026-09-17 관련 메일 검색·선택 화면과 로컬 반영

- 보고서 상단의 관련 메일 영역에서 검색어/발신자 검색, 후보 20건씩 페이지 이동, 텍스트 본문 확인 후 명시적 연결, 여러 건 열기/해제를 제공한다. 현재 분석 메일과 이미 연결한 후보는 선택할 수 없다. 선택 취소는 저장하지 않고, 연결 해제는 기존 메일·보고서·처리 상태에 영향을 주지 않는다.
- `verify-related-mails.mjs` 합성 검증 통과: 본문 확인 전 변경 요청 없음, 식별 충돌 후 재시도, 여러 건 연결, 중복/자기 자신 차단, 페이지 이동, 원본 조회 실패 시 연결 보존, 개별 해제, 완료 취소 후 연결 유지, 검색 실패 재시도, 취소 후 늦은 본문 응답 무시, 텍스트의 HTML 비실행, 390px 가로 넘침 없음/pageerror 0개. API 요청은 명시적인 연결/해제만 발생하고 분석·동기화 요청은 없었다.
- 기존 `verify-handling-ui.mjs`, `verify-history-ui.mjs`, `verify-markdown.mjs` 회귀 검증 통과. `.runtime/related-mails-mobile.png`를 육안 확인했다. README에 사용법을 추가하고 이미 제거된 동기화 30묶음 상한 설명도 현재 구현에 맞게 정정했다.
- Docker 빌드 및 API 단독 `--no-build --no-deps --wait` 반영 성공. 배포된 세 파일(app.js/style.css/related-mails.js)과 로컬 소스 일치, 실제 조회의 `relatedMails` 응답, 기존 보고서 해시 보존, Worker online/ready 확인. 배포 환경에서도 합성 관련 메일 UI 검증 통과. MCP의 실제 메일 메타데이터 형식을 읽기 전용으로 대조했으며 고객 메일의 처리 상태·연결·분석 실행은 변경하지 않았다.

## 2026-09-17 관련 메일 연결 API

- 계획서에 수동 검색/본문 확인/선택 연결, 메일 단위 공유, 완료 취소 후 연결 보존과 검증 기준을 먼저 추가했다. 별도 `related_mail` 테이블은 식별자와 제목/발신자/수신자/날짜만 저장하며 본문을 복사하지 않는다.
- 통합 테스트 36개 및 TypeScript 검사 통과. 신규 3개 시나리오에서 완료 전 등록 거부, 동시 중복 연결, 분석 버전 간 공유, 보고서/상태/실행 수 보존, 자기 자신/저장소/Message-ID 불일치, 다른 메일의 연결 해제 방지, 완료 취소와 등록의 경쟁, 인증/출처/입력 검증, 원본 불일치·조회 실패 시 연결 보존을 검증했다.
- 실제 MCP/고객 데이터에 연결을 만들지 않고 격리 임시 스키마와 합성 메일로 검증했다. 화면 및 로컬 API 반영은 후속 작업에서 진행한다.

## 2026-09-17 Markdown 파일 버튼과 로컬 반영

- 보고서 끝의 Markdown 링크를 제목 바로 아래 문서 도구 영역의 `Markdown 파일 열기 ↗` 버튼 모양 링크로 이동했다. 새 탭에서 원본 파일을 여는 기존 export 경로를 유지하며 본문의 원문 전환과 구분했다. 키보드 포커스, 상단 배치, Markdown 렌더링/안전한 링크/원문 보존, 390px 모바일을 검증했다.
- `verify-markdown.mjs`, `verify-history-ui.mjs`, `verify-handling-ui.mjs`, `verify-mail-analysis.mjs` 통과. 새 버튼과 처리 완료/취소 흐름의 모바일 캡처를 육안 확인했다. 배포 환경 검증 중 테스트 대기 조건이 잠시 비어 있는 제목을 참조하는 문제를 발견하여 null 안전하게 고쳤다.
- Docker 빌드 성공 후 API만 `--no-build --no-deps --wait`로 갱신했다. 실제 API의 처리 완료 필드 추가, 배포된 app.js/style.css/mail-analysis.js의 소스 일치, 기존 보고서 해시 보존, Worker online/ready를 확인했다. Worker/DB 재시작이나 실제 메일의 분석·처리 완료는 실행하지 않았다.

## 2026-09-17 메일 처리 완료

- `mail_identity.handled_at`에 메일 단위의 사용자 처리 완료 시각을 저장하고 취소할 수 있다. 기존 실행 상태/질문/보고서/해시를 변경하지 않으며 Worker나 MCP를 호출하지 않는다. 완료된 메일은 취소 후 재분석할 수 있고, 실행 등록과 같은 DB 잠금으로 동시 완료/분석 시작을 방지한다.
- 격리 임시 DB 스키마에서 통합 테스트 33개 통과. 보고서 보존, 실행 미생성, 반복 완료의 동일 시각, 저장소 분리, 취소 후 분석, 실행 중 완료 거부, 동시 등록, 인증/출처/입력 검사 및 MCP 미호출을 확인했다. 실제 고객 메일의 처리 상태는 변경하지 않았다.
- `verify-handling-ui.mjs` 합성 브라우저 검증 통과: 완료/취소, 목록과 이력 갱신, 기존 질문 보존, 새로고침 후 상태 유지, 중복 클릭 방지, API 오류 복구, 실행 중 버튼 비활성, 390px 모바일 가로 넘침 없음/pageerror 0개. `.runtime/handling-mobile.png` 육안 확인.
- `npm run check` 및 변경 JS 구문 검사 통과. API 반영은 다음 문서 버튼 작업과 함께 진행한다.

## 2026-09-17 연속 동기화·중지·이어받기

- 계획서에 범위/완료 기준을 먼저 추가한 뒤 구현했다. 정상 MCP partial(오류 없음/실패 0/잔여 있음/저장 진전)을 다음 묶음으로 이어가며 30회/3,000개 제한을 제거했다. `sync_run`에 묶음/재시도/다음 시도/집계 불확실 여부를 추가했다. HTTP 등록은 DB 저장만 하고 API 내부의 독립 스케줄러가 한 묶음씩 처리한다.
- 중지는 현재 MCP 묶음 반환 후 적용한다. 진행 결과는 이미 저장된 메일과 함께 보존하며, API 재시작은 `paused`로 복구한다. 이어받기는 새 실행이며 MCP UIDL 중복 제외를 사용한다. 저장 응답 유실 시 집계 불확실 안내를 표시한다. 상태와 예약은 영속화했지만 현재 처리기 수명은 API에 종속되므로 팀 다중 인스턴스/서버리스 작업은 별도다.
- transient 오류는 최대 3회(5/15/30초) 재시도하며 인증/TLS/저장소/영구 메일 오류, 무진행/잘못된 응답은 종료한다. 실패 시도는 누적 횟수로 표시한다. MCP의 남음은 실패 메일을 제외하므로 실패/오류 0인 최종 응답까지 완료로 표시하지 않는다. 재시도에서 실패가 해결되면 과거 실패 횟수는 유지한 채 완료할 수 있다.
- 통합 테스트 **30개 통과**. 현재 DB의 무작위 전용 schema에서 정상 partial을 포함한 3,200개/32묶음 수집, 요청/처리기 중복 방지, 중지 전/중/재시도 대기 상태, 과거 결과 보존, 지연 예약·최대 재시도, 영구 오류/무진행, 응답 유실·재시작, 잠금 연결 상실 시 오래된 결과 기록 차단, 인증된 시작/중지 API를 검증했다. 테스트가 자신의 schema에 해당하는 advisory-lock 연결만 종료했고 schema도 종료 시 정리했다. POP3 오류 코드 숫자(POP3) 분류 누락을 초기 테스트에서 발견해 수정 후 전체 통과했다.
- `verify-sync-refresh.mjs` 브라우저 검증 통과: 기존 빠른 완료/종료 갱신 회귀, 진행 저장 건수 변화에 따른 목록 갱신, 진행률, 중지/중지 요청 중 버튼, paused/서버 재시작 안내, 명시적 이어받기, 재시도 표시, 불확실 집계, 모바일. API는 합성 응답이며 실제 수신을 호출하지 않았다. `.runtime/sync-progress-desktop.png`, `sync-progress-mobile.png` 육안 확인 완료.
- 분석 배지·이력 레이어·Markdown·Office 미리보기 회귀 및 TypeScript/JS 검사 통과. 별도 Docker 프로젝트에서 기존 백업/복원 대조와 프로세스 KILL/DB restart 후 동기화 paused 복구를 검증하고 해당 프로젝트/볼륨만 정리했다. 실제 PC 재부팅이나 실제 POP3 중도 종료를 실행한 것은 아니다.
- 배포 전 실제 sync가 completed임을 읽기 전용으로 확인하고 API만 `--no-deps`로 갱신했다. 배포 app.js/style.css/index.html 해시 일치와 새 sync 컬럼 응답을 확인했다. 배포 환경 합성 UI 검증, 실제 목록 30건/완료 배지 2건/이전 이력 33건/모바일 및 기존 지정 메일 1130 보고서·직접 CLI 해시 대조 통과. Worker online/ready 유지. 실제 수집이나 새 고객 분석을 시작하지 않았다.

## 2026-09-17 동기화 후 목록 자동 갱신

- 기존 UI는 주기적 확인에서 `running → 종료` 전환을 관측했을 때만 목록을 갱신했다. 버튼 직후의 상태 조회는 이전 상태 변수에 반영하지 않았으며, 폴링 사이에 끝난 동기화도 놓칠 수 있었다.
- `public/app.js`에서 실행 ID/종료 상태/완료 시각을 기준으로 마지막 목록 반영 결과를 추적한다. 버튼 직후 및 10초 폴링이 같은 완료를 감지해도 중복 갱신하지 않는다. 목록 조회가 성공한 후에만 반영 완료로 기록하여 실패 시 재시도한다. 최초 로그인 때는 현재 목록을 한 번 조회하고 과거 동기화 때문에 반복 초기화하지 않는다.
- 갱신 시 검색어/발신자/날짜 조건과 선택 메일 상세는 유지하고 첫 페이지를 조회한다. 부분 완료/실패도 저장된 메일이 있을 수 있어 목록을 갱신한다. POST 대기 중 버튼을 즉시 비활성화하고, 진행 상태에 따라 비활성화를 유지한다.
- `scripts/verify-sync-refresh.mjs`의 합성 브라우저 검증 통과: 첫 폴링 이전 빠른 완료, 느린 목록 조회 중 중복 완료 감지, 일반 running→completed, 다른 탭의 completed→completed 실행 변경, 부분 완료/실패, 목록 조회 실패 후 동일 실행 재시도, 첫 페이지/필터/선택 상세 유지, 버튼 중복 클릭 방지. 모든 sync 응답은 모의 자료이며 실제 수신 요청은 실행하지 않았다.
- `npm.cmd run check`, app.js 구문 검사, 분석 배지 및 이력 레이어 회귀 검증 통과. 서버 API/DB/Worker 변경이 없어 DB 통합 테스트를 반복하지 않았다.
- API만 `--no-deps`로 반영했고 배포된 app.js 해시가 로컬 소스와 일치한다. 배포 환경에서도 모의 sync 완료/재시도 검증 통과. 실환경 읽기 전용 UI 검증은 목록 30건/완료 배지 2건/이전 이력 33건, 모바일 가로 넘침 및 pageerror 없음. Worker online/ready 유지. 실제 POP3 동기화는 이번 검증에서 재실행하지 않았다.

## 2026-09-17 메일 목록 분석 이력 배지

- 목록에 초록색 `✓ 분석 완료`와 최신 대기/진행/확인 필요/실패 표시를 추가했다. 이전 완료 후 재분석 실패/진행 중이면 완료 이력과 최신 상태를 함께 표시한다. 확정 연결된 이전 문서는 별도 건수로 표시하고 미연결 문서를 임의 연결하지 않는다.
- 인증된 `GET /api/mail-analysis?mailIds=...`는 현재 MCP 저장소와 최대 100개의 숫자 ID로만 집계한다. 웹/직접 실행을 모두 포함하고 본문·보고서를 반환하지 않는다. 현재 페이지당 단일 DB 조회이며 `analysis_by_mail` 인덱스를 추가했다. 기존 10초 폴링은 배지만 갱신하고 목록/검색/선택/스크롤을 유지한다. 늦은 이전 페이지 응답은 무시하고 조회 실패는 이력 없음과 구분한다.
- 통합 테스트 **23개 통과**: 별도 임시 PostgreSQL schema에서 동일 숫자 ID의 저장소 분리, 완료+실패 재분석, 대기/확인 필요, 확정 legacy 연결, 미연결 제외, 100건 초과 집계, 인증/입력 제한, 추가 MCP 호출 없음 검증. 테스트 종료 시 해당 schema만 제거했다.
- `verify-mail-analysis.mjs` 합성 브라우저 검증 통과: 일괄 조회, 모든 상태 배지, 기존 완료 보존, 이력 없는 메일 무표시, 10초 갱신/검색·선택 유지, 조회 실패/회복, 페이지 이동/늦은 응답 무시, 모바일. API 변경 요청 0건/pageerror 0건. 합성 캡처는 `.runtime/mail-analysis-*.png`에 보존했다.
- `verify-history-ui.mjs`, `verify-maintenance-ui.mjs`, `verify-markdown.mjs`, `verify-preview.mjs`, TypeScript 및 변경 JS 구문 검사 통과.
- API 컨테이너만 `--no-deps`로 반영하고 배포 정적 파일의 해시 일치를 확인했다. 배포 환경 합성 배지 검증 및 실환경 읽기 전용 UI 검증 통과: 현재 목록 30건 중 완료 배지 2건이 API 집계와 일치, 이전 이력 33건, 모바일 가로 넘침/pageerror 없음. 지정 메일 1130과 직접 분석 메일 1133의 완료 이력도 확인했다. Worker online/ready 유지. 실제 sync나 신규 고객 분석은 실행하지 않았다.

## 2026-09-17 Markdown viewer

- 분석 보고서·지식 제안·리뷰·이전 문서를 Markdown 서식으로 렌더링한다. 제목, 강조, 취소선, 표, 목록/읽기 전용 체크 목록, 인용, 코드 블록을 지원한다. 각 문서의 원문/문서 전환과 기존 export를 유지하며 저장된 내용을 변경하지 않는다.
- `marked@18.0.13`과 `dompurify@3.4.15`를 고정하고 `viewer/markdown.js`를 `public/markdown/viewer.js`로 번들한다. [marked 공식 문서](https://marked.js.org/)의 정제 권고에 따라 [DOMPurify](https://github.com/cure53/DOMPurify)의 제한된 태그/속성 목록을 적용한다. HTML은 DOM 생성 전에 escape하고 이미지 토큰은 설명 문자로 변환한다. HTTP(S)만 새 창 링크로 허용하고 상대 경로/앱 hash/javascript/file 링크, 폼, 스타일, SVG, iframe은 실행하지 않는다. CSP 완화 없음.
- `scripts/verify-markdown.mjs`의 합성 브라우저 검증 통과: 서식, 지식/리뷰/이전 문서, 원문 정확 일치, export 링크 유지, 위험 HTML/URL/이미지 비실행, 외부 및 예상 외 내부 요청 0건, API 변경 요청 0건, pageerror 0건. 390px 모바일에서 페이지 가로 넘침 없이 표/코드 내부 스크롤 확인. `.runtime/markdown-desktop.png`, `markdown-mobile.png` 육안 확인 완료.
- `verify-history-ui.mjs`, `verify-maintenance-ui.mjs`, `verify-preview.mjs` 회귀 검증 통과. 메뉴/레이어/포커스/늦은 응답/인증 만료, 기존 상태 문구, Office 세 형식/다운로드/실패 재시도 유지.
- `npm.cmd run check`, 변경 JavaScript 구문 검사 통과. API/DB 계약 변경이 없어 DB 통합 테스트를 재실행하지 않았다. Mermaid/코드 실행·구문 강조·문서 이미지 로드는 이번 범위에 포함하지 않는다.
- Docker API만 `--no-deps`로 갱신했다. 배포된 Markdown 합성 검증과 실제 UI 읽기 전용 검증(메일 목록 30건·이전 이력 33건·모바일·pageerror 0건)이 통과했다. 기존 지정 메일 1130 보고서의 기본 렌더링 및 원문 전환을 확인했고 웹/직접 CLI/저장 보고서 해시가 일치했다. 새 고객 분석이나 sync는 실행하지 않았다.

## 완료한 구현
- 별도 Git 프로젝트 mail-triage-web 생성 및 Docker Compose 구성.
- 웹/API, PostgreSQL 공용 이력, Codex Worker 실행.
- 메일 목록/검색/본문/이미지·텍스트 첨부 조회, 동기화 버튼, 분석 큐, 이력/보고서/질문 답변 화면.
- 공용 이력 API: 실행 등록, 요청 멱등성, 동일 메일 동시 실행 차단, lease/heartbeat, 불변 결과, 재분석, 리뷰, Markdown export.
- erp-manager CLI 및 스킬 분기 추가, history.local.json 설정으로 공용 모드 연결.
- ERP 경로 환경변수 지원. Worker는 업무 자료와 ERP 코드만 읽기 전용으로 마운트.
- API 인증 정보는 Worker의 모델 subprocess 환경과 업무 자료 마운트에서 제외.
- 웹에서는 자동 sync/Outlook/Orca/Claude 리뷰를 요청하지 않고 mail MCP sync 도구도 비활성화.
- 업무 지식은 report result의 knowledge 제안으로 저장. docs 자동 반영은 미구현.

## 실제 실행 결과
1. TypeScript 타입 검사 통과.
2. Docker의 전용 임시 PostgreSQL 스키마 통합 테스트 9개 통과.
   - 동시 등록과 요청 재전송
   - 결과 불변성과 재분석 버전
   - 만료된 실행의 저장 차단
   - Message-ID 단독 병합 방지와 저장소 구분
   - Worker claim 배타성과 질문 답변의 새 실행
   - 리뷰 재전송 중복 방지
   - sync 일부 실패와 진전 없음 판정
   - API 인증/Origin/잘못된 UUID 처리
   - 실제 직접 CLI와 웹 API의 양방향 보고서 공유
3. 호스트와 Docker에서 실제 mail MCP 연결 성공. 검증 당시 저장 메일 1,130건, 한 건 조회 성공.
4. Docker에서 실제 DB MCP의 SR DB SELECT 1 AS CONNECTION_OK FROM DUAL 성공.
5. Codex 0.154.0 인증 상태: ChatGPT 로그인 확인.
6. 실제 Codex 호출 이벤트: mail.search_emails, mail.get_email(id=1130), db.execute_query가 completed이며 isError=false.
7. 실제 Codex shell에서 /reference/tools/erp-nav.mjs와 /erp/gg/src/main/webapp 존재 확인 exit 0.
8. Headless Chrome 검증: 로그인, 목록 30건, 본문, 페이지 이동, 모바일 390px 가로 넘침 없음, pageerror 없음.
9. erp-manager CLI status 연결 성공. 공용 운영 이력 list는 빈 배열이며 모의 테스트 기록은 운영 이력에 남지 않았다.
10. Codex 스킬 quick_validate.py UTF-8 검증 통과. erp-manager git diff --check 통과.
11. Docker API/DB healthy, Worker ready 상태 확인.

## 해결한 환경 차이
- mail MCP는 Host=localhost:17082만 허용한다. Node fetch는 Host override가 적용되지 않아 API 프로세스의 loopback-only 고정 대상 HTTP 어댑터를 사용한다. Codex MCP 클라이언트는 명시적 Host 헤더로 연결한다. 기존 MCP 서버 설정은 변경하지 않았다.
- Codex 기본 bubblewrap가 Docker의 비특권 namespace 제한으로 shell 실행에 실패했다. 지원되는 use_legacy_landlock backend를 활성화하고 sandbox=read-only를 유지해 파일 접근을 확인했다.
- Landlock backend는 deprecated이므로 Codex를 0.154.0으로 고정했다. Codex/Docker 업그레이드 시 다시 검증해야 한다.
- 최초 smoke는 모델의 요약 문자열을 검사했으나 표현이 부정확할 수 있어 실제 MCP/명령 이벤트를 검사하도록 수정했다.

## 아직 실행하지 않았거나 미완료인 사항
- 고객 메일 한 건의 전체 업무 분석 → 보고서 저장까지 실제 Worker 종단 검증.
  현재 실제 MCP/AI/파일 접근은 검증했고, 이력 저장 흐름은 합성 메일/보고서로 검증했다.
- 실제 sync 버튼으로 신규 POP3 메일을 수집하는 검증. 부분 실패 판정은 테스트 데이터로 검증했다.
- 기존 Markdown 로그/보고서의 preview·식별자 대조·가져오기.
- MCP에 없는 Outlook 단건 예외의 공용 식별 및 등록.
- 업무 지식 제안의 단일 자동 반영기와 원본 해시 대조.
- 사용자 요청 취소 UI, 보다 상세한 실시간 단계 표시.
- DB 재시작/프로세스 강제 중단을 동반한 복구·백업 복원 실험.
- 사내 다중 사용자 인증/HTTPS. 현재는 localhost 전용 단일 사용자 토큰 방식.

## 실행 상태와 사용
주소: http://localhost:3080
로그인: 프로젝트 .env의 TRIAGE_TOKEN. 비밀 값은 이 문서/Git/로그에 기록하지 않는다.
기존 erp-manager Markdown 이력은 삭제하거나 이관하지 않았다. 새 공용 이력과 함께 확인한다.
프로젝트를 Git commit/push하지 않았다.

## 2026-09-16 이미지 자동 표시 수정
- 원인: 메일 상세에서 본문 텍스트만 즉시 표시하고 이미지는 첨부 버튼을 눌러야 조회하도록 구현되어 있었다.
- 수정: 메일을 열면 본문 아래 이미지 목록을 자동 조회·표시한다. 동시에 최대 3개를 조회하고 이미지별 실패 안내와 재시도를 제공한다.
- MCP image 및 embedded resource 이미지 형식을 지원한다. 메일 HTML을 실행하거나 원문 내 이미지 위치를 추정해 바꾸지는 않는다.
- 검증: 실제 메일의 이미지 3개(622×106, 969×145, 789×143)가 버튼 없이 표시됨. 조회 실패 모의 응답 후 재시도 성공, 중복 카드 없음.
- 이미지 응답 처리 회귀 테스트 2개 통과. TypeScript 검사 통과. Chrome desktop/mobile 390px 가로 넘침과 pageerror 없음.
- 로컬 Docker API 재빌드·반영 완료, healthy 상태 확인.

## 2026-09-16 본문 내 이미지 표시
- 위의 본문 아래 자동 이미지 목록 방식을 확장했다. mail MCP `get_email_html`이 저장 원본의 HTML과 CID 연결을 읽으며 기존 텍스트 API와 DB는 유지한다.
- 문단·표·인용문 안의 이미지 위치에 같은 메일의 첨부를 표시한다. 본문에서 반복 참조한 서명 이미지는 원래 위치마다 표시하며 미참조 첨부만 하단에 남긴다.
- 서버에서 스크립트·스타일·외부 이미지 등을 제거하고 웹에서 다시 허용 요소만 생성한다. CID 중복·미확인 참조는 임의 이미지로 연결하지 않는다.
- MCP Docker Gradle 전체 build/test 통과. HTML 선택·CID 경로·유해 콘텐츠 제거·첨부 메일 분리 테스트 3개와 새 도구 HTTP 스키마/조회 검증 포함.
- 웹 TypeScript 및 Docker 테스트 11개 통과. 실제 Chrome에서 이미지 3종이 본문 5곳(서명 반복 포함)에 로드됨. 별도 이미지 목록 0개.
- 브라우저 검증: 문장 사이 위치, CID 반복/중복 처리, 외부 요청·실행 요소 없음, 본문 내 실패 후 재시도, HTML 조회 장애 시 전체 텍스트 대체, 390px 가로 넘침 없음, pageerror 없음.
- 반복 CID 이미지의 실패가 여러 위치에 남는 문제를 재시도 회귀 검증에서 확인해 보완했다. 한 곳에서 재시도하면 같은 첨부의 모든 표시 위치가 함께 복구된다. 보완 후 verify-inline-images.mjs와 verify-images.mjs 모두 통과.
- 초기 브라우저 실행은 MCP 재시작 중 목록 조회 시간 초과가 발생했고, healthy 확인 후 재실행하여 통과했다.
- mail MCP와 웹 API의 Docker 재빌드·컨테이너 반영 완료. 메일 재동기화나 분석 실행은 하지 않았다.
- 검증 스크립트: scripts/verify-inline-images.mjs. 화면 캡처는 Git 제외 .runtime에만 저장한다.

## 2026-09-16 첨부파일 목록과 다운로드
- 사용자 선택 범위: 파일 목록·다운로드. ZIP 내부 목록이나 문서 내용 미리보기는 추가하지 않았다.
- 본문 위 첨부 목록에 파일명·형식·크기·다운로드 버튼을 표시한다. 이미지 포함 전체 첨부를 나열한다.
- 동일 메일/첨부 식별자를 검증하고 인증된 API에서 원본 바이트를 attachment로 전달한다. 파일명 경로/제어 문자 제거, octet-stream 응답을 적용했다.
- 기존 MCP 전달 한도 5 MiB를 그대로 적용한다. 큰 파일이나 식별자가 없는 첨부도 목록에 표시하고 다운로드 제한을 설명한다.
- TypeScript 및 Docker 테스트 14개 통과. 다운로드 인증, 원본 바이트 보존, 잘못된 응답/파일 크기 경계를 검증했다.
- 실제 메일 첨부 3개 목록과 첨부 1개(7,672바이트)의 다운로드 결과가 MCP 원본과 동일함을 확인했다.
- ZIP·DOCX·PPTX·XLSX 이름/형식 표시와 다운로드는 합성 응답으로 검증했다. 문서 파싱이나 해당 형식의 실제 고객 문서 검증을 수행한 것은 아니다.
- 실패 후 다운로드 재시도, 긴 파일명/HTML 문자 처리, 390px 모바일 가로 넘침 없음, pageerror 없음. 기존 본문 이미지 표시 검증도 통과했다.
- 웹 API Docker 재빌드·반영 완료. mail MCP 코드나 한도는 변경하지 않았다.
## 2026-09-16 최종 UI와 인수인계
- 분석 이력 버튼을 분석 버튼 옆 파란색 버튼으로 배치. 데스크톱/390px 모바일의 배치·색상·이력 GET 요청 정상 확인.
- 첨부 목록은 details/summary로 기본 닫힘. 클릭·Enter·Space·모바일 조작, 메일 재선택 시 닫힘, 펼친 후 실제 다운로드를 확인했다.
- 마지막 검증에서 기본 접힘 확인과 verify-downloads.mjs가 통과했다. 위 전체 테스트 14개 이후 이 작은 UI 변경은 실제 브라우저로 검증했다.
- 계획서 완료 표시를 확인된 범위에 맞추고 docs/work-summary.md에 세 저장소 변경·제약·미완료 검증·후속 순서를 정리했다.

## 2026-09-16 Office 미리보기 추가

- 인수 후 사용자 요청으로 DOCX/PPTX/XLSX 미리보기를 범위에 포함했다. 사용 라이브러리: `@extend-ai/react-docx@0.9.2`, `@extend-ai/react-pptx@0.2.1`, `@extend-ai/react-xlsx@0.16.4`. 각 공식 GitHub README와 설치 패키지 타입/Worker/WASM 구성을 확인했다.
- 첨부 목록의 미리보기 버튼, 읽기 전용 모달, 닫기/Escape 및 포커스 복원, 로딩·실패·60초 타임아웃·재시도, 원본 다운로드를 구현했다. 모달을 닫거나 메일을 바꾸면 요청을 취소하고 프레임을 제거한다.
- 기존 인증 다운로드 API의 원본 바이트와 5 MiB 제한을 재사용한다. ZIP/미지원 확장자에는 미리보기 버튼을 표시하지 않으며 초과 크기/식별자 누락은 비활성화한다.
- `viewer/` React 앱은 Vite로 `public/preview/`에 빌드한다. 형식별 코드/Worker/WASM은 로컬에서 필요 시 로드한다. 별도 프레임의 CSP만 WASM/인라인 스타일을 허용하며 외부 fetch/이미지/폰트, 하위 프레임, 폼 전송을 차단한다. 문서 링크는 클릭/키보드/중간 클릭 탐색을 막는다. 프레임은 같은 출처의 신뢰된 뷰어 코드를 실행하므로 별도 출처의 보안 격리 환경이라는 의미는 아니다.
- XLSX Worker 방식에서는 `workbook` 객체가 없어도 표시가 가능하므로 로딩 종료와 탭 목록으로 완료를 판정했다. 읽기 전용 시트 전환 및 확대/축소 UI를 제공한다.
- `npm.cmd run check`, `npm.cmd run build:viewer` 통과. WASM 및 문서 렌더러 특성상 500 kB 초과 번들 경고가 있으며 형식별 지연 로딩을 적용했다.
- `docker compose --profile verification run --rm tests`: **15개 통과**. 기존 인증/다운로드/이력 통합 테스트 및 메일 화면 CSP를 완화하지 않고 뷰어에만 WASM을 허용하는 회귀 검증을 포함한다. 전용 임시 PostgreSQL schema를 사용하며 운영 이력은 변경하지 않았다.
- `python scripts/create-preview-fixtures.py` 및 `node --import tsx scripts/verify-preview.mjs` 통과. 실제 OOXML 구조의 합성 DOCX 본문/표, PPTX 두 슬라이드, XLSX 두 시트 전환과 읽기 전용 상태를 브라우저에서 확인했다. HTML/이미지 응답을 문서처럼 꾸민 검증이 아니라 세 라이브러리가 문서 바이트를 파싱하고 렌더링한 결과다.
- 같은 스크립트를 `PREVIEW_BASE_URL=http://localhost:3080`으로 실행해 Docker에 반영된 정적 파일과 응답 CSP에서도 통과했다. 이 미리보기 검증의 API는 모두 브라우저 모의 응답이며 고객 메일/DB/MCP를 사용하지 않는다.
- 데스크톱/390px 모바일, 로드 실패 후 재시도, 원본 다운로드 바이트 일치, 401 인증 만료, 세 형식 손상 파일, 외부 fetch/이미지/링크 차단, Escape/포커스 복원 확인. API 변경 요청 0개, pageerror 0개. 502/401 및 CSP 콘솔 메시지는 의도한 실패·차단 검증에서 발생했다.
- `.runtime/preview-{docx,pptx,xlsx}[-mobile].png`를 저장하고 주요 데스크톱/모바일 화면을 육안 검토했다. 검토 중 XLSX 배율 표시를 100%로 보완했고 재검증했다. 합성 문서/캡처와 빌드 생성물은 Git 제외다.
- `scripts/verify-ui.mjs`의 본문 선택자를 HTML/텍스트에 모두 맞게 보완했다. Docker 반영 후 로그인, 목록 30건, 상세, 페이지 이동, 모바일 가로 넘침 없음과 pageerror 없음 확인.
- `scripts/verify-downloads.mjs`는 미리보기 버튼 추가 후 다운로드 버튼을 명시적으로 선택하도록 보완했다. Docker 반영 후 실제 첨부 한 건 7,672바이트 원본 일치, 합성 확장자 표시/재시도/제한/모바일 검증 통과.
- `docker compose up -d --no-build --no-deps --wait api`로 API만 반영했다. API/DB healthy, Worker running을 확인했다. ERP/mail MCP 코드 변경, 고객 메일 분석, POP3 sync, 이관, commit/push는 수행하지 않았다.

제한: 실제 고객 DOCX/PPTX/XLSX 문서의 복잡한 서식·차트·폰트·암호화 호환성 전체를 검증한 것은 아니다. DOCX 내장 폰트 로드는 끄고 로컬 대체 폰트를 사용한다. 원본 Office 프로그램과 렌더링이 다를 수 있으며 ZIP 내부, 구형/매크로 형식 및 편집은 이번 범위 밖이다. 기존 실제 Worker 전체 분석/POP3/이관/백업 복원 미완료 항목은 그대로 남아 있다.

## 2026-09-16 viewer 이후 계획서 후속 검증

위 viewer 시점의 미완료 항목 중 이관/동기화/격리 복구 검증을 이번 작업에서 진행했다.

- `npm.cmd run check` 통과. `docker compose --profile verification run --no-deps --rm tests`: **22개 통과**. 기존 15개에 legacy 동시 가져오기/해시/명시적 연결, Outlook mailbox 범위 식별, 만료 결과 재등록/멱등성, API 장애 시 Worker admission 차단, 실제 합성 파일 지식 반영/완료 저장 실패 후 재전송/원본 충돌, BOM/CRLF 보존 이관 CLI, 순차 sync/중복 배제/부분 실패/중단 복구를 추가했다.
- `scripts/verify-recovery.mjs` 통과. 격리 프로젝트 `triage-recovery-20c6f81d`에서 합성 DB를 `pg_dump -Fc`로 백업하고 별도 DB에 복원한 뒤 7개 테이블/4행 해시 일치를 확인했다. 단일 Worker 잠금 소유 프로세스 강제 종료와 실제 DB 컨테이너 재시작 각각에서 잠금 재획득, 오래된 owner 거부, 대기 작업 완료, 중단 sync 실패 전환을 확인했다. 생성한 테스트 프로젝트/볼륨만 정리했다. 실제 Codex 프로세스나 운영 고객 분석을 강제 종료한 검증은 아니다.
- 실제 이력 preview `.runtime/legacy-preview-20260916.json`: 보고서 32건+로그 1건. import 결과 `imported=33, existing=0, verified=33, linked=0`. 동일 manifest 재실행 결과 `imported=0, existing=33, verified=33`. API에서 모든 내용/해시 대조 완료, 원본 수정 없음. receipt `.runtime/legacy-import-20260916.json`. 확정할 수 없는 메일 연결을 만들지 않았으며 고객 완료 상태를 재분류하지 않았다.
- 실제 POP3 수집은 웹 동기화 버튼을 한 번 눌러 수행했다. 결과 `completed, saved=3, failed=0, remaining=0`. mail MCP 구현의 POP3 폴더 READ_ONLY/close(false)를 확인했고 메일 발송·삭제·읽음 처리나 AI 분석은 수행하지 않았다. 첫 브라우저 스크립트는 갱신 직전 화면을 검사하여 실패했으나 API 작업은 성공했다. 화면 대기 코드를 보완하고 재수집 없이 읽기 전용 UI 검증으로 최종 건수를 확인했다. `.runtime/live-sync-validation.json` 및 `.runtime/live-ui-validation.json` 참조.
- `scripts/verify-maintenance-ui.mjs`: legacy 목록/메일별 명시적 필터, 원문을 HTML로 실행하지 않음, Outlook 질문의 직접 실행 안내, 긴 파일명/모바일 통과. 모의 API만 사용, 변경 요청 0개/pageerror 0개.
- 실제 이관 자료로 모바일 검증 시 긴 파일명이 가로로 넘치는 문제를 발견하고 버튼 최소 폭/줄바꿈을 보완했다. 배포 후 `scripts/verify-ui.mjs`에서 로그인/메일 30건/상세/페이지/이관 33건/동기화 최종 건수 표시/390px 가로 넘침 없음/pageerror 없음 통과.
- Docker 배포 자산에서 Office 세 형식 합성 parser/Worker/WASM 렌더링 회귀 검증 통과. 의도된 401/502/CSP 차단 메시지 외 pageerror 없음.
- 첫 통합 테스트 때 Compose의 새 restart 설정으로 기존 DB 컨테이너가 재생성되었고 이전 API/Worker가 연결 오류로 종료됐다. 영구 볼륨을 유지하고 API/Worker를 재시작하여 복구했다. 그 후 통합 테스트에 `--no-deps`를 사용하고 강제 종료/DB 재시작 실험을 별도 프로젝트로 분리했다. 새 코드에는 pool idle 오류 처리와 Worker 잠금 소실 시 중단을 추가했고 서비스는 `unless-stopped`로 설정했다.
- API/Worker는 `--no-build --no-deps`로 새 이미지에 반영했다. 실제 고객 전체 Worker 분석과 Outlook COM 수집, 실제 업무 지식 문서 적용은 하지 않았다. 수직 검증용 mail MCP ID는 사용자 답변 대기다. ERP 코드·ERP DB 변경 및 commit/push 없음.
- 직접 실행의 `erp-manager/.claude/mail/shared-history.md`만 기존 내용을 보존하여 새 운영 절차와 연결했다. 미구현 안내를 수정하고 미연결 이력/기존 완료 상태 보존 및 운영 도구 문서 링크를 추가했다. ERP 소스·인증 설정은 변경하지 않았다.
- 이관 후 실제 앱 이력 DB를 `.runtime/triage-after-maintenance-20260916.dump`로 백업했다. 297,522바이트, SHA-256 `862de96ce67d810639621621d33ed9761d64e86b9efdc080e2d9683970cbd8d0`. 이 실제 백업 파일 자체의 복원은 수행하지 않았으며 위 복원 실험은 격리 합성 데이터다.
- 최종 상태: API/DB healthy, Worker online/ready, 실행 이력 0건/활성 작업 0건, legacy 33건, 실제 sync completed(3/0/0). `.runtime` 및 dump는 Git 제외를 확인했다.

## 2026-09-17 사용자 지정 메일의 실제 Worker 전체 분석

- 제목 검색 결과 정확히 한 건, MCP ID 1130과 Message-ID를 대조했다. 기존 공용 실행 0건을 확인한 뒤 실제 브라우저의 **이 메일 분석** 버튼으로 한 번 등록했다. 임의 고객 메일 선정, sync, 메일 발송은 하지 않았다.
- 실행 ID `b3c3523b-7828-43a0-b393-9072945d79e7`. 10:38:18~10:43:29 KST, 310.958초, `queued → running → completed`. API 실행 오류 없음.
- Worker의 `tool-calls.json`과 Codex 실행 세션을 함께 확인했다. 지정 ID의 `get_email` 성공, DB SELECT 13회 중 12회 성공, DB 목록·스키마 조사 및 파일 읽기 명령을 확인했다. 쓰기 쿼리, sync, Outlook, Claude 리뷰 호출은 없었다. 14개 근거 항목을 갖는 구조화된 최종 보고서가 저장됐다.
- 조회 실패는 메타데이터 4건과 문자열 조회 1건이었다. 후자는 일반 문자열 SELECT로 재조회 성공했고, 메타데이터 접근 제한·운영 프로시저 미검증·로그/배포본 미확인은 보고서에 기록됐다. 도구 완료 수만으로 모든 조회가 성공했다고 판단하지 않았다.
- 주요 집계·상태·감지 조건·발송 이력 네 가지를 실제 MCP 결과와 보고서 문장 사이에서 대조했다. 과거 보고서와 현재 조회의 차이를 별도로 표시하고 실제 발생 경로를 미확정으로 남긴 점을 확인했다. 고객 처리 상태나 ERP 데이터를 변경하지 않았다.
- `scripts/verify-live-worker.mjs verify --mail-id 1130 --direct-cli C:/Users/david/IdeaProjects/erp-manager/tools/triage-history.mjs` 통과. 웹 본문, 직접 CLI result JSON, API 보고서 및 Worker 파일의 보고서 해시가 모두 일치했다. 390px 가로 넘침 없음/pageerror 0개.
- 보고서 SHA-256: `be4019d855c65c95ee8d73ff891d6de9a05ae82df1ae898e9077be9c0a430050`. Worker `recovery.json` 상태 `registered`. 결과 JSON 해시 `810da6701324b0353fea1e06dc58fa2ebc2c88652d3b1c6c4d636ee0445e364e`.
- 해시 검증 export 성공. Git 제외 `.runtime/worker-e2e-1130-report.md`(보고서 사본), `worker-e2e-1130-result.json`(API 결과), `worker-e2e-1130-validation.json`(화면/CLI 검증), `worker-e2e-1130.json`(실행 receipt)에 보존했다. 원본 업무 문서나 기존 보고서를 덮어쓰지 않았다.
- 실제 실행에서 `/reference/.claude/mail/triage-log.md` 연결 누락을 발견했다. 해당 보고서는 로그 미대조를 정확히 제한으로 표시했다. 호스트의 대상 로그를 직접 대조하여 기존 처리 분류와 보고서의 일치를 확인한 뒤, 완료된 실행을 보존하고 `compose.yaml`에 원본 로그 read-only bind를 추가했다. `docker compose --profile analysis up -d --no-build --no-deps worker`로 Worker만 반영했다. 파일 읽기 성공과 `/proc/self/mountinfo`의 `ro` 옵션 확인. API/DB 재시작이나 전체 분석 재실행은 하지 않았다.
- 최종 Worker online/ready 확인. 이번 수정은 Compose의 읽기 전용 참조 추가 및 검증 스크립트/문서이며, 이 범위는 실제 마운트와 브라우저/CLI 검사로 검증했다. 기존 통합 테스트 22개를 이번 실행에서 재실행하지 않았다.

## 2026-09-17 팀 인증·배포 계획 추가

- 사용자 요청으로 Auth0 ID/비밀번호와 팀 내부 운영, Vercel 및 Docker 서버 대안을 검토했다. 추가 답변인 회사 SSO 불필요·기존 상시 서버 없음/개인 PC만 보유를 계획서에 반영했다.
- 현재 인증·이력·sync·Worker·Compose 코드를 확인했다. 단일 공용 토큰, 요청자 미기록, 응답 후 sync, 상시 Worker/로컬 볼륨, 개인 PC MCP 연결을 팀 전환 작업으로 분리했다.
- Auth0 로그인/Express/Device Flow/요금표, Vercel Functions 제한·Hobby 범위, Render Background Worker, Entra OIDC 공식 문서를 조회했다. Entra는 비교 후 이번 범위에서 제외했다. 플랫폼 사실과 이 앱에 대한 설계 판단을 `team-deployment-plan.md`에 구분하고 근거 링크를 기록했다.
- 권장 순서: Auth0 이메일·비밀번호/앱 권한 → 개인 PC의 제한된 팀 파일럿 → ERP망 연결 가능한 상시 VM의 Docker 운영. Vercel 웹만 올려도 PC의 Worker/MCP 의존은 해소되지 않으며, 클라우드 ERP 접근이 불가하면 내부 상시 호스트 확보가 선행 조건이다.
- 계획서·README·작업 정리·검증 기록만 변경했다. 런타임 코드/인증 설정/네트워크/DB/실행 중 서비스 변경 없음. 문서 링크와 최종 요구 반영을 확인했으며 문서 변경이므로 빌드·통합 테스트를 재실행하지 않았다.

## 2026-09-17 메뉴 분리와 메일별 이력 레이어

- 사용자 피드백에 따라 하단에 쌓이던 메일별 이력을 native dialog 레이어로 옮겼다. 해당 메일의 분석 이력/확인 연결된 이전 이력을 조회하고, 보고서와 이전 문서를 같은 레이어에서 읽는다. 목록 복귀, 새로고침, 닫기/Escape, 포커스 복원, 배경 스크롤 유지, 모바일 전체 화면을 제공한다.
- 상단 메뉴를 메일함/분석 이력/이전 이력으로 분리했다. hash 경로로 메뉴를 선택하고 메일함 검색·선택 DOM을 유지한다. 메일별 레이어의 필터·페이지와 전체 이력 메뉴의 상태를 분리하여 서로 영향을 주지 않게 했다.
- `scripts/verify-history-ui.mjs`의 합성 API/브라우저 검증 통과: 메뉴 표시 분리, 검색·메일 선택 유지, 정확한 mail/store 필터, 100건 이후 추가 조회, 보고서 목록 복귀, Escape/포커스/스크롤, 실패 재시도, 늦은 응답 무시, 빈 이력, 긴 보고서/390px 모바일, 인증 만료 시 레이어 닫기. API 변경 요청 0건/pageerror 0건. 합성 데스크톱·모바일 캡처를 `.runtime/history-*.png`로 남기고 육안 확인했다.
- `scripts/verify-maintenance-ui.mjs`는 새 메뉴/레이어 구조에 맞게 갱신하고 통과했다. 기존 문서의 HTML 비실행, 고객 완료 상태 문구 보존, Outlook 직접 답변 안내, 긴 경로 줄바꿈을 확인했다.
- `scripts/verify-preview.mjs` 통과. Office 세 형식 파싱/Worker/WASM·모바일·실패/재시도·다운로드·인증 만료·외부 요청 차단·Escape 동작 유지. 의도된 실패/CSP 콘솔 메시지를 제외한 pageerror 없음.
- `npm.cmd run check` 및 변경 JavaScript 구문 검사 통과. 서버 API/DB 계약은 변경하지 않아 DB 통합 테스트는 재실행하지 않았다. 실제 sync/새 AI 분석을 검증 목적으로 실행하지 않았다.
- 기존 실환경 검증 스크립트는 메뉴 이동/레이어 선택자에 맞게 갱신했다. sync 검증은 숨겨진 전체 이력 새로고침 버튼 대신 실제 동기화 표시 갱신을 기다리도록 수정했다.
- Docker API만 `--no-build --no-deps --wait`로 반영했고 배포된 app.js/style.css/index.html의 해시가 최종 로컬 소스와 일치함을 확인했다. 배포 환경의 합성 이력 레이어 검증도 통과했다.
- 실환경 읽기 전용 검증 통과: 메일 목록 30건/본문/페이지 이동/이전 문서 33건/동기화 표시/모바일 가로 넘침 없음/pageerror 0개. 기존 메일 1130의 보고서를 새 레이어에서 열어 직접 CLI 결과와 본문·해시 일치를 재확인했다. 새 분석은 만들지 않았으며 기존 Worker는 online/ready 상태를 유지했다.

## 2026-09-17 이미지 첨부 미리보기

- 본문 CID 이미지는 원래 위치에 유지하고, 본문 아래 자동 첨부 이미지 영역만 제거했다. 첨부 목록의 이미지 미리보기는 기존 Office dialog와 인증 다운로드 API를 재사용하며 PNG/JPEG/GIF/WebP/BMP/AVIF를 지원한다. 미리보기 버튼을 눌렀을 때만 별도 이미지 파일을 요청한다.
- `node --import tsx scripts/verify-images.mjs`는 이제 합성 전용 `verify-image-preview.mjs`를 실행한다. 본문 위치 보존, 하단 영역 제거, 목록 기본 접힘, 클릭 전 별도 첨부 요청 없음, MIME 미지정 PNG, 5 MiB/식별자 제한, 손상 파일/실패 후 재시도, 다운로드 바이트 일치, Escape/포커스 복원, 닫은 후 늦은 응답, HTML 실패 대체, 인증 만료, 모바일 검증 통과. 고객 메일/DB/MCP 조회 없음.
- `node --import tsx scripts/verify-preview.mjs` Office 세 형식 회귀 검증, `npm.cmd run check`, 기존 이미지 단위 테스트 2개 통과. 합성 이미지 미리보기 데스크톱/모바일 캡처를 `.runtime/image-preview-*.png`에 저장하고 모바일 레이아웃을 육안 확인했다.
- 같은 작업 폴더에서 별도 동기화 진행 UI 변경이 동시에 발견되어 실행 중 API 재생성은 수행하지 않았다. 위 검증은 수정 소스를 제공하는 임시 로컬 서버 기준이다.

## 2026-09-18 React 메인 화면 전환 R0~R6

- 계획을 먼저 작성하고 지정 Orca 터미널의 선행 작업 완료 및 기준 커밋 `97525f6`을 확인한 뒤 구현했다. `ui/`에 React + TypeScript + Vite 메인 앱을 만들고 Express의 기본 `/`와 Docker 빌드에 연결했다. API·토큰 인증·DB·Worker는 기존 계약을 유지한다.
- 검색·선택·스레드·수동 연결·스크롤·모바일·동기화·분석 진행·답변 초안·처리 상태·관련 메일·이력 레이어를 React 상태로 이관했다. 기존 CSS와 HTML/Markdown 정제, Office iframe, 초안 저장 모듈은 재사용하고 대체된 DOM 파일 8개는 제거했다.
- `npm run check`, 전체 빌드, `npm run verify:ui`의 합성 브라우저 검사 **15개 통과**. 추가 상태 검사와 `--strict-dev` 개발 React/StrictMode 검사도 통과했다. 기존 기준선에서 발견한 두 브라우저 조작 누락은 팝오버 닫기·모바일 메뉴 열기를 추가하여 기존 UI에서도 통과함을 확인했다.
- 1,000개 합성 목록 비교, 초기 Office/WASM 요청 0건, 데스크톱·모바일 캡처 육안 확인. React 초기 JS/CSS 크기는 증가했으며 측정 조건·수치·제한을 별도 기록했다.
- React 및 기존 UI 복귀 이미지를 운영 데이터 없이 임시 컨테이너에서 검증했다. 유휴 상태 확인 후 최종 API만 `--no-build --no-deps --wait`로 교체했다. Docker 엔진 및 기존 메일 MCP의 중단 상태는 기존 컨테이너를 재기동해 복구했다.
- 실제 `/health`, React HTML/JS/CSS 해시, 토큰 로그인, 메일 목록/상세, 기존 보고서, 390px 모바일 확인 통과. pageerror 0건, 변경 요청은 로그인뿐. 분석 6건·이전 문서 33건·리뷰·처리·관련 메일·수동 연결 해시 및 DB/Worker 컨테이너 ID 유지. Worker online/ready.
- 최종 이미지 `mail-triage-web:react-r6-20260918`와 기존 화면 이미지 `mail-triage-web:pre-react-97525f6`를 로컬 보존했다. 이미지 ID·기능 대응표·명령·복귀 절차는 [React 전환 검증](react-transition-validation.md)에 기록했다.
- 실제 새 AI 분석·동기화·ERP 변경은 수행하지 않았다. 비밀·실메일 원문·생성물·`.runtime`은 Git에 추가하지 않는다. P1~P8 팀 인증·Runner 작업은 미착수로 유지한다.

## 2026-09-18 React Query와 스레드 조회 성능 개선

- `@tanstack/react-query` 5.103.1을 정확한 버전으로 설치했다. 공식 npm 메타데이터의 React 18/19 호환·MIT 라이선스를 확인했고 추가된 의존성은 react-query/query-core 두 개다. npm audit 보고 취약점 0개.
- 메일 목록은 `QueryClientProvider`와 `fetchQuery`를 사용한다. 출처·보기·검색·분석 상태·페이지를 key로 구분하고 15초간 fresh, 미사용 캐시는 60초 뒤 제거한다. 서버 결과 캐시는 QueryClient가 관리하고 화면 선택·스크롤 및 요청 세대 판정은 기존 로직을 유지한다. AbortSignal을 전달하여 이전 조회 취소를 유지한다.
- 명시적 검색·수동 연결·동기화 변화 시 전체 목록 캐시를 무효화한다. 분석 시작·추가 답변·처리 변경 때도 관련 목록을 무효화하며 적용 중인 분석 상태 필터는 다시 조회한다. 401은 QueryClient를 비운다. 실패 자동 재시도·창 포커스 재조회·브라우저 디스크 저장은 사용하지 않는다. 기존 초안은 그대로 보존한다.
- 서버 `ThreadSearchCache`는 출처·검색 조건별 완전한 검색 결과를 15초간 보관한다. 동시에 들어온 동일 검색은 Promise를 공유하고 오류/불완전한 검색은 보관하지 않는다. 최대 8개·직렬화 크기 합계 16 MiB로 보존량을 제한한다. 페이지 번호와 분석 상태는 원본 검색 키에서 제외하되, 매번 최신 DB의 연결·분석 상태를 적용하고 전체 그룹을 만든 뒤 페이지를 자른다.
- DB의 최신 sync 실행 ID/상태/저장 수/배치 수/종료 시각을 매 요청 확인하여 변화 시 서버 캐시를 비운다. `refresh=1`로 명시적 검색도 캐시를 비우며 전체 upstream 조회에는 한 MCP 세션을 재사용한다. 앱 밖에서 MCP 자료가 바뀌면 TTL 뒤 다음 조회에 반영되며 프런트/서버 캐시 시간이 겹치면 약 30초 늦을 수 있다. **검색** 버튼으로 즉시 다시 읽을 수 있다.
- `npm run check` 및 전체 Docker 빌드 통과. 기존 Office 대형 번들 경고는 유지. 메인 JS gzip은 이전 113.61 kB에서 121.00 kB로 약 7.4 kB 증가했다.
- Docker 격리 schema 통합/단위 테스트 **54개 통과**. 새 검사 5개는 동시 요청 공유, TTL/동기화/명시적 갱신, 실패·응답 역전, 용량·LRU 제한, 인증, 상태·연결 재계산 및 페이지 정확성을 검증한다. 기존 운영 schema를 초기화하지 않았다.
- 합성 UI 회귀 **15개 모두 통과**. 스레드 합성 서버 3개는 새 동기화 버전 의존성을 mock 주입하도록 변경했다. 최초 DB 연결 실패는 이 테스트 설정 누락을 수정한 뒤 통과했다.
- `verify-query-cache.mjs`: 페이지 왕복 시 추가 목록 요청 없음, 개별/스레드 캐시 분리, 15초 만료 후 재조회, 동기화 시 다른 페이지까지 무효화, 401 후 이전 캐시 제거 통과. `verify-react-state.mjs --strict-dev`: 실제 개발 React/StrictMode의 요청 경합·폴링 정리·재인증·CSP 검사 통과.

동일 로컬 API·메일 1,162개/542개 대화·페이지 크기 30으로 `measure-thread-api.mjs`를 실행했다. 아래는 API 응답 시간이며 화면 렌더링을 포함하지 않는다.

| 조회 | 적용 전 | 적용 후 재측정 |
|---|---:|---:|
| 캐시 없는 전체 스레드 조회 — 2회 | 2,046 / 1,962 ms | 2,460 / 1,965 ms |
| 다음 페이지 — 2회 | 1,939 / 2,544 ms | 20 / 15 ms |
| 첫 페이지 반복 조회 — 1회 | 1,865 ms | 13 ms |

- API 기동 직후 첫 측정은 캐시 없는 조회가 4,926/3,690 ms, 재사용 조회가 18~33 ms였다. `.runtime/query-cache/after-startup.json`으로 따로 보존하고 안정된 환경에서 위 표를 재측정했다. 최초 조회가 항상 빨라졌다고 주장하지 않는다.
- 동일 실행 중 컨테이너에서 원본 전체 스캔만 기존 연결/세션 재사용/세션 재사용/기존 연결 순서로 교차 측정했다. 페이지별 연결 2,594/2,767 ms, 세션 재사용 2,104/1,730 ms로 관찰했다. 작은 표본이며 장기 부하 검증은 아니다. 전체 메일을 읽는 최초 비용은 남고, 이번 개선의 큰 효과는 반복 전체 스캔 제거다.
- `.runtime/query-cache/before.json`, `after.json`, `browser.json`과 `.runtime/react-validation/`에 결과를 보존했다. 원문·실제 화면 캡처는 커밋하지 않는다.
- 유휴 상태를 확인하고 API만 `--no-build --no-deps --wait`로 적용했다. `/health`, 배포 자산 해시, 실제 로그인·메일 목록/상세·기존 보고서·390px 모바일·pageerror 0건 확인. 분석 6건·이전 문서 33건·리뷰·처리·관련 메일·수동 연결 해시 및 DB/Worker 컨테이너 ID 유지, Worker online.
- 적용 이미지 `mail-triage-web:query-cache-20260918`, ID `sha256:2482a5f984e040b4bd41edd494130dc529989d347194119bf4dcc1f59a7f6e3a`. 직전 React 이미지 `mail-triage-web:react-r6-20260918`를 보존했다. 필요 시 해당 이미지를 local 태그로 지정한 후 API만 `--no-build --no-deps`로 교체한다. 새 실메일 분석·sync·ERP 변경은 실행하지 않았다.

## 2026-09-18 P1 서비스 경계 분리

- `apps/history-api`, `apps/local-app`, `packages/contracts`, `packages/history-client`, `packages/ui` npm workspace 추가. 이력/DB와 로컬 메일 구현을 이동하고 `src` re-export와 기존 실행 경로를 유지했다.
- 인증 주입형 `/api/v1` HTTP 계약과 DB 자격이 없는 클라이언트 구현. 계약 검사는 메모리 repository 합성이며 실제 PostgreSQL v1 종단 검증과 v0 화면 전체의 v1 전환은 후속 작업이다.
- `npm run check`, `npm run build`, 격리 schema 백엔드 55개, 전체 UI 합성 15개 통과.
- 최초 Docker 검사는 Windows node_modules 마운트로 esbuild 플랫폼 오류가 발생했다. 소스 디렉터리만 read-only 마운트하고 컨테이너의 Linux 의존성을 사용해 해결했다.
- 기존 서비스/운영 schema/고객 메일은 변경하지 않았다. Office 기존 대용량 번들 경고는 남는다.
