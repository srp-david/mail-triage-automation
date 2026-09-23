# 이력 이관과 운영 도구

> 기존 v0 서비스의 유지보수 절차다. 현재 Supabase/v1 DB에 그대로 적용하지 않는다. 현재 진입점은 [v0 안내](legacy-v0.md), 새 팀 구성은 [문서 안내](../README.md)를 따른다.

> 현재 구현된 단일 사용자 토큰 API와 Docker 환경의 운영 안내다. 사용자별 v1 API·로컬 설치형 앱의 목표 사양은 [통합 구현 계획](../implementation-plan.md)을 따른다. 아래 명령을 아직 구현되지 않은 팀 운영 명령으로 해석하지 않는다.

명령은 `mail-triage-web`에서 실행한다. API 설정은 `TRIAGE_CONFIG` JSON(`url`, `token`, `storeId`), 환경변수 `TRIAGE_API_URL`+`TRIAGE_TOKEN`, 프로젝트 `.env` 순서로 읽는다. JSON/토큰/메일 원문/receipt/백업은 `.runtime` 등 Git 제외 경로에 둔다. API/DB가 중단되면 새 분석을 시작하지 않는다.

## 메일 전체 동기화와 이어받기

- **메일 동기화**를 한 번 누르면 DB에 실행을 먼저 저장하고 API의 백그라운드 스케줄러가 100개씩 순차 처리한다. 정상 `partial`(오류 없이 남은 메일 있음)은 계속 진행하며 30회/3,000개 제한은 없다. 날짜/발신자 검색 조건은 화면 조회용이며 POP3 수집 범위를 제한하지 않는다.
- 서버에 남아 있고 MCP에 아직 저장되지 않은 메일을 UIDL 기준으로 수집한다. 처음에는 전체 미수집 메일, 이후에는 신규/기존 실패 메일이 대상이다. PC의 Outlook에만 남은 메일은 수집 대상이 아니다.
- **중지**는 현재 최대 100개 묶음이 반환된 뒤 적용된다. API가 아직 시작하지 않은 묶음/재시도 대기는 다음 스케줄 확인 때 중지한다. 이미 저장된 메일/실행 기록은 보존한다. 통신이 지연되면 MCP 호출이 반환되거나 제한 시간에 도달할 때까지 중지 요청 상태가 유지될 수 있다.
- API/PC 재시작 시 진행 중 실행은 `paused`로 복구된다. 브라우저를 닫는 것은 중지가 아니다. **이어서 동기화**는 새 실행 기록을 만들며, MCP가 이미 저장한 UIDL을 건너뛰어 이어받는다. 자동 재시작 수집은 하지 않는다.
- 화면의 **이번 실행 저장**은 해당 실행에서 응답으로 확인한 누적 건수다. 재개 실행은 0부터 집계하고 과거 건수를 덮어쓰지 않는다. 응답 유실/재시작으로 마지막 묶음의 저장 여부가 불확실하면 안내를 표시한다. 진행률은 마지막 MCP 응답의 서버 총수와 서버에 존재하는 저장 완료 건수 기준이며 서버 메일 증감에 따라 달라질 수 있다.
- **실패 시도**는 고유 메일 수가 아닌 누적 실패 횟수다. MCP `remaining`은 해당 묶음의 실패 메일을 제외하므로 남음 0만으로 완료 판단하지 않는다. 오류 없는 최종 응답에서 실패 0/남음 0일 때 완료하며, 이후 재시도에서 해결된 실패 시도 기록은 보존한다.
- 일시적 POP3/연결/다른 sync 진행 오류는 5·15·30초 간격으로 최대 3회 연속 재시도한다. 인증/TLS/저장소/영구 메일 오류, 유효하지 않은 응답, 저장 진전 없는 잔여는 중단한다. 실패 원인을 해결한 후 사용자가 이어받을 수 있다.
- 진행/목록은 10초마다 확인한다. 진행 중 현재 페이지/검색 조건을 유지해 갱신하고, 종료 시 첫 페이지로 이동한다. 선택한 메일 상세/열린 분석 이력은 유지한다. UI 조회 오류는 수집 작업을 취소하지 않는다.
- DB 스키마별 advisory lock으로 한 묶음만 처리한다. `sync_run`의 상태·묶음 수·재시도 예약을 영속화하며, API 재시작 시 명시적 재개 정책을 적용한다. 현재 수집 처리기는 API 프로세스 안에 있으므로 팀 다중 API/서버리스 배포 전에는 독립 처리기와 시작 시 복구 책임을 분리해야 한다.

## 기존 문서 이전

```powershell
node scripts/legacy-history.mjs preview --root C:/Users/david/IdeaProjects/erp-manager --out .runtime/legacy-preview.json
node scripts/legacy-history.mjs import --manifest .runtime/legacy-preview.json --out .runtime/legacy-receipt.json
```

preview는 GG/GGFAC/DCODE의 `erp/*/reports/**/*.md`와 `.claude/mail/triage-log.md`를 읽어 상대 경로·SHA-256·크기만 기록한다. 원본을 수정하지 않으며 링크/1 MB 초과 파일은 거부한다. import는 전체 해시를 다시 확인한 다음 가져오고 API에서 모든 문서 내용/해시를 대조한다. 원본 변경 시 새 manifest를 만들어 검토한다. 같은 출처/경로/해시는 재실행해도 중복되지 않으며, 변경된 원본은 별도 버전으로 보존한다.

웹의 **이전 이력 → 기존 문서 조회**로 보존 사본을 확인한다. 기존 고객 완료 상태를 다시 미완료로 분류하지 않는다. 제목이나 Message-ID만으로 메일을 자동 연결하지 않는다. 확실한 연결은 원문과 대조한 아래 JSON으로 명시한다. 전체 로그는 여러 메일을 포함하므로 한 메일에 연결할 수 없다.

```json
{"id":"legacy document UUID","hash":"검토한 원본 SHA-256","storeId":"local-mail-v1","mailId":123,"messageId":"<검증한 Message-ID>","verifiedBy":"대조한 담당자와 근거"}
```

```powershell
node scripts/legacy-history.mjs link --file .runtime/legacy-link.json
```

API는 현재 저장소와 실제 mail MCP의 ID/Message-ID를 재확인한다. 미확정 문서는 미연결 상태로 보존한다. 전환 검증 전에는 기존 triage-log와 공용 이력을 함께 확인하고 원본을 삭제하지 않는다.

## Outlook 예외 메일

기존 Outlook 절차로 원본 파일과 `namespace`, `mailbox`, `entryId`, `messageId`(없으면 null), `subject` 메타데이터 JSON을 보존한다. mailbox는 동일 메일함에 대해 일관된 식별자를 사용한다. 원본 파일 SHA-256은 CLI가 계산한다. 메일함과 EntryID의 조합을 해시한 별도 식별을 쓰며 임의 MCP 숫자 ID나 제목으로 병합하지 않는다. Outlook에서 이동하여 EntryID가 바뀐 메일은 자동 병합되지 않는다.

```powershell
node scripts/external-history.mjs register --file .runtime/outlook-meta.json --source .runtime/original.msg
node scripts/external-history.mjs begin --mail MAIL_UUID
node scripts/external-history.mjs keepalive --run RUN_UUID
node scripts/external-history.mjs complete --run RUN_UUID --file .runtime/result.json
# 추가 답변을 받은 뒤 직접 재분석
node scripts/external-history.mjs begin --mail MAIL_UUID --parent PREVIOUS_RUN_UUID --answer-file .runtime/answer.txt
```

keepalive는 별도 프로세스로 실행한다. 결과 형식은 공용 이력의 result JSON과 같다. 이 기능은 직접 분석의 등록·저장을 제공하며 Outlook COM 자동화나 웹 Worker의 Outlook 접근을 추가하지 않는다. receipt와 결과는 `.runtime/external-history`에 보존한다. 만료된 실행은 근거를 재확인하고 새 실행으로 등록한다.

## 지식 제안의 단일 반영

```powershell
node scripts/knowledge-writer.mjs prepare --root C:/Users/david/IdeaProjects/erp-manager --run RUN_UUID --target erp/gg/docs/FILE.md
node scripts/knowledge-writer.mjs apply --root C:/Users/david/IdeaProjects/erp-manager --proposal PROPOSAL_UUID
```

prepare는 기존 docs 파일의 원본 해시, 불변 보고서 해시, 적용할 추가 문구와 결과 해시를 저장한다. 출력된 내용을 업무 근거와 함께 검토한 뒤 apply한다. 자동 분석 완료만으로 apply하지 않는다. 적용은 지정된 업무 지식 Markdown 끝에 추가하며 ERP 소스/DB를 변경하지 않는다.

API의 대상별 단일 applying 제안과 로컬 `.triage-lock`이 중복 반영을 막는다. 적용 직전 원본 해시를 다시 확인한다. API 완료 저장 전에 연결이 끊겨도 동일 제안을 재실행하면 파일의 결과 해시를 확인하여 완료 기록만 재전송한다. 원본이 바뀌면 덮어쓰지 않고 중단한다.

프로세스 강제 종료로 잠금 파일이 남으면 소유 프로세스 종료, API 제안 상태, 파일의 base/next 해시를 확인한 뒤 운영자가 해당 잠금만 해제하고 같은 제안을 재실행한다. 불일치하는 파일을 강제로 되돌리거나 applying 행을 임의 삭제하지 않는다. applying 상태에서 제3자가 원본을 변경한 경우에는 보존 사본과 제안으로 수동 대조가 필요하며 자동 충돌 병합/잠금 해제 기능은 없다. 모든 반영자가 이 절차를 사용해야 하며 별도 편집기의 동시 수정까지 원자적으로 잠글 수는 없다.

## 보고서 사본

`GET /api/runs/RUN_UUID`의 `reportHash`를 검토한 후 내보낸다.

```powershell
node scripts/export-report.mjs --run RUN_UUID --hash REVIEWED_REPORT_HASH --out .runtime/new-report.md
```

run/보고서 해시를 사본에 기록하고 조회 시점의 리뷰를 함께 내보낸다. 보고서 해시는 리뷰를 포함하지 않으므로 출력되는 `exportHash`로 사본 전체를 식별한다. 기존 파일은 덮어쓰지 않는다. 기존 직접 CLI export도 유지된다.

## Worker 결과 재등록

Worker는 조회 증거와 구조화 결과 검증 후 `/work/RUN_UUID/`에 `result.json`, `tool-calls.json`, 소유권이 포함된 `recovery.json`을 보존한다. work 볼륨은 삭제하지 않는다. DB가 끊어지면 전용 Worker 잠금 연결을 잃은 프로세스가 중지되고 Docker가 재시작한다. 이전 running 실행은 lease 만료로 실패 처리하며 무조건 재실행하지 않는다.

```powershell
docker compose exec -T worker node scripts/worker-result.mjs preview --directory /work/RUN_UUID
# 원본 메일과 보고서의 DB/코드 근거를 다시 확인한 후에만 실행
docker compose exec -T worker node scripts/worker-result.mjs recover --directory /work/RUN_UUID --revalidated
```

API가 현재 메일 식별을 재확인하지만 DB/업무 근거의 재검토는 담당자의 책임이다. 유효한 실행은 같은 결과로 완료하고, 실패/만료 실행은 부모를 보존한 새 직접 실행 버전으로 등록한다. 재전송 request ID는 receipt에 고정되어 있다. 생성 도중 종료되어 유효한 결과/receipt가 없으면 자동 복구할 수 없다. 원래 결과와 ownerToken을 다른 실행에 임의로 복사하지 않는다.

## 검증과 백업

실행 중 DB를 사용하는 통합 테스트는 의존 서비스를 재생성하지 않도록 한다.

```powershell
npm run check
docker compose --profile verification run --no-deps --rm tests
node scripts/verify-recovery.mjs
```

마지막 명령은 `compose.recovery.yaml`의 별도 임의 프로젝트와 합성 데이터만 사용한다. 백업/복원 해시, 잠금 소유 프로세스 강제 종료, DB 재시작, 대기 작업/lease/sync 복구를 검사하고 자신이 만든 프로젝트·볼륨만 제거한다. 운영 DB나 실제 Codex 분석을 중단하는 테스트가 아니다.

운영 백업은 DB 컨테이너에서 `pg_dump -U triage -Fc triage -f /tmp/triage.dump` 실행 후 `docker compose cp db:/tmp/triage.dump .runtime/triage.dump`로 보존한다. 복원은 별도 검증 DB에서 먼저 수행한다. 원본 메일 저장소와 work/codex 볼륨은 별도 보존 대상이며 DB dump만으로 모두 복구되지 않는다. 비밀을 포함하는 백업을 Git에 추가하지 않는다.

실제 동기화 검증 `scripts/verify-live-sync.mjs`는 `VERIFY_LIVE_SYNC=1`일 때만 POP3 수집 버튼을 누른다. 일반 UI/합성 검증과 달리 실제 수집이므로 목적 없이 반복하지 않는다. `scripts/verify-ui.mjs`는 읽기만 수행한다.

실제 Worker 검증은 사용자가 지정한 메일에 한해서 `node scripts/verify-live-worker.mjs begin --mail-id ID --subject '정확한 제목'`으로 웹 분석 버튼을 누른다. 동일 제목이 여러 건이거나 receipt가 이미 있으면 새 실행을 거부한다. receipt가 `submitting`에서 멈춘 경우 공용 이력과 request ID부터 확인하며 파일을 지워 무조건 재실행하지 않는다. 완료 후 `verify --mail-id ID --direct-cli C:/Users/david/IdeaProjects/erp-manager/tools/triage-history.mjs`로 웹/직접 결과를 대조한다. 이 명령은 실제 모델 분석과 DB 읽기를 수행하므로 합성 테스트처럼 자동 반복하지 않는다.
