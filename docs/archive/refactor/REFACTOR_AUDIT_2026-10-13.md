# PANG3 외근도우미 정리 후보 감사 — 2026-10-13

> 보관 문서: 작성 당시의 조사·변경 기록입니다. 현재 구현·검증 상태는 [문서 목차](../../README.md)에서 관련 문서를 확인하세요. 아래 작업 지시는 이 기록을 열었다는 이유로 실행하지 않습니다.

> 이 문서는 당시 코드의 기록이다. 최신 변경과 미커밋 지도 수정까지 재검증한 결과는 [2026-10-14 보고서](REFACTOR_AUDIT_2026-10-14.md)를 기준으로 확인한다. 아래 줄 번호와 APK 정보는 작성 당시 값이다.

## 결과와 범위

현재 소스에 사용하지 않는 화면·함수와 예전 구현의 잔재가 있다. 다만 APK 용량에는 네이티브 라이브러리와 CPU별 중복 포함이 훨씬 큰 비중을 차지한다. 코드 정리와 앱 용량·실행 성능 개선은 별도 검증 대상으로 진행해야 한다.

- 분석 기준: `C:\PANG3-app`, HEAD `239d4eb`. 코드·설정·의존성을 수정하거나 삭제하지 않았다. 이 보고서만 추가했다.
- 모바일, 웹 소스의 import 관계, 현재 화면 분기, Java 서비스·컨트롤러, 음성 입력과 Python 연결, 빌드 설정 및 기존 로컬 APK를 확인했다.
- Git 추적 모바일 JS/TS 소스 74개 중 `App.js`에서 상대경로/별칭 import를 따라 연결되는 파일은 42개였다. 이 수치는 직접 만든 정적 그래프의 결과이며 플랫폼별 파일 선택·프레임워크 자동 등록까지 완전히 표현하는 수치는 아니다.
- 설치된 TypeScript로 JS를 `allowJs`, `checkJs`, `noEmit`, `noUnusedLocals` 설정으로 분석했다. 아래 함수 후보는 관련 미사용 진단과 실제 선언·참조를 함께 확인했다. 전체 타입 검사 통과를 뜻하지 않는다.
- 운영 로그·실제 사용자 사용 기록·DB 데이터·휴대폰 성능은 확인하지 않았다. 새 APK/백엔드 빌드 및 회귀 테스트는 실행하지 않았다. 모든 항목은 **삭제 승인 전 후보**다.
- 기존 비추적 `ux-research-output/`, `ux-research-prompts/`는 건드리지 않았다.

## A. 비교적 안전한 정리 후보

‘낮음’은 현재 저장소와 확인한 Android 진입점 기준이다. 외부 소비자·다른 플랫폼·숨은 호출을 완전히 배제했다는 뜻은 아니다.

| ID | 후보 및 위치 | 사용 여부와 현재 구현 근거 | 위험도 / 정리 후 검증 |
|---|---|---|---|
| A1 | `frontend/screens/MainScreen.js:19` | 앱·웹 소스에 import하는 곳 없음. 현재 `App.js:19,966`은 `DashboardScreen`을 홈으로 렌더링. 기존 release 소스맵에도 MainScreen 없음. | 낮음. 개인/그룹 홈, 미처리 업무 선택·오늘 업무 추가 확인. |
| A2 | `frontend/screens/PublicDataAssignmentScreen.js:18` | import하는 곳 없음. 현재 `App.js:1086`의 `publicDataAssignment` 분기는 `MapScreen`에 `publicDataMode`를 전달. 기존 release 소스맵에 해당 옛 화면 없음. | 낮음. 공공데이터 조회·동 선택·방문지 등록 확인. **동일 이름의 화면 분기까지 없애면 안 됨.** |
| A3 | `frontend/data/mockData.js` | export된 C/USER/LOCATIONS/REGION_DATA/MONTHLY/HEATMAP/DAYS/WEEKS/MOCK_ENTRIES를 다른 앱·웹 소스가 참조하지 않음. 기존 release 소스맵에도 없음. | 낮음. 개발용 데모 목적이 없는지 확인 후 파일 정리. |
| A4 | `frontend/App.js:907`의 `openTeamMap` | TypeScript 미사용 진단. 함수 선언만 존재하며 다른 곳에 전달/호출하지 않음. | 낮음. **함수만** 후보. `teamLocations` 화면·팀 경로 상태·다른 팀 지도 진입은 유지. |
| A5 | `frontend/components/KakaoMapWebView.js:3053`의 `handleFieldAction` | TypeScript 미사용 진단. 지역 함수가 이벤트 핸들러로 전달되지 않음. | 낮음. 함수만 정리 후 마커 클릭·현장 기록 진입 확인. `onMarkerClick` 자체는 삭제 대상 아님. |
| A6 | `frontend/screens/DashboardScreen.js:1827`의 `BarRow` | TypeScript 미사용 진단. JSX에서 컴포넌트 사용 없음. | 낮음. 대시보드 통계 확인. styles는 별도 사용 확인 없이 일괄 삭제 금지. |
| A7 | `frontend/screens/MapScreen.js:90`의 `getStatusLabel` | TypeScript 미사용 진단. 현재 파일에서 참조되지 않는 지역 함수. | 낮음. 지도 상태 표시 확인. 다른 파일의 동명 함수는 별도 판단. |
| A8 | `frontend/screens/ReportListScreen.js:47`의 `isPersonalGroup`, `frontend/screens/WorkStatusScreen.js:47`의 `shortAreaName` | 각각 TypeScript 미사용 진단. 해당 파일에서 지역 함수 참조 없음. | 낮음. 보고서 목록·업무 현황 확인. 다른 화면의 같은 이름 함수는 실제 사용 중. |
| A9 | `backend/.../service/RouteService.java:318`의 `getOrsWalkingPath` | private 메서드가 선언 외 참조 0회. 현재 `optimizeRoute`의 walk 분기는 `getKakaoWalkingPath` → `KakaoWalkingClient.route`; 단일 구간도 카카오 도보 분기 사용. 약 104줄의 과거 ORS 구현. | 낮음. 도보 전체 최적화·단일 구간·출입구 연결 검증. `makeRoutePoints`, `makeSegment`, `RestTemplate` 등 공유 헬퍼는 유지. |
| A10 | `backend/.../service/TaskProgressService.java:307`의 `isLocalPath` | private 메서드가 선언 외 참조 0회. 애너테이션 콜백도 없음. | 낮음. 함수만 후보. 실제 사진 경로 처리 및 다운로드 로직은 유지. |
| A11 | 명백한 미사용 import | `components/ui.js`의 `radius`; `FieldActionScreen.js`의 `TextInput`, `PHOTO_TYPES`에 미사용 진단. | 낮음. import에서 해당 이름만 정리. 모듈 전체나 `PHOTO_TYPES` 정의를 삭제하는 근거는 아님. |

Java private 메서드는 선언/참조 검색으로 선별하고 본문과 실제 호출 분기를 확인했다. reflection을 사용하는 외부 코드가 없는지 최종 승인 단계에서 재확인해야 한다.

## B. 선행 작업이 필요한 후보

### B1. PublicDataMapMode의 옛 화면 구현

`frontend/screens/PublicDataMapMode.js:256`의 default 화면은 현재 앱에서 import/렌더링하지 않는다. 공공데이터 화면은 `MapScreen`에 통합되어 있다. 그러나 같은 파일의 **BUSAN_DISTRICT_CODES**는 다음 두 실제 화면이 사용한다.

- `frontend/screens/MapScreen.js:29`
- `frontend/screens/WorkStatusScreen.js:17`

따라서 **파일 통째 삭제 금지**. 먼저 구·군 코드 상수를 전용 constants 파일로 옮기고 소비자 2곳 및 관련 테스트의 mock 경로를 함께 변경한 뒤 옛 화면을 정리해야 한다. 기존 release 소스맵에도 PublicDataMapMode 모듈이 포함되어 있었다. 모듈이 포함됐다는 사실만으로 모든 함수가 실행되거나 전부 번들에 남았다고 단정할 수는 없다.

파일 내부 `createMockItems:204`도 미사용 진단이 있으며 과거 호출은 주석이다. 상수 분리와 함께 정리할 후보다.

### B2. Expo 기본 예제 묶음과 의존성

현재 Android 진입점 해석 명령은 `frontend/node_modules/expo/AppEntry.js`를 반환한다. 이 파일은 `../../App`을 import한다. 현재 package.json에는 router 진입점 설정이 없다. 기존 release 소스맵도 AppEntry → App.js이며 `expo-router` JS 소스는 0개였다.

현재 App.js 그래프에서 연결되지 않는 기본 예제 묶음:

- `frontend/app/`의 tabs·modal·layout 5개
- `hello-wave`, `haptic-tab`, `external-link`, `parallax-scroll-view`, `themed-text`, `themed-view`
- `components/ui/collapsible`, `icon-symbol` 및 iOS 변형
- `hooks/use-color-scheme` 및 web 변형, `use-theme-color`, `constants/theme.ts`

이 파일들은 서로 참조하지만 실제 Android 앱 진입점과 분리되어 있다. 파일 기반 라우팅은 자동 발견될 수 있으므로 import 0회만으로 판단하지 않고 진입점도 확인했다. 예제 삭제는 낮은 위험 후보지만 iOS·모바일 web 진입점은 추가 확인이 필요하다.

의존성 정리는 별도 작업:

| 패키지 | 확인한 상태 | 정리 전 확인 |
|---|---|---|
| `expo-router` | 기본 예제에서만 코드 참조. app.json plugin 및 extra.router 설정은 남음. | 예제, plugin, 설정, 의존성을 함께 정리하고 모든 지원 플랫폼 빌드 확인. |
| `react-native-reanimated` | 코드 참조는 기본 예제. 기존 release JS 소스맵에 없음. 반면 generated PackageList에 ReanimatedPackage 등록, APK에는 libreanimated.so 존재. | 실제 앱과 다른 의존성의 요구 여부·worklets 연결 확인 후 제거. 새 APK에서 비교. |
| `expo-haptics` | 기본 예제 haptic-tab에서 참조. 기존 release JS 소스맵에는 없음. | 다른 패키지의 사용·네이티브 연결 확인. |
| `expo-web-browser` | 기본 예제 external-link에서 참조. app.json plugin은 남음. 기존 release JS 소스맵에는 없음. | 인증·외부 링크 요구 및 plugin 확인 후 정리. |

JS import가 없어도 네이티브 모듈은 autolinking으로 포함될 수 있다. 실제 프로젝트의 Reanimated 등록/라이브러리도 그 차이를 보여준다. [Expo autolinking 공식 문서](https://docs.expo.dev/modules/autolinking/).

React Native SafeAreaProvider 등은 현재 앱에서 직접 사용한다. 상위 package.json 직접 선언 여부만으로 설치된 전이 의존성을 ‘불필요’로 분류하면 안 된다.

### B3. 상태·계산 잔재

`MapScreen.js:380`의 assignmentMap 계산 결과에 미사용 진단이 있다. 또한 `locationMoving`, KakaoMapWebView의 `setIsSearching`, FieldActionScreen의 일부 state 값 등에도 진단이 있다.

이것은 hook/관련 기능 전체가 불필요하다는 뜻이 아니다. 상태 setter, initializer의 부수 효과, 요청 결과 처리와 테스트를 개별 확인해야 한다. 특히 `aiRefinedContent`, `reportDownloadUrl`이라는 **지역 state 값**의 미사용 진단을 보고 API 응답 필드나 보고서 다운로드 기능을 삭제하면 안 된다. 같은 파일에서 응답의 해당 필드는 실제로 읽는다.

## C. 운영·호환성 확인 후 판단할 후보

### C1. 이전 서버 음성 변환 경로

현재 VoiceTextInput은 `expo-speech-recognition` 네이티브 인식을 사용하며 서버 transcribe 요청이 없다. `ANDROID_BUILD_README.txt`에도 전환 사실이 적혀 있다. 현재 모바일·웹 소스에서 `/api/speech/transcribe` 호출을 찾지 못했다.

그러나 서버에는 실제로 연결된 경로가 남아 있다:

`SpeechController` → `SpeechService.transcribe` → Python `app.py --stt` → `transcribe_audio`.

**외부 공개 API와 CLI 기능이므로 즉시 삭제 판정 불가.** 구버전 앱·직접 API 호출·운영 스크립트 사용 확인 후 한 묶음으로 폐기해야 한다. AI 보고서 생성은 별도 기능이므로 Python 엔진 전체를 없애면 안 된다. 이 경로를 정리해도 휴대폰 APK 크기를 직접 줄이는 작업은 아니다.

### C2. legacy LocationService / LocationRepository / Location Entity

LocationController는 LocationService 대신 TaskService를 직접 사용한다. LocationService는 다른 Java 클래스에서 주입/호출하는 곳을 찾지 못했다. LocationRepository는 이 서비스에서만 참조하며 Location 엔티티는 해당 묶음에서 참조한다.

다만 각각 `@Service`, Spring Data repository, `@Entity @Table(name="locations")`로 프레임워크가 등록한다. 운영 DB와 외부 연동 확인 없이 전체 묶음을 삭제하면 안 된다. 특히 **locations 테이블 삭제 승인과 Java 코드 정리 승인은 별개**다.

`/api/locations`는 현재 App.js·화면에서 계속 쓰며 내부적으로 task 데이터를 제공한다. 이름이 레거시라고 해서 LocationController나 API까지 지우면 앱이 깨진다.

### C3. ORS 설정

RouteService의 `orsApiKey`는 옛 ORS private 메서드에서만 사용된다. 함수 정리 시 설정 필드도 후보지만 `@Value("${ors.api-key}")`는 bean 생성 시 설정을 읽는다. 운영 설정·SSM 및 다른 서비스 참조를 확인해야 한다. 이번에는 비밀 설정값이나 원격 SSM을 조회하지 않았다.

## D. 유지해야 하는 코드 및 오판 방지

- AssignmentScreen: App.js에서 import하고 실제 렌더링. 이전 대화의 ‘배정 기능은 대체되어 안 쓸 수 있다’는 예시를 이 프로젝트의 사실로 적용하면 안 된다.
- GroupDashboardScreen: WorkStatusScreen에서 실제 렌더링한다.
- kakao-navigation 모듈: MapScreen이 Android 차량 모드에서 사용. package.json의 일반 의존성 목록에 없다는 이유로 삭제 금지. 로컬 Expo 모듈 등록 설정이 있다.
- NotificationScheduler: 다른 클래스의 직접 호출이 없어도 `@Scheduled`로 오전 9시·오후 5시 자동 실행 경로가 있다.
- AedService/BusStopService: 별도 관리 API 외에도 PublicDataService가 호출한다. 프론트에서 개별 import API를 안 쓴다고 서비스 전체 삭제 금지.
- `web/`: 별도 Vite/React 진입점과 라우트가 있다. 모바일에서 import하지 않는다고 불필요 코드로 판정할 수 없다. 실제 운영 필요 여부는 별도 확인.
- 엔티티 필드·Repository 메서드·DTO/JSON 필드: JPA·Spring·Jackson의 동적 사용이 있으므로 일반 문자열 참조 0회 기준으로 삭제 금지.
- PNG 아이콘·스플래시: 실행 코드 import만이 아니라 Expo 설정과 플랫폼 자산 규칙까지 확인. React 로고 예제 자산은 예제 묶음 정리 후 별도 후보.
- 테스트는 앱 실행에서 import되지 않는 것이 정상이다. 미사용 소스 파일 목록과 분리해야 한다.

## E. 앱 용량에 대한 실제 측정

기존 파일 `frontend/android/app/build/outputs/apk/release/app-release.apk`를 ZIP으로 읽었다. 재빌드하거나 APK를 수정하지 않았다. 아래 MB는 1,048,576 bytes 기준(MiB)이다.

| 항목 | 압축된 크기 |
|---|---:|
| APK 전체 | 163.43 MB |
| lib/x86_64 | 31.19 MB |
| lib/x86 | 31.06 MB |
| lib/arm64-v8a | 29.37 MB |
| lib/armeabi-v7a | 20.18 MB |
| 네이티브 라이브러리 4종 CPU 합계 | 111.80 MB |
| res 자원 | 26.29 MB |
| assets/index.android.bundle | 2.26 MB |
| 4개 CPU의 libreanimated.so 합계 | 5.18 MB |

CPU 4종 포함은 현지 gradle.properties 설정과 일치한다. arm64 이외 세 종류 lib 합계는 약 82.43 MB다. 이 수치는 **해당 APK 내부 구성량**이며 arm64 전용 재빌드 시 정확한 절감량을 보장하는 예측은 아니다. 대상 기기와 배포 방식을 먼저 결정해야 한다. production EAS 프로필은 이미 AAB를 사용하도록 설정되어 있으므로 universal APK 크기와 Play 사용자 다운로드 크기를 혼동하면 안 된다. [Android 앱 용량 공식 문서](https://developer.android.com/topic/performance/reduce-apk-size).

생성된 Android app/build.gradle은 minify와 resource shrink가 설정 미지정 시 false다. 현지 gradle.properties에는 활성화 항목이 없었다. 실제 빌드 실행 때 전달된 override까지는 확인하지 못했으므로 ‘이 APK는 확실히 최적화 없이 생성됐다’고 단정하지 않는다. 활성화를 검토한다면 카카오 SDK·음성·알림 등의 keep 규칙과 release 실기기 검증이 필요하다. [Android resource shrinking 공식 문서](https://developer.android.com/topic/performance/app-optimization/customize-which-resources-to-keep).

**측정 한계:** 기존 APK/소스맵은 10월 13일 00:23~00:24경 파일이다. 소스맵 sourcesContent와 현재 저장소의 대응 파일을 비교했을 때 24개는 일치하고 12개는 달랐다. App.js, MapScreen, KakaoMapWebView 등 최신 변경이 반영되지 않은 산출물이다. 따라서 번들 포함 여부는 보조 증거이며 현재 코드 그래프·진입점 확인을 함께 사용했다. 최신 APK의 최종 수치로 제시해서는 안 된다.

## F. 빌드 시간·실행 성능 조사 후보

- CPU 4종 빌드와 여러 네이티브 의존성이 확인됐지만 이번에 빌드 시간은 측정하지 않았다. 동일 조건의 clean/incremental 빌드를 각각 재야 병목을 확인할 수 있다.
- App.js:484는 앱 활성 상태의 main/mapDirect에서 30초마다 loadWorkspaceLocations를 호출한다. 앱 복귀와 의존성 변경 시에도 새로 불러온다. 사용자·그룹 수에 따른 요청 수와 응답 크기를 측정할 후보이며 삭제 대상이라고 단정하지 않는다.
- KakaoMapWebView.js:2407은 High accuracy, timeInterval 5000, distanceInterval 5로 GPS watch를 등록하고 state 갱신과 JS bridge 전송을 한다. 실제 콜백 빈도·렌더 시간·배터리를 측정해야 한다. 코드에서는 위치 마커 갱신을 사용하며 HTML 전체를 매번 재생성한다고 단정할 근거는 없다.
- App.js 1,608줄, MapScreen 2,784줄, KakaoMapWebView 4,844줄은 관리 복잡도를 보여주지만 줄 수 자체가 실행 속도의 증거는 아니다.
- 예전 화면 2개와 mockData는 확인한 기존 release 번들에 없었다. 해당 파일 삭제는 유지보수에 도움이 되지만 그 APK의 대폭 용량 감소를 약속할 수 없다.
- 발표 자료·보고서·서버 데이터는 앱 번들 포함 여부를 확인해야 한다. 저장소 파일이 크다고 휴대폰 APK에도 포함되는 것은 아니다.

## 승인 후 권장 순서

1. A군에서 승인된 ID만 작은 묶음으로 정리. 현재 변경을 기준점으로 보존하고 diff를 검토.
2. 상수 분리 후 B1의 옛 공공데이터 화면 정리. 관련 테스트 mock 경로도 조정.
3. Expo 예제 묶음 정리 → 의존성/플러그인 정리 → 네이티브 재빌드와 APK 비교. 설정 원본을 고쳐야 하며 재생성되는 Android 산출물만 고치는 방식은 피한다.
4. C군은 운영 호출·구버전 클라이언트·DB 소유자 확인 후 API 폐기 범위를 별도로 승인.
5. 성능 개선은 APK 크기, 빌드 시간, 홈 진입/지도 반응, API 요청 수를 각각 측정한 뒤 진행.

정리 후 검증은 `frontend/scripts/`의 관련 경로·방문 순서·업무 계획·장소 검색·보고서 검증 스크립트와 `backend/src/test/`의 관련 계약 테스트를 선택하고, 로그인 → 개인/그룹 → 배정/이관 → 공공데이터/지도 → 차량/도보 경로 → 현장 사진/음성 → 보고서 저장·다운로드 → 알림의 실기기 확인을 변경 범위에 맞춰 수행한다. 이번 감사에서 이 테스트들이 통과했다고 주장하지 않는다.

삭제 승인은 ID로 범위를 지정할 수 있다. 예: ‘A1~A3, A5~A10 정리’. 패키지 제거, API 폐기, DB 변경, 동작 변경은 자동으로 포함하지 않는다.
