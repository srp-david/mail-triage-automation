# 기존 단일 사용자 Docker 서비스

기존 실행 중인 API·PostgreSQL·Codex Worker를 보존하기 위한 안내다. 현재 Supabase 팀용 구성의 설치/배포 명령이 아니다. v0와 v1의 DB·인증·실행 주체는 [아키텍처](../architecture.md)에서 비교한다.

## 실행 경로

루트 `compose.yaml`, `npm start`(`dist/server.js`), `npm run worker`(`dist/worker.js`)는 기존 v0다. 기존 Mail MCP 17082·DB MCP 17080과 ERP 읽기 전용 마운트·개인 설정을 사용한다. 팀원의 새 Windows 앱에 이 Docker 구성 전체를 설치할 필요는 없다.

이미 구성된 개발 PC의 서비스 상태는 다음으로 확인한다.

```powershell
docker compose ps
```

새로운 v0 개발 환경을 별도로 준비할 때의 기존 시작 순서는 다음과 같다. 기존 `.env`·개인 인증·볼륨을 덮어쓰는 초기화로 사용하지 않는다.

```powershell
node scripts/setup.mjs
docker compose up -d --build api
docker compose --profile analysis up -d worker
```

기존 UI는 `http://localhost:3080`, 인증은 기존 `TRIAGE_TOKEN`이다. Supabase 사용자명 계정과 같은 인증 방식이 아니다. Worker 인증은 원본 seed와 별도 볼륨을 사용하므로 다른 사람에게 인증 볼륨을 전달하지 않는다.

## 기존 서비스 변경과 데이터 보존

API 화면만 바꾸는 경우 대상 API만 빌드·교체하고 DB/Worker를 불필요하게 재생성하지 않는다. 실행 중 분석·sync와 기존 자료를 확인한 후 배포하고 health·제공 정적 파일·이력 보존을 확인한다. 전체 서비스 변경은 별도 범위다.

`docker compose down -v`는 데이터를 지우므로 사용하지 않는다. 새 팀 DB로 기존 이력을 자동 공개·이관하지 않는다. 이관·지식 제안·복구 도구는 [기존 유지보수 안내](legacy-maintenance.md)의 대상 DB와 승인 범위를 확인한다.

메일 화면·Office/Markdown·동기화와 직접 erp-manager CLI의 당시 사용법은 [기존 README 보존본](../archive/README-v0-2026-09-22.md)에 있다. 해당 문서의 Auth0/팀 배포 상태는 당시 기록이며 현재 팀 구성의 기준이 아니다.
