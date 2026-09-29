# 현재 구현·배포 상태

갱신일: 2026-09-29. 팀 분석 이력·메일 식별 개선·Windows/WSL 선택·보고서 템플릿 복원을 포함한 **[v0.3.13](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.13)** 공개와 시험 업데이트 catalog 갱신을 완료했다. 배포 소스는 `3400a28df122881b5e280c96c10db66037931dcd`다. 실제 EXE 신규 설치·0.3.12→0.3.13 업그레이드 설정 보존·트레이 기동/종료 및 공개 자산 5개 다운로드 대조를 확인했다. 공용 API·DB는 앞서 적용한 010·011과 같은 코드를 유지한다. 개인 설치본 교체·실메일 생성 품질·실제 WSL·두 PC 업무 수용은 별도다. [검증 기록](validation.md)을 따른다.

이전 배포 기록(2026-09-28). 비밀번호 변경 실패 안내를 개선한 [v0.3.12](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.12) 배포와 테스트 채널 catalog 갱신을 완료했다. 배포 소스는 `579f0553bc5cdaebdad8f8261383dd5af7bc1923`이며 이후 문서 커밋은 게시 기록이다. 현재 비밀번호 오류 후 화면 유지·재시도·변경·재로그인을 실제 브라우저와 격리 DB로 검증했다. 실제 EXE 신규 설치와 0.3.11→0.3.12 설정 보존, 공개 자산 5개 다운로드 대조도 완료했다. 실계정 앱 updater 수용·업무 분석은 별도다.

## 2026-09-28 팀 단위 분석 이력 구현 당시 기록

- 공용 목록의 필수 출처 선택과 보고서별 공유 조건을 제거하고 같은 팀 조회·분석자/관리자 편집으로 변경했다. 검색·상태·기간·내 분석 필터를 추가했다.
- 메일함 원본 헤더 확인 → 동일 메일 연결 → 팀 분석 상태 집계를 연결했다. 팀 분석 보기, 메일별 이력·완료 태그를 통일하며 개인 처리 완료는 분리한다.
- 개발1팀 지정 마이그레이션과 팀 추가·계정 소속 선택을 구현했다. 지정 계정·세션·출처 UUID를 보존한다.
- 격리 DB 통합 66개 및 실제 Chrome 합성 화면 검증 통과. 상세 계약과 적용 순서는 [팀 이력 운영](operations/team-history.md)을 따른다.
- 사용자 요청대로 커밋 범위다. 실제 Supabase의 세 계정 소속은 이번 작업에서 변경하지 않았으며, 새 API·설치본 배포·Release·push도 하지 않았다.

## 최신 공개 배포

2026-09-28 서버 후속 수정: 숫자 버전의 업데이트 채널 불일치를 해결했다. 기존 0.3.11의 수동 확인에서 0.3.12 `offered`와 공개 EXE hash 일치를 실제 로그인된 설치본으로 확인했다. 관리자·지정 시험 계정 제한은 유지하며 새 설치 파일 없이 서버만 반영했다. 앱 updater의 실제 설치 완료는 사용자 확인 전이다. [검증 기록](validation.md)을 따른다.

최신 설치 파일은 **[0.3.13-setup.exe](https://github.com/srp-david/mail-triage-automation/releases/download/v0.3.13/0.3.13-setup.exe)**다. 기존 개인 설정과 저장소를 보존한다. EXE SHA-256 `a18dc0f3e82b9aa2b32fff1e74eb1ed5a937e2445896f71327025e5c82069fb4`. GitHub 일반 Release이며 앱의 제공 정책은 기존 `test` 채널이다. 개인 설치본은 교체하지 않았다. [패치노트](releases/v0.3.13.md)를 따른다.

사용자가 **0.3.6 설치 후** 설정·새로고침 피드백을 제공했다. 이전 자동 검증에서는 개인 PC에 0.3.5를 설치하고 Codex를 앱 버전 폴더 밖의 실제 `codex.exe`로 설정했으며 자동 찾기·실행 옵션·제공 UI hash 대조를 확인했다. 당시 ZIP SHA-256은 `e36a0d8be5396a73f8ecb3b1e253c3316222570a3e6665c5bfc1ed3670dac906`이다.

아래는 이전 **`.runtime/packages/0.3.3-setup.exe`**까지의 EXE 생성 기록이다. 0.3.4·0.3.5는 ZIP으로 설치했다. 기존 candidate.10 이후 다음 변경을 포함한다.

| 작업 | 구현·로컬 검증 | 남은 확인 |
|---|---|---|
| 개인 연결 | 웹에서 Mail/DB MCP·AI 실행 경로·자료 폴더 저장, Codex/Claude HTTP MCP 자동 찾기, DB 구조 조회 4종 | 개인 계정·실메일·실제 업무 자료 분석 |
| Windows 실행 | 바탕화면 바로가기, 트레이 화면/설정/중지/재개/종료, 중복 실행 방지 | 사용자 PC 실제 메뉴 클릭·2PC 수용 |
| 설정 화면 | 연결 환경·분석 준비 탭, 카드 배치, 변경/저장 상태, 작성 중 값 유지 | 개인 연결로 사용자 수용 |
| 계정 화면 | 관리자 목록·검색·권한/상태 카드·임시 비밀번호 창, 독립된 내 계정 메뉴 | 실제 사용자 계정 운영 수용 |
| 문서 | [자동 로그인 안내](operations/login.md), 설치·실행 절차, 숫자 버전 패치노트 규칙 | 팀 문서 사이트 게시 |

EXE SHA-256 `e77bab9916ac32cb9f818ed4cf32ffec90e257f195de9c105e521f3bce0c2bba`, ZIP `f0b925b2b2b5e32e537f8738c7a5cc897288b3dd51d9e651df2173515b27b12e`. 설치 파일은 소스 커밋 정리 전에 생성한 로컬 산출물이며, 이번 커밋으로 새 패키징이나 서명·게시를 수행한 것은 아니다. Authenticode 및 공개 업데이트 metadata 서명은 없다. 실제 계정은 변경하지 않았다.

### 로컬 버전별 기록

| 버전 | 변경 | 패치노트 |
|---|---|---|
| 0.3.0 | 웹 연결 설정·자동 탐색·DB 구조 조회 | [초안](releases/v0.3.0.md) |
| 0.3.1 | 트레이·바탕화면 바로가기 | [초안](releases/v0.3.1.md) |
| 0.3.2 | 설정 화면 구성·가독성 | [초안](releases/v0.3.2.md) |
| 0.3.3 | 관리자 계정 화면·내 계정 메뉴 | [초안](releases/v0.3.3.md) |
| 0.3.4 | 공통 메일 공유·보고서 협업·기존 자료 이관 | [운영 기록](operations/shared-analysis.md) |
| 0.3.5 | Codex 실제 exe 자동 찾기·현재 PC 설정 전환 | [Windows 안내](operations/windows.md#codex-실행-파일-자동-찾기-v035) |
| 0.3.6 | Node 업데이트 확인·설정/트레이 메뉴·진행 상태·나중에 | [초안](releases/v0.3.6.md) |
| 0.3.7 | 공유·장치 관리 탭 제거·새로고침 로그인 깜빡임 수정 | [초안](releases/v0.3.7.md) |
| 0.3.8 | 동기화·분석 자동 실행·수동 실행 버튼 제거·알림 자동 닫힘 | [초안](releases/v0.3.8.md) |
| 0.3.9 | 임시 비밀번호·분석 이력·공유 분석 팝업 정렬과 여백 | [초안](releases/v0.3.9.md) |
| 0.3.10 | 누적 변경·내장 기술 문서 공개 배포 | [패치노트](releases/v0.3.10.md) |
| 0.3.11 | 신규 설치 공용 서버 자동 설정 | [패치노트](releases/v0.3.11.md) |
| 0.3.12 | 비밀번호 변경 오류·세션 만료 구분과 재시도 안내 | [패치노트](releases/v0.3.12.md) |

0.3.0~0.3.9는 로컬 검증 기록이며, 변경 사항을 모은 0.3.10을 최초 숫자 버전으로 공개했다. 기존 candidate 태그와 자산은 보존했다. 이전 로컬 0.3.10 산출물은 보관하고 확정 커밋에서 다시 빌드한 파일을 게시했다. 버전별 검증과 최종 공개 파일 해시는 [검증 일지](validation.md)에 보존한다.

## 제품 경계

현재 제공 형태는 **Supabase 공용 API·DB + Windows 로컬 앱 + 개인 MCP·AI 실행**이다. 사용자명 계정은 관리자가 생성한다. 공개 가입, Auth0/인증 이메일, 공용 웹에서 PC 없이 수행하는 원격 SR→PR은 현재 제품에 포함되지 않는다.

| 대상 | 확인된 상태 | 남은 항목 |
|---|---|---|
| 공용 API | 서울 Supabase의 `history` 배포, HTTPS health·인증·ACL·결과 저장 검증 | 실제 업무 부하·장기 관찰·pause/resume |
| 공용 DB | PostgreSQL 17.6, `triage_private`, migration 10개, runtime DDL 차단 | 외부 백업·복원과 운영 담당 확정 |
| Data API | 사용자 비활성화 확인, publishable key 접근 401 확인 | 모든 관리 키까지 차단했다는 의미는 아님 |
| 로그인 | 최초 관리자 생성, hosted 로그인·첫 변경 제한 확인 | 팀원 계정 발급·각 사용자 최초 변경 |
| Windows 앱 | 현재 PC 0.3.4→0.3.5 설치·기동, Codex exe 설정·자동 찾기·실행 확인·기타 설정 보존·제공 UI hash 대조. 0.3.4 인증 보고서 조회와 candidate.10 게시 기록 보존 | 새 소스 게시·숫자 버전 GitHub 배포·깨끗한 팀 PC/2PC 수용·실업무 분석 |
| GitHub 저장소 | 기존 41개 SHA 보존·공개 검사 통과, 이전 통합 시 원격 main·태그 확인. 이번 후속 커밋은 로컬만 진행. 원격 candidate.9 태그 `83be2a941f6125db58c70ac05a5efc63f45fe566`·candidate.10 태그 `6fe6de9a93c1df3313541ad4d78a085483edbe17` 및 Release metadata/catalog 대조 완료 | 자동 게시 CI·private 전환·실계정 수용은 별도 |
| Release 업데이트 | candidate.10 prerelease 게시·서버 asset digest 일치. 공용 분석 API를 새로 배포했으며 catalog는 기존 candidate.10 설정 유지. 이전 비인증 update check 401 확인 | 실계정의 버전별 `current`/`offered`·앱 updater 다운로드/설치 미검증 |
| 보고서 협업 | 동일 메일 공유·중복 방지, 지속 대화·revision·낙관적 락 구현. 전체 테스트 164건 통과 | Supabase 보고서 43건 공유 이관·새 API 배포·현재 PC 0.3.4 설치 완료. 기존 로그인으로 보고서·협업 조회 확인. 개인 MCP/Agent 연결·두 PC 수용은 후속. [상세](operations/shared-analysis.md) |
| 작업 시작·업무 등록부 | 분석용 requestId·메일당 활성 분석 제한 존재 | 선택한 Agent/repo로 구현 시작·brief 고정·업무 단위 중복 방지 미구현, M5 |
| 개인 연결 UI | 0.3.0에서 추가, 0.3.2에서 연결 환경/분석 준비 탭과 카드로 정리. 0.3.3에도 포함 | 기존 candidate.10에는 없음. 실계정 수용 필요 |
| 로컬 실행 환경 | Runner·Agent adapter·읽기 전용 근거 도구 구현 | 설치본의 개인 Mail MCP·Agent·ERP 경로와 지정 사례 검증 |
| DB MCP | 0.3.0부터 주소 설정과 고정 메타데이터 조회 4종 provider 연결 | 임의 SQL 미지원, 실제 업무 데이터 근거 조회는 후속 범위 |
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

- 2026-09-28 이력 통합 완료: 기존 41개 SHA 보존·공개 검사 findings 0, 코드까지 47개 한글 커밋·준비 문서 포함 48개 이력을 원격 main과 두 태그에 atomic force-with-lease push했다. main은 문서 후속 커밋 포함 같은 로컬 이력으로 관리한다. tag9/10의 docs·README 제외 추적 소스 parity, npm check/build·unit 8/8·한글 경로 lifecycle을 재검증했으며 `realAuthentication=false`다. 기존 Release asset 10개를 백업하고 exe/ZIP/checksum asset digest가 전환 전후 유지됨을 확인했다.
- 게시 metadata: candidate.9 SHA-256 `0d2129a36f39b7caee8f4b905b6634cc2ad5264b1028985e9b9cd49833f95075`, 만료 `2026-10-12T00:51:40.543Z`; candidate.10 SHA-256 `77693d6ee7c0e50faace8b1a12e166bb655512a45ad22b9895579cadfde8ad68`, 만료 `2026-10-12T00:51:40.627Z`. 공개 metadata를 다시 내려받아 서명·sourceCommit·hash를 검증했다.
- 최신 게시 후보 `0.3.0-candidate.10`: 기존 개인 candidate.5 홈에서 종료된 PID의 stale `app.lock`을 읽기 전용으로 확인했다. setup.exe는 기존 설치본의 `lifecycle.mjs recover-lock`을 설치 전에 호출하도록 바뀌었다. 합성 candidate.9 홈에서 stale lock 복구→candidate.10 설치·기존 `historyUrl`/port 보존 통과; 살아 있는 프로세스의 lock은 거절한다. 한글 경로 lifecycle start/pause/stop, npm check/build, unit **8/8** 통과. 실제 Claude Code **2.1.280**의 probe는 `supported=true`; 실제 분석 실행은 아직 하지 않았다.
- [candidate.10 GitHub prerelease](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.0-candidate.10)는 `draft=false`, `prerelease=true`, 소스 커밋 `6fe6de9a93c1df3313541ad4d78a085483edbe17`. setup.exe SHA-256 `a54825403f9f56ea2e84dc6b08100d955605212ab9e5ab63a7a906fc8cac5879`, ZIP SHA-256 `79d40fb700814aa85aa44f577cc40e81c6430024bcea1ba907dd920c6f3931fb`, metadata SHA-256 `77693d6ee7c0e50faace8b1a12e166bb655512a45ad22b9895579cadfde8ad68`; 서버 asset digest와 일치했다. metadata 만료 `2026-10-12T00:51:40.627Z`. 이전 공개 URL 검사에서 HTTP 302→release-assets 도메인·HTTP 200/45,374,976 bytes를 확인했고 이번 전환에서 Release asset 10개를 전체 백업 다운로드했다. 실계정 앱 updater를 통한 설치 파일 다운로드·설치는 미검증이다.
- hosted Supabase `history` function은 기존 API 코드를 유지하고 `UPDATE_CATALOG_JSON`을 새 candidate.10 metadata로 secret set(exit 0)했다. secrets list digest `c41d67651412bd4a9872400547a3ecc83304d1a3e26ad1401aa67d607c9ab57f`는 로컬 minified JSON SHA와 일치한다. `2026-09-28T00:59:43.299Z`에 hosted `/health/live` HTTP 200·`x-contract-version: 1`을 포함한 비인증 update check HTTP 401을 확인했다. 실계정 `offered`·실사용 업데이트·실 MCP/Agent 분석은 미검증이다.
- candidate.9의 fresh 설치·8→9 업그레이드/설정 보존·브라우저 로그인→비밀번호 변경→업데이트 버튼→로그아웃 E2E **1 passed**는 이전 후보의 증거다. candidate.10은 UI 코드가 동일하지만 .9 E2E를 .10 실행 증거로 재사용하지 않는다.
- 아래 candidate.5 기록은 2026-09-22에 설치한 기존 개발 PC 상태와 당시 해시의 기록이다. 새 setup.exe·GitHub Release의 배포 증거로 재사용하지 않는다.
- 설치 위치: `%LOCALAPPDATA%\MailTriagePilot`. candidate.5 기동과 43180 포트의 설정 화면·상단 로그아웃을 확인했다. 이후 실행 여부는 별도로 조회한다.
- 후보 ZIP: `.runtime/packages/0.3.0-candidate.5.zip`, 45,355,411 bytes, 3,724파일. 이전 candidate.4는 롤백용으로 보존했다.
- ZIP SHA-256: `6ae7a9fd0a8061d1af169dbb0c87a38858a5ee6d61e60861048430f0c4df20ce`.
- Node v24.16.0 포함. manifest `authentication=username`, `releaseApproved=false`.
- 업데이트 전후 `config/secrets/work` 해시 일치를 확인했다. 기존 개인 설정을 유지했으며 MCP·Agent·자료 경로가 설정되어야 실제 분석 가능하다.
- 소스/문서 커밋 정리가 ZIP을 다시 빌드하거나 릴리스 승인 값을 변경하지는 않는다.

## 다음 작업

1. 새 candidate.10 설치본에서 실계정 로그인·개인 연결 후 동일 catalog 버전의 `current` 정책과 지정 실메일의 분석·저장·공용 보고서 재조회를 시험한다. ERP 자료/DB는 읽기 전용으로 연결한다.
2. 이전 candidate.9 앱에서 candidate.10의 `offered`·test 채널 정책·설치 전 재확인을 확인한다. 실계정 앱 updater의 게시 asset 다운로드·서명 검증·설치·재시작·롤백까지 실제 앱 업데이트를 검증한다. 현재 health 200·비인증 401은 제공/설치 성공 증거가 아니다.
3. 설치 파일의 실행/화면 열기·작업 중지·앱 종료와 게시 asset 다운로드·stable/test·버튼 설치·정상 종료/재시작·실패 복구를 깨끗한 팀 PC에서 수용 검증한다. Agent의 고정 CLI 버전 검사는 소스에서 제거했으므로 실제 대상 CLI의 실행·MCP·결과 계약을 합성 자료로 확인한다.
4. 새 설치본에서 개인 MCP·AI Agent·ERP 읽기 자료를 연결·진단하고 지정 사례로 실제 분석·저장·공용 보고서 재조회를 확인한다. DB 조회가 필요한 사례는 실제 ERP DB provider도 읽기 전용으로 연결/검증한다.
5. 팀원 계정과 2PC 파일럿을 구성해 지정 업무·공유 권한·원본 부재·중단 복구·업데이트를 확인한다. 이전 Auth0 기준 수용 양식/검사기를 현재 사용자명 방식으로 정합화한다.
6. 피드백·사용량/비용·pause/resume·운영 항목을 확인한다. 백업은 요청으로 보류되어 있으므로 자동 재개하지 않는다.
7. 보고서 협업 C1~C3·동일 메일 공유는 구현·Supabase 데이터 이관·API 배포·현재 PC 0.3.4 설치를 완료했다. 기존 로그인으로 이관 보고서·협업 조회를 확인했으며 개인 MCP/Agent 연결과 두 PC 업무 수용은 남았다. 작업 시작·brief 고정·업무 등록부·구현/검증/PR은 M5로 유지한다.
8. 기존 이력 L1~L3와 팀 문서 사이트 제공을 별도 추적한다. 상세 상태·의존성·완료 근거는 [계획서 13절](implementation-plan.md#13-남은-작업-등록부)을 따른다.

M1/M2를 완료로 표시하지 않는다. candidate.10 로컬 후보 검증·GitHub prerelease 게시·hosted catalog 갱신은 완료했지만 실계정 `offered`·실사용 업데이트·실 MCP/Agent 분석은 아직 완료가 아니다. AWS 이전 및 원격 SR→PR은 [통합 계획](implementation-plan.md)의 후속 단계다.
