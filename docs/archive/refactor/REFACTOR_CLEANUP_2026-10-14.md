# 추가 정리 완료 — 2026-10-14

> 보관 문서: 작성 당시의 조사·변경 기록입니다. 현재 구현·검증 상태는 [문서 목차](../../README.md)에서 관련 문서를 확인하세요. 아래 작업 지시는 이 기록을 열었다는 이유로 실행하지 않습니다.

사용자가 B·C 후보를 확인 후 정리하도록 승인했고, 보고서 사진 분석과 기존 N 항목은 유지하도록 범위를 정했다. 현재 tmap 작업 폴더에 변경을 반영했다.

## 정리한 내용

| 항목 | 반영 내용 |
|---|---|
| B1 | 부산 SGIS 코드 16개를 constants/busanDistricts.js로 이동. MapScreen·WorkStatusScreen import와 테스트 mock 경로를 갱신하고 PublicDataMapMode.js의 옛 화면 1,877줄 제거. 원본과 새 상수 객체의 값이 완전히 같음을 검증. |
| B2 | Expo 기본 화면 5개, 예제 전용 컴포넌트·hooks·theme, React 로고 4개와 reset-project 스크립트 제거. 실제 앱 아이콘·스플래시 자산 유지. |
| B2 의존성 | expo-router, react-native-reanimated, expo-haptics, expo-web-browser, expo-status-bar 직접 의존성 및 router/browser plugin과 router 설정 제거. 실제 앱에서 사용하는 react-native-safe-area-context 5.9.1을 직접 의존성으로 등록. package-lock을 npm offline install/prune로 갱신했으며 기존 패키지 버전 변경·새 패키지 추가 없음. |
| B2 개발 설정 | README를 실제 App.js 진입점 기준으로 갱신. TS 예제 제거 후에도 프로젝트 설정이 JS 소스를 포함하도록 allowJs와 include를 조정. checkJs는 false이며 전체 JS 타입 안전성을 보장하는 설정이 아님. |
| B3 | MapScreen의 읽지 않는 assignmentMap 계산 및 locationMoving 상태·setter·전달 callback 제거. 별도 FieldActionScreen의 locationMoving은 화면에서 사용하므로 유지. KakaoMapWebView의 호출되지 않는 검색 setter가 있던 hook을 기존 값 false인 상수로 대체. |
| C1 | SpeechController, SpeechService, Python transcribe_audio 및 --stt CLI 분기 제거. 현재 휴대폰의 expo-speech-recognition 음성 입력은 유지. |
| C2 | 외부 Java 참조가 없는 LocationService·LocationRepository·Location 엔티티 제거. 현재 LocationController → TaskService 및 BulkLocationService 경로는 유지. DB 변경 스크립트·DROP TABLE은 추가/실행하지 않음. |
| C3 | RouteService의 ORS 키 필드 및 @Value 주입 제거. 원격 SSM 값과 로컬 비밀 설정 파일은 조회·수정하지 않음. |

Expo CLI의 선택적 peer 관계 때문에 expo-router/reanimated/worklets 등이 lockfile·로컬 node_modules에 도구용 전이 항목으로 남을 수 있다. 앱의 직접 의존성에서는 제거했고, Android 자동 연결과 새 APK에서 앱에 불필요한 네이티브 코드가 빠졌는지 따로 확인했다. lockfile에서 선택적 도구 항목을 임의로 잘라내지는 않았다. Expo는 로컬 모듈 및 의존성을 자동 연결한다. [공식 문서](https://docs.expo.dev/modules/autolinking/).

## 보호한 기능과 데이터

- 보고서 사진 편집, 사진 분석, Gemini 보고서 생성·HWPX 출력 유지.
- ai/app.py의 함수 AST를 HEAD와 비교: 제거된 함수는 transcribe_audio 하나이며 나머지 함수는 전부 동일. run_gemini_analysis, run_pipeline, 이미지 처리·문서 생성 함수 및 기존 ENABLE_AI_ANALYSIS 설정은 변경하지 않음.
- FieldActionScreen.js, PhotoMarkupEditor.js, AiReportService.java, ai/requirements.txt는 변경하지 않음. 따라서 보고서 응답의 aiRefinedContent/reportDownloadUrl과 관련 지역 상태도 이번에 정리하지 않음.
- 기존 N1 백업 파일 및 N2/N3 대상 KakaoNavigationView.kt는 변경하지 않음.
- 서버 차량 REST 경로/optimize API는 유효한 공개 Controller·테스트 경로가 있으므로 폐기하지 않음. 도보·차량 경로, 배정·이관·알림·일괄 업로드는 유지.
- 운영 locations 테이블, 기존 업로드 사진·보고서 데이터, 원격 SSM 항목은 변경하지 않음. Java 참조를 검증했지만 운영 DB/로그·외부 사용 기록을 조사했다고 주장하지 않음. 서버 STT 폐기는 사용자의 명시적 폐기 승인에 따른 것임.

## 검증 결과

- 기존 프론트 기능 검증 12개 전부 통과: current-district-search, place-screen, place-search, report-upload, report-ux, route-notification, route-progress, route-session, route-viewport, single-place-map, visit-order, work-plan.
- 전체 Java main/test 소스를 기존 출력과 분리한 새 폴더에 javac로 컴파일 성공. 해당 출력에는 제거한 Location/Speech 클래스가 없음.
- 새 클래스에서 assertions를 켠 KakaoRoadContractTest, KakaoWalkingContractTest, TaskProgressContractTest, WorkplaceContractTest, BusanEntranceServiceTest 5개 통과. 실운영 API 요청 없이 수행.
- HWPX 합성 검증 통과: 두 방문지의 서로 다른 사진, 작업 단계·기록일·메모, 이미지 참조, 파일명이 유지됨. 기존 임시 Python 경로는 lxml이 없어 실패하여 bundled Python으로 재실행해 통과. 실제 Gemini 요청은 보내지 않음.
- TypeScript noEmit 검사 통과. checkJs=false이므로 JS의 전체 타입 검사 통과 의미는 아님.
- Android와 iOS Hermes/JS export 성공. 두 플랫폼 모두 AppEntry.js의 현재 App.js를 진입점으로 사용하며 Android/iOS/web 진입점 해석도 AppEntry.js로 확인.
- Android arm64 debug APK 네이티브 빌드 성공: Gradle --offline :app:assembleDebug -PreactNativeArchitectures=arm64-v8a. 카카오 모듈·사진·음성·알림 모듈은 유지되며 새 APK에는 libreanimated.so와 libworklets.so가 없음.
- 새 debug APK 크기 약 129.64 MiB. 앞서 기록된 debug APK는 약 134.08 MiB였지만 빌드 시점의 코드가 달라 엄밀한 동일 소스 A/B 비교 수치로 보지는 않음. 옛 release APK 163.43 MiB와 직접 비교하면 안 됨.
- git diff --check 통과. 생성된 번들·클래스·검증 데이터는 기존 무시 경로 backend/target 및 생성된 Android build 경로에만 보관.

## 검증 한계

실기기 조작, iOS 네이티브 빌드, release APK/AAB 빌드·배포는 수행하지 않았다. 전체 플랫폼 export 시도는 **모바일 web의 기존 react-native-web 누락** 때문에 실패했다. HEAD의 lockfile에도 이 패키지가 없었음을 확인했으며, 이 정리 작업에서 웹 기능을 새로 구현하거나 해당 패키지를 추가하지 않았다. 별도 web/ Vite 앱은 수정하지 않았다.

위 검증은 현재 사용 기능의 코드·빌드 연결을 확인한 것이다. 실제 운영 데이터의 사용 관계와 Gemini 응답 품질까지 검증한 결과는 아니다.
