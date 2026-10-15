# PANG3 공개 출시 준비 조사 결과

조사일: 2026-10-15(KST). 기준: Android / Google Play 공개 출시. 브랜치: `codex/app-release`. 기존 미커밋 변경을 보존하고 조사·문서 작성만 수행했다.

현재 공개 출시 완료로 판단할 수 없다. 주요 기능은 구현되고 로컬 검증도 진행됐지만, 운영 HTTPS·DB 변경 적용·메일·정식 서명 AAB·개인정보 및 삭제 경로·스토어 계정 조건이 남아 있다. 회사 설립 자체는 선행 조건이 아니다. 개인 계정으로 준비를 시작할 수 있다.

## 1. 상태를 읽는 방법

`구현`은 코드가 있다는 뜻, `로컬 검증`은 격리된 H2/파일과 시험 APK에서 확인했다는 뜻이다. 운영 AWS와 Play에서 동일하게 동작한다는 뜻은 아니다. 아래 운영 상태는 계정·콘솔 접근 없이 확정하지 않았다.

| 영역 | 구현·로컬 근거 | 실기기/사용자 확인 | 운영·스토어 상태 |
|---|---|---|---|
| 인증·로그인 유지 | Bearer 인증, DB 토큰 해시, 갱신, SecureStore, 세션 폐기 구현. 인증 통합 18개·파일 격리 1개 성공 기록 | 로그인 및 재실행 확인 기록 있음 | 운영 DB 적용·HTTPS·만료/갱신 재검증 필요 |
| 조회·수정 권한 | 개인은 본인, 그룹은 구성원 조회, 수정은 현재 담당자. 초기 문서의 ‘인증 없음’ 판단은 폐기 | 계정별 조회/수정 제한 확인 기록 | PostgreSQL과 실제 운영 URL에서 재검증 필요 |
| 그룹·업무 이관 | 수락/거절 결과, 담당자 및 지도 연결 갱신. 이관 요청/업무 행 잠금 있음 | 사용자 재확인 기록 | 동시 이관·탈퇴 경합은 운영 DB 환경 테스트 필요 |
| 그룹 나가기 | 임의 재배정 없이 기록 보존, 탈퇴자 표시, 탈퇴자는 접근 제한 | 관련 확인 기록 | 계정 삭제와 별도 보관 정책 필요 |
| 지도·검색·안내 | 구/20km 검색 제한 제거, 일반 종류 검색은 근처 단계 검색, 화면 범위는 결과 묶음으로 조정. 단일 안내·재실행 복구 구현 | 지도 실행·단일 안내 복구 확인 기록 | 출시 인증서에서 SDK 승인·주행/백그라운드 안정성 미검증 |
| 출입구 품질 | 사용자 요청대로 자동 출입구 보정 철회 | 두송중 정문·후문 좌표는 확정하지 못함 | 공급자 도착점 한계. 해결됐다고 광고하면 안 됨 |
| 사진 편집·위치 수정 | 자르기/펜/회전 전체 이전·이후, 위치 확정 저장, 하단 안전영역 구현 | 일부 기기/사용자 확인 기록 | 여러 제조사·큰 사진·사진 포함 보고서 검증 필요 |
| 보고서 보관/파일 | 개인·그룹 보관함, 방문지별 별도 HWPX, 직접 다운로드. 삭제된 중간 확인/팀원관리 화면은 복원 대상 아님 | 로컬 파일 생성·다운로드, ZIP/XML 검사 성공 기록 | Linux 이미지·영구 파일 경로·한글 뷰어·운영 인증 다운로드 필요 |
| 자정·오프라인 | 날짜 갱신/복귀 시 갱신, 이전 날짜 미완료 처리. 로컬 초안 저장 있음 | USB 연결 테스트는 완전 오프라인 증거가 아님 | 완전 오프라인 로그인/저장/수동 재저장 검증 필요. 자동 동기화 큐 완성으로 보지 않음 |
| 설정·지원 | 계정 관리와 알림 토글 구현 | 설정 확인 기록 | 문의·운영정책은 ‘준비 중’, 실제 지원 기능 아님 |
| 배포 | Expo 57.0.28 / RN 0.86.3, Spring Boot 3.5.14 / Java 17, Python 3.11 이미지 | 로컬 arm64 APK 있음 | 정식 AAB·업로드 인증서·Play 설치는 미확인 |

기존 검증 근거는 [최신 수정 기록](C:/PANG3-app/RELEASE_FIXES_2026-10-15.md), `backend/target/surefire-reports`의 2026-10-15 결과다. 이번 조사에서 그 결과 파일과 코드를 확인했다. 이 문서 작성 중 전체 기능 테스트를 새로 실행했다고 주장하지 않는다.

## 2. 공개 전 P0 항목

| ID | 판단 | 실제 근거·영향 | 완료에 필요한 일 |
|---|---|---|---|
| R01 | 설정/코드 수정 필요 | `frontend/eas.json:41` 운영 API가 HTTP. Manifest:24 cleartext 허용. 계정·사진·토큰 전송 보호 미충족 | 서버 HTTPS 도메인 → 운영 앱/웹 URL 변경 → HTTP 차단 및 실제 통신 검사 |
| R02 | 설정 필요 | `android/app/build.gradle:115` release도 debug 서명. EAS production은 AAB 설정이 있지만 실제 클라우드 자격 증명 미확인 | 출시 업로드 키 확정/백업, Play App Signing, 정식 AAB 검사·Play 설치 |
| R03 | 코드 수정/사용자 결정 필요 | `AuthService:100` 탈퇴는 계정 익명화, 사진·업무·보고서·관련 파일 남음. 외부 삭제 요청 웹 화면은 저장소에서 찾지 못함 | 개인 데이터 삭제·공유 기록 보관 구분, 기간/사유 승인, 앱·외부 삭제 경로 구현·검증 |
| R04 | 설정/사용자 결정 필요 | 설정의 정책/문의는 준비 중. Data safety의 실제 SDK 흐름 미작성 | 공개 개인정보처리방침/지원 주소, 데이터 흐름 검토, Play 선언과 앱 고지 일치 |
| R05 | 설정 필요 | 가입 시 이메일 입력하면 `AuthController:67` 메일 발송. `AccountEmailService:107` 발신자/HTTPS 페이지/SMTP 없으면 실패, 가입 트랜잭션 롤백 가능 | 운영 메일과 HTTPS 인증/재설정 웹 페이지 준비, 실제 수신·만료·재사용 검증 |
| R06 | 운영 확인 필요 | 현재 로컬은 H2. 운영 Compose에는 release 프로필 명시 없음, DB 자동 update. 인증 SQL만으로 모든 업무 스키마 변경이 충족되는지 미확인 | 운영 DB 복제 검증, 변경 SQL/백업/복구, 앱·서버 호환 배포 |
| R07 | 운영 확인 필요 | 파일 볼륨은 Compose에 있으나 실제 AWS 보존·백업·복원 미확인. 운영 multipart 제한 명시도 없음 | 사진/HWPX 영구 보관 및 복구, 업로드 제한·Linux 파일 생성/다운로드 확인 |
| R08 | 공동 확인 필요 | 앱 키 환경 이름이 EAS `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`와 config `KAKAO_NATIVE_APP_KEY`로 다름. 현재 로컬 키가 들어가는 것과 클라우드 주입은 별개 | 환경명/네이티브 반영 경로 통일, 카카오에 Play 서명 키 해시·허용 앱/도메인 등록 |
| R09 | 사용자/공동 확인 필요 | Play 계정 유형·생성 시점·본인 인증·테스트 접근 상태 모름 | 실제 Console의 필수 준비 및 해당 비공개 테스트/프로덕션 접근 심사 통과 |

회원가입이 있으므로 앱 내부와 외부의 삭제 요청 경로가 필요하다. 정당한 보관 예외가 있는 데이터도 사유를 공개해야 한다. ‘그룹 보고서를 계속 볼 수 있게 하자’는 제품 결정이 모든 계정 연관 개인정보의 무기한 보관 근거를 자동으로 만들지는 않는다. 그룹 나가기는 보존하되 계정 삭제 때 개인 공간 데이터와 공유 문서 속 개인정보를 따로 처리하는 설계가 필요하다. [Play 계정 삭제 요구](https://support.google.com/googleplay/android-developer/answer/13327111)

개인정보처리방침은 실제 수집·전송·보관·삭제와 맞아야 한다. 국내 적용 내용은 운영 주체·위탁 계약·국외 이전 여부를 확정한 뒤 2026.4 지침과 대조한다. 이 조사로 특정 법률 위반이나 보관 연한을 확정하지 않았다. [Play 사용자 데이터](https://support.google.com/googleplay/android-developer/answer/10144311), [개인정보위 작성지침](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=&nttId=12018)

## 3. Android 배포 판단

2026-08-31부터 새 모바일 앱/업데이트 제출은 target API 36 조건이다. 현재 로컬 merged release manifest는 target 36 / min 26으로 확인돼 이 수치 자체는 충족한다. 최종 AAB에서도 확인한다. 연장 신청 가능 조건을 기본 면제로 가정하지 않는다. [목표 API 요구](https://support.google.com/googleplay/android-developer/answer/11926878)

16KB 지원은 네이티브 SDK가 있는 앱에 해당한다. 이번에 로컬 arm64 APK의 ELF64 라이브러리 18개 PT_LOAD 정렬에서 16KB 미만 0개, `zipalign -c -P 16 4` 종료 코드 0을 확인했다. 이는 긍정적인 부분 검사다. 최종 AAB의 모든 배포 ABI/분할 APK, RELRO와 실제 16KB 기기 실행은 미검증이므로 전체 호환 완료는 아니다. [검사 절차](https://developer.android.com/guide/practices/page-sizes), [Play 적용 안내](https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html)

로컬 merged manifest에는 위치·카메라·마이크·알림·location foreground service, 기존 저장소 권한(maxSdk 32)이 있다. `ACCESS_BACKGROUND_LOCATION` / `READ_MEDIA_IMAGES`는 확인한 manifest에 없었다. `SYSTEM_ALERT_WINDOW`, SDK에서 합쳐진 `READ_PHONE_STATE`, 차량 템플릿/표면 접근 등은 사용 출처와 필요성을 조사해 최소화한다. 위치 FGS는 안내 시작/종료·사용자 표시와 Play 기능 영상이 필요하다. 백그라운드 위치 권한을 무조건 추가하지 말고 실제 위치 접근 방식과 정책 적용을 확인한다. [FGS 요구](https://support.google.com/googleplay/android-developer/answer/13392821), [백그라운드 위치 정책](https://support.google.com/googleplay/android-developer/answer/9799150)

새 개인 계정 중 2023-11-13 이후 생성 계정이면 최소 12명이 14일 연속 참여하는 비공개 테스트 후 프로덕션 접근 신청 조건이 적용된다. 자동 출시 승인이 아니며 참여 품질과 답변도 확인한다. 신원 및 실물 Android 기기 확인도 해당 여부를 Console에서 확인한다. [테스트 조건](https://support.google.com/googleplay/android-developer/answer/14151465), [기기 확인](https://support.google.com/googleplay/android-developer/answer/14316361)

## 4. Expo 공동 작업과 서명

`app.json`에 owner와 EAS projectId가 있다. 소유 계정의 실제 접근권한과 credentials 상태는 미확인이다. 각자 개인 로그인으로 같은 소유 프로젝트/공유 권한에 접근해 빌드하는 방식은 가능하다. 매번 별도 프로젝트·키를 만드는 방식은 같은 앱의 업데이트 관리와 다르다. 하나의 프로젝트·패키지·서명 체계를 고정하고, 팀원에게 역할을 부여하며 업로드 키는 백업한다. Expo 조직은 공동 관리 수단이며 회사 법인 설립과 동일한 개념이 아니다. [Expo 계정/역할](https://docs.expo.dev/accounts/account-types/), [자격 증명](https://docs.expo.dev/app-signing/app-credentials/)

Play 설치 앱은 Play 앱 서명 인증서를 기준으로 카카오 허용 정보를 맞춘다. 업로드 인증서와 Play 앱 서명 인증서는 다를 수 있다. 개인에서 회사로 옮길 때도 단순 로그인 ID 변경으로 보지 말고 Play 앱 이전 및 연결 서비스 이전을 검토한다. [서명](https://developer.android.com/studio/publish/app-signing), [앱 이전](https://support.google.com/googleplay/android-developer/answer/6230247)

`EXPO_PUBLIC_*`는 번들에서 볼 수 있는 값이다. EAS에 숨겨 입력했다고 클라이언트 키 자체가 비밀이 되는 것은 아니다. 공개 앱 키는 허용 패키지/서명/도메인과 쿼터로 제한하고, 서버 비밀은 SSM 등 서버 측에서만 사용한다. 조사 도중 앱 키 값 출력이 있어 이후 확인은 값을 가렸다. 현재 설정·Git 이력의 키 종류와 제한 상태를 점검하고, 실제 서버 비밀 노출이 확인되면 별도 대응한다. 이번 조사에서 키 교체는 수행하지 않았다. [Expo 환경 변수](https://docs.expo.dev/guides/environment-variables/)

네이티브 내비게이션 모듈은 Android만 선언돼 있다. iOS 안내 모듈/권한/실기기와 App Store 준비는 별도 후속 과제이며 Android 출시 차단 항목이 아니다. OTA 업데이트 운영도 runtimeVersion/channel/네이티브 변경 호환 정책부터 정해야 한다.

## 5. 실제 개인정보·외부 서비스 흐름

| 정보 | 코드상 처리 | 출시 전 확인 |
|---|---|---|
| 아이디·이름·이메일·비밀번호 | 자체 가입/인증, 비밀번호 해시, 이메일 챌린지 | 필수/선택 항목·수집 목적·메일 위탁·삭제 기간 |
| 계정 근무지역/근무지 좌표 | DB와 개인 공간, 복귀 목적지 | 실제 운영자 접근 및 계정 삭제 시 제거 범위 |
| 현재 위치·검색어·안내 좌표 | 지도/검색/내비 SDK·공급자 요청 | 카카오 SDK 수집 안내, 서버 저장 여부, 위치 고지/동의 |
| 방문지·작업 메모·상태·담당자·사진 | DB/업무 파일, 그룹 구성원 조회, HWPX 생성 | 공유 범위, 사진 속 타인 개인정보, 보관 기간, 내보낸 파일 회수 한계 |
| 음성 | `VoiceTextInput:174` OS 인식 서비스 사용, 앱 음성 파일 저장 옵션은 보이지 않음. 인식 텍스트는 메모에 반영 가능 | on-device 강제 설정 없음. OS/인식 공급자 외부 전송을 ‘없음’으로 단정 금지 |
| 푸시 토큰/알림 | Expo Notifications/FCM, 서버 등록 | credentials·실제 발송·토큰 로그/폐기·SDK 선언 |
| AI | `ai/app.py:34` 분석 False, Python HWPX 처리 활성. genai 의존성만으로 사진 AI 전송 중이라고 판단하지 않음 | AI 활성화 시 고지·위탁/국외 처리·비용 재검토 |

Data safety는 우리 서버뿐 아니라 SDK/WebView의 전송도 조사한다. ‘수집’과 ‘공유’는 정책 정의와 서비스 제공자 예외를 구분하고, 그룹 공유나 SDK 사용만으로 모든 항목의 답을 자동 결정하지 않는다. 아직 최종 제출 답안은 아니다. [Data safety 설명](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)

SGIS 경계 코드와 최신 호스트는 구현돼 있다. ‘로컬 서버라서 안 됨’이 아니라 키/상용 승인·인증·년도/지역 코드·호출 실패를 확인해야 한다. 공식 안내는 테스트 키 후 상용 키 전환과 무료 호출을 설명한다. 최종 이용약관·출처 표시는 서비스에 맞게 추가 확인한다. [SGIS 안내](https://sgis.mods.go.kr/developer/html/openApi/api/intro.html)

## 6. P1 위험과 P2 개선

- P1 업로드: 확장자 허용과 경로 격리는 있으나 파일 내용/디코딩·픽셀 수 검증은 부족하다. 잘못된 파일·거대 이미지로 자원 고갈/보고서 실패를 방지해야 한다.
- P1 로그: `App.js:710` 사용자 객체 출력, Python 결과/본문 출력이 있다. 운영에서 개인정보·파일 경로·본문을 지우거나 최소화한다.
- P1 보고서 프로세스: 120초 제한·재시도·임시 JSON 정리와 고유 파일명은 있음. stdout을 종료 후 읽어 많은 출력 때 대기/타임아웃 위험이 있고 병렬 생성·동시 수·취소·고아 파일 청소는 추가 검증 필요.
- P1 운영 재현성: Python `>=` 의존성, 이미지 latest, CI 패키징 `-DskipTests`. 검증된 버전/이미지 식별자 고정과 배포 전 필수 테스트를 준비한다. 모든 의존성을 즉시 대규모 업그레이드하라는 뜻은 아니다.
- P1 장애 관측: Crash/ANR, API 5xx, 메일 실패, 파일 생성 시간, 디스크/DB 백업 실패 알림과 담당자가 미확인이다.
- P1 지도 경계: 대시보드 핵심으로 제공한다면 운영 SGIS 성공이 필요. 비핵심으로 출시할 경우 오류 화면/소개 문구와 기능 범위를 명확히 결정한다.
- P2 지도 직접선택 디자인은 사용자 보류. ‘화면 중심 선택’ 동작 검증과 별개다. 범용 검색 의도 분류, 더 세밀한 디자인은 출시 후 개선 가능하다.

## 7. 비용: 확정 금액과 산정 입력 분리

USD 금액은 환율·세금·지역·추가 사용량을 포함한 원화 청구 예측이 아니다. 계정 무료 크레딧이 있다고 운영비를 0원으로 가정하지 않는다.

| 구분 | 확인한 공식 요금/조건 | 현재 판단 |
|---|---|---|
| Play 등록(일회성) | US$25 | 계정 보유 여부 확인. [공식 등록](https://support.google.com/googleplay/android-developer/answer/6112435) |
| EAS(월/사용량) | Free $0: Android/iOS 각 15 builds, 저우선 큐. Starter $19/월 + 사용량 | 초기 Free 가능성 있음. 기존 계정 사용량/빌드 횟수 확인. [요금](https://expo.dev/pricing) |
| AWS 컴퓨팅/DB(월) | 서비스·리전·인스턴스/디스크/시간에 따라 달라짐 | 실제 EC2 또는 Lightsail, 동일 VM DB 또는 RDS 여부 미확인. [Lightsail](https://aws.amazon.com/lightsail/pricing/), [RDS](https://aws.amazon.com/rds/pricing/) |
| 사진/문서/백업/전송(사용량) | 저장 GB월·요청·인터넷 전송·백업 별도 | S3 코드/안내가 있다고 현재 S3 저장 완료는 아님. 현 구현은 로컬 파일/볼륨. [S3](https://aws.amazon.com/s3/pricing/) |
| SES 메일(사용량) | 기본 발송 $0.10/1,000통, 첨부 전송 등 별도 | 예: 1,000통 기본 $0.10. 도메인·다른 옵션 비용 제외. [SES](https://aws.amazon.com/ses/pricing/) |
| 카카오 지도(사용량) | 계정의 첫 활성화 지도 앱에 무료 쿼터, 이후 앱/초과는 유료 조건 | 실제 앱 Free badge와 쿼터/Wallet 확인. ‘전부 무료’ 확정 금지. [지도 정책](https://developers.kakao.com/docs/en/kakaomap/common), [쿼터](https://developers.kakao.com/docs/en/getting-started/quota) |
| 길찾기 SDK/API(사용량) | SDK 초과 1원/요청, 자동차 API 해당 구간 초과 8원/요청. 일일 무료량과 월 공통량을 함께 확인 | SDK 안내와 REST 길찾기 호출을 따로 계산. [Mobility 요금](https://developers.kakaomobility.com/price/) |
| SGIS | 공식 안내 무료, 일일 호출 제한 안내 있음 | 상용 키 승인·최신 조건 확인. 금액보다 준비/장애 대응이 과제 |

산정 예시(실측이 아닌 용량 계획): 활동 사용자 100명, 22근무일, 1명당 하루 보고서 2개, 1보고서 사진 3장×2MB이면 월 4,400보고서·사진 신규 26.4GB다. 생성 HWPX 평균 5MB 가정이면 추가 22GB, 둘 다 3개월 보관하면 약 145.2GB이며 백업/지도 캡처/임시/기존 데이터는 별도다. 보고서 20%를 한 번 내려받으면 약 4.4GB 다운로드다.

검색 10회/인/일이면 월 22,000 검색 동작이지만 주소/키워드 병렬 및 단계 검색 때문에 API 요청은 그 이상일 수 있다. 실제 endpoint별 호출수를 측정해야 한다. 사용자 수를 월 청구액으로 바로 환산할 수 없다. 서버 팀원이 서울 리전 서비스·사양·백업·트래픽을 확정해 AWS 계산기로 견적을 남기고, 사용자가 월 예산/초과 알림 한도를 승인한다.

## 8. 다음 행동과 조사 한계

먼저 사용자가 Play 계정/카카오/지원 연락처와 보관 정책을 준비한다. 동시에 서버 팀원은 격리된 운영형 검증 서버의 HTTPS·DB·파일·메일을 준비한다. Codex는 그 설정/결정을 받아 운영 config·삭제 경로·로그/업로드·빌드 정리를 구현한다. 이후 공동으로 정식 AAB → 내부 테스트 → 해당 비공개 테스트 → 공개 심사 순서다. 확정 출시일은 아직 산정할 수 없다.

AWS/Play/Expo/Kakao 콘솔의 실제 승인·결제·키 제한, 운영 DB 스키마/트래픽/백업은 미확인이다. 이번 조사에서 운영 배포·스토어 제출·계정 생성/이전·키 교체·실사용자 메일·DB 변경·push/merge는 하지 않았다. 실제 주행·16KB 기기·Play 설치·HWPX 뷰어 전수 검증도 하지 않았다.

구체적 실행은 [담당자별 계획](C:/PANG3-app/APP_RELEASE_ACTION_PLAN.md), [서버 전달 문서](C:/PANG3-app/APP_RELEASE_SERVER_HANDOFF.md), [사용자 준비](C:/PANG3-app/APP_RELEASE_OWNER_CHECKLIST.md), [검증 계획](C:/PANG3-app/APP_RELEASE_VALIDATION_PLAN.md), [공식 출처·코드 근거](C:/PANG3-app/APP_RELEASE_SOURCES.md)에 정리했다.
