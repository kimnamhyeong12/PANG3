# 차량 경로 비교 검증

2026-10-13: 앱 내부 지도와 안내 UI를 유지한 상태에서 `RouteService`를 개선했다.

- 차량 목적지는 원래 방문지 좌표를 먼저 사용한다. 원래 좌표에서 세 옵션 모두 경로를 찾지 못할 때만 실제 출입구를 시도한다. 건물 중심과 출입구 사이의 벡터를 연장해 만든 가상 접근 지점은 사용하지 않는다.
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
