# P7 두 PC 파일럿 실행·기록

현재 상태는 **준비, 현장 미착수**다. 로컬 합성 두 사용자/Runner와 실제 서로 다른 두 PC를 구분한다. `pilot-record.example.json`을 Git 제외 경로에 복사하고 시험자/PC는 익명 별칭으로 기록한다. 실제 계정, 메일 원문·첨부·토큰·dump·고객 화면을 저장소에 넣지 않는다.

선행 조건은 P1 전체 기능 연결, P2 실인증/세션, P3 지속 Runner/복구, P4 Codex·Claude 실제 읽기 전용 검증, P5 외부 공용 API, P6 깨끗한 PC 설치 통과다. 이 조건이 남은 상태에서 ‘파일럿 완료’로 기록하지 않는다.

| 사례 | PC A / PC B에서 수행 | 남길 근거 |
|---|---|---|
| 설치·가입 | Codex 1대, Claude 1대. 회사 인증 전/후 접근·비활성 사용자 재검사 | 버전·시간·성공/실패, 민감정보 없는 오류 코드 |
| 격리·공유 | 서로 같은 숫자 ID의 개인 source를 만들고 타인 목록/건수/export 직접 접근 거부. 명시 공유 후 허용 | source/run 가명·HTTP 상태·불변 보고서 hash |
| 원본 부재 | PC B에 없는 MCP source의 공유 보고서 열기 | 보고서는 표시, 원본 제한 안내 |
| 개발자 PC 종료 | 개발자 PC를 끄고 외부 API 조회와 PC B 분석 | 외부 API 주소 별칭·결과/시간 |
| Runner 종료 | claim 후 PC A 절전/종료, lease 만료 뒤 복귀 | 자동 재분석 없음, 사용자 재확인/복구 |
| 응답 유실 | claim/완료 응답만 차단하고 같은 요청 재전송 | generation 및 결과 hash 일치, 중복 결과 없음 |
| 권한 회수 | running 중 source grant/Runner/user 폐기 | 다음 heartbeat/result/조회 거부 |
| sync | 100건 묶음, 중지/재개, 마지막 응답 유실, 다른 PC 동시 실행 | 확인된 건수·불확실 표시·중복 방지 |
| 업데이트 | 활성 작업 중 거부, 실패 롤백, 한글 경로·포트 충돌 | 개인 설정/인증/outbox hash 보존 |
| 복원 | 암호화된 외부 위치 백업을 격리 DB에 복원 | 건수/hash·RPO/RTO 실측 |

합성 시험은 `node scripts/test-backend.mjs`의 v1 인증·ACL·run·sync·outbox와 `node --import tsx --test test/installer.test.ts`를 사용한다. 실제 agent 시험은 `scripts/verify-agents.mjs`의 adapter 검사와 `node --import tsx scripts/verify-agent-e2e.mjs`의 실제 CLI→Runner→API→DB 저장 검사를 사용한다. 모두 별도 합성 자료만 사용하며 실메일은 D7에서 사용자가 메일 MCP ID를 지정한 이후에만 실행한다.

관찰마다 날짜·PC 별칭·실행 종류(합성/실제 agent/실메일)·소요시간·복구/결함 번호를 기록한다. 실제 업무 5일 이상 관찰은 제안이며 일정 약속이 아니다. 업무 판단 확인은 기술 실행 성공과 별도다. 미해결 권한·쓰기 방어·데이터 손실 결함이 있으면 팀 확대를 보류한다.

P8 service 실행은 보류한다. D8 공용 AI 계정/예산/MCP grant·공용 자료 버전과 P7 결과가 확정되기 전에는 service Runner를 등록하지 않는다. v1은 현재 executorKind=local만 수락하며 개인 인증을 서버로 복사하지 않는다.
