# Windows 후보 설치·실행·종료

아래 수동 명령은 `0.3.0-candidate.5` 당시 설치 절차다. 현재 배포 후보 `0.3.0-candidate.9`는 [GitHub prerelease](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.0-candidate.9)의 self-extracting setup.exe다. fresh 한글 경로 설치, candidate.8→.9 업그레이드/설정 보존, lifecycle start/pause/stop, 로그인·비밀번호 변경·업데이트 버튼·로그아웃 브라우저 E2E를 로컬 검증했다. hosted update route도 배포됐지만 실계정 `offered`·실사용 업데이트와 팀 PC 수용은 아직 검증하지 않았다. 과거 `0.2.0-candidate.6`은 다른 인증 구성의 기록이다.

## 1. 포함 내용과 사전 조건

- Windows x64용 Node v24.16.0, local-app·Runner·Agent adapter·UI·규칙·설치 관리 도구를 포함한다.
- 공용 API/DB, 서버 비밀, 개인 Agent/MCP 설치·자격, 메일·ERP 원본은 포함하지 않는다.
- 팀원별 앱 계정과 개인 MCP/Agent 설정이 필요하다. API URL만 전달해서 사용하는 공용 웹 사이트는 아니다.
- ZIP checksum과 신뢰된 전달 경로를 확인한다. 현재 파일 hash 검사는 배포자 코드 서명을 대신하지 않는다.

현재 ZIP 위치·hash·검증 범위는 [현재 상태](../current-status.md)에 있다. manifest의 `releaseApproved=false`를 임의로 true로 바꾸지 않고 명시적인 `--candidate`로 시험한다.

## 2. 수동 설치

ZIP을 비어 있는 폴더에 해제한다. ZIP 루트에 `node.exe`와 `installer`가 있다. 아래 payload 경로는 실제 압축 해제 위치로 바꾼다.

```powershell
$payload = 'C:\Downloads\mail-triage-candidate.5'
$installRoot = Join-Path $env:LOCALAPPDATA 'MailTriagePilot'
& (Join-Path $payload 'node.exe') (Join-Path $payload 'installer\manage.mjs') install $installRoot $payload --candidate
if ($LASTEXITCODE -ne 0) { throw '설치 진단 실패' }
```

설치 성공 후 `config/settings.json`을 [설정 예시](../../deploy/supabase/local-settings.example.json)와 [개발 안내](../guides/development.md)에 맞게 준비한다. 실제 PROJECT·issuer/audience를 담당자가 맞추고 개인 Mail MCP·Agent·자료 경로는 PC별로 설정한다. 기존 개인 설정을 덮어쓰지 않는다.

프로그램은 먼저 staging에 복사·검증하고 진단 성공 후 활성 버전을 전환한다. 설치 중단 복구나 이미 있는 버전 덮어쓰기는 별도 안전 검사를 따른다.

## 3. 실행

다음 PowerShell은 활성 버전을 읽고 앱을 시작해 브라우저를 연다. 이미 실행 중이면 같은 앱의 화면을 다시 연다.

```powershell
$installRoot = Join-Path $env:LOCALAPPDATA 'MailTriagePilot'
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
if ($active.version -notmatch '^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$') { throw '잘못된 버전' }
$release = Join-Path (Join-Path $installRoot 'releases') $active.version
& (Join-Path $release 'node.exe') (Join-Path $release 'installer\lifecycle.mjs') start $installRoot --candidate
```

첫 로그인은 발급된 사용자명·임시 비밀번호로 하고 비밀번호를 변경한다. 후보의 기본 `launch.ps1`과 일반 shortcut은 정식 승인 값이 없으면 실행을 거절한다. 개발 PC에 별도로 만든 `start-pilot.ps1`은 개인 설치 보조 파일이며 ZIP의 공통 실행기로 제공된 것이 아니다.

## 4. 정상 종료

브라우저 창을 닫는 것은 앱 종료가 아니다. 같은 활성 버전 경로로 stop을 호출한다.

```powershell
$installRoot = Join-Path $env:LOCALAPPDATA 'MailTriagePilot'
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
if ($active.version -notmatch '^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$') { throw '잘못된 버전' }
$release = Join-Path (Join-Path $installRoot 'releases') $active.version
& (Join-Path $release 'node.exe') (Join-Path $release 'installer\lifecycle.mjs') stop $installRoot
```

`{"stopped":true}`가 정상 종료 결과다. 공용 API·DB나 다른 사용자의 앱을 끄지 않는다. 설정·저장 세션·작업 복구 기록은 남는다. PC 종료 전 실행 상태를 확인하고 `secrets/work`나 잠금 파일을 직접 지우지 않는다.

## 5. 진단·업데이트·롤백

설치 버전의 `installer/diagnose.mjs RELEASE HOME`은 파일·개인 CLI·포트 등의 상태를 확인한다. `--connect-mcp`는 도구 목록 연결을 검사하고 실제 메일을 동기화하지 않는다. CLI 자격 존재만으로 제공자 실호출 성공을 보장하지 않는다.

업데이트는 앱 정상 종료 → 새 번호 payload 설치 → 진단 → 활성 버전 확인 순서다. 실행 중 `app.lock`이 있으면 설치가 거절된다. `manage.mjs rollback HOME`은 직전 앱 버전으로 돌리며 공용 DB를 복원하지 않는다. `manage.mjs uninstall HOME`은 개인 설정·자격·outbox를 보존하는 기본 제거다. 전체 사적 데이터 삭제는 별도 명시적 요청·정확한 root 확인 없이는 수행하지 않는다.

오래된 잠금 복구는 `lifecycle.mjs recover-lock HOME`이 실제 소유 프로세스 종료를 확인하는 절차를 사용한다. 포트 충돌에서 기존 서비스나 임의 Node 프로세스를 일괄 종료하지 않는다.

## 6. 팀 배포 묶음으로 남은 작업

setup.exe와 `control.ps1`에 실행/화면 열기(`start`)·작업 중지(`pause`)·앱 종료(`quit`) 조작을 추가했다. 실행 중이면 화면만 열고, 작업 중지는 Runner의 신규 작업 시작을 멈추되 로컬 웹 화면을 유지하며, 앱 종료는 Runner와 로컬 웹 서버를 정상 종료한다. candidate.9 fresh 한글 설치, candidate.8→.9 업그레이드/설정 보존과 start/pause/stop을 로컬 검증했고, 업데이트 배너가 로그아웃을 가리지 않는 브라우저 E2E 1건도 통과했다. 검증된 설치 파일은 GitHub prerelease로 게시했다. 다음으로 깨끗한 팀 PC의 포트 충돌·설정 보존·재실행·롤백과 사용자 안내/배포 신뢰 경로, hosted update API를 통한 실제 업데이트를 확인한다. 그 설치본에서 개인 연결과 지정 사례 실분석·저장·보고서 재조회를 확인하고 두 PC 수용 결과로 [팀 파일럿](team-pilot.md)의 확대 기준을 판단한다. `releaseApproved=false`인 시험 후보는 정식 승인과 구분한다.

GitHub Release를 배포 파일·변경 내역 저장소로 쓰는 [업데이트 계획](releases.md)에 따라 인증 update API·서명 메타데이터·로컬 다운로드/updater·사용자 버튼 소스를 추가했다. candidate.9의 게시 asset digest는 검증된 로컬 파일과 일치한다. public 단계에도 인증된 공용 API로 버전·채널·호환성·중단 정책을 확인하고, 알림 후 사용자가 설치를 선택하는 방식이 기본안이다. 새 route를 담은 hosted `history` function의 첫 배포 요청은 자동 승인 검토에서 대상 명시 부족으로 거절됐으나, 사용자 명시 승인 뒤 함수와 catalog secret을 갱신했다. hosted health 200·비인증 update check 401을 확인했다. 실계정 `offered`와 GitHub asset을 실제 앱 업데이트로 내려받아 설치하는 종단 검증은 남아 있다.

현재 패키지 스크립트는 candidate만 만들고 `releaseApproved=false`다. 정식 Release 버전 생성·승인 근거·서명/게시 절차와 public→private 다운로드 전환을 추가 검증해야 한다. 앱 업데이트는 공용 API/DB 및 ERP 운영 배포와 별개다. 완전 자동 설치는 후속 안정화 범위다.
