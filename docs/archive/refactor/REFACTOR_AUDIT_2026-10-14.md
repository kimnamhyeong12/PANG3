# PANG3 외근도우미 정리 후보 재검증 — 2026-10-14

> 보관 문서: 작성 당시의 조사·변경 기록입니다. 현재 구현·검증 상태는 [문서 목차](../../README.md)에서 관련 문서를 확인하세요. 아래 작업 지시는 이 기록을 열었다는 이유로 실행하지 않습니다.

> 후속 승인에 따른 B1/B2/B3 및 C1/C2/C3 코드 정리 결과는 [추가 정리 완료 보고서](REFACTOR_CLEANUP_2026-10-14.md)를 확인한다. 아래 내용은 감사와 A군 실행 시점의 기록이다.

## 결론

어제 발견한 미사용 화면·함수는 최신 코드에서도 대부분 남아 있다. 새로 추가된 업로드 백업 파일과 카카오 안내 코드의 잔재를 추가 후보로 확인했다. 반면 엑셀·CSV 일괄 등록, 보고서 파일 처리, SDK 미리보기·안내 연결, 경로 진행 계산과 네이티브 알림은 실제 호출 경로가 있으므로 유지 대상이다.

아래 감사 내용은 코드 변경 전 분석 기록이다. 이후 사용자 승인으로 **A1~A11 정리를 완료**했으며 실행 결과는 다음 절에 기록한다. B/C/N 후보는 이번 변경에 포함하지 않았다.

## 승인된 A1~A11 실행 결과

- 사용자 요청: ‘N은 작업하지 말고 A만 다 작업’.
- A1~A3: MainScreen.js, PublicDataAssignmentScreen.js, data/mockData.js 삭제.
- A4~A8: openTeamMap, handleFieldAction, BarRow, MapScreen의 getStatusLabel, ReportListScreen의 isPersonalGroup, WorkStatusScreen의 shortAreaName 삭제.
- A9~A10: getOrsWalkingPath, isLocalPath 삭제. ORS 메서드에서만 사용하던 Arrays import도 제거. ORS 설정 필드·공유 경로 헬퍼·API는 유지.
- A11: ui.js의 radius, FieldActionScreen의 TextInput·PHOTO_TYPES import 이름만 제거. 실제 상수 정의와 사진·보고서 기능은 유지.
- 소스 13개 파일에 걸친 정리이며, 기존 지도 색상 변경을 제외한 순감소는 약 500줄이다. DB·패키지·네이티브 설정은 변경하지 않았다.
- N1 백업 파일과 N2/N3 대상 Kotlin 파일은 작업 전후 SHA-256이 동일하다. 기존 KakaoMapWebView의 빨간 도착점·pointer-events 수정도 보존했다.

삭제 후 검증:

1. 프론트 기존 검증 스크립트 12개 전부 통과: current-district-search, place-screen, place-search, report-upload, report-ux, route-notification, route-progress, route-session, route-viewport, single-place-map, visit-order, work-plan.
2. Maven offline test-compile/classpath 생성 성공. Maven이 up-to-date로 판단했으므로 그 결과에만 의존하지 않고 **전체 Java main/test 소스를 javac로 별도 새 출력 폴더에 컴파일**하여 성공 확인.
3. 새로 컴파일한 클래스에서 assertions를 켜고 KakaoRoadContractTest, KakaoWalkingContractTest, TaskProgressContractTest, WorkplaceContractTest, BusanEntranceServiceTest 5개 실행, 모두 종료 코드 0. 실운영 API 요청 없이 실행했다.
4. javap로 새 클래스의 ORS/isLocalPath 메서드 제거와 현재 카카오 도보/파싱 메서드 유지 확인.
5. Expo Android export 성공: AppEntry 952개 모듈과 Hermes bytecode 생성. 처음 시도는 sandbox 임시 경로 쓰기 권한 때문에 실패했으며 프로젝트 내부 target/refactor-temp로 임시 경로를 변경해 성공. 앱 설정은 바꾸지 않았다.
6. git diff --check 통과. 생성된 클래스·번들은 기존 무시 경로 backend/target 아래에만 보관했다.

APK/AAB 전체 네이티브 빌드, 설치·실기기 조작과 운영 DB 검증은 수행하지 않았다. Android export는 JS/Hermes 번들 검증이며 APK 용량 감소 측정값이 아니다. 아래 후보 표의 줄 번호는 삭제 전 감사 시점의 기록이다.

## 기준과 검증 방법

- 현재 HEAD: `615378a` — 경로 미리보기를 지도 가시 영역에 맞추는 수정.
- 이전 감사 기준 `239d4eb` 이후 변경과 현재 작업 파일을 함께 확인했다.
- 시작 시 미커밋 변경: `frontend/components/KakaoMapWebView.js`의 도착점 색상 및 pointer-events 변경. 그대로 보존했으며 분석·관련 테스트에 포함했다.
- Git 추적 모바일 JS/TS/CJS 소스는 74개에서 84개로 증가했다. App.js에서 정적 import로 연결되는 파일은 42개에서 46개로 증가했다. 신규 연결은 BulkUploadModal, bulkUpload, reportAvailability, routeProgress다. 테스트·예제도 전체 소스 수에 들어가므로 증가분 전부를 앱 무게 증가로 해석하지 않는다.
- 상대경로·별칭 import 그래프, 실제 렌더링 분기, JS/네이티브 연결, Java 호출과 애너테이션을 확인했다. TypeScript의 noEmit/checkJs/noUnusedLocals 진단도 다시 실행했다.
- 동적 등록·플랫폼 변형·외부 클라이언트 사용을 정적 검색만으로 완전히 증명할 수는 없다. 운영 로그·DB·실기기 성능·새 release 빌드는 확인하지 않았다.

## 새로 확인한 정리 후보

| ID | 후보 | 근거와 대체 구현 | 판단 및 삭제 후 검증 |
|---|---|---|---|
| N1 | `frontend/components/BulkUploadModal_backup.jsx` — 1,060줄 | 모바일·웹 소스와 테스트에 파일 참조 없음. App.js의 지도 → `MapScreen.js:38,2091`은 **BulkUploadModal.jsx**를 import/렌더링한다. 현재 파일은 실제 서버 등록 처리와 상세 입력을 포함한다. | 낮은 위험의 파일 정리 후보. 현재 업로드 화면, utils/bulkUpload 및 관련 패키지는 유지. 삭제 후 CSV/XLSX 선택·변환·등록·실패 내보내기 확인. |
| N2 | `KakaoNavigationView.kt:54`의 private `requestId`와 `:73,:136`의 증가문 | 현재 파일에서 선언과 `++` 두 곳만 존재한다. 값을 비교하는 비동기 콜백이나 분기 없음. 예전 요청 관리의 잔재로 보인다. | 낮은 위험 후보. 선언과 증가문만 한 묶음으로 정리 후 차량 안내 시작·종료·재진입 검증. **MapScreen.js의 동명 requestId는 실제 비교에 쓰므로 삭제 금지.** |
| N3 | 같은 Kotlin 파일의 `KNLanguageType`, `WGS84ToKATEC`, `KNPOI`, `roundToInt` import | 각각 현재 파일에서 import 외 참조 없음. 초기화·좌표 변환은 별도 KakaoRouteEngine에서 실제 사용한다. | 낮은 위험의 import 정리 후보. 다른 파일의 동명 import는 유지. Kotlin 컴파일 확인. |

N2/N3는 소스의 직접 참조를 확인한 결과다. Kotlin 컴파일러·lint를 이번에 새로 실행한 결과는 아니다. SDK delegate의 override 함수는 몸체가 짧거나 Unit이어도 자동 콜백 계약이므로 삭제 후보로 취급하지 않는다.

## 기존 A군 후보의 최신 상태

이전 ID를 유지했다. 아래 줄 번호는 현재 파일 기준이다.

| ID | 현재 위치/후보 | 재검증 결과 |
|---|---|---|
| A1 | `screens/MainScreen.js:19` | import하는 곳 없음. 현재 홈은 `App.js:969`의 DashboardScreen. 삭제 후보 유지. |
| A2 | `screens/PublicDataAssignmentScreen.js:18` | import하는 곳 없음. `App.js:1089`의 실제 publicDataAssignment 분기는 MapScreen. 파일만 후보이며 분기 자체는 유지. |
| A3 | `data/mockData.js` | 현재 앱·웹 소스의 import 없음. 삭제 후보 유지. |
| A4 | `App.js:910` openTeamMap | TypeScript 미사용 진단 재현. 팀 지도 기능 전체와 분리하여 함수만 후보. |
| A5 | `components/KakaoMapWebView.js:3089` handleFieldAction | 미커밋 지도 변경을 포함한 소스에서 TypeScript 미사용 진단 재현. 함수만 후보. |
| A6 | `screens/DashboardScreen.js:1827` BarRow | TypeScript 미사용 진단 재현. 해당 컴포넌트만 후보. |
| A7 | `screens/MapScreen.js:92` getStatusLabel | TypeScript 미사용 진단 재현. 다른 파일의 동명 함수는 별도 사용 중. |
| A8 | `ReportListScreen.js:47` isPersonalGroup, `WorkStatusScreen.js:47` shortAreaName | 두 미사용 진단 재현. 지역 함수만 후보. |
| A9 | `backend/src/main/java/com/fieldwork/service/RouteService.java:396` getOrsWalkingPath | private 선언 외 참조 없음. 현재 walk 분기는 getKakaoWalkingPath. 삭제 후보 유지. |
| A10 | `backend/src/main/java/com/fieldwork/service/TaskProgressService.java:317` isLocalPath | private 선언 외 참조 없음. 삭제 후보 유지. |
| A11 | `components/ui.js:4` radius, `FieldActionScreen.js:10` TextInput 및 `:20` PHOTO_TYPES import | TypeScript 미사용 진단 재현. 해당 import 이름만 후보. |

기존 B군도 유지된다:

- PublicDataMapMode의 옛 default 화면은 렌더링하지 않지만 BUSAN_DISTRICT_CODES는 MapScreen·WorkStatusScreen에서 사용한다. 상수 분리 후 옛 화면 정리. 파일 통째 삭제 금지.
- Expo app/ 기본 예제와 전용 컴포넌트·hooks는 App.js 그래프와 여전히 분리되어 있다. router plugin은 설정에 남아 있으므로 패키지까지 정리하려면 지원 플랫폼 진입점과 plugin을 함께 검증해야 한다.
- reanimated/haptics/web-browser는 기본 예제 연결 및 네이티브·전이 의존성을 확인한 뒤 판단하는 후보다. 이번 신규 기능에 쓰는 패키지까지 확대 삭제하면 안 된다.
- `MapScreen.js:392`의 assignmentMap 결과는 미사용 진단이지만 hook initializer·의존성을 검토한 후 정리해야 한다.
- FieldActionScreen의 지역 state 값 aiRefinedContent/reportDownloadUrl 미사용 진단이 계속 있다. 같은 이름의 응답 필드와 setter·저장/다운로드 동작을 없애는 근거는 아니다.

## 신규 기능 중 유지할 연결

| 기능 | 확인한 실제 경로 | 유지 이유 |
|---|---|---|
| 엑셀·CSV 일괄 등록 | MapScreen → BulkUploadModal.jsx → submitBulkRows → `/api/locations/bulk` → BulkLocationController → BulkLocationService → TaskService | 실제 UI와 서버 등록이 연결됨. 요청은 최대 200행 단위로 전송. |
| 파일 선택·실패 행 내보내기 | BulkUploadModal의 DocumentPicker.getDocumentAsync, XLSX 읽기/쓰기, FileSystem, Sharing.shareAsync | 신규 `expo-document-picker`, `expo-sharing`, `xlsx`는 사용 중. 백업 파일을 지워도 이 패키지는 필요함. |
| 보고서 다운로드 조건 | ReportScreen, ReportListScreen, GroupReportsScreen → canDownloadReport | `utils/reportAvailability.js`는 작아도 여러 화면이 사용. |
| 보고서 파일 생성·업로드 | FieldActionScreen 저장 처리, DownloadScreen의 report/prepare 및 통합 보고서 요청 | 현장 사진·지도·텍스트 처리와 HWPX 생성 동작에 연결됨. |
| 차량 SDK 경로 | MapScreen.fetchRouteSegment의 car 분기 → previewSdkRoute → 네이티브 previewRoute → KakaoRouteEngine.preview | 현재 차량 미리보기 구현. 삭제 대상 아님. |
| 미리보기와 안내 경로 공유 | sdkPreviewId → KakaoRouteEngine.get → KakaoNavigationView.start → prepared.trip | 안내에 미리보기에서 생성한 trip을 사용. TTL/위치 이동 검사와 discard도 연결됨. |
| 진행 거리·시간 | MapScreen → remainingRouteProgress | 도보 등 경로 진행 표시에서 실제 사용. |
| 차량 교통 색상 | KakaoRouteEngine trafficSections → JS 지도 / KakaoNavigationView trafficTheme | 미리보기·안내에 사용하는 별도 렌더링 경로. 단순 중복으로 삭제하면 안 됨. |
| 앱 작업 제거 시 안내·알림 종료 | notificationService → 네이티브 모듈 → RouteGuidanceService; AndroidManifest service 등록 | Android 생명주기 콜백으로 사용. 일반 JS import 검색만으로 판단 불가. |

특히 notificationService의 Expo 알림 경로는 네이티브 알림을 사용할 수 없을 때 fallback으로 남아 있다. 네이티브 서비스가 추가됐다고 기존 알림 코드를 일괄 삭제하면 안 된다. KakaoNavigationView의 preparedTrip/released/stopping도 실제 콜백 검증에서 읽으므로 유지한다.

## API·DB 확인이 필요한 영역

### 서버 차량 경로와 optimize API

현재 모바일 차량 구간은 SDK를 사용하고 도보 구간은 `/api/routes/segment`를 호출한다. 조사한 모바일·웹 실행 소스에서 `/api/routes/optimize` 요청은 찾지 못했다. 하지만 서버 Controller는 해당 API를 공개하며 KakaoRoadContractTest·KakaoWalkingContractTest도 optimizeRoute를 호출한다. `/segment`는 여전히 차량 요청을 처리할 수 있다.

따라서 서버의 차량 REST 계산과 optimize API는 **운영 호출·구버전 호환 확인 후보(C4)**다. 바로 삭제할 수 있는 함수가 아니다. ‘모바일 차량이 SDK로 바뀌었다’는 이유로 RouteService를 통째로 삭제하거나 테스트가 호출하는 메서드를 죽은 함수라고 분류하지 않는다. API 폐기 승인 후 어떤 내부 헬퍼가 불필요해지는지 다시 분석해야 한다.

### 이전 감사의 C1~C3

- 서버 STT: 현재 앱의 `/api/speech/transcribe` 요청은 여전히 발견되지 않지만 Controller → SpeechService → Python --stt 경로는 유효하다. 외부 호출 확인 필요.
- legacy LocationService: **정확한 이름 단위 검색**에서 다른 Java 클래스의 참조 없음. 새 **BulkLocationService**는 별개이며 실제 일괄 등록에 사용한다. 부분 문자열 검색으로 둘을 혼동하면 안 된다.
- Location Entity/Repository, locations 테이블과 ORS 설정은 프레임워크 등록·운영 데이터·설정 확인 후 판단. `/api/locations`와 `/api/locations/bulk`는 실제 사용 중이므로 유지.

## 파일·용량에 대한 갱신

- 현재 추적된 `backend/ai/uploads/` JPG/PNG 31개는 합계 약 **18.87 MiB**다. SHA-256이 같은 파일 묶음 6개가 확인됐다.
- 예: 3110 작업의 map 3개와 photo0 3개, 4380 작업의 photo0 2개는 각 묶음 안에서 내용이 같다. 그러나 보고서/DB가 각각의 경로를 참조할 수 있으므로 **중복 파일이라고 삭제 승인 후보로 확정하지 않는다**. 데이터 연결과 실제 저장 경로 확인이 선행되어야 한다.
- backend Dockerfile은 backend/src와 ai의 지정 파일·templates를 복사하며 backend/ai/uploads를 직접 COPY하지 않는다. 이 파일들이 Git에 들어 있다고 곧바로 모바일 APK 포함 또는 서버 이미지 포함으로 판단하지 않는다. 저장소·전송 비용과 데이터 보관 문제를 따로 봐야 한다.

기존 로컬 산출물을 읽은 결과(단위는 MiB):

| 산출물 | 수정 시각 | 파일 크기 | 해석 |
|---|---|---:|---|
| app-release.apk | 10월 13일 00:24경 | 163.43 | 이전과 같은 옛 release. 최신 신규 기능의 크기 측정값이 아님. |
| app-debug.apk | 10월 14일 12:01경 | 134.08 | arm64 네이티브 lib 약 71.49, res 약 25.39. 현재 HEAD보다 이전이며 dev 구성. |
| app-debug-androidTest.apk | 10월 14일 12:01경 | 27.01 | 테스트용 별도 APK. 사용자 앱의 크기에 더하는 값이 아님. |

옛 release 소스맵은 현재 대응 파일 22개와 일치하고 14개와 다르다. 새 BulkUploadModal/xlsx/document-picker/sharing 소스가 아예 없는 옛 번들이므로 ‘번들에 없음 = 지금도 안 씀’ 판단에 사용할 수 없다. 새 기능 때문에 최신 release가 얼마나 커졌는지는 재빌드 후 비교해야 한다. CPU 4종과 native lib 중심이라는 이전 release 분석은 그 산출물에 대해서만 유효하다.

새 업로드 화면은 MapScreen에서 정적으로 import한다. 업로드를 열지 않아도 import 그래프에 XLSX가 연결되는 구조다. 이것은 추가 번들 비용을 측정할 대상이며 실행 속도 저하나 라이브러리 제거 필요를 증명하지 않는다. 실제 CSV/XLSX 요구를 유지한 채 최신 번들의 모듈 크기를 확인해야 한다.

## 이번에 실행한 검증

기존 스크립트 6개가 모두 종료 코드 0으로 통과했다:

- route-progress-test.cjs — 경로 투영·끝점·잘못된 GPS 처리
- route-notification-test.cjs — 네이티브 알림 사용·종료·지연 업데이트 취소
- route-viewport-test.cjs — 지도 가시 영역 여백 전달
- report-upload-test.cjs — 설치된 Expo를 통한 텍스트·사진·지도 직렬화
- single-place-map-test.cjs — SDK/도보 분기·진행·도착 처리
- place-screen-test.cjs — 화면 렌더링·검색·보고서 선택 조건

대부분 mock/소스 기반 검증이며 삭제 후 통과를 보장하지 않는다. TypeScript 미사용 진단도 전체 타입 검사 통과를 뜻하지 않는다. Kotlin/Java 재컴파일, 실제 파일 업로드·운영 API·DB·휴대폰 테스트와 release 재빌드는 하지 않았다.

## 승인 범위별 진행안

1. **낮은 위험 정리:** 기존 A1~A11 + 신규 N1~N3에서 승인한 항목만 정리. 함수 삭제와 기능 삭제를 분리.
2. **옛 공공데이터 화면:** 상수 분리·소비자/테스트 경로 갱신 후 옛 default 구현 정리.
3. **예제·의존성:** Expo 예제와 설정을 함께 검증하고 실제 쓰는 신규 파일/패키지를 보호하면서 별도 정리.
4. **API·DB·업로드 데이터:** 운영 사용과 데이터 경로 확인 후 별도 승인. 1~3번 승인에 포함하지 않음.
5. **성능·용량:** 최신 동일 조건 release를 만든 뒤 모듈/자원 크기와 빌드·실행 시간을 비교. 이번 감사 수치를 최신 release 측정값으로 대체하지 않음.

삭제 승인 예시: ‘A1~A3, A5~A10, N1~N3 정리’. 그러면 해당 후보만 변경하고 관련 테스트·빌드 결과와 diff를 다시 보고한다.
