# 구글·카카오 계정 연결 배포

기준: 2026-10-28. 앱은 HTTPS 백엔드에 직접 요청하고, 인증 복귀만 Vercel 주소로 받는다.

## 주소

- 앱 API: `https://3-37-233-96.sslip.io`
- 공개 인증 기본 주소: `https://pang-3.vercel.app`
- Google redirect URI: `https://pang-3.vercel.app/api/auth/social/google/callback`
- Kakao redirect URI: `https://pang-3.vercel.app/api/auth/social/kakao/callback`
- Vercel은 `/api/auth/social/:path*`를 같은 백엔드 경로로 전달한다. 이 규칙은 SPA 화면 규칙보다 앞에 둔다.

## 배포 반영

1. `web/vercel.json`이 Vercel 프로젝트의 Root Directory 설정에 맞게 적용되는지 확인하고 웹을 재배포한다.
2. 서버 담당자는 기존 비밀 저장소/환경변수에 아래 이름을 등록하고 실행 컨테이너에 반영한다. 예시 파일 자체는 자동으로 읽히지 않는다.

```text
SOCIAL_PUBLIC_BASE_URL=https://pang-3.vercel.app
SOCIAL_GOOGLE_CLIENT_ID=<server secret store>
SOCIAL_GOOGLE_CLIENT_SECRET=<server secret store>
SOCIAL_KAKAO_CLIENT_ID=<Kakao REST API key>
SOCIAL_KAKAO_CLIENT_SECRET=<Kakao Login client secret>
```

3. Google 및 Kakao 콘솔의 redirect URI를 위 주소와 일치시킨다. Google은 개발 중 사용할 본인 계정을 테스트 사용자에 등록한다.
4. 모바일 앱을 새로 빌드해 설치한다. `frontend/eas.json`의 세 빌드 프로필은 HTTPS API를 사용한다. 로컬 환경변수나 EAS 설정에서 이전 HTTP 주소를 덮어쓰지 않도록 한다.

## 본인 계정으로 확인

- 먼저 기존 앱 계정으로 로그인하고 계정 관리에서 Google/Kakao 연결을 진행한다. 연결 전 로그인 화면에서 소셜 로그인을 시작하면 별도 계정이 생성될 수 있다.
- 인증 후 브라우저에서 앱으로 돌아오고 연결됨이 표시되는지 확인한다.
- 로그아웃 후 소셜 로그인해서 기존 그룹·방문지·보고서가 유지되는지 확인한다.
- `https://pang-3.vercel.app/api/auth/social/providers`는 웹 로그인 화면 대신 JSON을 반환해야 한다. `true`는 설정값 존재 여부만 뜻하며 공급자 인증 성공을 보증하지 않는다.

## 확인 범위

- 2026-10-28 브라우저로 HTTPS 백엔드 `/api/auth/social/providers`의 `{"google":true,"kakao":true}` 응답을 확인했다.
- 이 문서 작성 시 변경한 Vercel 규칙은 로컬 소스이며 원격 배포 완료를 뜻하지 않는다. 실제 계정 로그인·연결은 소유자가 확인한다.
- 소셜 로그인 진행 상태와 재인증 증명은 서버 메모리에 있으므로, 인증 중 재시작하거나 여러 인스턴스로 분산하면 진행이 실패할 수 있다. 현재 단일 백엔드 기준이다.
- 키·시크릿은 Git, 앱 번들, 문서, 출력 로그에 저장하지 않는다.
