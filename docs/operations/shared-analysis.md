# 공용 분석 협업

## 구현 순서

1. 공통 메일 식별과 기존 source 권한 보존
2. 명시적 팀 공유, 각 메일함의 공유 조회, 공통 메일 중복 분석 방지
3. 대화 저장, 보고서 revision, expectedVersion 충돌 처리와 초안 보존
4. 기존 이력의 검증 가능한 이관과 연결

## 식별과 권한

메일 원본은 각자의 MCP에 남긴다. 공통 메일은 팀 범위에서 Message-ID, 발신 주소 하나, 발송 시각, 제목의 정규화된 지문으로 연결한다. 제목만 같거나 헤더가 부족한 자료는 자동 연결하지 않는다. Message-ID의 local-part 대소문자를 보존한다. 같은 source 내부 ID의 식별 정보가 바뀌면 충돌로 처리한다.

로컬 앱이 MCP에서 직접 확인한 식별 정보만 전달한다. 이 API는 인증된 로컬 클라이언트의 증명을 신뢰하며 메일 서버의 암호학적 소유 증명은 아니다. 공통 메일 연결 자체는 보고서나 원본 조회 권한을 부여하지 않는다. 보고서는 소유자가 명시적으로 팀에 공유해야 다른 source 사용자에게 노출된다.

기존 source/메일 ID/분석/결과는 유지한다. 새로운 테이블과 추가 열로 연결하며 기존 migration checksum을 변경하지 않는다. 여러 기존 활성 분석이 발견되면 자동 합치지 않고 충돌을 반환한다.

## 공유 조회와 실행

보고서 소유자가 팀 읽기/편집 공유를 명시적으로 선택한다. 동일 메일을 연결한 팀원은 자기 메일 상세의 공유 분석에서 보고서를 열 수 있다. 공유 응답은 보고서와 작성 정보만 반환하며 원래 source ID, 관련 메일, 원본 첨부나 개인 처리 상태를 노출하지 않는다. 공유 해제·계정 비활성화·팀 탈퇴를 매 요청 검사한다.

공통 메일 식별자를 가진 queued/running 실행은 팀 내 하나만 허용한다. 요청 중복은 기존 requestId 계약을 유지하고, 다른 요청의 경합은 COMMON_MAIL_BUSY로 거절한다. PostgreSQL 부분 unique index와 기존 트랜잭션 잠금으로 보장한다. 식별 헤더가 부족한 메일은 기존 source별 제한만 적용된다. 처리 완료는 사용자별로 저장한다.

검증: 식별 unit 2건, 공용 협업/기존 실행 통합 13건, local UI/계약 3건 및 check 통과. 합성 자료와 임시 PostgreSQL 기준이며 hosted 배포 증거는 아니다.

## 보고서 협업

보고서마다 불변 revision을 만들고 현재 head를 관리한다. 최초 분석은 v1이며 수정본은 v2부터 시작한다. 보고서 수정 요청에 expectedVersion, requestId, 변경 내용, 근거를 포함한다. 최신 head가 다르면 409 REPORT_VERSION_CONFLICT를 반환한다. UI는 초안과 기준 버전을 sessionStorage에 보관하며 최신 내용과 비교 후 명시적으로 기준을 변경한다. 동일 요청 재전송은 이미 저장한 버전을 반환한다. 최신 export와 최초 분석 원본 export는 별도로 제공한다.

질문·추가 조사·결정·미확정 사항·회신 초안을 공용 대화로 저장한다. 개인 Agent 질문은 기준 보고서와 최근 30개 대화의 snapshot을 사용하고 원본 메일을 조회하지 않는다. 사용자가 허용한 경우에만 설정된 로컬 읽기 자료와 DB 도구를 제공한다. AI 답변은 대화에만 추가하며 보고서 반영은 명시적 편집 저장이다. 질문 작업은 실행 장치당 하나, 기존 분석과 합산하여 팀당 두 개로 제한한다. 10분 실행 기한, DPAPI outbox와 요청 대조를 사용하며 불확실한 실행을 자동 반복하지 않는다.

검증: 전체 unit/UI/격리 PostgreSQL 163건, check/build/Edge bundle 통과. 로컬 Supabase Edge의 migration 재실행·runtime grants·인증·Runner·복원 11군 통과. 실제 개인 AI 및 타 PC의 사용 검증은 수행하지 않았다.

## 기존 데이터 이관

`import-history.ts`는 운영자 전용이며 HTTP API에 노출하지 않는다. source/소유자/팀을 명시하고 전체 bundle과 대상 충돌 상태를 포함한 preview hash를 대조한 후 한 트랜잭션으로 반영한다. 원본 UUID·결과 JSON·문서·연관 관계를 보존하며 실행 중 분석과 충돌 자료는 거절한다. 기존 Markdown 보고서 중 메일에 연결된 문서는 결정적인 UUID의 분석 이력으로 추가하여 공유할 수 있다. 미연결 문서는 원문 그대로 컬렉션에 보관한다.

- `scripts/import-shared-history.mjs BUNDLE PLAN [--confirm HASH]`: migration DB 연결 파일과 CA를 사용한다. 먼저 옵션 없이 미리보기한다.
- `node --import tsx scripts/prepare-shared-history.mjs BUNDLE PLAN OUTPUT_SQL`: 임시 DB에서 이관과 재실행을 검증하고 원자적인 운영 SQL을 만든다. SQL도 실제 데이터이므로 보호된 Git 제외 폴더에 둔다. 기존 migration checksum과 소유자·팀·활성 작업을 검증하며 기존 데이터 충돌 시 전체 rollback한다.
- schema migration 006~009와 `private-grants.sql` 적용 후 새 Edge API 및 local-app을 배포해야 한다. 설치본 코드만 변경하거나 API만 갱신하는 것으로 신규 UI까지 배포되지는 않는다.

실제 자료 복제본 검증: 기존 메일 39건, 분석 13건, 이전 문서 33건, 기존 문서 연결 30건, 관련 메일 4건. MCP 식별 대조 39/39 일치. 공유 가능한 보고서 43건(기존 분석 13 + 연결된 이전 보고서 30), 미연결 문서 3건. 원본 13개 결과 JSON 일치와 동일 이관 재실행 시 중복 없음 확인. 원본 DB와 ERP 데이터는 수정하지 않는다.
