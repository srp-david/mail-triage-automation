# Windows 후보 패키지

현재 사용자명 인증 후보의 빌드·검증 상태는 [Supabase 배포 안내](../operations/supabase.md)와 [검증 기록](../validation.md)을 따른다. 아래 candidate.6은 이전 P6 개발 후보이며 새 팀 배포본으로 사용하지 않는다. Native UI·세션·Runner와 두 agent MCP 합성 실행은 연결됐고, 실인증·ERP 읽기 계정·공용 호스트·팀 PC 검증은 남아 manifest는 releaseApproved=false다. 시작 스크립트는 미승인 후보의 일반 실행을 거부한다. 값을 임의로 true로 바꿔 배포하지 않는다.

빌드 PC의 Windows x64 Node v24.16.0을 고정한다. `npm.cmd run build` 후 `node scripts/package-windows.mjs 새후보버전`을 실행한다. 버전 형식은 `0.2.0-candidate.6`이며 기존 폴더를 덮어쓰지 않으므로 다음 빌드는 새 번호를 사용한다. portable node.exe·Node 라이선스·정확한 의존성/lockfile·로컬 앱/Runner/adapter·공통 스킬·UI 자산·설치 관리 도구와 모든 파일 SHA-256 manifest/ZIP checksum을 만든다. DB 드라이버·history-api·개인 설정·ERP 자료·인증·outbox는 넣지 않는다.

2026-09-18 최종 로컬 후보는 `0.2.0-candidate.6`(3,719파일)이다. ZIP SHA-256은 `8e5c45c9439af96cb7d3e2b53a463541ae73796ec1783efdd32755ce88fa7222`다. 후보5의 한글 경로 ACL 실패를 수정한 버전이며 상세 실행 근거는 [최종 검증](local-completion-2026-09-18.md)에 기록한다.

검증된 ZIP은 설치 전 별도 빈 폴더에 압축 해제한다. checksum은 전송 손상 검사이며 배포자 서명을 대체하지 않는다. 승인된 배포 경로에서 받은 패키지만 사용한다. 후보 설치 실험:

```powershell
node installer/windows/manage.mjs install "$env:LOCALAPPDATA/MailTriage" "후보 압축 해제 경로" --candidate
node installer/windows/manage.mjs rollback "$env:LOCALAPPDATA/MailTriage"
node installer/windows/manage.mjs remove "$env:LOCALAPPDATA/MailTriage" "참조되지 않는 이전 버전"
```

파일 목록/hash/계약 검증 후 새 버전 폴더에 복사하고 진단 성공 시에만 active.json을 원자적으로 바꾼다. app.lock이 있으면 업데이트/제거를 거부한다. 앱 종료를 확인하기 전 잠금 파일을 지우지 않는다. config/secrets/work/logs, 개인 Codex/Claude/MCP 설정은 보존한다. 직전 버전은 rollback에 남기며 제거 도구는 active/previous 버전을 삭제하지 않는다.

복사/진단은 고유 staging 폴더에서 끝낸 뒤 검증된 버전 폴더로 rename한다. 중단된 staging은 같은 버전의 재설치를 막지 않는다. 이전 형식의 불완전한 비활성 버전만 지우려면 `manage.mjs discard-incomplete HOME VERSION --confirm-root "정확한 절대 HOME"`을 사용한다. 유효한 버전/활성·직전 버전/링크는 이 명령으로 삭제하지 않는다. 서명 없는 manifest의 `releaseApproved`는 배포 절차상의 승인 표시이며, 같은 Windows 사용자의 파일 변조까지 막는 신뢰 서명을 대신하지 않는다(D6 대기).

설치 후 `installer/lifecycle.mjs start|open|stop|recover-lock HOME`으로 실행·브라우저 열기·정상 중지·명시적 오래된 잠금 복구를 수행한다. 후보 합성 실행은 `start HOME --candidate --no-open`을 명시해야 한다. `shortcut HOME 새바로가기.lnk`는 기존 바로가기를 덮어쓰지 않는다. 설치 홈의 `launch.ps1`은 활성 버전을 따라간다.

기본 포트는 3080이다. 충돌하면 기존 서비스를 종료하지 않고 실패한다. `settings.json.localPort`에 1024~65535의 명시 포트를 설정할 수 있다. 현재 사용자명 인증은 Auth0 callback 등록이 필요하지 않으며 loopback Host/Origin·CSRF·launcher 보호를 유지한다. Supabase 파일럿 설정 예시는 43180을 사용한다.

`manage.mjs uninstall HOME`은 앱 버전만 제거하고 개인 상태를 보존한다. 개인 상태까지 지우려면 `--purge-private --confirm-root "정확한 절대 HOME"`이 필요하다. 실행 중 잠금·알 수 없는 파일·심볼릭 링크가 있으면 거부한다. 별도 위치에 만든 바로가기는 사용자가 해당 위치에서 제거한다. 개인 AI 설치/계정은 이 도구가 지우지 않는다.

`diagnose.mjs RELEASE HOME`은 패키지 import·포트·개인 CLI 버전/자격 존재를 확인하며 자격 원문을 출력하지 않는다. `--connect-mcp`는 설정된 메일 MCP의 도구 목록만 확인하고 메일 조회나 동기화는 호출하지 않는다. 자격 존재는 제공자의 만료/실제 호출 성공을 보장하지 않는다.

깨끗한 팀 PC 설치, 코드 서명/PowerShell 정책, 실제 계정 만료·외부 GitHub 게시(D5/D6)는 미완료다. `.workflow.example.yml`은 비활성 초안이며 Actions 실행이나 Release 게시를 수행하지 않았다.
