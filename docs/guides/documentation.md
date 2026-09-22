# 기술 문서 사이트

기존 `docs/` Markdown을 Docusaurus 3로 읽어 정적 사이트를 생성한다. 별도 문서 사본을 편집하지 않는다. 현재 제품·개발·운영·API·검증·보존 문서를 사이드바에서 구분하며 Mermaid 도표와 브라우저 내 로컬 검색을 제공한다.

## 설치와 실행

저장소 루트에서 Node.js 24로 실행한다.

```powershell
npm.cmd run docs:install  # 문서 도구의 별도 lockfile로 설치
npm.cmd run docs:dev      # http://127.0.0.1:3000, 변경 감시
```

배포 형태의 결과를 확인할 때는 다음을 실행한다. 로컬 검색 인덱스는 정적 빌드에서 생성되므로 검색 검증에는 `docs:serve`를 사용한다.

```powershell
npm.cmd run docs:build    # website/build 생성, 내부 문서/링크 오류 검사
npm.cmd run docs:serve    # http://127.0.0.1:3000
npm.cmd run docs:test     # 별도 4175 포트에서 Playwright 문서 검증
```

문서 도구는 `website/package.json`과 별도 lockfile에 고정한다. 제품의 npm workspace·Docker 이미지·Windows 설치본에 Docusaurus를 넣지 않으며 제품 빌드와 문서 빌드를 각각 실행한다. 생성된 `website/build`와 `.docusaurus`는 Git에서 제외한다.

## 문서 작성

- 본문은 기존 `docs/**/*.md`에서 수정한다. `.md`는 CommonMark로 읽으므로 코드 예시의 `<...>`와 중괄호가 JSX로 해석되지 않는다.
- 탐색 순서는 `website/sidebars.js`, 사이트 구성과 검색 설정은 `website/docusaurus.config.js`에서 관리한다. guides·operations·reference·validation·archive 하위 문서는 자동으로 목록에 추가된다.
- Markdown 상대 링크를 사용하고 `docs:build`로 검사한다. `docs/README.md`는 사이트 첫 화면이다. 프로젝트 루트 README와 문서에서 직접 연결한 코드·설정 예제는 읽기용 파일로 제공한다.
- 도표는 기존 fenced `mermaid` 블록을 사용한다. 사이트에서 도표가 실제 표시되는지는 `docs:test`로 확인한다.
- 보존 문서의 당시 결정과 현재 정책을 구분한다. 자료·비밀번호·토큰·메일 원문은 문서나 검색 인덱스에 포함하지 않는다.

## 제공 범위

정적 결과와 검색 인덱스에는 문서 내용이 포함된다. 기본 서버는 loopback에만 바인딩하며 이 작업으로 외부 호스팅이나 접근 인증을 제공하지 않는다. `noIndex`는 검색 엔진용 설정이며 접근 통제가 아니다. 팀 배포 시 사내 인증/네트워크 범위와 실제 사이트 URL을 별도로 정한다. 검색은 외부 검색 서비스나 AI API를 호출하지 않는다.
