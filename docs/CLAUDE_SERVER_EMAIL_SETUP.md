# 친구의 Claude에 전달할 서버 이메일 설정 프롬프트

아래 프롬프트 전체를 서버 작업이 가능한 Claude에 전달한다.

---

PANG3 앱 출시를 준비하고 있다. 기존 AWS 서버에서 이메일 인증과 비밀번호 재설정 메일 발송이 실제로 작동하도록 설정·구현·검증해줘.

발신 계정은 `pang3.apps@gmail.com`이다. 고객센터 수신 주소로도 사용할 이메일이지만, 이번 작업의 핵심은 서버에서 인증·복구 메일을 자동으로 발송하는 것이다.

## 1. 현재 서버와 코드 확인

- 현재 프로젝트와 운영 체크아웃, Git 상태, 배포 커밋을 확인해줘. 서버의 미커밋 변경을 덮어쓰지 말고 최신 main을 안전하게 반영해줘.
- 현재 컨테이너, Docker Compose, Spring 활성 프로필, AWS SSM 연동, 공개 주소와 HTTPS 프록시 구성을 확인해줘. 기존 서버를 사용하고 별도 테스트 서버를 새로 만들지는 말아줘.
- 설정을 바꾸기 전에 배포 이미지 태그/다이제스트, Compose·프록시 설정, 관련 비밀 설정의 복원 가능한 버전을 보관하고 복구 절차를 준비해줘. 비밀 값은 작업 출력에 노출하지 말아줘.
- 도메인이나 HTTPS 공개 주소가 없으면 임의로 만들어 넣지 말고, 사용할 주소와 필요한 DNS 작업을 먼저 알려줘. 나머지 코드·설정 준비는 진행해줘.

## 2. 기존 구현을 재사용

확인할 파일:

- `backend/src/main/java/com/fieldwork/service/AccountEmailService.java`
- `backend/src/main/java/com/fieldwork/controller/AccountEmailController.java`
- `backend/src/main/resources/application-release.properties`
- `backend/src/main/java/com/fieldwork/config/SecurityConfig.java`
- `docker-compose.yml` 및 실제 운영 Compose 구성

현재 API:

- `POST /api/auth/email/request`: 로그인한 사용자의 현재 비밀번호와 인증할 이메일로 인증 메일 요청
- `POST /api/auth/email/verify`: 토큰으로 이메일 인증
- `POST /api/auth/password/forgot`: 아이디와 이메일로 비밀번호 재설정 메일 요청
- `POST /api/auth/password/reset`: 토큰과 새 비밀번호로 재설정

현재 이메일 링크 형식:

- `${FIELDWORK_AUTH_PUBLIC_URL}/verify-email#token=...`
- `${FIELDWORK_AUTH_PUBLIC_URL}/reset-password#token=...`

토큰은 현재 30분 유효·1회 사용이며 DB에는 해시로 저장된다. 이 동작과 사용자 정보 노출 방지 동작을 유지해줘.

## 3. 메일 발송 설정

Gmail SMTP를 사용한다면 다음 설정을 실제 서버 설정에 연결해줘.

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=pang3.apps@gmail.com
SMTP_PASSWORD=<계정 소유자가 안전하게 입력하는 Google 앱 비밀번호>
FIELDWORK_AUTH_MAIL_FROM=pang3.apps@gmail.com
FIELDWORK_AUTH_PUBLIC_URL=https://<실제로 운영하는 공개 주소>
```

- 587 포트는 STARTTLS와 인증을 사용해줘. SMTP_PASSWORD에 일반 Google 로그인 비밀번호를 사용하지 말아줘.
- 앱 비밀번호 발급에는 Google 계정의 2단계 인증이 필요하다. 계정에서 발급할 수 없는 경우 우회하지 말고 소유자가 해결할 항목을 알려줘.
- 앱 비밀번호가 필요하면 값을 대화에 붙여넣게 하지 말고, 소유자가 서버의 숨김 입력이나 비밀 저장소에 직접 등록할 수 있도록 안내해줘.
- 실제 서버는 `SPRING_CONFIG_IMPORT=aws-parameterstore:/sahagu/`를 사용할 수 있다. 현재 배포 방식을 확인해서 SSM SecureString 또는 기존 비밀 관리 경로를 재사용해줘.
- **SMTP_* 환경변수를 선언하는 것만으로 끝내지 말아줘.** 실제 활성 Spring 프로필에서 `spring.mail.*`, `fieldwork.auth.mail-from`, `fieldwork.auth.public-url`로 값이 연결되고 컨테이너 안에 적용되는지 확인해줘.
- `application-release.properties`를 활성화하려고 프로필을 무작정 바꾸면 기존 인증·CORS 설정도 달라질 수 있으니 기존 앱 로그인 동작을 유지하는 방식으로 반영해줘.
- 저장소, Docker 이미지, 프론트 EXPO_PUBLIC 변수에 SMTP 비밀번호를 넣지 말아줘. 전체 환경변수나 비밀이 보이는 `docker compose config` 출력을 대화·로그에 남기지 말아줘.
- 메일 발송을 위해 EC2의 수신 SMTP 포트를 열 필요는 없다. 필요한 외부 SMTP 연결과 TLS 통신만 확인해줘.

## 4. 인증·재설정 웹페이지와 HTTPS

- 저장소의 실제 최신 상태에서 `/verify-email`, `/reset-password` 페이지가 존재하는지 확인해줘. API만 있고 페이지가 없으면 두 페이지를 구현해줘.
- `/verify-email`은 URL fragment의 토큰을 읽고 사용자 확인 동작 후 인증 API를 호출해서 성공·실패를 안내해줘. 단순 GET 접속만으로 인증 상태를 바꾸지 말아줘.
- `/reset-password`는 새 비밀번호·비밀번호 확인 입력을 받아 비밀번호 재설정 API로 보내고 결과를 안내해줘. 비밀번호 조건은 기존 서버와 동일하게 맞춰줘.
- 토큰은 fragment에서 읽고 주소 표시에서 제거해줘. query string, 접근 로그, 분석 도구나 외부 스크립트로 유출하지 말고 localStorage에도 남기지 말아줘.
- 두 페이지와 필요한 정적 자원은 로그인하지 않아도 열려야 한다. 기존 인증 API의 접근 제어는 유지해줘.
- 공개 HTTPS 주소로 두 페이지와 API가 실제 연결되도록 프록시를 구성해줘. 가능하면 같은 origin으로 제공해서 불필요하게 CORS 범위를 늘리지 말아줘.
- 인증서 검증을 끄거나 코드의 HTTPS 확인 조건을 제거하는 식으로 해결하지 말아줘.
- 이 두 페이지를 개인정보처리방침·운영정책 페이지와 혼동하지 말아줘. 정책 문서 작성은 별도 작업이다.

## 5. 검증과 반영

- 자동 테스트는 격리된 테스트 DB에서 실행하고, 운영 사용자 비밀번호를 테스트 목적으로 변경하지 말아줘.
- 프로젝트 소유자가 지정한 테스트 수신 주소·테스트 계정을 사용해서 실제 인증 메일 1건과 재설정 메일 1건의 수신까지 확인해줘. 수신 주소를 모르면 이 단계에서만 물어봐줘.
- 발송 함수가 성공했다는 로그만으로 완료 처리하지 말고, 수신된 메일의 링크를 휴대폰 브라우저에서 열어 인증·비밀번호 변경·앱 재로그인까지 확인해줘.
- 만료·이미 사용한 토큰, 잘못된 토큰, 비밀번호 불일치도 확인해줘. 계정이 없는 경우에도 비밀번호 찾기 응답으로 가입 여부를 노출하지 않도록 유지해줘.
- 기존 로그인·지도·보고서 등 서비스가 정상인지 배포 후 기본 상태를 확인해줘. 문제가 생기면 준비한 설정·이미지로 복구해줘. DB 볼륨을 지우는 명령은 사용하지 말아줘.
- 필요한 코드 수정은 테스트 후 프로젝트의 기존 main 배포 절차에 맞춰 커밋·푸시·반영해줘. 비밀 값은 커밋하지 말아줘.

## 6. 완료 보고

다음 내용을 비밀 값 없이 정리해줘.

1. 변경한 코드·서버 설정과 반영한 커밋
2. 실제 발신 주소와 공개 HTTPS 주소
3. 인증·재설정 페이지 주소
4. 실제 메일 수신, 링크 처리, 앱 재로그인 검증 결과
5. 복구 방법과 아직 소유자가 해야 할 작업

공개 주소, 앱 비밀번호 또는 테스트 계정이 없어 실제 검증을 못 했다면 그 부분을 분명히 구분하고 완료했다고 말하지 말아줘.

---

## 계정 소유자가 준비할 것

- `pang3.apps@gmail.com`에 로그인할 수 있는 권한
- Google 2단계 인증 및 앱 비밀번호 발급
- 사용할 도메인·DNS 접근 권한 또는 이미 운영 중인 공개 HTTPS 주소
- 실제 메일을 수신해서 확인할 테스트 이메일·테스트 계정

앱 비밀번호는 이 문서에 적지 않는다.

참고: [Google 앱 비밀번호 안내](https://support.google.com/accounts/answer/185833?hl=ko), [Google SMTP 설정 안내](https://support.google.com/a/answer/176600?hl=ko)
