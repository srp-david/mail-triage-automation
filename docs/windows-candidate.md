# Windows 후보 패키지

P6 개발 후보이며 팀 배포용 완성본이 아니다. P1/P2 전체 UI·인증 연결, P3 지속 Runner, P4 두 agent 읽기 전용 검증, P5 실서버가 남아 manifest는 releaseApproved=false다. 시작 스크립트는 미승인 후보의 일반 실행을 거부한다. 값을 임의로 true로 바꿔 배포하지 않는다.

빌드 PC의 Windows x64 Node v24.16.0을 고정한다. `npm run build` 후 `.runtime/packages` 디렉터리를 만들고 `node scripts/package-windows.mjs 0.2.0-candidate.1`을 실행한다. portable node.exe·Node 라이선스·정확한 의존성/lockfile·로컬 앱/Runner/adapter·공통 스킬·UI 자산·설치 관리 도구와 모든 파일 SHA-256 manifest/ZIP checksum을 만든다. DB 드라이버·history-api·개인 설정·ERP 자료·인증·outbox는 넣지 않는다.

검증된 ZIP은 설치 전 별도 빈 폴더에 압축 해제한다. checksum은 전송 손상 검사이며 배포자 서명을 대체하지 않는다. 승인된 배포 경로에서 받은 패키지만 사용한다. 후보 설치 실험:

```powershell
node installer/windows/manage.mjs install "$env:LOCALAPPDATA/MailTriage" "후보 압축 해제 경로" --candidate
node installer/windows/manage.mjs rollback "$env:LOCALAPPDATA/MailTriage"
node installer/windows/manage.mjs remove "$env:LOCALAPPDATA/MailTriage" "참조되지 않는 이전 버전"
```

파일 목록/hash/계약 검증 후 새 버전 폴더에 복사하고 진단 성공 시에만 active.json을 원자적으로 바꾼다. app.lock이 있으면 업데이트/제거를 거부한다. 앱 종료를 확인하기 전 잠금 파일을 지우지 않는다. config/secrets/work/logs, 개인 Codex/Claude/MCP 설정은 보존한다. 직전 버전은 rollback에 남기며 제거 도구는 active/previous 버전을 삭제하지 않는다.

깨끗한 팀 PC 설치, 자동 바로가기/중지·복구 UI, 코드 서명/PowerShell 정책, 실제 CLI 없음·로그인 만료·MCP 진단과 외부 GitHub 게시(D5/D6)는 아직 미완료다. `.workflow.example.yml`은 비활성 초안이며 Actions 실행이나 Release 게시를 수행하지 않았다.
