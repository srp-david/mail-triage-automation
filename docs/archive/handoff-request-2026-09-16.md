# mail-triage-web Codex 소유권 인계

> 2026-09-16 인계 당시 요청을 보존한 역사 문서다. 아래 지시와 미완료 목록은 새 작업 요청이 아니며 현재 개발 범위는 [통합 구현 계획](../implementation-plan.md)을 따른다.

사용자는 남은 작업을 C:/Users/david/IdeaProjects/mail-triage-web 프로젝트 안에서 진행하기로 했다.
이 요청은 Claude 리뷰가 아닌 Codex로의 전체 작업 인수인계다. 발신자는 전송 후 같은 구현을 계속하지 않는다.

## 바로 수행할 일
1. 아래 계획서·작업 정리·검증 기록과 AGENTS.md를 읽는다.
2. 현재 작업 트리와 실행 상태를 읽기 전용으로 확인하고 인수한 기능/미완료 항목/다음 작업을 간결하게 정리한다.
3. 이후 개발 소유권을 mail-triage-web에서 이어받는다. 이 인계 자체 때문에 임의 고객 메일 분석, POP3 sync, 기존 이력 이관, 재초기화를 실행하지 않는다.
4. 인수 확인 결과와 다음 단계는 UTF-8 초안에 저장한 후 이 요청 헤더의 --complete 명령으로 결과를 확정한다. 이때 succeeded는 인수 확인 완료를 뜻하며 전체 백로그 완료로 표현하지 않는다.

## 전달 파일 — 모두 실제 대상 프로젝트에 존재
- C:/Users/david/IdeaProjects/mail-triage-web/docs/implementation-plan.md
- C:/Users/david/IdeaProjects/mail-triage-web/docs/work-summary.md
- C:/Users/david/IdeaProjects/mail-triage-web/docs/validation.md
- C:/Users/david/IdeaProjects/mail-triage-web/README.md
- C:/Users/david/IdeaProjects/mail-triage-web/AGENTS.md

계획서를 새로 쓰거나 별도 erp-manager 사본을 만들지 말고 이 파일들을 기준으로 이어간다.
work-summary.md에 변경 파일 절대경로, 3개 저장소 경계, Git 상태, 검증 명령, 미실행 검증, 후속 순서가 있다.

## 반드시 유지할 최종 결정
- 별도 Docker 웹 + mail MCP/DB MCP + erp-manager 직접 실행이 공용 API/PostgreSQL 이력을 공유한다.
- ERP 코드·DB는 읽기 전용. 메일 발송/삭제/읽음 처리 없음.
- 웹 Worker는 Claude/Orca 리뷰·Outlook·자동 sync 없음. 직접 실행의 기존 리뷰는 공용 이력 등록 계약으로 유지.
- 본문 CID 이미지 원래 위치, 실패 재시도, HTML 실패 시 텍스트 대체.
- 분석 버튼 옆 파란색 이력 버튼.
- 첨부는 파일명/형식/크기/다운로드만. ZIP 내부/Office 미리보기는 사용자가 선택하지 않았다.
- 첨부 목록은 기본 접힘. 제목 클릭/Enter/Space로 접고 펼친다.
- 다운로드 5 MiB 한도는 기존 MCP 제한이며 큰 파일도 목록에는 남긴다.
- 한국어 응답, 비밀/고객 메일 원문/.runtime 캡처 커밋 금지, commit/push 미요청.

## 현재 상태와 경계
API/DB/mail MCP healthy, Worker 컨테이너 실행 중. 웹 http://localhost:3080, 최신 UI Docker 반영 완료.
프로젝트는 아직 최초 Git 커밋이 없는 상태다. erp-manager 및 mail-mcp 변경도 미커밋이다.
기존 사용자 파일 erp-manager/.claude/settings.local.json과 mail-mcp의 .gitattributes/gradlew 변경을 보존한다.
기본 수정 대상은 mail-triage-web. erp-manager는 공유 규칙/지식 원본, mail-mcp는 HTML 읽기 도구를 추가한 외부 의존성이다.
.env와 history.local.json 및 Codex 인증은 경로만 확인하고 비밀 값을 문서나 모델 프롬프트에 복사하지 않는다.

## 검증과 미완료
웹 전체 테스트 14개, 실제 본문 이미지/다운로드/모바일/접힘 조작 검증 통과.
실제 다운로드는 첨부 1건 원본 바이트 일치, 네 문서 확장자별 UI는 합성 응답으로 검증했다.
고객 메일 전체 분석→보고서 저장 실제 종단 검증과 실제 POP3 sync, 과거 이관, Outlook 예외 등록, 지식 반영기, 백업 복원 실험은 미완료다.
scripts/verify-ui.mjs의 초기 '#detail pre' 선택자는 HTML '.mail-body' 표시를 고려하는 후속 보완이 필요하다.
수신자는 문서에 적힌 검증 범위를 확장해 주장하지 말고 실제 수행과 미실행을 구분한다.
