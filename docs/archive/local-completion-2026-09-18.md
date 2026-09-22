# 2026-09-18 P1 이후 로컬 구현·검증 결과

승인된 범위에서 로컬 구현·합성 검증·후보 패키지와 파일럿 준비를 완료했다. 실제 Auth0·운영 서버·ERP 읽기 계정·깨끗한 팀 PC·두 PC 파일럿은 대기한다. P1~P8 전체 또는 팀 배포를 완료한 기록이 아니다. 단계 상태의 기준은 [통합 계획](../implementation-plan.md) 12~13절이다.

## 구현 결과

- P1: history-api/local-app/UI와 DB 없는 HistoryClient 분리. 기존 이력·리뷰·처리 상태·관련 메일·수동 연결·legacy·내보내기·지식 제안의 v1 ACL 및 React facade 연결, 이전 dist import 호환 유지.
- P2: Native PKCE/state/nonce, 서버 JWT/회사 도메인·membership 검증, DPAPI 세션·회전 갱신, 일회용 브라우저 진입·CSRF, 공유/출처/장치 설정. 재연결은 기존 이력 표본 대조와 사용자 확인을 요구한다.
- P3: 지속 Runner와 별도 sync loop, 지정 장치·lease·고정 진행 이벤트·취소·DPAPI outbox, 응답 유실과 불확실 실행의 명시적 복구, 추가 답변/부모 보고서 맥락, 같은 로컬 세션을 쓰는 직접 CLI.
- P4: 개인 Codex/Claude를 LocalExecutor에 연결. 읽기 전용 MCP broker의 실제 도구 관찰과 결과 evidence를 대조한다. 승인된 root/확장자/파일명/내용·실경로 검사, 환경 자격 제거, 임시 작업과 보호 receipt 분리.
- P5: API 이미지·배포 설정·운영 runbook, 복제 DB migration/restore, 운영자 전용 이관 preview/hash/apply, 불변 보고서/감사의 DB UPDATE/DELETE 회수 및 DDL 차단 검증.
- P6: Node 고정 Windows ZIP, 파일 hash/import 진단, staging 후 게시·실패 재시도·롤백, 브라우저 진입/바로가기/종료/잠금 복구·설정 보존 제거. 한글 경로 DPAPI 회귀 수정.
- P7: 두 PC 파일럿 시나리오/기록 양식과 검증 도구 준비. P8 service 실행은 P7/D8 결정 전 거부한다.

## 검증 근거

| 실행 | 결과와 범위 |
|---|---|
| `npm.cmd run check`, `npm.cmd run build`, `node scripts/verify-build-compat.mjs` | 통과. 마지막 DPAPI 경로 수정 후 다시 실행. 기존 Office bundle 크기 경고는 남음 |
| `node scripts/test-backend.mjs` | 격리 schema, 98/98 통과. 인증/ACL/claim/outbox/sync/mapping/runtime 권한/설치/종료/제어 listener 검사 포함 |
| `node scripts/verify-react-suite.mjs` | UI 합성 회귀 15/15 통과. Native Chrome 합성 검사도 로그인 진입·원본 없는 공유 조회·설정·로그아웃 초안 정리 통과 |
| `node --import tsx scripts/verify-agent-e2e.mjs` | 최신 파일 정책에서 실제 Codex 0.154.0 30,548ms, Claude 2.1.276 55,937ms. 합성 메일/fixture를 읽고 결과36·verified evidence·진행 이벤트를 API/DB에서 재조회 |
| `node scripts/verify-agent-cancel.mjs` | 직접 생성한 Windows 부모·자식 프로세스 둘 모두 취소 확인 |
| `node scripts/verify-dpapi-repeat.mjs` | 한글 경로 실제 write/read3회, 평문 부재, 현재 사용자 전용 DACL 확인 |
| `node scripts/verify-windows-lifecycle.mjs .runtime/packages/0.2.0-candidate.6` | 별도 한글 설치 경로에서 미승인 일반 실행 차단·packaged main 기동·무인증401/일회용 진입·바로가기·정상 중지/lock 해제·앱 제거 후 설정 보존 통과 |
| `node installer/windows/diagnose.mjs .runtime/packages/0.2.0-candidate.6` | 파일 hash와 실제 packaged 모듈 import 진단 통과 |
| 복제 DB migration/restore | `triage-v1-restore-33f4ef3b`: 기존11테이블 건수/hash가 이관 후·재복원 후 일치. 총9,494ms, 재복원 검증2,028ms |
| `docker build -f deploy/Dockerfile.history -t mail-triage-history:852dfe1 .` | 현재 서버 소스 로컬 이미지 빌드 성공. 이후 변경은 로컬 Windows DPAPI와 문서이며 서버 코드 동일. 배포하지 않음 |

UI는 실제 브라우저에 합성 API를 연결한 검증이다. 실제 CLI 종단은 별도 일시 컨테이너/schema를 사용했으며 종료 시 정리했다. 같은 Windows PC에서 실행했으므로 두 PC 파일럿 성공으로 계산하지 않는다. 실메일/ERP/실Auth0 분석은 실행하지 않았다.

최종 합성 종단 원본은 Git 제외 `.runtime/agent-e2e/run-w2VKGV/result.json`, 검사 로그는 `.runtime/continuation/final-*.log`에 보존했다. 복원본/dump와 원문·인증은 Git에 넣지 않았다.

## Windows 후보

`0.2.0-candidate.6`, Windows x64 Node v24.16.0, contract1, 3,719파일. ZIP은 `.runtime/packages/0.2.0-candidate.6.zip`이며 SHA-256은 `8e5c45c9439af96cb7d3e2b53a463541ae73796ec1783efdd32755ce88fa7222`다. `releaseApproved=false`를 유지한다.

후보5의 실제 한글 설치에서 PowerShell 기본 console code page가 UTF8 경로를 잘못 읽어 `ACL_FAILED`가 발생했다. DACL-only 권한 처리는 유지하고 경로만 ASCII base64→UTF8로 전달했다. 실패한 후보5는 최종 산출물로 사용하지 않는다.

패키지 진단의 `portAvailable=false`는 기본3080에 기존 v0 서비스가 실행 중이기 때문이다. 실제 후보 검증은 별도 빈 loopback 포트를 사용한다. v0 API/DB/Worker는 유지했고 검사 후 API/DB healthy와 Worker running을 확인했다.

## 교차 리뷰와 커밋

Claude 읽기 전용 리뷰3건은 고정 커밋에 대해 수행했고 완료 ID/바이트/SHA-256을 확인했다. P1 HTTP/호환성, P2 bootstrap/ACL/export/refresh, P4~P6 증거 정책·복구 경합·이관·종료·설치 지적을 후속 커밋으로 반영했다. `reviews.json` 및 `.runtime/reviews`에 원본을 보존했다.

최초 `0561d1c` 이후 작업 단위로 별도 커밋했다. 주요 후속은 `f20f968` 호환성, `e5aa54e` bootstrap, `5447f7d` 실행 연결, `c34f19a` 이관 권한, `82d91ab` 설치 수명주기, `8d47d68` 원본 재연결, `b18b50f` 반복 DPAPI, `29d0c8b` 실제 종단, `2bd589b` 증거 제한, `e788eae` 복구/권한, `3595d48` 종료/listener 검증, `852dfe1` staging 복구, `e19b0f1` 한글 경로 수정이다. 전체 목록은 `git log --reverse --oneline 0561d1c..HEAD`로 확인한다. push/Release 게시는 수행하지 않았다.

## 외부 입력 후 이어갈 순서

1. D1/D3 회사 도메인·최초 관리자·팀·Auth0/발송 서비스 확정 → 실가입·인증메일·재설정·재발송/만료 검증.
2. D2/D4 실제 source/legacy 소유권·호스트/DNS·운영/백업 담당 확정 → 복제 리허설 후 이관 미리보기 검토, runtime 권한, TLS·외부 암호화 백업/복원과 실전환.
3. D5 팀 PC·개인 CLI/MCP·승인된 ERP 자료와 읽기 계정 확인 → 고정 DB query provider 연결, 실제 쓰기 거부·저장소 instance 식별·다른 Windows 사용자 검증.
4. D6 배포 조직/접근 방식·서명/회사 실행 정책 확정 → 깨끗한 PC 설치·업데이트 검증과 릴리스 승인/게시.
5. D7 두 PC 시험자와 메일 MCP ID 지정 → 파일럿·업무 판단 확인. P8은 파일럿 결과와 D8 공용 실행 계정/예산/권한 결정 후 별도 진행.

현재 broker의 `query_evidence`는 고정 provider 주입 인터페이스만 제공하며 기본 앱에는 실제 ERP DB provider가 없다. 민감 파일 검사는 임의 비밀을 완전히 탐지하지 않으므로 운영자가 승인한 비밀 없는 root가 필요하다. Codex MCP 읽기는 성공했지만 이전 shell-only Windows sandbox 설정1223 문제와 OS 쓰기 거부는 검증 완료로 바꾸지 않았다. source 재연결 표본은 전체 저장소 동일성 증명이 아니며 미확정 legacy 연결 L1~L3도 임의로 확정하지 않았다. manifest hash는 신뢰 서명을 대체하지 않는다.
