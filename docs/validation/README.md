---
slug: /validation/topics
---

# 기능별 검증 기록

이 문서들은 작성 시점의 실제 수행·실패·경계를 보존한다. 현재 배포 요약은 [현재 상태](../current-status.md), 날짜별 전체 검증은 [검증 일지](../validation.md)를 본다.

| 문서 | 대상 |
|---|---|
| [React 전환](react-transition-validation.md) | UI 전환·회귀·로컬 적용 |
| [메일 스레드](mail-threads-validation.md) | 헤더 그룹·수동 링크·패널·관련 UI |
| [기존 문서 연결](legacy-link-validation.md) | 기존 이력 연결과 보존 |
| [분석 상태 필터](status-filter-validation.md) | 메일 검색과 분석 상태 |

로컬/합성 검사, 실제 제공자 호출, hosted 배포, 팀 업무 수용을 구분한다. 과거 기록의 성공을 새 버전의 자동 통과로 재사용하지 않는다. `.runtime` 증거 파일은 Git 제외 로컬 자료이므로 새 clone에서 없을 수 있다.
