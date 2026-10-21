# 서버 팀원 전달용: 앱 출시 환경 준비

2026-10-15 조사. 이 문서는 준비 요청이며 운영 변경을 실행한 기록이 아니다. 실제 키/비밀번호는 넣지 않았다.

우리 로컬 기능 검증과 별도로, 휴대폰이 USB 없이 접근하는 HTTPS 서버에서 가입·인증·사진·HWPX·권한·메일을 다시 검증해야 한다. 현재 앱은 자체 아이디/비밀번호 로그인이다.

## 1. 먼저 알려줄 운영 정보

- 실제 AWS 서비스/리전/VM 사양, DB가 VM PostGIS인지 RDS인지, 현재 배포 이미지와 commit.
- API와 웹의 도메인/HTTPS 인증서/자동 갱신, 외부 공개 포트와 DB 접근 제한.
- 실제 사진/HWPX 경로·볼륨·백업 위치·복구 가능 여부, DB 백업 일정.
- 발송 서비스/발신 주소/도메인 인증/샌드박스 상태, SGIS 상용 키 상태.
- SSM에서 전달하는 속성 이름·release 프로필 적용 여부. 값 자체를 채팅/문서로 보내지 않는다.

## 2. 저장소에서 확인한 배포 구조

`docker-compose.yml`: PostGIS 16-3.4 + Java API 이미지, 사진 `/app/ai/uploads`, HWPX `/app/ai/output`를 호스트 볼륨으로 연결. SSM `/sahagu/` import, 서울 리전 지정. DB5432/API8080 포트 공개 매핑과 `ddl-auto=update`가 있다. 실제 AWS 보안그룹은 미확인이다.

`.github/workflows/deploy.yml:3`: main push 배포, 이미지 빌드는 `backend/Dockerfile` 명시. 루트 Dockerfile은 별도 Nginx 파일이므로 API 이미지와 혼동하지 않는다. backend Dockerfile은 Java17+Python3.11/libheif/templates를 같은 컨테이너에 넣고 테스트 없이 패키징한다. 최신 변경이 포함된 운영 이미지 여부는 확인되지 않았다.

검증 환경을 별도 DB/볼륨/도메인/SSM 경로로 구성한다. H2 테스트 데이터 또는 실제 개인 사진을 운영으로 복사하지 않는다. release 브랜치를 검증하려고 main에 무조건 올리는 것이 선행 조건은 아니다. 수동/검증 전용 배포 경로를 검토하고 승인된 commit을 지정한다.

## 3. 환경 변수·속성 전달표

| 위치 | 이름 | 용도/주의 |
|---|---|---|
| API 런타임 | `SPRING_PROFILES_ACTIVE=release` | 운영 인증/메일 설정 로딩. 실제 profile 로그로 확인 |
| API 런타임/SSM | `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | 운영 또는 격리 검증 PostgreSQL. 외부 공용 DB 포트 차단 |
| API 런타임/SSM | `FIELDWORK_AUTH_ALLOWED_ORIGINS` | 웹의 정확한 HTTPS origin. 값 구분 형식은 CorsConfig와 대조 |
| API 런타임/SSM | `FIELDWORK_AUTH_PUBLIC_URL` | 메일 링크용 웹 origin. `/verify-email`, `/reset-password`가 공개 HTTPS로 실제 열려야 함 |
| API 런타임/SSM | `FIELDWORK_AUTH_MAIL_FROM` | 인증된 발신자 |
| API 런타임/SSM | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | 현 코드 JavaMailSender/STARTTLS 경로. 보통587이지만 선택 서비스 기준 |
| API 런타임/SSM | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | 서버만 보유. 서비스는 SGIS 인증 후 경계 조회 |
| API 설정 | `sgis.boundary-year`, `sgis.sahagu-code` | 기본2025/21100. 실제 제공 연도/그룹별 지역 처리 확인 |
| API 런타임 | `FIELDWORK_AI_PYTHON_PATH`, `FIELDWORK_AI_SCRIPT_PATH`, `FIELDWORK_AI_OUTPUT_DIR`, `FIELDWORK_UPLOAD_BASE_DIR` | Dockerfile 기본 Python·script·output·uploads와 볼륨 일치 |
| API 런타임 | `SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE`, `SPRING_SERVLET_MULTIPART_MAX_REQUEST_SIZE` | 로컬은15MB/60MB. 운영 값은 실제 사진 정책과 메모리/프록시 한도에 맞춰 결정 |
| API 런타임 | `SPRING_JPA_HIBERNATE_DDL_AUTO`, `SPRING_JPA_SHOW_SQL` | migration 검증 후 자동 DDL에 의존하지 않게 하고 SQL 로그 최소화 |
| API 런타임/SSM | 기존 카카오/경로/푸시 공급자 속성 | 실제 Properties/Service와 대조. 쓰지 않는 공급자 키는 불필요하게 발급하지 않음 |
| 선택 기능 | `GEMINI_API_KEY` | 현재 AI 분석 False. 키 설정만으로 사용 중이라고 표시 금지 |
| 앱 빌드(EAS) | `EXPO_PUBLIC_API_BASE_URL`, `KAKAO_NATIVE_APP_KEY`, 실제 사용하는 공개 지도 키 변수 | 사용자/Codex가 설정. 서버 비밀을 앱 번들에 넣지 않음 |

변수 이름 존재와 설정 완료는 다르다. 메일 프로필 파일에 host가 비어 있어도 기능이 동작하는 것은 아니다. 운영 proxy upload/body/timeout도 앱 서버 값과 맞춰야 한다. Spring Boot 3.5 기본 multipart는 별도 설정 없으면 파일1MB/요청10MB여서 휴대폰 사진 실패 가능성이 있다. [속성 공식 문서](https://docs.spring.io/spring-boot/3.5/appendix/application-properties/index.html)

## 4. DB 적용과 복구

1. DB/파일 백업 시점과 복원 위치를 기록하고 실제 복원을 검증한다.
2. `backend/sql/auth_release_migration.sql`의 users.email, auth_sessions, email_challenges를 운영 스키마와 비교한다. 이것만 모든 변경을 포함한다고 가정하지 않는다. 업무 담당자/예정일·개인 그룹·이미지/보고서 metadata 등의 entity 변경을 Codex와 대조한다.
3. 복제 PostgreSQL에서 SQL 적용·회원가입·기존 계정 로그인·권한·개인 그룹 동기화·업무 이관 잠금을 확인한다. 이메일 unique index 전에는 빈 문자열/중복/정규화도 조사한다.
4. 앱과 API 버전 호환을 확인한다. 기존 무인증 클라이언트가 새 API에 연결하면 로그인/요청 형식 변경이 영향을 줄 수 있다.
5. 배포 이미지에 commit/tag/digest를 남긴다. 실패 시 이전 이미지를 복구할지, 새 schema와 호환되는지 먼저 확인한다. DB를 되돌릴 경우 이후 저장된 업무 손실을 평가하고 무조건 덤프 덮어쓰지 않는다.

완료 증거: 변경 SQL/실행 결과(비밀 가림), migration 전후 row count/샘플 연관 검증, 인증 회귀 결과, 복원 소요 시간과 손실 가능 기간. RPO/RTO는 운영자가 정한다.

## 5. 사진·보고서·Python

- 재시작뿐 아니라 컨테이너 교체/VM 교체 후에도 DB와 사진/HWPX 연결이 유지되는지 검증한다. 호스트 볼륨은 컨테이너 재배포 보존 수단이지 VM 장애 백업은 아니다.
- private 저장소/인증 다운로드를 유지한다. S3를 쓰려면 코드 연동·서명 URL·접근 정책이 별도 필요하다. infra 안내만으로 구현 완료는 아니다.
- Linux 컨테이너에서 한글 이름·큰 사진·HEIC 변환 경로·파일 권한·템플릿과 Python 패키지 버전을 검증한다.
- 1개/여러 개 보고서 생성, 선택별 파일 내용·다운로드·ZIP/XML·실제 HWPX 뷰어를 확인한다.
- stdout/본문 로그, 생성 동시 수·CPU/RAM·120초 timeout·재시도·임시 JSON 삭제·출력 파일 누적을 확인한다. 프록시가 먼저 timeout이면 사용자가 실패로 보고 재요청할 수 있다.
- 백업은 DB와 파일이 같은 업무 버전을 가리키게 맞춘다. 계정 삭제와 백업 보존/삭제 복원 정책도 결정한다.

## 6. 메일·웹·SGIS·푸시

SES 사용 시 발신 도메인/메일 검증과 해당 리전 production access가 필요하다. 샌드박스의 인증된 수신자에게만 보내지는 테스트가 공개 가입 메일 성공 증거는 아니다. DKIM/SPF/DMARC와 bounce/complaint 대응도 준비한다. [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

웹의 인증/재설정 페이지는 UI 코드가 있어도 공개 호스팅이 필요하다. SPA 새로고침 fallback, 토큰 hash 링크, API CORS/cookie, 만료/재사용을 검증한다. 지원/정책/계정 삭제 URL도 앱 없는 브라우저에서 열려야 한다.

SGIS는 실제 상용 키/인증 응답·경계 년도·지역 코드·EPSG변환·캐시를 점검한다. 현 서비스 호스트는 `sgisapi.mods.go.kr`이다. 실패 원문에 키가 포함되지 않게 한다. [공식 준비 절차](https://sgis.mods.go.kr/developer/html/openApi/api/intro.html)

FCM/Expo 자격 증명은 단일 EAS 프로젝트와 일치시킨다. Android 실제 테스트 알림·알림 off·로그아웃/탈퇴 token 비활성화를 확인한다. 별도로 내비게이션 FGS 알림은 업무 알림 토글과 정책/시스템 제약을 구분한다.

## 7. 운영 완료 제출물

- [ ] 검증/운영 URL, profile, 이미지 식별자와 DB migration 결과
- [ ] HTTPS 인증서 갱신, 방화벽/DB 비공개, 비밀 저장/접근권한
- [ ] 실제 인증·재설정 메일과 브라우저 링크 확인
- [ ] 사진 포함 HWPX 생성·다운로드 및 재배포 후 보존
- [ ] DB+파일 복원 시험, 보관/삭제·용량 경보
- [ ] API5xx/프로세스/디스크/메일/백업 알림과 담당자
- [ ] 실제 운영형 E2E 결과 및 실패/복구 절차

이 결과를 확인한 뒤 공동 출시 검증으로 넘어간다. 키 원문·실사용자 보고서·개인정보를 결과 문서에 붙이지 않는다.
