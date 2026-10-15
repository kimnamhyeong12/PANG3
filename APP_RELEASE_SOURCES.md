# 공식 출처와 코드 근거

모든 아래 웹 자료의 조사일은 **2026-10-15**다. 공식 페이지를 실제 열거나 검색해 확인했다. 정책/가격이 변경될 수 있어 최종 제출/결제 시 Console과 다시 대조한다. 링크는 검색 결과가 아닌 원문이다. 콘솔의 계정별 상태와 약관 승인·무료량 자격은 문서만으로 확인되지 않는다.

## 1. Google Play / Android

| ID | 공식 페이지 | 적용 조건·프로젝트 영향 |
|---|---|---|
| S01 | [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) | 계정 등록/유형/인증과 US$25 비용. 실제 계정 보유·완료는 사용자 확인 |
| S02 | [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465) | 2023-11-13 이후 생성 개인 계정의 12명/14일 연속 비공개 테스트와 접근 신청. 계정 생성일 미확인 |
| S03 | [Device verification requirements for new developer accounts](https://support.google.com/googleplay/android-developer/answer/14316361) | 새 개인 계정의 실제 Android 기기 확인. 실기기 보유와 Console 확인 완료는 별개 |
| S04 | [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878) | 2026-08-31 새 일반 모바일 앱/업데이트 API36. 프로젝트 로컬 target36, 최종 AAB 확인 필요 |
| S05 | [Support 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes) / [Play requirement announcement](https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html) | 네이티브 C/C++ 라이브러리 포함 앱의 정렬/포장/실행 검증. 로컬 부분 통과와 전체 배포 호환 분리 |
| S06 | [Sign your app](https://developer.android.com/studio/publish/app-signing) | 업로드/앱 서명 키 구분, Play 서명과 SDK 인증서 연결. debug 서명 교체/최종 확인 |
| S07 | [Transfer apps to a different developer account](https://support.google.com/googleplay/android-developer/answer/6230247) | 향후 회사 계정으로 앱 이전 가능 조건·연결 서비스 점검. 회사 설립을 지금 출시 선행으로 만들지 않음 |
| S08 | [Understanding app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) | 회원가입 앱의 내부/외부 삭제 요청, 연관 데이터·보관 사유. 현재 익명화만으로 충분하다고 판단하지 않음 |
| S09 | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) | 개인정보처리방침/개인·민감 데이터 처리 고지, 실제 수집·전송 보호 검토 |
| S10 | [Provide information for Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) | 서버·SDK·앱 제어 WebView 포함 선언. 내부 트랙 전용과 비공개/공개 배포 적용 구분 |
| S14 | [Understanding foreground service requirements](https://support.google.com/googleplay/android-developer/answer/13392821) / [Location FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types) / [Background location policy](https://support.google.com/googleplay/android-developer/answer/9799150) | API34+ location FGS 선언/영상·권한/실사용 정책. manifest에 background permission 없다는 이유만으로 실제 백그라운드 정책 적용을 배제하지 않음 |
| S15 | [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152) | 앱 정보/설명/카테고리/연락처와 제출 흐름. 신규 출시/업데이트 범위는 Console에서 최종 확인 |

## 2. Expo / 공급자 / 국내 정책

| ID | 공식 페이지 | 적용 조건·프로젝트 영향 |
|---|---|---|
| S11 | [Expo Account types](https://docs.expo.dev/accounts/account-types/) | 공동 역할/소유 프로젝트/조직 관리. 개인 로그인 공유 없이 한 프로젝트 관리 |
| S12 | [App credentials](https://docs.expo.dev/app-signing/app-credentials/) | 빌드 자격 증명·keystore 관리. 현재 EAS credentials 실제 상태 미확인 |
| S13 | [Environment variables in Expo](https://docs.expo.dev/guides/environment-variables/) / [Environment variables in EAS](https://docs.expo.dev/eas/environment-variables/) | 공개 번들 값과 서버 비밀 구분·환경별 주입. 로컬 .env가 클라우드에서 자동 존재하지 않음 |
| S16 | [Kakao Map Concepts](https://developers.kakao.com/docs/en/kakaomap/common) / [Quota](https://developers.kakao.com/docs/en/getting-started/quota) / [Paid API](https://developers.kakao.com/docs/en/app-setting/paid-api) | 지도 활성 앱의 무료 자격/쿼터/초과 과금. 계정 최초 활성 앱·Wallet 등 실제 앱 상태 확인 |
| S17 | [Kakao Mobility 가격 및 문의](https://developers.kakaomobility.com/price/) / [길찾기 SDK](https://developers.kakaomobility.com/product/navisdk) | REST API와 SDK 별도 제공량/요금/이용 조건. 현재 native SDK 사용을 앱투앱 호출로 혼동하지 않음 |
| S18 | [SGIS 개발지원센터 안내](https://sgis.mods.go.kr/developer/html/openApi/api/intro.html) / [OpenAPI 정의서](https://sgis.kostat.go.kr/developer/upload/doc/SGIS_OpenAPI_%EC%A0%95%EC%9D%98%EC%84%9C.pdf) | 회원/테스트키/상용키, 무료·호출 제한 및 인증·경계 API. 상세 상업 이용/출처 표시 약관은 계정 신청 시 추가 확인 |
| S19 | [Expo Push troubleshooting and FAQ](https://docs.expo.dev/push-notifications/faq/) | 푸시 플랫폼 credentials/기기 검증과 장애 대응. 실제 운영 발송 성공은 미확인 |
| S20 | [Spring Boot 3.5 Common Application Properties](https://docs.spring.io/spring-boot/3.5/appendix/application-properties/index.html) | multipart 기본1MB/10MB와 운영 속성 확인. 문서 minor가 현재3.5.16이어도 프로젝트는3.5.14로 대조 |
| S21 | [개인정보 처리방침 작성지침(2026.4. 개정)](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=&nttId=12018) | 개인정보위 공식 게시2026-04-23. 작성/공개 검토 기준. 게시물·첨부 존재 확인, PDF 전체 조문별 분석은 미수행. 구체적 국내 법 적용은 운영 주체/계약 확정 후 추가 검토 |

## 3. 비용·메일 공식 자료

| ID | 공식 페이지 | 적용 조건·조사 활용 |
|---|---|---|
| S22 | [Expo pricing](https://expo.dev/pricing) | Free/Starter 가격과 포함 빌드량. 프로젝트 계정별 사용량은 미확인 |
| S23 | [SES pricing](https://aws.amazon.com/ses/pricing/) / [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) | 기본 통당 비용 및 리전별 sandbox 해제/발신자 인증. 실제 발송 서비스 선정은 미확정 |
| S24 | [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/) / [RDS pricing](https://aws.amazon.com/rds/pricing/) / [S3 pricing](https://aws.amazon.com/s3/pricing/) | 리전/사양/저장·요청·전송 기준의 견적 출발점. 실제 사용 서비스가 확인되지 않아 합계 금액 확정하지 않음 |

요금 비교는 조사의 용량 가정과 실제 endpoint 요청량으로 해야 한다. 과거 답변이나 ‘사용자100명=월얼마’ 형태를 공식 견적처럼 쓰지 않는다.

## 4. 코드 근거

줄 번호는 현재 작업 파일 기준이며 후속 수정 시 달라질 수 있다. 키·비밀번호·실사용자 데이터 값은 인용하지 않는다.

| ID | 파일/줄 | 확인 사실 |
|---|---|---|
| C01 | [eas.json](C:/PANG3-app/frontend/eas.json:37), [app.json](C:/PANG3-app/frontend/app.json:20) | production AAB/autoIncrement, HTTP API, 패키지·owner/projectId 존재. 콘솔 credentials 미확인 |
| C02 | [app.config.js](C:/PANG3-app/frontend/app.config.js:8) | KAKAO_NATIVE_APP_KEY 또는 로컬 .env 읽음. EAS의 EXPO_PUBLIC 이름과 구분 |
| C03 | [Manifest](C:/PANG3-app/frontend/android/app/src/main/AndroidManifest.xml:24) | cleartext true / allowBackup true. release에서 로컬 데이터 백업 범위도 검토 |
| C04 | [build.gradle](C:/PANG3-app/frontend/android/app/build.gradle:92) | applicationId/versionCode, release debug signing:115 |
| C05 | [merged release manifest](C:/PANG3-app/frontend/android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml:8) | min26/target36, SDK 병합 권한/FGS. 생성물로 다음 빌드 때 바뀜 |
| C06 | [SecurityConfig](C:/PANG3-app/backend/src/main/java/com/fieldwork/config/SecurityConfig.java:22), [AuthSessionService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/AuthSessionService.java:27), [auth.js](C:/PANG3-app/frontend/utils/auth.js:8) | API 인증/토큰 해시·기간/갱신·SecureStore 구현 |
| C07 | [AuthService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/AuthService.java:100), [GroupService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/GroupService.java:222) | 계정 익명화와 그룹 나가기. 업무/공유 자료 보존·임의 재배정 없음 |
| C08 | [FileStorageService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/FileStorageService.java:27), [TaskProgressService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/TaskProgressService.java:116) | 확장자/경로 격리, 업로드/기존 경로 검증. 파일 내용·픽셀 한도 추가 필요 |
| C09 | [TaskService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/TaskService.java:85), [TaskTransferService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/TaskTransferService.java:111), [Transfer repository](C:/PANG3-app/backend/src/main/java/com/fieldwork/repository/TaskTransferRequestRepository.java:15) | 그룹/담당자 권한, 잠금 및 수락/거절·assignment 반영 |
| C10 | [AiReportService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/AiReportService.java:113), [ai/app.py](C:/PANG3-app/ai/app.py:34), [requirements](C:/PANG3-app/ai/requirements.txt:1) | 120초 대기·재시도/청소, 분석 비활성, 출력·의존성 범위 |
| C11 | [release profile](C:/PANG3-app/backend/src/main/resources/application-release.properties:1), [가입 Controller](C:/PANG3-app/backend/src/main/java/com/fieldwork/controller/AuthController.java:44), [메일 서비스](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/AccountEmailService.java:88), [migration](C:/PANG3-app/backend/sql/auth_release_migration.sql:1) | SMTP/HTTPS 링크 설정, 이메일 포함 가입 발송·트랜잭션, 인증 DB 변경 |
| C12 | [App.js](C:/PANG3-app/frontend/App.js:710), [SettingsScreen](C:/PANG3-app/frontend/screens/SettingsScreen.js:165), [VoiceTextInput](C:/PANG3-app/frontend/components/VoiceTextInput.js:174), [알림](C:/PANG3-app/frontend/services/notificationService.js:15) | 사용자 객체 로그, 정책/지원 준비 중, 음성 인식 설정, 개인별 알림 토글 |
| C13 | [backend Dockerfile](C:/PANG3-app/backend/Dockerfile:1), [Compose](C:/PANG3-app/docker-compose.yml:1), [deploy workflow](C:/PANG3-app/.github/workflows/deploy.yml:3), [기본 설정](C:/PANG3-app/backend/src/main/resources/application.yml:9) | Java/Python 통합 이미지·volume·SSM/main CI, update/show-sql. 실제 클라우드 상태 아님 |
| C14 | [SgisBoundaryService](C:/PANG3-app/backend/src/main/java/com/fieldwork/service/SgisBoundaryService.java:27), [검색](C:/PANG3-app/frontend/utils/placeSearch.js:1) | 새 SGIS 호스트/인증·경계년도와 근처 검색·viewport 제한 로직 |
| C15 | [모듈 선언](C:/PANG3-app/frontend/modules/kakao-navigation/expo-module.config.json:2), [SDK 의존성](C:/PANG3-app/frontend/modules/kakao-navigation/android/build.gradle:21), [모바일 버전](C:/PANG3-app/frontend/package.json:11), [서버 버전](C:/PANG3-app/backend/pom.xml:15) | Android-only, knsdk_ui1.12.8-hotfix02, Expo57/RN0.86.3/Boot3.5.14. speech-recognition56 호환성은 도구/실기기 추가 확인 |

## 5. 검증 자료와 제외한 근거

- [최신 수정/검증 기록](C:/PANG3-app/RELEASE_FIXES_2026-10-15.md), [앞선 기록](C:/PANG3-app/RELEASE_FIXES_2026-10-14.md), [로컬 실행](C:/PANG3-app/LOCAL_RELEASE_RUN.md): 과거 작업 근거. 운영 완료 근거로 확대하지 않았다.
- [인증 테스트 XML](C:/PANG3-app/backend/target/surefire-reports/TEST-com.fieldwork.security.ReleaseAuthIntegrationTest.xml), [파일 테스트 XML](C:/PANG3-app/backend/target/surefire-reports/TEST-com.fieldwork.security.FileIsolationTest.xml): 2026-10-15 18+1개 실패/오류0. 별도 오래된0-test 결과는 성공 회귀 수에 포함하지 않았다.
- [로컬 APK](C:/PANG3-app/backend/target/release-local/pang3-local-preview.apk): arm64 부분 정렬 검사 대상. 파일명 release-local은 Play 정식 배포를 뜻하지 않는다.
- 원문 열기 오류가 난 정책 링크는 성공했다고 기록하지 않았다. Data safety는 `?hl=en` 공식 원문으로 다시 확인했다. SGIS/개인정보위 상세 이용약관·첨부 PDF 전체 분석, 카카오 앱별 계약/서명/쿼터·AWS/Play/Expo 콘솔은 추가 확인 대상이다.

최신 변경이 담긴 현재 소스를 우선했다. 초기 ‘인증 미구현’ 체크리스트, 출입구 자동 보정·삭제 화면 복원, USB 연결 중 Wi-Fi off를 완전 오프라인으로 보는 결론은 채택하지 않았다.
