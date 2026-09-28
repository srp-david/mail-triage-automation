# Windows 설치·연결 설정·실행·종료

최신 공개 설치본: [v0.3.10 Release](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.10)의 `0.3.10-setup.exe`. 진행 중인 작업을 마치고 트레이에서 앱을 종료한 뒤 기존 위치에 설치한다. 기본 설치 위치는 `%LOCALAPPDATA%\MailTriagePilot`이며 개인 설정과 작업 파일을 보존한다.

로그인 유지 기간, 토큰 저장 위치, 앱 종료·업데이트 후 자동 접속과 재로그인 조건은 [로그인 유지와 자동 로그인](login.md)을 참고한다.

## 신규 설치의 공용 서버 자동 설정 (v0.3.11)

v0.3.11부터 처음 설치하면 공용 API·인증 issuer·audience를 자동 설정한다. 주소를 전달받거나 설치 중 입력할 필요 없이 바로가기로 앱을 열고 관리자가 발급한 계정·임시 비밀번호로 로그인한다. 첫 로그인 후 비밀번호를 변경하고 개인 Mail/DB MCP·AI·읽기 자료 연결은 웹 설정에서 진행한다.

기본 공용 API는 `https://tborximfpwrzzwuazjrb.supabase.co/functions/v1/history`, issuer는 `https://tborximfpwrzzwuazjrb.supabase.co/history-auth`, audience는 `mail-triage`다. 공개 연결 정보만 설치본에 포함하며 계정·비밀번호·토큰은 포함하지 않는다. 기존 `config/settings.json`이 있으면 서버 주소·포트·개인 연결 설정 전체를 그대로 보존한다. v0.3.10까지의 신규 설치는 두 주소를 직접 입력해야 한다.

## 설치본의 기술 문서 (v0.3.10)

기술 문서는 설치 파일에 포함되며 실행 중인 앱과 같은 주소의 `/docs/`에서 새 탭으로 열린다. 별도 문서 서버나 3000번 포트를 켤 필요가 없다. 앱이 실행 중이면 외부 인터넷 없이 문서 내용·검색·도표를 볼 수 있고 문서 안의 외부 링크는 인터넷 연결이 필요하다. 문서 내용은 설치한 버전 기준이며 업데이트 때 함께 교체된다.

0.3.9까지의 버튼은 개발용 `http://127.0.0.1:3000/`을 가리켜 문서 서버가 없는 설치 PC에서 `ERR_CONNECTION_REFUSED`가 발생했다. 0.3.10으로 설치하면 앱 내부 문서로 연결된다.

## 팝업 배치와 가독성 (v0.3.9)

- 임시 비밀번호 창은 발급 계정·비밀번호·안내문·닫기 버튼을 구분한다. 작은 화면에서는 비밀번호를 줄바꿈해 표시하며 복사되는 값에는 표시용 줄바꿈을 추가하지 않는다. 닫으면 기존처럼 화면에서 지운다.
- 분석 이력은 제목과 실행 시각을 두 줄로 구분하고, 보고서 창의 제목·도구·본문 영역 여백을 정리했다. 긴 메일 제목은 머리글에서 최대 3줄로 표시하며 보고서 본문에서 전체 제목을 확인할 수 있다.
- 보고서의 공유·최신 내용 확인·추가 답변 버튼에 간격과 줄바꿈을 적용했다. 보고서 편집·대화·AI 질문 입력은 세로 정렬한다.
- 공유 분석 창의 닫기 버튼은 제목과 분리하고, 첨부 미리보기 버튼도 좁은 화면에서 줄바꿈한다. 내용 스크롤과 닫기 동작은 유지한다.

## 동기화·분석 자동 실행과 알림 (v0.3.8)

- 연결 환경과 분석 준비의 선택을 저장한 뒤 **메일함 → 메일 동기화** 또는 메일의 **분석**을 누른다. 필요한 백그라운드 작업은 요청 시 자동으로 시작하므로 설정에서 실행을 켤 필요가 없다. 앱을 켜는 것만으로 새 분석·동기화를 요청하지는 않는다.
- 설정의 분석 실행 켜기·동기화 실행 켜기·로컬 실행 중지 버튼을 제거했다. 실행 상태 확인은 진단용이며 요청 전에 누를 필요가 없다.
- 실행 중인 작업은 중복으로 켜지 않고, 대기 중인 작업은 새 요청을 바로 확인한다. 업데이트 설치 준비 중이거나 중단 기록의 복구가 필요한 경우에는 새 요청 등록 전에 안내한다.
- 트레이에서 직접 일시 중지했다면 트레이의 **재개** 후 요청한다. 로그아웃·앱 종료는 실행을 중지한다. 중단·미전송 기록은 **설정 → 중단 작업 복구**에서 확인한다.
- 일반 화면과 보고서 대화상자의 일시 알림은 5초 뒤 사라진다. 같은 알림이 다시 발생하면 표시 시간이 새로 시작된다. 입력 오류·연결 오류·업데이트 안내 등 별도 상태 영역은 유지한다.

## 설정 화면 정리와 새로고침 (v0.3.7)

**공유·장치 관리** 탭을 제거했다. 팀 사용자·문서 모음 조회와 권한 변경·장치 폐기 입력은 일반 설정에서 제공하지 않는다. 기존에 저장된 문서 모음 연결은 설정 저장 시 보존한다. 분석 실행에 필요한 출처·AI·실행 장치 연결은 분석 준비에서 계속 사용한다.

새로고침 시 로그인 폼을 먼저 표시하던 문제를 수정했다. 세션 확인 중에는 로딩 화면, 확인 실패 시에는 다시 확인 버튼을 표시한다. 상세 동작은 [로그인 안내](login.md#새로고침-중-화면-표시-v037)를 참고한다.

## 업데이트 확인과 설치 (v0.3.6)

- **설정 → 앱 업데이트** 또는 트레이의 **업데이트 확인**에서 현재 버전·마지막 확인 시각·새 버전 여부를 확인한다. 트레이 메뉴는 업데이트 설정 화면을 직접 연다.
- Node 앱이 시작할 때, 로그인 직후, 이후 1시간마다 서버에 확인한다. 브라우저를 닫아도 앱과 트레이가 실행 중이면 확인한다. 앱 종료·PC 종료 중에는 확인하지 않는다. 로그인이 필요하거나 업데이트 정보가 없는 상태는 최신 버전과 구분한다.
- 새 버전이 있으면 웹 안내와 트레이 메뉴에 표시하고 앱 실행 중 같은 버전의 트레이 알림은 한 번만 요청한다. Windows 알림 표시 여부는 OS 설정에 영향을 받는다.
- **지금 설치**를 누르면 다운로드 진행률 → 파일·배포 정보 검증 → 작업 종료 대기 → 설치·재시작 순서로 진행한다. 중복 설치 요청은 거절한다. 실패 시 사유와 업데이트 확인 버튼을 표시한다.
- **나중에**는 같은 버전의 안내를 현재 앱 실행 동안 숨긴다. 설정에서는 계속 설치할 수 있고, 앱 재실행 또는 수동 확인으로 안내를 다시 표시한다. 자동 설치하지 않는다.
- GitHub Release만 올려서는 안내가 뜨지 않는다. 인증된 서버의 catalog에 유효하게 서명된 최신 metadata가 있어야 하며 버전·채널 정책도 통과해야 한다. 해당 기능을 포함한 v0.3.10은 Release와 테스트 채널 catalog에 게시됐다.
- 로컬 파일로 설치하려면 트레이에서 **앱 종료** 후 `0.3.10-setup.exe`를 기존 위치에 설치하고 바로가기로 실행한다. 현재 개인 설치본은 이번 검증에서 교체하지 않았다.

## Codex 실행 파일 자동 찾기 (v0.3.5)

Windows의 **이 PC에서 자동 찾기**는 `.local/bin`과 PATH의 `codex.exe`를 우선 확인한다. npm으로 설치했다면 현재 아키텍처의 Codex 플랫폼 패키지 또는 기존 vendor 폴더에서 실제 `codex.exe`를 찾는다. 이 과정에서 Codex 스크립트를 실행하지 않으며, exe가 없으면 Codex 항목을 자동으로 채우지 않는다.

Codex에는 앱의 `releases/버전/node.exe`와 `codex.js` 조합을 새로 추천하지 않는다. 앱 업데이트에 따라 사라질 수 있는 Node 경로에 의존하지 않도록 실제 Codex exe를 사용한다. Claude의 기존 실행 경로와 사용자가 저장한 외부 명령은 유지한다.

이전 Node 기반 Codex 설정이 이미 저장되어 있으면 자동 찾기가 덮어쓰지 않는다. **설정 → 연결 환경**에서 Codex 실행 경로와 기존 `codex.js` 실행 인수를 비운 뒤 자동 찾기를 실행하고, 발견한 `codex.exe`의 실행 확인 후 저장한다. Codex 설치 위치가 바뀌면 다시 찾아 저장한다. 앱은 Codex 자체를 설치하거나 업데이트하지 않는다.

## 관리자 계정 관리와 내 계정 (v0.3.3)

- **관리자 → 계정 관리**에 들어가면 목록을 자동으로 불러온다. 사용자명·표시 이름으로 검색하고 역할·사용 상태·비밀번호 변경 필요 여부를 확인한다.
- **계정 정보 수정**을 펼쳐 표시 이름·역할·사용 허용 여부를 변경하고 저장한다. **새 계정 만들기**에서 계정을 발급한다.
- 계정 생성이나 비밀번호 초기화 후 임시 비밀번호는 대상 계정 이름과 함께 대화상자에 표시된다. 닫으면 화면에서 지워진다.
- 본인의 비밀번호는 설정 화면이 아닌 주 메뉴의 **내 계정 → 비밀번호 변경**에서 변경한다. 변경 후 다시 로그인하며, 첫 로그인 시 필수 변경 화면은 그대로 유지한다.
- 관리자 메뉴는 기존처럼 관리자에게만 표시한다. 이번 변경은 UI 구성과 이동 경로이며 서버 권한·비밀번호 정책을 바꾸지 않는다.

## 설정 화면 구성 (v0.3.2)

현재 설정 화면은 **연결 환경 → 분석 준비 → 중단 작업 복구 → 앱 업데이트**로 구성한다. v0.3.2에 추가했던 공유·장치 관리 탭은 v0.3.7에서 제거했다. 이전 버전의 `개인 연결`에 있던 주소·실행 경로·자료 폴더는 `연결 환경`, 출처·장치 선택은 `분석 준비`에서 관리한다. v0.3.8부터 실행은 요청 시 자동으로 시작한다.

- Mail/DB MCP와 AI 도구를 카드로 묶고 PC에서는 두 열, 작은 화면에서는 한 열로 표시한다.
- `주소 입력됨`·`경로 입력됨`은 입력 여부다. 실제 통신·호환성은 각 카드의 확인 버튼으로 검사한다.
- 자동 찾기 안내, 읽기 자료 폴더, 저장 영역을 구분한다. 변경이 있을 때만 `연결 환경 저장`을 누를 수 있다.
- 탭을 이동해도 아직 저장하지 않은 입력은 유지한다. 페이지 새로고침 전에는 저장해야 한다.
- 저장 후 `다음: 분석 준비`로 이동해 출처·장치를 선택·저장한 뒤 메일함에서 동기화·분석을 요청한다.

## 바탕화면 바로가기와 트레이 (v0.3.1 로컬 설치본)

`0.3.1-setup.exe`를 기존 위치에 설치하면 바탕화면에 **메일 분석실** 바로가기를 만든다. 실행하면 브라우저 화면과 Windows 알림 영역의 봉투 아이콘이 열린다. 이미 실행 중이면 같은 앱의 화면을 연다. 브라우저를 닫아도 앱과 트레이는 유지된다. 아이콘은 Windows 설정에 따라 작업 표시줄의 **숨겨진 아이콘 표시(∧)** 안에 있을 수 있다.

| 트레이 메뉴 | 동작 |
|---|---|
| 화면 열기 / 아이콘 더블클릭 | 현재 앱의 웹 화면 열기 |
| 환경설정 | 웹 설정 화면 열기. 로그인이 필요하면 먼저 로그인 |
| 작업 중지 | 실행 중인 분석·동기화 루프 중지. 앱·웹 화면은 유지 |
| 작업 재개 | 이 실행 세션에서 트레이로 중지한 종류만 다시 실행 |
| 앱 종료 | 분석·동기화 중지 후 로컬 서버와 트레이 종료 |

작업 중지는 진행 중인 작업도 중단할 수 있다. 중단된 작업에 복구 확인이 필요하면 웹 화면에서 처리한다. 재개는 이미 중단된 분석을 무조건 다시 수행한다는 뜻이 아니다. 로그아웃·연결 재설정·앱 종료 후에는 재개 기록이 초기화되며 웹 화면에서 실행을 다시 켠다. 원래 켜지지 않은 분석이나 동기화를 트레이가 임의로 켜지 않는다. 설치 파일에는 별도 Node 설치 없이 실행할 Node와 .NET Framework 기반 트레이 프로그램이 포함된다.

이 설치본은 로컬 검증용이며 GitHub Release·업데이트 catalog에는 아직 게시하지 않았다. 실제 Windows 메뉴 클릭과 개인 계정 분석은 사용자 수용 단계에 남아 있다.

## 웹에서 개인 연결 설정 (v0.3.0부터, v0.3.1에도 포함)

`v0.3.0`부터 로그인 후 **설정 → 개인 연결 → 연결 환경**에서 Mail MCP·DB MCP 주소, Codex·Claude Code 실행 경로/인수, ERP 읽기 자료 폴더를 입력하고 저장한다. 이 기능은 기존 candidate.10에는 없으며 새 설치본이 필요하다. 공용 API·로그인 주소는 설치 시 지정한 값을 유지한다.

1. 처음 열면 비어 있는 MCP 항목에 대해 자동 찾기를 실행한다. **이 PC에서 자동 찾기**로 다시 검색할 수도 있다.
2. Codex의 `~/.codex/config.toml`/`CODEX_HOME/config.toml`, Claude Code의 `~/.claude.json`/`~/.claude/settings.json`, Windows Claude Desktop 설정과 이 PC의 기본 `127.0.0.1:17082/mcp`·`17080/mcp`를 확인한다. 도구 목록으로 Mail/DB 종류를 확인하며 메일·ERP 데이터를 조회하지 않는다.
3. 종류별 연결이 하나면 빈 입력란을 채우고, 여러 개면 선택 목록을 제공한다. 기존 입력은 보존하고 **연결 환경 저장**을 눌러야 반영한다. 인증 헤더·OAuth·stdio 연결은 자동 가져오기 대상이 아니다. HTTP MCP를 실행하고 주소를 직접 입력할 수 있다.
4. **Mail MCP/DB MCP 연결 확인**은 통신과 필요한 도구 목록을 검사한다. AI 실행 확인은 CLI의 실행·필수 기능을 검사한다. Codex/Claude 설치와 제공자 로그인은 각 도구에서 먼저 수행한다.
5. 저장하면 대기 중인 실행을 중지하고 새 연결을 즉시 적용한다. 진행 중인 분석·동기화가 있으면 완료 후 저장하도록 안내한다. 다음 동기화·분석 요청 시 필요한 실행을 자동으로 켠다. 메일 주소가 달라지면 기존 출처의 원본으로 자동 간주하지 않고 새 등록 또는 기존 원본 재연결을 진행한다.
6. 설정 파일은 앱이 갱신한다. 기존 historyUrl·auth·port와 기타 설정은 보존하고 동시 수정은 거절한다. 새 설정은 앱을 다시 켜도 유지된다.

DB MCP는 `list_databases`, `list_schemas`, `list_tables`, `describe_table`만 읽기 근거 도구로 연결한다. 자유 SQL·쓰기 도구는 전달하지 않는다. 연결 성공은 지정 업무 데이터 조회·실분석 성공 증거가 아니다.

아래는 기존 candidate 설치·수동 관리 기록이다.

아래 수동 명령은 `0.3.0-candidate.5` 당시 설치 절차다. 최신 배포 후보 `0.3.0-candidate.10`은 [GitHub prerelease](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.0-candidate.10)의 self-extracting setup.exe다. 합성 candidate.9 홈의 stale lock 복구→.10 설치·기존 historyUrl/port 보존, 한글 경로 lifecycle start/pause/stop을 로컬 검증했다. candidate.9의 로그인·비밀번호 변경·업데이트 버튼·로그아웃 브라우저 E2E 1 passed는 이전 후보 기록이며 .10 UI 코드는 같다. 실계정 `offered`·실사용 업데이트와 팀 PC 수용은 아직 검증하지 않았다. 과거 `0.2.0-candidate.6`은 다른 인증 구성의 기록이다.

2026-09-28 전환 완료: 기존 41개 SHA를 보존한 코드·문서 이력으로 원격 main과 Release 태그를 통합했다. candidate.9 태그 `83be2a941f6125db58c70ac05a5efc63f45fe566`·candidate.10 태그 `6fe6de9a93c1df3313541ad4d78a085483edbe17`, main은 문서 후속 커밋 포함 같은 로컬 이력이다. exe/ZIP/checksum digest는 그대로이며 공개 metadata 서명·sourceCommit·hash와 hosted catalog digest를 확인했다. 한글 경로 lifecycle 재검증 항목은 모두 true, `realAuthentication=false`다. 다음은 새 candidate.10의 실계정 로그인·개인 연결·`current` 정책·실메일 분석과 이전 candidate.9의 candidate.10 `offered`·앱 updater 다운로드/설치 테스트다.

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

업데이트는 앱 정상 종료 → 새 번호 payload 설치 → 진단 → 활성 버전 확인 순서다. 새 setup.exe는 기존 `app.lock`이 있으면 기존 설치본의 `lifecycle.mjs recover-lock`으로 소유 PID를 검사한다. 종료된 PID의 stale lock만 복구하고 살아 있는 프로세스 잠금이면 설치를 거절한다. `manage.mjs rollback HOME`은 직전 앱 버전으로 돌리며 공용 DB를 복원하지 않는다. `manage.mjs uninstall HOME`은 개인 설정·자격·outbox를 보존하는 기본 제거다. 전체 사적 데이터 삭제는 별도 명시적 요청·정확한 root 확인 없이는 수행하지 않는다.

오래된 잠금 복구는 `lifecycle.mjs recover-lock HOME`이 실제 소유 프로세스 종료를 확인하는 절차를 사용한다. 개인 candidate.5에서 dead PID 잠금이 남은 것을 읽기 전용으로 확인했고, candidate.10 합성 설치·별도 살아 있는 PID 잠금 거절/종료 후 복구를 검증했다. 포트 충돌에서 기존 서비스나 임의 Node 프로세스를 일괄 종료하지 않는다.

## 6. 팀 배포 묶음으로 남은 작업

setup.exe와 `control.ps1`에 실행/화면 열기(`start`)·작업 중지(`pause`)·앱 종료(`quit`) 조작을 추가했다. 실행 중이면 화면만 열고, 작업 중지는 Runner의 신규 작업 시작을 멈추되 로컬 웹 화면을 유지하며, 앱 종료는 Runner와 로컬 웹 서버를 정상 종료한다. candidate.10 합성 stale lock 복구·설치/설정 보존과 한글 경로 start/pause/stop을 로컬 검증했다. GitHub prerelease asset digest도 확인했다. 다음으로 깨끗한 팀 PC의 포트 충돌·설정 보존·재실행·롤백과 사용자 안내/배포 신뢰 경로, hosted update API를 통한 실제 업데이트를 확인한다. 그 설치본에서 개인 연결과 지정 사례 실분석·저장·보고서 재조회를 확인하고 두 PC 수용 결과로 [팀 파일럿](team-pilot.md)의 확대 기준을 판단한다. `releaseApproved=false`인 시험 후보는 정식 승인과 구분한다.

GitHub Release를 배포 파일·변경 내역 저장소로 쓰는 [업데이트 계획](releases.md)에 따라 인증 update API·서명 메타데이터·로컬 다운로드/updater·사용자 버튼 소스를 추가했다. candidate.10의 게시 asset digest는 검증된 로컬 파일과 일치한다. public 단계에도 인증된 공용 API로 버전·채널·호환성·중단 정책을 확인하고, 알림 후 사용자가 설치를 선택하는 방식이 기본안이다. hosted `history` function은 candidate.9에 배포한 API 코드를 유지하고 승인된 `UPDATE_CATALOG_JSON`만 candidate.10으로 갱신했다. hosted health 200·비인증 update check 401을 확인했다. 실계정 `offered`와 GitHub asset을 실제 앱 업데이트로 내려받아 설치하는 종단 검증은 남아 있다.

현재 패키지 스크립트는 숫자 버전과 기존 candidate 형식을 지원하며 로컬 검증본은 `releaseApproved=false`다. 정식 Release 승인 근거·서명/게시 절차와 public→private 다운로드 전환을 추가 검증해야 한다. 앱 업데이트는 공용 API/DB 및 ERP 운영 배포와 별개다. 완전 자동 설치는 후속 안정화 범위다.
