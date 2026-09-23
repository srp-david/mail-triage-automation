# GitHub Release 배포·업데이트 계획

2026-09-23 · **candidate.9 로컬 검증·GitHub prerelease·hosted update route 배포 완료, 실사용 업데이트 미검증**. [통합 계획 v3.3](../implementation-plan.md)의 5.5절과 U1~U3를 구체화한다. candidate.9 fresh 한글 설치·8→9 업그레이드/설정 보존·lifecycle·브라우저 E2E를 로컬 검증했고 [GitHub prerelease](https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.0-candidate.9) asset digest 일치를 확인했다. 사용자 명시 승인 후 Supabase `history` function과 `UPDATE_CATALOG_JSON` 설정을 갱신했다. hosted health 200·비인증 update check 401까지 확인했으며 실계정 `offered`·다운로드·설치는 사용자 테스트 전이다. 증거 범위는 [현재 상태](../current-status.md)를 따른다.

## 1. 결정·기본안·미정 사항

| 구분 | 내용 |
|---|---|
| 사용자 방향 | GitHub 저장소는 public으로 시작하고 필요하면 private 전환. Release에 앱 파일과 변경 내역 보관 |
| 확정 저장소 | [srp-david/mail-triage-automation](https://github.com/srp-david/mail-triage-automation), Git URL `https://github.com/srp-david/mail-triage-automation.git`. 공개용 단일 첫 커밋 `3803669f801ec8b52bc3614d367b830e5e38b2a9`를 main·candidate.9 태그로 push하고 prerelease 게시 |
| 조회 경계 | public 단계에서도 앱은 공용 API에 인증해 업데이트 조회. API가 사용자별 버전·stable/test 채널·호환성·배포 중단을 결정 |
| 첫 구현 기본안 | public asset 직접 다운로드, 알림/변경 내역 표시 후 사용자가 버튼으로 설치. 완전 자동 설치는 후속 안정화 |
| 다운로드 추상화 | API 응답의 다운로드 방식을 사용. 클라이언트에 GitHub 토큰·소유자/저장소 URL 고정 금지 |
| 독립 배포 | PC 앱, 공용 API/DB, 업무 대상 ERP는 별도 배포 단위. Release 게시로 서버 migration/ERP 운영 배포를 실행하지 않음 |
| D13의 남은 결정 | 첫 공개는 기존 41개 이력을 제외한 단일 커밋·candidate.9 prerelease로 실행. 후속 버전의 공개 범위, 서명/키 보관·교체, 게시 담당/CI, 제공 채널·API 지원 기간, private 다운로드 호스팅은 추가 결정 |

기존 작업 저장소의 41개 이력을 공개하지 않고 별도 공개용 단일 첫 커밋을 push했다. 후보 게시 전 소스·이력/태그·ZIP·번들·문서/검색 인덱스·변경 내역의 비밀·메일 원문·업무 자료 포함 여부를 검토했다. 후속 버전에서도 이 검사를 반복한다. 저장소 주소는 운영 설정이며 클라이언트 다운로드 경로를 고정하는 값으로 사용하지 않는다.

public Release asset은 인증 없이 직접 다운로드할 수 있다. 앱의 API 인증은 제공 정책과 서비스 사용을 통제하며 공개 파일을 비공개로 만들지 않는다. [GitHub asset API](https://docs.github.com/en/rest/releases/assets). private 전환 시 기존 public fork는 공개 상태로 분리되며 이미 내려받은 사본도 회수되지 않는다. [저장소 공개 범위 변경](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## 2. 현재 기반과 변경 위치

| 현재 파일/영역 | 현재 동작 | 계획 변경 |
|---|---|---|
| [package-windows.mjs](../../scripts/package-windows.mjs) | candidate 버전만 허용, Node 포함 ZIP·파일 manifest·SHA-256, 승인 false. candidate.9 setup.exe·ZIP·서명 metadata 생성/검증·게시 완료 | 정식/시험 버전 생성·승인 근거 분리 |
| [release.mjs](../../installer/windows/release.mjs) | 로컬 payload 검증, staging/진단·활성 전환·rollback, app.lock 존재 시 거절. 다운로드/updater 연계 소스 추가 | 게시 asset·전원 손실·설치 경합·중단 복구 검증 |
| [lifecycle.mjs](../../installer/windows/lifecycle.mjs) / [manage.mjs](../../installer/windows/manage.mjs) | 정상 시작/종료·로컬 설치/rollback. 작업 중지와 setup.exe shortcut 소스 추가 | 별도 updater의 종료/재시작·기동 후 진단 실패 복구 실검증 |
| [CI 예시](../../deploy/windows-release.workflow.example.yml) | draft, 이전 테스트 명령/후보 번호, publish/upload 없음 | 현재 Vitest 명령/지원 런타임 대조, 고정 action·빌드/검증·서명·게시 단계 준비 |
| [history-api](../../apps/history-api/src/username-app.ts) | 인증된 업데이트 조회 route를 hosted `history` function에 배포, catalog secret 등록. health 200·비인증 조회 401 확인 | 실계정 `offered`·채널/중단 정책·설치 전 재확인 검증 |
| [local-app](../../apps/local-app/src/ui-routes.ts) | 로컬 인증·설정·실행 제어와 조회 façade·다운로드/updater 소스 추가 | 게시 asset 다운로드·진행 상태·drain/updater·CSRF/Host/Origin 실검증 |
| [UI](../../packages/ui/ui/src/app/App.tsx) | 앱 shell·설정/상태 화면과 업데이트 버튼 소스 추가. candidate.9에서 업데이트 안내 배너·상단 로그아웃 겹침 조정 | 실제 제안·진행·대기·실패/복구와 로그아웃 노출 브라우저 수용 |

2026-09-22 소스 확인 시 활성 `.github/workflows`는 없고 위 CI는 예시다. 예시를 복사한 것만으로 게시 파이프라인 완료로 표시하지 않는다. 앱 updater는 동일 Windows 사용자 권한의 별도 프로세스로 설계하고 GitHub 자격·관리자 DB 자격을 전달하지 않는다.

## 3. 업데이트 API·메타데이터 계약안

공용 `GET /api/v1/updates/check` route는 소스와 hosted `history` function에 반영했다. 비인증 요청은 401 `UNAUTHENTICATED`를 확인했으며 인증 실계정의 `offered` 응답은 아직 검증하지 않았다. UI는 로컬 API만 호출하고 HistoryClient가 서버 인증을 담당한다. GitHub `latest` 값을 그대로 설치 대상으로 쓰지 않고 서버 catalog에서 사용자/채널/호환 정책을 적용한다. GitHub는 Release/asset 저장소로 이용한다. [GitHub Release API](https://docs.github.com/en/rest/releases/releases).

| 계약 | 필요한 필드·규칙 |
|---|---|
| 요청 | 설치 버전, 플랫폼/아키텍처, 지원 metadata/API 계약 버전. 사용자·팀은 서버 인증에서 결정하며 요청 본문의 userId를 신뢰하지 않음 |
| 제공 정책 | `metadataVersion`, `policyRevision`, `channel`, `status`(최신/제공/중단/지원 불가), 사용자별 제공 버전. stable은 prerelease를 제외하고 test는 지정된 사용자만 허용 |
| Release 식별 | `releaseId`, version, 배포 시각, source commit, 안전한 변경 내역. 버전 비교는 SemVer 규칙으로 수행하며 일반 문자열 비교 금지 |
| 호환성 | 지원 API 계약 범위·최소 지원 앱 버전·updater/OS 요구 조건. 앱과 API 버전을 같은 번호로 가정하지 않음 |
| 다운로드 | `mode`(public direct / authenticated broker), HTTPS URL 또는 API 상대 경로, 만료 시각, asset 식별자·크기·SHA-256. GitHub 토큰과 앱의 refresh/access token을 응답 URL에 넣지 않음 |
| 진위 검증 | release/platform/version/호환 범위/asset hash·크기와 서명 key ID·서명·유효기간. 신뢰 root와 교체/폐기 절차는 D13에서 확정 |
| 설치 전 재확인 | 선택한 releaseId·digest·policyRevision을 다시 확인. 회수/중단·권한 변경·만료 시 설치를 멈추고 새 조회 안내 |

SHA-256과 파일 manifest는 내용 일치 검사다. 공격자가 ZIP과 hash를 함께 바꾸는 경우를 막는 배포자 인증으로 취급하지 않는다. 기본 설계는 앱에 신뢰 공개키를 포함해 서명된 메타데이터와 asset을 연결하는 방식이며 Windows 코드 서명과는 별개다. 서명키를 ZIP·Git·PC 설정에 넣지 않고 키 교체용 중첩 지원 버전·구키 폐기·만료/재전송 공격 방지 규칙을 마련한다. 알고리즘·정규화·키 수명·오프라인 유예는 구현 전 확정한다. 서명 실패 시 hash만 검사하는 fallback은 두지 않는다.

인증 실패·오프라인·조회 오류를 ‘최신 버전’으로 표시하지 않는다. 기존 앱 사용은 현재 API 정책에 따르고 새로운 설치는 유효한 정책/검증 없이 시작하지 않는다. first-password-change 제한은 유지하며 변경 후 업데이트를 조회한다. 구버전 앱도 업데이트 조회·필요한 재로그인/비밀번호 변경으로 탈출할 수 있도록 최소 인증/update 계약을 유지하거나 지원되는 수동 복구 경로를 제공한다. 호환되지 않는 앱은 새 업무 실행을 제한하되 결과 보존·지원 안내를 막지 않는다.

## 4. 사용자 흐름과 설치 상태

1. **확인/알림:** 앱 시작과 주기적 조회에서 새 버전·채널·변경 내역을 표시한다. 주기는 D13에서 정하고 backoff/jitter를 사용한다. 설치는 사용자 버튼으로 시작하며 단순 알림을 동의로 해석하지 않는다.
2. **작업 종료 대기:** 사용자 선택 후 신규 분석 claim/동기화 시작을 막고 진행 중 분석·batch가 끝나기를 기다린다. 이 drain은 서버/로컬 실행 제어에서도 보장해 버튼 비활성화만으로 대체하지 않는다. 사용자가 미루면 설치를 보류한다. 기존 작업 강제 종료나 완료되지 않은 분석의 자동 재실행은 하지 않는다.
3. **다운로드/검증:** 앱이 실행되는 동안 별도 임시 위치에 받는다. 중단 재개는 같은 asset/digest인지 확인하고 전체 크기·hash·서명·유효기간·호환성을 검사한다. HTTPS/허용 다운로드 목적지·redirect를 검사하고 외부 목적지에 앱/GitHub 인증 헤더를 전달하지 않는다. 압축 해제 전후 경로 이탈·symlink·파일 수/용량 제한을 적용한다.
4. **updater 인계:** 개인 설정/outbox를 보존하고 설치 요청 ID·대상 버전·검증된 payload·진행 단계를 로컬에 기록한다. 단일 updater 잠금을 획득하고 신규 기동과 설치가 경합하지 않게 한다. 설치 전 최신 제공 정책을 재확인한 뒤 신뢰된 관리 프로세스에 인계한다.
5. **정상 종료/설치:** lifecycle stop 성공과 실제 프로세스 종료를 확인한다. `app.lock`을 임의 삭제하거나 실행 중 파일을 덮어쓰지 않는다. 기존 staging 검증·진단과 활성 전환을 재사용하며 승인되지 않은 candidate를 stable로 바꾸지 않는다.
6. **재시작/진단:** 새 앱의 버전·로컬 제어 채널·파일/설정·호환성을 확인한 뒤 설치 완료를 표시한다. 분석 loop의 재개 여부는 기록된 상태와 사용자 의도로 판단하고 새 분석을 몰래 시작하지 않는다. 서버/API 일시 장애와 앱 기동 실패를 구분한다.
7. **실패 복구:** 설치 전 실패는 기존 버전을 유지한다. 활성 전환 후 기동 실패는 호환되는 직전 검증 버전으로 되돌리고 진단/조치 안내를 남긴다. PC 종료/전원 손실 후에는 진행 기록을 대조하며 설치를 무조건 처음부터 반복하지 않는다. rollback도 실패하면 보존된 파일과 지원 경로를 제공한다.

설치/복구 전후 `config/secrets/work`와 outbox 소유권·결과를 보존한다. 앞으로 로컬 설정 형식이 바뀌면 역호환 또는 별도 복구 사본이 필요하다. 앱 rollback이 공용 DB rollback을 뜻하지 않으며 서버 schema/API 변경은 구·신 앱 지원 기간과 outbox 제출 호환성을 고려해 별도 배포한다. 자동 rollback 대상도 회수/보안 중단 버전 또는 API 미지원 버전이면 임의 실행하지 않고 복구 안내로 전환한다.

## 5. Release 게시와 public→private 전환

배포 순서는 공개 대상 검토 → 버전/commit 고정 → 깨끗한 빌드/시험 → ZIP/manifest·서명 생성 → Release asset 검증 → API catalog 제공 활성화다. stable/test 구분, 게시 자격의 최소 권한과 보호, Release/asset 식별자·hash·검증 기록을 남긴다. 같은 버전 파일을 조용히 교체하지 않고 새 버전으로 제공한다. 제공 중단은 우선 API catalog에서 처리하되 이미 공개된 사본까지 회수했다고 표현하지 않는다.

public에서는 API가 직접 다운로드 URL을 반환하는 기본안을 사용한다. Supabase Edge에 큰 ZIP 전체를 중계하는 설계를 기본으로 두지 않는다. private에서는 서버 GitHub 인증을 사용하는 broker나 별도 비공개 저장소로 변경한다. 실제 중계 위치는 크기/시간/메모리/egress를 검증해 정하며 Edge가 무조건 불가능하다고 단정하지 않는다. [Supabase Edge 제한](https://supabase.com/docs/guides/functions/limits).

전환 전 다운로드 추상화와 broker를 이해하는 클라이언트 버전을 보급하고, 구버전부터 새 다운로드까지 모의/실전 경로를 검사한다. API 주소와 인증/update 계약은 유지하고 응답의 mode/URL만 바꾼다. 이전 직접 URL로 진행하던 다운로드는 재조회·재인증 후 같은 release/digest로 재개하거나 다시 받는다. 만료된 URL·401/403/404를 새 버전 없음으로 해석하지 않는다. bridge 버전을 설치하지 못한 사용자는 지원되는 수동 설치 경로를 제공한 뒤 저장소 공개 범위를 전환한다.

GitHub 읽기 토큰은 서버에만 두고 다운로드 권한을 현재 앱 사용자로 다시 검사한다. 중계의 redirect/단기 다운로드 URL이 필요하면 토큰/인증 헤더 노출 없이 유효기간·대상 범위를 제한한다. GitHub 자격을 API 응답·로그·클라이언트 환경에 넣지 않는다. public→private 전환 검증은 GitHub에서 다운로드하는 행위와 앱 서비스 로그인 권한을 각각 확인한다.

## 6. 수용 검증과 작업 순서

| 시나리오 | 기대 결과 |
|---|---|
| 최신/구버전·prerelease | 올바른 SemVer 비교, stable/test 분리, 사용자별 제공 및 중단 정책 |
| 인증/오프라인 | 만료/비활성·오프라인 구분, 기존 서비스 정책 유지, 검증 없는 설치 금지 |
| 호환 불일치 | 지원 범위 안내와 새 업무 제한, 구버전의 업데이트/수동 복구 경로 유지 |
| 변조/서명·키 교체 | ZIP·hash·서명·metadata/플랫폼 불일치·만료·구정책 재사용 거절, 신뢰 키 교체 수용 |
| 다운로드 중단 | 임시 파일에서 재개/재다운로드, 전체 digest 검증, 위험 경로/redirect 거절 |
| 분석/동기화 중 설치 | 신규 실행 차단과 현재 작업 종료 대기, 보류/재시도 가능, 강제 재실행 없음 |
| 다중 창/프로세스 | updater·기동·설치 경합에서 활성 전환 하나, lock 임의 삭제 없음 |
| 정상/실패 설치 | 종료·설치·재시작·버전 진단, 설치/기동 실패와 전원 손실 복구, 호환 rollback |
| 개인 상태 | config/secrets/work·outbox 보존, 다른 계정 제출 거절, 앱 rollback과 DB 분리 |
| private 전환 | 지원 구버전부터 broker 다운로드·만료/권한 오류·수동 복구 검증, GitHub 자격 미노출 |
| 실제 배포 | 게시 asset과 검증된 빌드 hash 일치, 실제 2PC 업데이트 기록, 서버/ERP 배포 없음 |

U1은 metadata/API·서명/호환 계약과 모의 검증, U2는 UI·drain·다운로드/updater, U3는 현재 테스트 체계에 맞춘 CI·게시·private 전환 준비다. **① U3의 파일 형식·재현 패키징·게시 절차와 U1 계약을 먼저 마련한다. ② 같은 배포물을 사용하는 SET1 설치 파일·실행/분석 중지/앱 종료와 U1 API·U2 앱 업데이트를 구현·검증한다. ③ 검토된 소스를 GitHub에 push하고 검증된 설치 파일을 Release로 게시한다. ④ 새 설치본에서 SET2 개인 연결·지정 사례 실분석/저장/재조회를 수행한다.** 완전 자동 게시까지 먼저 완성할 필요는 없지만 검증된 후보를 같은 절차로 반복 배포할 수 있어야 한다.

첫 공개용 단일 커밋의 main·태그 push, `draft=false`·`prerelease=true`인 candidate.9 Release 게시와 asset digest 일치를 기록했다. setup.exe SHA-256은 `8deb34f1edc271d1346278b94a46eadf1568eea8c2ce21b3ea000699b5d69314`, ZIP은 `75214a5cdaf614e154df228c0289504b07142065f2badeb175893c6d2df71beb`, 서명 metadata는 `c4ff754fe9a7ebae71040826e52a5647bf2cdeaa53074776486c3ade0f685e58`이며 metadata 만료는 `2026-10-07T02:22:53.376Z`다. 이 게시 기록과 hosted route의 health/비인증 거절은 실계정 `offered`·다운로드/설치·팀 PC 수용 증거가 아니다. private 다운로드 호환과 실제 저장소 전환은 필요할 때 별도로 검증한다. 후속 게시 전에도 공개 소스·이력·asset·문서/변경 내역의 비밀·메일 원문·업무 자료 검토를 반복한다.
