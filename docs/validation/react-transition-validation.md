# React 화면 전환 검증

검증일: 2026-09-18. 범위는 [통합 구현 계획 4.3절](../implementation-plan.md)의 R0~R6이다. React 메인 화면을 구현하고 로컬 Docker API에 적용했다. Auth0·팀 권한·공용 API 분리·개인 Runner는 이번 변경에 포함하지 않는다.

## 기준과 단계별 결과

Orca CLI는 `C:\Users\david\AppData\Local\Programs\orca\resources\bin\orca.exe`에서 확인했다. 지정 터미널 `term_f7f458c8-c327-41dd-be4c-cb3c936128f7`의 `tui-idle`과 완료 출력을 확인한 뒤 기준 HEAD `97525f6`의 사이드바·수동 스레드·스크롤 변경을 포함해 이관했다. 계획 문서를 먼저 작성했으며 선행 작업 중 화면 소스를 변경하지 않았다.

| 단계 | 결과·산출물 |
|---|---|
| R0 | 기존 화면 기준선·기능 대응·합성 회귀·동일 목록 크기 비교 기록 |
| R1 | `ui/` React/TypeScript/Vite, API DTO/Context, 오류 경계, 타입 검사·Docker 빌드 연결 |
| R2 | 메일함 검색·상태 필터·페이지·스레드·드래그 연결·동기화·스크롤 상태 이관 |
| R3 | 본문·기본 접힘 첨부·다운로드·이미지/Office iframe·Markdown 정제 유지 |
| R4 | 분석·진행·보고서·답변 초안·업무 처리·관련 메일·전체/메일별/이전 이력 이관 |
| R5 | 합성 15개·추가 상태 검사·타입/빌드 통과. React/기존 UI 이미지 격리 검증 |
| R6 | 실제 기본 URL의 React 적용·읽기·데이터 보존 확인. 미사용 DOM 파일 8개 제거·운영 문서 갱신 |

추가 패키지 설치나 lockfile 변경 없이 기존 React 19.3.0·Vite 8.3.0·TypeScript 7.0.2를 사용했다. 서버 런타임 변경은 `/`에서 `public/react/index.html`을 제공하는 부분이며 API·인증·DB 스키마·Worker는 유지했다. `/react/`는 빌드 자산 경로이고 기본 진입점은 `/`다. 과도기 `TRIAGE_UI` 분기는 제거했다.

## 기존 기능과 이관 대응

| 기존 파일·역할 | React 소스 | API·검증 |
|---|---|---|
| `public/index.html`, `app.js`: 로그인·메뉴·공통 상태 | `app/App.tsx`, `api/client.tsx` | `/login`, `/status`; pre-p1-ux, react-state |
| `app.js`: 검색·메일함·동기화·페이지 | `mailbox/MailboxPage.tsx`, `SyncStatus.tsx` | `/mails`, `/mail-analysis`, `/sync`; status-filter, sync-refresh, mail-scroll |
| `mail-threads.js`, `manual-threads.js` | `mailbox/ThreadList.tsx` | `/mails?view=threads`, `/thread-links`; mail-threads, manual-threads |
| `app.js`, `attachment-list.js`: 상세·첨부 목록 | `mailbox/MailDetail.tsx` | `/mails/:id`, `/body`, `/attachments`; image-preview, preview |
| `mail-analysis.js`, `analysis-progress.js` | `MailDetail.tsx`, `analysis/RunProgress.tsx`, `RunReport.tsx` | `/runs`, `/runs/:id`; mail-analysis, analysis-progress |
| `app.js`, `related-mails.js`: 처리·답변·관련 메일 | `analysis/RunReport.tsx`, `RelatedMails.tsx` | `/runs/:id/handling`, `/related-mails`; handling-ui, related-mails, pre-p1-ux |
| `app.js`: 이력 목록·레이어·이전 문서 | `history/History.tsx` | `/runs`, `/legacy`, `/export`; history-ui, maintenance-ui, markdown |

표의 React 경로는 `ui/src/features/` 기준이며 `app/`, `api/`는 `ui/src/` 기준이다. 기존 `public/style.css`, `mail-body.js`, `attachments.js`, `office-preview.js`, `answer-drafts.js`, `mail-scroll.js` 및 `viewer/markdown.js`는 공통 표시·정제·저장 기능으로 재사용한다. 정제 모듈은 React가 내용을 관리하지 않는 빈 leaf에만 마운트한다. Office는 별도 iframe/CSP/WASM 경계를 유지한다.

## 수행한 검증

- `npm run check`, `npm run build`: 통과. 기존 Office 번들의 500 kB 경고는 남아 있으며 메인 UI로 Office 파서를 합치지 않았다.
- 전환 전 기존 UI: 15개 중 13개 최초 통과. manual-threads는 열린 연결 관리 팝오버가 드래그를 가렸고 markdown은 모바일 메뉴를 열지 않은 채 숨겨진 링크를 눌렀다. 실제 사용자 조작처럼 팝오버 닫기·메뉴 열기를 추가한 뒤 기존 UI에서도 두 검사를 재실행해 통과했다. 동작 검증 항목은 제거하지 않았다.
- React: `npm run verify:ui`의 pre-p1-ux, status-filter, mail-threads, manual-threads, mail-scroll, image-preview, preview, mail-analysis, analysis-progress, handling-ui, related-mails, history-ui, markdown, maintenance-ui, sync-refresh **15개 모두 통과**.
- `node --import tsx scripts/verify-react-state.mjs`: 검색·상세 응답 역전 방지, hash 뒤로 이동, 401 이후 폴링 중지·재로그인 검색/선택 보존, 자동 변경 POST 없음, CSP/pageerror 없음. `--strict-dev`를 추가한 별도 개발 React 빌드에서도 통과했다. 개발 renderer임을 확인하고 루트 StrictMode의 Effect 재실행 하에서 10초 구간의 status/summary 요청을 각각 1회로 확인했다. 개발 빌드는 `.runtime/react-strict/`에만 출력하며 배포 자산을 덮어쓰지 않는다.
- 합성 DOCX/PPTX/XLSX를 실제 브라우저의 Worker/WASM으로 파싱했다. 이미지/Office 오류·재시도·닫기·포커스·외부 요청 차단·모바일은 해당 기존 검사에서 확인했다. 합성 데스크톱·모바일 화면을 육안 확인했다.
- `node scripts/verify-react-images.mjs`: 두 이미지를 운영 볼륨·인증값·DB 연결 없이 임시 컨테이너로 시작해 기본 URL·정적 자산·Office·Markdown과 합성 이력 검증을 통과했다. 임시 컨테이너는 종료했다.

로그·합성 캡처·측정치는 Git 제외 `.runtime/react-validation/` 및 `.runtime/*-mobile.png` 등에 저장한다. 최초 기준선 실패와 보정 결과는 legacy 기록으로 남겼다. 실메일 원문·토큰·실제 화면 캡처는 커밋하지 않는다.

### 성능 관찰

Chrome, 1280×900, 합성 메일 1,000개, 새 page 3회씩 측정했다. 단위 ms, 중앙값 기준이다.

| 항목 | 기존 UI | React |
|---|---:|---:|
| 목록 준비 | 145 | 174 |
| 상세 표시 | 65 | 70 |
| 초기 JS/CSS 디코딩 크기 | 194,410 bytes | 382,494 bytes |
| 전체 관찰 요청 수 범위 | 32~38 | 21~27 |
| 초기 Office/WASM 요청 | 0 | 0 |

다른 검사와 병행한 로컬 측정이므로 작은 시간 차이로 성능 향상/퇴보를 단정하지 않는다. React 런타임으로 초기 번들 크기는 늘었다. Office는 요청 시 로드하며 중복 폴링·응답 역전은 별도 상태 검사로 확인했다. `node --import tsx scripts/measure-ui.mjs`로 현재 UI를 재측정할 수 있고, 기존 이미지의 격리 서버 주소를 `LEGACY_BASE_URL`로 주면 동일 모의 API로 비교한다.

## 실제 로컬 적용과 보존

`scripts/verify-react-deployment.mjs before`로 활성 분석·동기화가 없음을 확인하고 이력·연결 해시와 DB·Worker 컨테이너 ID를 기록했다. `docker compose up -d --no-build --no-deps --wait api`로 API만 교체하고 `after`로 대조했다.

최종 React 적용 이미지: `mail-triage-web:react-r6-20260918`, ID `sha256:0940555af66e6ba99a786220d1036fcce448053a151d2f4701c1cac2d1b78884`. 기존 DOM 파일 정리 후 다시 빌드·적용하고 아래 검증을 재확인했다.

- API healthy, 기본 `/`와 React JS/CSS가 로컬 빌드 해시와 일치.
- 기존 분석 **6건**, 이전 문서 **33건**, 보고서/리뷰/처리 상태/관련 메일 및 수동 스레드 연결 해시 유지.
- DB·Worker 컨테이너 ID 유지, Worker online/ready. 볼륨 재생성이나 DB 복원 없음.
- 실제 로그인·메일 목록·상세·기존 보고서 열기 통과. 390px 가로 넘침 없음, pageerror 없음. 변경 요청은 `/api/login`뿐이다.
- 적용 도중 Docker 엔진이 중단되어 Docker Desktop을 다시 기동했다. 기존 서비스들이 복귀한 후 자동 시작되지 않은 기존 메일 MCP 컨테이너도 시작했다. 최초 MCP 준비 전 목록 대기 실패는 준비 완료 후 재실행하여 통과했다. API 교체로 DB·Worker를 재생성하지 않았지만 Docker 복구 과정의 프로세스 재시작은 발생했다.

검증 receipt는 `.runtime/react-deployment/before.json`, `after.json`이다. 실제 새 분석·동기화·ERP 변경은 수행하지 않았다. DB/API 계약 변경이 없으므로 기존 DB 통합 테스트 전체를 반복하지 않았고, 합성 UI 결과를 실제 고객 분석 품질이나 팀 운영 검증으로 해석하지 않는다.

## 기존 화면 복귀

복귀 이미지 `mail-triage-web:pre-react-97525f6`는 선행 작업 완료 후 최신 API와 기존 화면을 함께 빌드한 이미지다. 이미지 ID는 `sha256:1d13ac7471591df5a7351a09d76478e54db374ec930d43c09528c7359e6e22d7`이다. 임시 컨테이너에서 기존 화면·자산·합성 이력 동작을 확인했다. 해당 로컬 이미지를 보존해야 하며 다른 호스트에는 자동 전달되지 않는다.

필요 시 활성 분석·동기화가 없음을 확인하고, 현재 React 이미지에 보존 태그를 붙인 뒤 기존 이미지를 local 태그로 지정해 API만 교체한다.

```powershell
node scripts/verify-react-deployment.mjs before
docker tag mail-triage-web:local mail-triage-web:react-preserved
docker tag mail-triage-web:pre-react-97525f6 mail-triage-web:local
docker compose up -d --no-build --no-deps --wait api
# React 재적용
docker tag mail-triage-web:react-preserved mail-triage-web:local
docker compose up -d --no-build --no-deps --wait api
node scripts/verify-react-deployment.mjs after
```

각 명령 성공을 확인한 뒤 다음 명령을 실행한다. 기존 화면으로 복귀한 동안에는 `/health`, 로그인·목록·기존 이력을 읽어 확인한다. `after` 검사는 React 자산 해시를 요구하므로 React 재적용 후 사용한다. 복귀에 `down -v`, DB 복원, Worker 이미지 교체를 사용하지 않는다.
