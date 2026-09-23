# 보안과 데이터 경계

현재 코드의 보호 장치와 한계를 기록한다. 보안 인증서나 독립 침투 테스트 결과가 아니며, [실제 검증 범위](current-status.md)를 함께 읽는다.

## 1. 데이터가 이동하는 위치

| 데이터 | 위치·이동 |
|---|---|
| 원본 메일·첨부 | Mail MCP 저장소에서 로컬 앱으로 조회. 분석에 사용한 내용은 AI 제공자에게 전달될 수 있음 |
| ERP 코드·읽기 근거 | 허용한 경로/provider에서 제공. 모델 입력에 포함될 수 있음 |
| 메일 식별자·제목 | 공용 DB에 작업 식별 및 이력 연결 목적으로 저장 |
| 보고서·추가 답변·질문·리뷰 | 공용 DB에 저장. 원문 인용·업무 정보가 포함될 수 있음 |
| 가져온 기존 문서 | 명시적 import 시 본문을 공용 DB에 저장 |
| 로그인 토큰·장치 자격·작업 결과 | PC의 DPAPI 저장소. 토큰/자격은 인증된 API 요청에 사용 |
| 비밀번호 | 로그인·변경 시 HTTPS 요청으로 서버에 전달. DB에는 Argon2id hash 저장 |
| DB 비밀번호·서명키 | 서버/운영자 보호 경로. 일반 팀원 패키지에 넣지 않음 |

로컬 실행을 외부 전송 없는 실행으로 설명하지 않는다. 모든 PC의 메일 원본을 자동 DB 복제하지는 않지만 보고서·기존 문서·모델 입력에도 민감 정보가 들어갈 수 있다. 사용 가능한 회사 자료와 AI 제공자 정책은 실제 업무 배포 전에 확인한다.

## 2. 접근 제어

- 계정 역할은 `viewer/analyst/admin`, 자료 권한은 source/collection 소유·공유로 구분한다.
- admin은 계정을 관리하지만 타인의 비공개 자료 열람을 자동 허용하지 않는다. DB·호스트 운영자는 별도 신뢰 주체다.
- JWT 서명·issuer/audience/만료와 DB의 현재 계정·membership·session 상태를 검사한다. JWT 서명만으로 접근을 허용하지 않는다.
- 권한 없는 자료는 일부 경로에서 404로 응답해 존재 여부 노출을 줄인다.
- Runner 작업에는 사용자 토큰뿐 아니라 소유 장치의 credential과 작업 lease/generation 검사가 필요하다.
- 로그아웃·비밀번호 변경·계정 변경은 서버 세션 폐기와 연결된다. 네트워크 오류에서 원격 폐기 완료를 추정하지 않는다.

## 3. DB와 API

비공개 `triage_private` schema와 별도 runtime 역할을 사용한다. anon/authenticated/PUBLIC의 schema 접근을 거절하고 Data API를 비활성화했다. 공개 키의 REST 접근 거절은 확인했으나 관리 비밀 키의 모든 경로 차단까지 검증한 것은 아니다.

공용 `history` 함수는 인터넷에서 요청을 받을 수 있으며 자체 인증·ACL이 자료 접근을 통제한다. Data API 비활성화가 앱 API 자체를 사설망으로 만드는 것은 아니다. 앱은 서비스 키를 클라이언트에 전달하지 않는다. 이 서버 중계 방식은 [Supabase의 데이터 보호 안내](https://supabase.com/docs/guides/database/secure-data)와 구분해 읽을 수 있다.

TLS CA·호스트 검증은 유지한다. migration 자격과 runtime 자격을 분리하고 runtime에 DDL을 주지 않는다. 이는 사용자별 DB 역할/RLS로 모든 행을 독립적으로 격리한 구조와는 다르며, 앱 API의 권한 검사 정확성이 중요하다. 자세한 실제 grants는 [private-grants.sql](../deploy/supabase/private-grants.sql)을 본다.

## 4. PC와 브라우저

loopback bind, 정확한 Host/Origin 검사, HttpOnly·SameSite cookie, CSRF 토큰, CSP, 일회용 ticket을 적용한다. 단순 localhost 주소만 인증으로 취급하지 않는다. 직접 CLI는 DPAPI의 제어 자격을 사용하며 브라우저 저장소에 서버 토큰을 노출하지 않는다.

MUI/Emotion 스타일은 HTML 응답마다 새로 생성한 192-bit nonce를 `style-src-elem`과 Emotion cache에 전달해 허용한다. 동적 크기·위치를 위한 `style-src-attr 'unsafe-inline'`만 별도로 허용하고 `script-src 'self'`는 유지한다. 메일·Markdown 정화에서 임의 style/script를 제거하며, Office iframe의 기존 WASM 정책은 별도로 유지한다. `/`와 `/react/index.html` 등 HTML 진입점은 `no-store`로 응답한다. 이 설정은 [MUI CSP 안내](https://mui.com/material-ui/guides/content-security-policy/)를 따른다.

DPAPI는 현재 Windows 사용자 범위로 세션·장치·outbox를 암호화하고 저장 폴더 ACL을 제한한다. 같은 사용자 권한의 악성 프로세스나 관리자/호스트 침해까지 막는 격리 장치는 아니다. 다른 PC로 `secrets/work`를 복사해 로그인 이전을 처리하지 않는다. [Microsoft DPAPI 문서](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)를 참고한다.

## 5. AI와 근거 도구

메일·문서 본문은 신뢰할 수 없는 자료로 취급한다. Agent에는 해당 메일·이전 맥락·허용 파일·사전 정의 조회를 제공하는 도구만 연결하고, 셸·쓰기·임의 웹 접근을 제한하는 실행 설정을 사용한다. 개인 사용자 설정 전체를 무조건 상속하지 않는다.

파일 근거는 허용 root, realpath/상대 경로, symlink, 확장자·민감 파일명·일반적인 비밀 구문을 검사한다. 이 필터가 모든 비밀을 탐지하거나 임의 프롬프트 공격을 완전히 방어한다는 의미는 아니다. 최소 자료 경로와 실제 CLI 버전의 제한 동작을 함께 검증한다.

현재 DB 조회 도구는 임의 SQL을 받지 않으며 등록된 provider만 실행한다. 실제 ERP DB 연결은 미구성이다. 운영 DB 쓰기와 메일 발송·삭제·읽음 변경 도구는 현재 분석 범위 밖이다.

## 6. 패키지·로그·운영의 남은 경계

- manifest/SHA-256은 파일 일치 검사다. 배포자 코드 서명·신뢰된 다운로드 경로를 대신하지 않는다. 현재 서명과 간편 배포 묶음은 미완료다.
- HTTP 오류에는 requestId·경로 템플릿·고정 오류 코드 등만 기록하며 본문·토큰·SQL·raw stack을 제외한다. 별도 프로세스/제공자/운영 로그 전체까지 같은 정책을 자동 적용하지는 않는다.
- 공용 API는 자체 로그인 제한을 갖지만 WAF·전체 API rate limit·MFA·독립 보안 점검 완료를 주장하지 않는다.
- hosted 백업 계정은 생성하지 않았고 백업 설정은 사용자 요청으로 보류했다. 데이터 유출 방지와 데이터 유실 복구는 다른 문제다.
- 팀 수용에서는 실제 두 사용자 간 격리·권한 회수·원본 부재·Agent 읽기 제한을 확인한다. 문서 작성이나 합성 테스트 통과만으로 전사 배포를 승인하지 않는다.

## 7. 계획된 Release 업데이트의 신뢰 경계

아래는 미구현 요구다. 상세 계약과 수용 기준은 [Release 업데이트 계획](operations/releases.md)을 따른다.

- public GitHub Release의 직접 다운로드는 공개 접근이다. 공용 API 인증은 사용자별 제공 버전·채널·서비스 정책을 관리하며 공개 asset 접근을 제한하지 않는다. private 전환으로 기존 공개 사본을 회수할 수 있다고 설명하지 않는다.
- 공개 전 소스·Git 이력/태그·ZIP·문서/변경 내역에서 비밀·메일 원문·업무 자료를 검사하고 공개 대상을 확정한다. 현재 저장소가 공개 적합성 검사를 통과했다고 주장하지 않는다.
- 다운로드 파일/hash와 배포자 인증을 구분한다. 신뢰 공개키 기반 signed metadata와 asset digest·호환 범위·유효기간을 검증하고 키 교체/폐기·구정책 재사용을 처리한다. Windows 코드 서명·배포 신뢰 경로도 별도 검토한다.
- private 다운로드용 GitHub 자격은 서버에만 보관한다. API 응답·로그·ZIP·클라이언트 환경에 넣지 않고 외부 다운로드 redirect에 앱 인증 헤더를 전달하지 않는다.
- updater는 동일 사용자 권한으로 검증된 payload만 설치한다. 경로 이탈·symlink·과도한 압축 해제·프로세스/설치 경합을 검사하고 정상 종료와 개인 설정/자격/outbox 보존을 보장해야 한다.
- 보고서 대화·편집 revision에도 source ACL과 현재 권한 검사를 적용한다. 편집 낙관적 락은 권한 검사를 대신하지 않고, 작업 시작 brief와 서버 정책을 사용자 자유 텍스트가 바꾸게 하지 않는다.
