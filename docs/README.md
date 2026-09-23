---
slug: /
---

# 문서 안내

갱신: 2026-09-23. 현재 제품 설명, 실행 절차, 앞으로의 계획, 과거 증거를 구분해 관리한다. 처음 읽는 사람은 **현재 상태 → 아키텍처 → 주요 흐름 → 제품 스펙** 순서로 읽는다.

## 현재 제품 이해

| 문서 | 답하는 질문 |
|---|---|
| [프로젝트 README](../README.md) | 무엇을 하는 제품이며 어디서 시작하는가? |
| [현재 상태](current-status.md) | 무엇이 배포·검증됐고 무엇이 남았는가? |
| [아키텍처](architecture.md) | PC·API·DB·MCP·AI는 어디에 있고 어떻게 연결되는가? |
| [내부 구조](internals.md) | 어떤 파일과 모듈이 어떤 역할을 맡는가? |
| [주요 흐름](workflows.md) | 시작·로그인·분석·동기화·복구·종료가 어떻게 동작하는가? |
| [제품 스펙](specification.md) | 제공 기능, 지원 환경, 설정과 제한은 무엇인가? |
| [보안과 데이터](security.md) | 어떤 자료가 어디로 가며 어떤 보안 경계가 있는가? |
| [API 계약](reference/api.md) | 로컬 API와 공용 API의 경로·인증·입출력은 무엇인가? |
| [데이터 모델](reference/data-model.md) | 계정·출처·작업·보고서·복구 정보는 어떻게 저장되는가? |

## 개발·설치·운영

| 문서 | 적용 대상 |
|---|---|
| [개발 안내](guides/development.md) | 현재 사용자명 인증 코드의 빌드·별도 실행·검증 |
| [기술 문서 사이트](guides/documentation.md) | Docusaurus 빌드·탐색·검색·도표 검증 |
| [Windows 후보 설치](operations/windows.md) | 최신 candidate.10 setup.exe 게시·stale lock 복구/한글 경로 수명주기 검증, candidate.5 수동 절차는 이력 |
| [Release 업데이트](operations/releases.md) | candidate.10 GitHub prerelease·hosted catalog 갱신, 실계정 제공/설치 검증 대기. public→private·서명키 운영은 후속 결정 |
| [Supabase 운영](operations/supabase.md) | 현재 공용 API·비공개 DB와 최초 계정·운영 절차 |
| [팀 파일럿](operations/team-pilot.md) | 제한된 2명/2PC 수용과 피드백. 간편 배포 묶음은 미구현 |
| [일반 Node 서버](operations/node-server.md) | 이후 자체 호스팅 코드 경로. 실제 AWS 배포 완료 아님 |
| [기존 v0 서비스](operations/legacy-v0.md) | 기존 Docker API/DB/Worker 보존과 사용 경계 |
| [기존 유지보수 도구](operations/legacy-maintenance.md) | v0 이관·동기화·복구 도구. v1 운영 DB에 그대로 적용하지 않음 |

## 계획과 증거

- [통합 구현 계획](implementation-plan.md): v3.2, M1 공용 기반 → M2 제한 배포 → M3 안정화 → M4 원격 분석 → M5 SR→PR. Release 업데이트·보고서 대화/낙관적 락·작업 시작과 13절 남은 작업 등록부를 포함하는 단일 기준이다.
- [검증 일지](validation.md): 날짜별 실제 수행 결과. 과거의 미완료 상태를 현재 사실로 읽지 않는다.
- [기능별 검증 기록](validation/README.md): UI 전환·메일 스레드·기존 문서 연결 등의 근거.
- [보존 문서](archive/README.md): 이전 Auth0·VM 제안, 옛 계획, 인계, 당시 개발·설치 안내. 현재 실행 명령의 기준으로 사용하지 않는다.

## 문서 구조

```text
docs/
  README.md                  문서 지도
  current-status.md          배포·검증·남은 작업의 현재 요약
  architecture.md            배치와 경계
  internals.md               코드와 모듈
  workflows.md               실행 흐름과 상태
  specification.md           구현된 제품 스펙
  security.md                보안과 데이터 이동
  implementation-plan.md     앞으로의 순서와 수용 기준
  reference/                 API·DB 상세 계약
  guides/                    개발 안내
  operations/                설치·운영·팀 수용
  validation.md              날짜별 검증 일지
  validation/                주제별 검증 근거
  archive/                   과거 결정·인계·옛 안내
```

## 변경 규칙

1. 기능을 바꾸면 관련 현재 문서와 코드 경로를 함께 갱신한다. 새 계획은 구현된 기능처럼 기술하지 않는다.
2. 배포·실검증을 수행했을 때만 현재 상태와 검증 일지를 갱신한다. 문서 정리는 새 배포·테스트 완료가 아니다.
3. 계정·권한·백업 등 운영 수치는 환경과 확인일을 명시한다. 실제 endpoint·자격·메일 원문은 예시에 넣지 않는다.
4. 과거 기록은 삭제하지 않는다. 위치를 옮길 때 상대 링크를 수정하고 Git으로 이전 본문을 추적한다.
5. 2026-09-22 커밋 정리 전 ID는 `backup/commits-before-cleanup-20260922` 브랜치에 보존되어 있다. 과거 검증의 원래 ID를 현재 HEAD로 일괄 치환하지 않는다.
