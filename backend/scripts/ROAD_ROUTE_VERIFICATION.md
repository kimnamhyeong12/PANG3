# 차량 경로 비교 검증

2026-10-13: 앱 내부 지도와 안내 UI를 유지한 상태에서 `RouteService`를 개선했다.

- 차량 목적지는 원래 방문지 좌표를 먼저 사용한다. 경로가 없거나 실제 도착점이 자료상의 출입구에서 50m 이상 떨어지면 출입구 경로를 시도한다. 출입구 경로가 연결되지 않으면 기존 도로 경로를 유지하며 `entranceMatched=false`로 표시한다. 건물 중심과 출입구 사이의 벡터를 연장해 만든 가상 접근 지점은 사용하지 않는다.
- 같은 출발·도착 좌표로 카카오 공식 `RECOMMEND`, `TIME`, `DISTANCE`를 비교한다. 추천 경로보다 거리·시간 중 하나 이상이 개선되고, 나머지와 통행료가 증가하지 않는 후보만 대체한다. 통행료를 알 수 없는 비교 후보는 자동 선택하지 않는다.
- 각 구간 응답의 `routePriority`, `routeDiagnostics`에 선택 옵션, 실제 요청 좌표, 목적지 좌표 출처, 비교 후보의 거리·시간·통행료를 제공한다. API 키와 제공자의 오류 본문은 포함하지 않는다.
- 다음 차량 구간은 앞 구간의 실제 도로 도착 좌표에서 시작한다. 도로 끝과 방문지 핀 사이의 연결선은 차량 경로의 거리·시간에 합산하지 않는다. 연결선은 실제 보행 길찾기 결과가 아니다.

## 실제 API 결과

출발: 카카오 장소 검색의 주례동일1차아파트 `128.99917820891798,35.153863853563315`.
도착: 백양낙조전망대작은도서관 `128.997466947464,35.1538830767717`.

| 옵션 | 거리 | 시간 | 통행료 |
| --- | ---: | ---: | ---: |
| RECOMMEND | 1,849m | 330초 | 0원 |
| TIME | 1,360m | 234초 | 0원 |
| DISTANCE | 1,360m | 234초 | 0원 |

수정된 서비스가 TIME을 선택하고 실제 경로 좌표 51개를 반환하는 것을 확인했다. 실제 부산 출입구 자료도 로드한 상태에서 목적지 출처는 `original`이었다.
촬영 당시 GPS는 확보하지 못했다. 위 출발지는 주소의 대표 장소 좌표로, 카카오맵 사진의 1.1km·3분을 동일 조건으로 재현한 결과는 아니다. 교통 상황에 따라 시간과 경로가 달라질 수 있다.

## 재검증 (PowerShell, backend 폴더)

```powershell
mvn test-compile dependency:build-classpath '-Dmdep.outputFile=target/road-classpath.txt'
$routeClasspath = (Get-Content target/road-classpath.txt -Raw).Trim()
java -ea -cp ("target/classes;target/test-classes;" + $routeClasspath) com.fieldwork.service.KakaoRoadContractTest
java -ea -cp ("target/classes;target/test-classes;" + $routeClasspath) com.fieldwork.service.BusanEntranceServiceTest
# 실제 API 검증은 KAKAO_REST_API_KEY 환경변수를 안전하게 설정한 상태에서 실행한다.
java -ea -cp ("target/classes;target/test-classes;" + $routeClasspath) com.fieldwork.service.KakaoRoadContractTest --live
```

단독 main 테스트이므로 `mvn test`만으로 위 계약 검증이 실행되지는 않는다.
이번 변경은 구간당 최대 3회의 API 요청을 사용한다(원래 좌표에서 경로가 전혀 없을 때 출입구 재시도로 최대 6회). 인증·통신 오류로 출입구를 재시도하지 않는다. 비교 중 선택 가능한 경로가 이미 있으면 추가 후보 요청 실패 시 그 경로를 유지한다.
서버 재시작 또는 배포 후 기존에 저장된 경로는 다시 계산해야 변경 결과를 확인할 수 있다.

## 2026-10-14 다선초 출입구 회귀 검증

주례동의 위 출발지에서 다선초 검색 좌표 `128.985493965177,35.0636823232284`까지 RECOMMEND로 실제 호출했다. 출입구 `128.98499390998413,35.06305264711054`로 재탐색해 실제 도착점 `128.98491053459378,35.063044271008266`(출입구에서 약 8m)을 확인했다. 사용자 현재 GPS에서의 실주행 검증은 아니다.

구간의 `navigationDestination`은 실제 차량 도로 도착점이다. 앱은 안내 시작 및 복원 시 이 좌표를 SDK에 넘긴다. 해당 필드가 없는 과거 저장 경로는 재계산한다. `entranceMatched`는 자료상의 출입구와 50m 이내라는 뜻이며 차량 진입 가능 여부를 보증하지 않는다. 서버에도 부산 출입구 데이터 파일이 필요하다.

## 차량 안내의 자동 경로 비교 복원

앱은 차량 구간 요청에서 RECOMMEND를 강제하지 않는다. 서버가 세 옵션을 비교하고 거리·시간·통행료를 악화시키지 않는 개선 후보를 선택한다. `routeCompared=true`를 반환하며, SDK에도 선택한 `routePriority`(RECOMMEND/TIME/DISTANCE)를 전달한다. 과거 추천 전용 세션은 다시 계산한 뒤 안내를 복원한다. 출입구 보정은 유지한다.

주례동일1차아파트의 위 고정 좌표에서 도서관으로 실제 재검증: 추천 1,849m/361초, TIME 및 DISTANCE 1,360m/234초, 모두 통행료 0원. TIME을 선택했다. 자료상의 출입구로 연결되는 경로는 확인되지 않아 `entranceMatched=false`이며 원래 좌표의 도로 경로를 유지했다. 다선초는 비교 후에도 자료상의 출입구 약 8m 앞 도착을 유지했다.

SDK는 전달된 도착점과 기준으로 다시 계산하므로 REST 미리보기와 경로 전체가 완전히 동일하다고 보장하지 않는다. 촬영 당시 GPS에서 카카오맵의 1.1km를 재현한 검증도 아니다. Android 네이티브 모듈이 바뀌므로 앱 재빌드가 필요하다.
