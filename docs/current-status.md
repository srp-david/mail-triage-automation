# 현재 구현·배포 상태

구현·검증 기준일: 2026-09-23. 최초 hosted 합성 검증은 `dea1e2c`이며, 이후 update route를 포함한 Supabase `history` function과 candidate.10 catalog secret을 갱신했다. Windows candidate.10의 stale lock 복구·설치·한글 경로 수명주기, 실제 Claude Code 2.1.280 probe와 GitHub prerelease 게시를 확인했다. 인증 실계정의 업데이트 제공·설치와 실업무 수용은 아직 검증하지 않았다.

## 제품 경계

현재 제공 형태는 **Supabase 공용 API·DB + Windows 로컬 앱 + 개인 MCP·AI 실행**이다. 사용자명 계정은 관리자가 생성한다. 공개 가입, Auth0/인증 이메일, 공용 웹에서 PC 없이 수행하는 원격 SR→PR은 현재 제품에 포함되지 않는다.

| 대상 | 확인된 상태 | 남은 항목 |
|---|---|---|
| 공용 API | 서울 Supabase의 `history` 배포, HTTPS health·인증·ACL·결과 저장 검증 | 실제 업무 부하·장기 관찰·pause/resume |
| 공용 DB | PostgreSQL 17.6, `triage_private`, migration 6개, runtime DDL 차단 | 외부 백업·복원과 운영 담당 확정 |
| Data API | 사용자 비활성화 확인, publishable key 접근 401 확인 | 모든 관리 키까지 차단했다는 의미는 아님 |
| 로그인 | 최초 관리자 생성, hosted 로그인·첫 변경 제한 확인 | 팀원 계정 발급·각 사용자 최초 변경 |
| Windows 앱 | candidate.10 setup.exe의 합성 stale lock 복구→설치·기존 historyUrl/port 보존, 한글 경로 lifecycle start/pause/stop 통과. candidate.9 UI E2E 1 passed, .10 UI 동일 | candidate.10의 별도 UI E2E·깨끗한 팀 PC/2PC 수용·실업무 분석 |
| GitHub 저장소 | 기존 41개 이력 제외 첫 커밋 `2b9e223e005f214e408edd19f31967bc8705e004` 후 새 소스 커밋 `bb797d83b742bc90d2395298585142e372077e44`와 `v0.3.0-candidate.10` 태그 push | 후속 버전 공개 범위·이력 검사 지속 |
| Release 업데이트 | candidate.10 prerelease 게시·서버 asset digest 일치. hosted `history` 함수는 .9 배포 코드 유지, `UPDATE_CATALOG_JSON`을 .10으로 갱신. health 200·비인증 update check 401 확인 | 실계정 `offered`·게시 asset 다운로드/설치 미검증 |
| 보고서 협업 | 추가 답변→새 분석 구현 | 지속 대화·보고서 반영/revision·낙관적 락 미구현. M3 확장 배치안 |
| 작업 시작·업무 등록부 | 분석용 requestId·메일당 활성 분석 제한 존재 | 선택한 Agent/repo로 구현 시작·brief 고정·업무 단위 중복 방지 미구현, M5 |
| 개인 연결 UI | 메일 → AI·장치 → ERP 자료 → 저장·실행의 4단계, 공유·복구 분리 | 주소·실행 경로는 설정 파일로 지정. 실제 MCP·AI 통신 검증 별도 |
| 로컬 실행 환경 | Runner·Agent adapter·읽기 전용 근거 도구 구현 | 설치본의 개인 Mail MCP·Agent·ERP 경로와 지정 사례 검증 |
| DB MCP | 사전 정의 조회 provider 인터페이스 존재 | local-app 진입점에 실제 DB provider 미연결 |
| 백업 | 로컬 합성 DB dump/restore 검증 이력 존재 | hosted dump 실패 후 사용자 요청으로 설정 보류 |
| 실제 팀 파일럿 | 절차 준비 | 2명/2PC 지정 업무·공유·복구·피드백 미완료 |
| 기존 v0 | Docker API/DB/Worker 보존 | 새 Supabase DB와 자동 이관·자동 동기화하지 않음 |
| 원격 SR 자동화 | 설계·리뷰 반영 계획 존재 | M4/M5 구현·원격 검증·PR 발행 미완료 |

## 확인한 증거

- backend **130/130**: `.runtime/triage-free-tests-7f7bf86b/tests.log`.
- 실제 hosted 합성 **7군**: 인증/첫 변경/사용자 권한, private 보고서 ACL, 멱등 실행, DPAPI Runner 응답 유실 복구, refresh 경합·폐기, 로그아웃 등. `.runtime/supabase-deploy-20260922/hosted-verification.json`.
- 설치된 Windows 후보의 Chrome 로그인→비밀번호 변경 요구→로그아웃, pageerror 0. `installed-browser-verification.json`.
- Node→pooler TLS 암호화·인증서 검증 확인. pooler 내부 DB 구간의 관측은 별도이며 전체 내부 구간 TLS를 보증하지 않는다.
- 앞선 로컬 Edge/DB/브라우저/Runner/복원 12군과 Windows 설치 수명주기 검증은 실제 두 PC 수용과 구분한다.

상세 조건과 실패·재검증 이력은 [검증 일지](validation.md)에 있다. `.runtime` 증거는 Git 제외 로컬 산출물이므로 새 clone에는 없다. 개인 연결 UI 변경에서는 UI 13/13, 로컬 API 검사, 합성 브라우저 및 설치본 설정 화면을 검증했다. hosted 합성 7군 전체를 재실행한 것은 아니다.

## 설치본과 패키지

- 최신 게시 후보 `0.3.0-candidate.10`: 기존 개인 candidate.5 홈에서 종료된 PID의 stale `app.lock`을 읽기 전용으로 확인했다. setup.exe는 기존 설치본의 `lifecycle.mjs recover-lock`을 설치 전에 호출하도록 바뀌었다. 합성 candidate.9 홈에서 stale lock 복구→candidate.10 설치·기존 `historyUrl`/port 보존 통과; 살아 있는 프로세스의 lock은 거절한다. 한글 경로 lifecycle start/pause/stop, npm check/build, unit **8/8** 통과. 실제 Claude Code **2.1.280**의 probe는 `supported=true`; 실제 분석 실행은 아직 하지 않았다.
- [candidate.10 GitHub prerelease](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.0-candidate.10)는 `draft=false`, `prerelease=true`, 소스 커밋 `bb797d83b742bc90d2395298585142e372077e44`. setup.exe SHA-256 `a54825403f9f56ea2e84dc6b08100d955605212ab9e5ab63a7a906fc8cac5879`, ZIP SHA-256 `79d40fb700814aa85aa44f577cc40e81c6430024bcea1ba907dd920c6f3931fb`, 서명 metadata SHA-256 `c6a7c8523ebc410a95140ee45cc5f589280e8ef93f673c2bd712bfccc355b7ff`; 서버 asset digest와 일치했다. metadata 만료는 `2026-10-07T03:24:06.802Z`. setup.exe URL은 HTTP 302 → release-assets 도메인, 두 번째 GET HTTP 200·Content-Length 45,374,976 bytes로 asset size 일치. 전체 다운로드/설치는 미실행이다.
- hosted Supabase `history` function은 candidate.9에 배포한 동일 API 코드를 유지했다. 사용자 승인 범위의 `UPDATE_CATALOG_JSON`만 candidate.10으로 secret set(exit 0)했고 hosted `/health/live` HTTP 200·비인증 `/api/v1/updates/check` HTTP 401을 확인했다. 실계정 `offered`·실사용 업데이트·실 MCP/Agent 분석은 미검증이다.
- candidate.9의 fresh 설치·8→9 업그레이드/설정 보존·브라우저 로그인→비밀번호 변경→업데이트 버튼→로그아웃 E2E **1 passed**는 이전 후보의 증거다. candidate.10은 UI 코드가 동일하지만 .9 E2E를 .10 실행 증거로 재사용하지 않는다.
- 아래 candidate.5 기록은 2026-09-22에 설치한 기존 개발 PC 상태와 당시 해시의 기록이다. 새 setup.exe·GitHub Release의 배포 증거로 재사용하지 않는다.
- 설치 위치: `%LOCALAPPDATA%\MailTriagePilot`. candidate.5 기동과 43180 포트의 설정 화면·상단 로그아웃을 확인했다. 이후 실행 여부는 별도로 조회한다.
- 후보 ZIP: `.runtime/packages/0.3.0-candidate.5.zip`, 45,355,411 bytes, 3,724파일. 이전 candidate.4는 롤백용으로 보존했다.
- ZIP SHA-256: `6ae7a9fd0a8061d1af169dbb0c87a38858a5ee6d61e60861048430f0c4df20ce`.
- Node v24.16.0 포함. manifest `authentication=username`, `releaseApproved=false`.
- 업데이트 전후 `config/secrets/work` 해시 일치를 확인했다. 기존 개인 설정을 유지했으며 MCP·Agent·자료 경로가 설정되어야 실제 분석 가능하다.
- 소스/문서 커밋 정리가 ZIP을 다시 빌드하거나 릴리스 승인 값을 변경하지는 않는다.

## 다음 작업

1. [Release 배포 기반](operations/releases.md)의 candidate.10 게시 결과를 기준으로 서명 metadata 유효기간·채널 정책·후속 버전 공개 범위·게시 절차를 관리한다. 정식 버전/승인·서명키 운영 등 D13의 남은 결정은 별도로 확정한다.
2. 배포된 hosted update API의 실계정 `offered`·test 채널 정책·설치 전 재확인을 확인한다. 게시 asset 다운로드·서명 검증·설치·재시작·롤백까지 실제 앱 업데이트를 검증한다. 현재 health 200·비인증 401은 제공/설치 성공 증거가 아니다.
3. 설치 파일의 실행/화면 열기·작업 중지·앱 종료와 게시 asset 다운로드·stable/test·버튼 설치·정상 종료/재시작·실패 복구를 깨끗한 팀 PC에서 수용 검증한다. Agent의 고정 CLI 버전 검사는 소스에서 제거했으므로 실제 대상 CLI의 실행·MCP·결과 계약을 합성 자료로 확인한다.
4. 새 설치본에서 개인 MCP·AI Agent·ERP 읽기 자료를 연결·진단하고 지정 사례로 실제 분석·저장·공용 보고서 재조회를 확인한다. DB 조회가 필요한 사례는 실제 ERP DB provider도 읽기 전용으로 연결/검증한다.
5. 팀원 계정과 2PC 파일럿을 구성해 지정 업무·공유 권한·원본 부재·중단 복구·업데이트를 확인한다. 이전 Auth0 기준 수용 양식/검사기를 현재 사용자명 방식으로 정합화한다.
6. 피드백·사용량/비용·pause/resume·운영 항목을 확인한다. 백업은 요청으로 보류되어 있으므로 자동 재개하지 않는다.
7. 보고서 대화·명시적 반영/버전·낙관적 락은 M3 확장 배치안으로 추적하고 D14에서 출시 범위를 정한다. 작업 시작·brief 고정·업무 등록부·구현/검증/PR은 M5로 유지한다.
8. 기존 이력 L1~L3와 팀 문서 사이트 제공을 별도 추적한다. 상세 상태·의존성·완료 근거는 [계획서 13절](implementation-plan.md#13-남은-작업-등록부)을 따른다.

M1/M2를 완료로 표시하지 않는다. candidate.10 로컬 후보 검증·GitHub prerelease 게시·hosted catalog 갱신은 완료했지만 실계정 `offered`·실사용 업데이트·실 MCP/Agent 분석은 아직 완료가 아니다. AWS 이전 및 원격 SR→PR은 [통합 계획](implementation-plan.md)의 후속 단계다.
