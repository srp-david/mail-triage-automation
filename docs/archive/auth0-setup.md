# 회사 이메일 가입·로그인 연결

> **2026-09-21 방향 변경으로 폐기된 연결안이다.** 사용자는 Auth0·이메일 인증·SES 발송 없이 공용 서버의 사용자명 로그인과 관리자 계정 생성을 선택했다. 아래 내용은 기존 코드 검토/이력 용도로만 보존한다. 새 작업은 [통합 구현 계획](../implementation-plan.md) 5절·17절을 따르며 Auth0 테넌트·발송 설정을 준비할 필요가 없다.

실제 연결 전 준비 절차다. 완료 상태와 미확정 결정은 [구현 계획](../implementation-plan.md) 12~13절에서 관리한다. 기존 v0는 유지하고 최초 실인증은 별도 v1 앱·격리 DB로 확인한다. 예시 설정만으로 실제 이메일 인증이 연결되지는 않는다.

## 사용자에게 필요한 정보

| 항목 | 예시·확인 위치 |
|---|---|
| 가입 허용 회사 도메인 | `example.co.kr`. 이메일의 @ 뒤 부분. 여러 개면 각각 지정 |
| 최초 관리자 이메일 | 해당 회사 주소. 실제 메일 수신이 가능해야 함 |
| 팀 표시 이름 | `개발팀`. 내부 UUID는 설정 시 생성 |
| Auth0 테넌트 | 기존 유무. 있으면 Application Settings의 Domain (`dev-xxx.jp.auth0.com`) |
| Native Application Client ID | 기존 앱이 있으면 Settings에서 확인. 없으면 생성 후 기록 |
| API Identifier(Audience) | 기존 API가 있으면 Applications → APIs에서 확인. 없으면 설정 시 확정 |
| 인증메일 발송 | 기존 서비스 유무, 서비스명, 사용할 From 주소와 DNS 설정 담당 |

없는 항목은 `없음`, 모르는 항목은 `모름`으로 전달한다. 비밀번호, Client Secret, SMTP 비밀키, Management API 토큰은 채팅·Git에 넣지 않는다. Native 앱은 Client Secret을 사용하지 않는다. 실제 설정 파일은 Git 제외 로컬 경로에 둔다.

## Auth0 설정 대응

1. 회사 이메일·앱 전용 비밀번호를 저장할 Database Connection을 준비하고 Native Application에 연결한다. Universal Login의 가입과 비밀번호 재설정 경로를 사용한다. 회사 메일 계정의 비밀번호를 앱에 입력하지 않는다. 이 전용 앱에는 요구하지 않은 소셜 로그인을 활성화하지 않는다.
2. Native Application의 Token Endpoint Authentication Method는 `None`, grant는 Authorization Code와 Refresh Token을 사용한다. Refresh Token Rotation을 켜고 앱의 `refreshMode: rotating`과 맞춘다.
3. 기존 v0의 3080과 분리한 첫 실인증 앱은 43180을 제안한다. 포트 사용 여부 확인 후 `http://127.0.0.1:43180/auth/callback`을 Allowed Callback URLs에 정확히 등록한다. `localhost`, 포트 wildcard, 이메일 인증 URL을 callback 대신 등록하지 않는다. 이후 3080으로 전환할 때는 Auth0 callback과 로컬 `localPort`를 함께 맞춘다.
4. 공용 이력용 API의 signing algorithm은 RS256, Allow Offline Access는 활성화한다. Identifier를 서버 `AUTH_AUDIENCE`와 로컬 `auth.audience`에 똑같이 사용한다. Identifier는 API 식별자이며 로컬 서버의 실제 `historyUrl`과 달라도 된다.
5. [pre-registration.cjs](../../deploy/auth0/pre-registration.cjs)를 Pre User Registration Action에, [post-login.cjs](../../deploy/auth0/post-login.cjs)를 Post Login Action에 배포하고 각각 해당 flow에 연결·적용한다. 파일 업로드만으로 flow가 활성화된 것으로 간주하지 않는다.
6. 두 Action의 `COMPANY_DOMAINS`와 서버 값을 일치시킨다. Post Login의 `CLAIM_NAMESPACE`는 서버 `AUTH_NAMESPACE`와 정확히 맞춘다. 미인증 회사 이메일과 외부 도메인은 Post Login에서 거절하고, 검증된 access token의 namespaced email/email_verified만 API가 신뢰한다.
7. Auth0 Domain은 `https://<Domain>/`으로 조합해 서버 `AUTH_ISSUER`와 로컬 `auth.issuer`에 사용한다. 마지막 `/`까지 동일하게 맞춘다.

가입·재설정 화면은 [Universal Login 공식 문서](https://auth0.com/docs/authenticate/login/auth0-universal-login/universal-login-vs-classic-login/universal-experience)를 따른다. 갱신 설정은 [Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation)과 [PKCE 토큰 발급](https://auth0.com/docs/api/authentication/authorization-code-flow-with-pkce/get-token-pkce)을 참고한다.

## 메일과 최초 관리자

- Auth0의 Verification Email과 Change Password 이메일을 설정한다. 운영 발송은 외부 provider를 연결하고 From 주소 및 provider가 요구하는 DNS 인증을 확인한다. 기본 provider를 이용한 개발 수신 확인은 운영 발송 완료로 기록하지 않는다. [Auth0 이메일 설정](https://auth0.com/docs/customize/email).
- 현재 앱에는 인증메일 재발송 버튼이 없다. 첫 연결 검증은 Auth0 Dashboard의 Users → 대상 사용자 → Send Verification Email로 재발송한다. 이는 관리자 재발송 검증이며 사용자 셀프서비스 구현 완료와 구분한다. [공식 재발송 안내](https://support.auth0.com/center/s/article/How-to-Resend-a-User-Verification-Email).
- 이메일 인증을 완료하면 앱으로 돌아와 로그인을 다시 시작한다. 인증·재설정 메일은 진행 중 PKCE 요청의 callback이 아니므로 `/auth/callback`을 직접 열지 않는다. 메일 완료 화면에서 로컬 앱으로 자동 복귀하는 설정은 별도 확인한다.
- 최초 관리자 이메일에 해당하는 Auth0 `user_id` (`auth0|…`)를 확인해 **앱 API에 처음 로그인하기 전에** `ADMIN_SUBJECT`에 넣는다. 관리자 이메일 자체나 Client ID를 넣지 않는다. 현재 코드는 새 membership 생성 시에만 admin을 지정하며, 기존 analyst가 된 사용자는 환경변수 변경만으로 자동 승격되지 않는다.
- 격리된 v1 DB에 확정한 `TEAM_ID`의 team을 먼저 준비한다. DB 초기화와 runtime 권한 설정은 [서버 runbook](server-runbook-2026-09-22.md)을 따른다. 기존 DB에 실험용 migration·team을 추가하지 않는다.

## 로컬 설정과 첫 로그인

[local-settings.example.json](../../deploy/auth0/local-settings.example.json)을 별도 `TRIAGE_LOCAL_HOME/config/settings.json`에 복사하고 실제 issuer/Client ID/audience를 채운다. 예시는 개인 MCP·AI 계정을 등록하지 않아 로그인과 공용 이력 연결까지만 검증한다. 기존 개인 설정을 덮어쓰지 않는다.

서버에는 `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_NAMESPACE`, `COMPANY_DOMAINS`, `TEAM_ID`, `ADMIN_SUBJECT` 및 격리 DB 접속 설정이 필요하다. 실제 값은 [server.env.example](../../deploy/server.env.example)와 대응시킨다. 상시 공용 서버 구축 전에는 별도 로컬 history-api로 인증을 검증할 수 있다.

1. 격리 history-api를 127.0.0.1:3081에서 기동하고 readiness를 확인한다.
2. 별도 `TRIAGE_LOCAL_HOME`을 지정해 빌드된 v1 local-app을 기동한다. 실행 명령은 [v1 개발 경계](v1-development-2026-09-22.md)를 따른다.
3. 같은 `TRIAGE_LOCAL_HOME` 환경에서 `node scripts/history-v1.mjs open`으로 브라우저를 연다. 단순 URL 직접 접속은 최초 로컬 세션을 만들지 못한다.
4. 회사 계정으로 로그인 → Auth0 가입 → 이메일 인증 → 앱에서 다시 로그인 순서로 확인한다. 재설정은 Auth0 로그인 화면에서 시작한다.

## 실제 완료 확인

| 시나리오 | 확인할 결과 |
|---|---|
| 회사 이메일 신규 가입 | 인증메일 실제 수신, 인증 전 API 접근 불가 |
| 이메일 인증 후 로그인 | API `/me` 성공, 지정 관리자만 admin, 일반 사용자는 analyst |
| 외부 도메인 | 가입 또는 로그인 거절, 앱 자료 조회 불가 |
| 인증메일 재발송·만료 | 실제 재발송 수신, 만료 링크 거절, 새 링크 인증 후 새 로그인 성공 |
| 비밀번호 재설정 | 실제 재설정 메일 수신, 새 비밀번호로 재인증 성공. 기존 SSO 세션으로 생략되지 않도록 별도 브라우저 세션에서 확인 |
| 갱신·앱 재시작 | DPAPI 보존 세션으로 정상 복구, refresh rotation 후 재접속 가능 |
| 로그아웃 | 앱 세션과 초안 제거, API 접근 차단. Auth0 브라우저 SSO 세션의 전역 로그아웃과 구분 |

실검증 결과에는 시각·시나리오·성공 여부·안전한 오류 코드만 기록한다. 비밀번호·토큰·메일 링크·원문은 증거 문서나 Git에 넣지 않는다. Auth0 테넌트, 메일 수신, 격리 API까지 연결해 위 항목을 확인하기 전에는 실제 가입/로그인 완료로 표시하지 않는다.
