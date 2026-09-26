# ORS → Kakao 도보 경로 전환

롤백된 `tmap` 브랜치에서 도보 provider만 변경했다. 지도는 Kakao Map, 차량 경로는 기존 Kakao Mobility 구현 그대로다. commit/push/merge는 하지 않았다.

## 변경 파일과 이유

| 파일 | 변경 |
| --- | --- |
| PLAN.md | 실제 ORS 사용처, 데이터 흐름, 수정 범위, 검증·롤백 보완 |
| backend/src/main/java/com/fieldwork/service/KakaoWalkingClient.java | 공식 도보 GET 요청, BROAD_FIRST, WGS84 변환, status·오류·시간 제한 처리 |
| backend/src/main/java/com/fieldwork/service/RouteService.java | 최적화/단일구간의 walk 분기만 새 provider로 연결; 방문지별 구간과 기존 응답 계약 유지 |
| backend/src/main/java/com/fieldwork/controller/RouteController.java | 도보 키를 선택적 헤더로 받아 전달; 기존 서버 설정 사용 호환성 유지 |
| frontend/screens/MapScreen.js | 세 route 요청에 도보일 때만 .env REST 키 헤더 추가 |
| backend/src/test/java/com/fieldwork/service/KakaoWalkingContractTest.java | 요청·응답·오류·다중 구간·메타데이터 계약 시험 |
| frontend/scripts/kakao-walk-validate.cjs | 비밀값을 출력하지 않는 실제 API/Android 검증 |
| KAKAO_WALK_MIGRATION_REPORT.md | 검증 결과와 실기기 확인 항목 |

지도 컴포넌트, 차량 경로 메서드, 기존 방문지 순서 계산, UI/업무 상태/보고서/DB/패키지·SDK·Gradle 버전은 수정하지 않았다. 기존 미추적 google-services.json은 그대로 두었다. ORS 메서드와 설정은 실기기 검증 전 복구용으로 보존했으며 활성 도보 호출은 Kakao다.

## 데이터와 키 처리

MapScreen → 기존 `/api/routes/optimize` 또는 `/segment` → RouteService → Kakao 도보 API → 기존 path/segments/거리/시간 → 기존 Kakao Polyline 흐름이다. 차량 요청과 프런트엔드 업무 로직은 그대로다.

`EXPO_PUBLIC_KAKAO_REST_API_KEY`를 도보 요청의 `X-Kakao-Walk-Key` 헤더로 서버에 전달한다. 서버는 `Authorization: KakaoAK …`로 공식 API를 호출한다. 키는 코드·본문·URL·로그·문서에 기록하지 않는다. 기존 클라이언트가 헤더를 보내지 않으면 기존 서버 Kakao 설정을 사용한다. 실행하려면 수정된 백엔드도 재시작/배포해야 한다. 원격 서버 배포는 이번 작업에서 수행하지 않았다.

`route.legs[].steps[].path.points`의 [경도,위도]를 [{latitude,longitude}]로 변환하고 연속 중복만 제거한다. `totalDistance`는 미터, `totalTime`은 초 단위의 기존 `totalDuration`으로 연결한다. 별도 직선이나 목적지 보정 좌표를 추가하지 않는다. 방문지별 두 점 구간 요청을 유지하므로 새 경유지 제한을 업무 흐름에 도입하지 않는다.

SAME_POINT는 0 거리/시간으로 처리하고 나머지 공급자 실패 status, 잘못된 응답, 네트워크·권한 오류는 안전한 502 응답으로 기존 화면 오류 흐름에 전달한다. 실패한 구간을 건너뛰어 부분 경로를 성공 처리하지 않는다. 원본 공급자 응답과 예외는 노출하지 않는다. 탐색 옵션은 KakaoWalkingClient.ROUTE_MODE 한 곳에서 변경할 수 있다.

## 검증 결과

- 백엔드 Maven package: 성공. 테스트 라이브러리/의존성 버전을 변경하지 않았다.
- 별도 실행 계약 테스트(`java -ea … KakaoWalkingContractTest`): 요청 좌표·인증·탐색 옵션, 응답 정규화, 거리/시간, status, 안전한 오류, 동일 지점, 다중 방문지, 업무/담당자 메타데이터 통과. Maven의 기본 test 실행으로 수행됐다는 의미는 아니다.
- 실제 REST 키로 공식 예제 좌표 요청: HTTP 200 / OK, 좌표 118점, 거리 4,163m, 시간 4,012초.
- 프런트엔드 48개 JS/TS 구문 검사 통과. 차량 메서드와 방문지 순서 계산의 원본 일치 및 지도 파일 변경 없음 확인.
- Android assembleDebug: BUILD SUCCESSFUL in 1m 49s, 818 tasks (97 실행). Debug APK 생성. 개발 클라이언트이므로 Metro 연결이 필요하다.
- Android JS/Hermes 최종 결과는 PLAN.md 실행 기록과 `outputs/kakao-walk/bundle.log` 참조.
- 수정 소스/PLAN/검증 로그에서 실제 환경변수 비밀값 없음 확인. git diff --check 통과(줄바꿈 경고만 존재).

실제 REST 응답과 자동 계약 검증을 Android 지도 표시 및 현장 경로 정확도 확인으로 간주하지 않았다.

## 실기기 확인 필요

1. 기존 ORS 문제 초등학교에서 담장 통과 여부, 실제 보행로, 출입구 방향, 목적지 부근 비정상 직선, KakaoMap 앱 도보 경로와의 차이를 확인한다.
2. 실제 GPS로 도보 Polyline 표시, 거리/시간, 여러 방문지 안내/재탐색과 차량↔도보 전환을 확인한다.
3. Marker/Polygon, 그룹·개인 업무, 담당자·완료 상태, 보고서 흐름에 회귀가 없는지 확인한다.
4. 실제 기기의 네트워크 끊김/권한·쿼터 오류에서 기존 오류 안내와 재시도 흐름을 확인한다.

STOP 1·2는 코드 불변 검사, 3은 도보 분기/API 검사, 6은 Android 빌드, 7은 위 목록으로 확인했다. STOP 4·5의 실제 Android 화면/업무 동작은 미검증이다. 실제 GPS와 학교 경로가 정상이라는 주장은 하지 않는다.

공식 근거: [Kakao 도보 REST API](https://developers.kakao.com/docs/ko/kakaomap/rest-api).

최종 Android JS/Hermes 검증: BUILD SUCCESSFUL in 1m24s, 837 modules, 33 tasks. 릴리스 서명 APK 생성은 수행하지 않았다.
