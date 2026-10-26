"""Build a reviewable report from actual REST/SDK observations, no live requests."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];p=root/'tmp/rest-sdk-benchmark'
timing=json.loads((p/'timing-cost-summary.json').read_text(encoding='utf8'));comparison=json.loads((p/'comparison.json').read_text(encoding='utf8'));points=json.loads((p/'points.json').read_text(encoding='utf8'));sdk=json.loads((p/'sdk.json').read_text(encoding='utf8'))
fmt=lambda s:f'{int(s)//3600}시간 {(int(s)%3600)//60}분 {int(s)%60}초' if s>=3600 else f'{int(s)//60}분 {int(s)%60}초'
lines=['# 재사용을 유지한 REST 대 KNTrip 차량 추천 실측','', '2026-10-26. 운영 코드를 교체하지 않고 실제 REST 요청과 연결된 SM-S908N의 기존 카카오 SDK 1.12.8-hotfix02로 비교했다. 추천 버튼을 추가하거나 배포하지 않았다.','',
'## 조건과 측정 범위','',
'- 다선초·동아대 승학캠퍼스·기존 사하구 공원 표본 등 고정 20곳. 5곳과 10곳은 같은 목록의 앞부분이다. 출발 위치 고정, 복귀 없음, 차량 TIME, 기본 도착 옵션, 장소 ID 추가 없음.','- 한 곳씩 등록할 때마다 해당 단계의 미조회 구간만 확보했다. 1곳은 추천용 호출을 건너뛰고 2곳에서 처음 필요한 행렬을 확보했다. 같은 방향 구간을 재요청하지 않았다. 모든 단계가 끝날 때까지 캐시를 유지했다.','- REST는 현재 production VisitDurationMatrix/VisitDurationCache를 직접 실행했다. 동시 작업 상한 4, 25초 단계 마감, 실제 다중 목적지·다중 출발지 API를 사용했다. 모의 API가 아니다. 39회 모두 HTTP 200.','- SDK는 별도 진단 APK로 설치된 본 앱의 공개 KNSDK.makeTripWithStart 및 KNTrip.routeWithPriority를 실행했다. 단계마다 새 구간만 최초 탐색하고 결과의 시간을 저장했다. 동시 상한 4. 400개 구간 모두 성공·중복 구간 없음. 진단 APK는 제거했다.','- SDK 재사용은 비교용 프로토타입이다. 현재 서비스가 이미 SDK 행렬을 저장한다는 뜻은 아니다. 기존 업무 캐시와 같은 등록 중 재사용 조건을 맞췄으며, SDK 결과 DB 복원이나 수일 후 갱신 구현은 이번 실험 범위가 아니다.','- REST의 숫자는 실제 HTTP 요청 수이고 SDK는 실제 makeTripWithStart 최초 탐색 호출 수다. SDK 내부 인증·다운로드 등의 전체 HTTP 패킷 수를 센 것은 아니다. 카카오 계정 대시보드 차감량과 대조하지 않았으며 SDK 차감 추정은 공식 답변에 따른다.','- REST는 PC Java 클라이언트, SDK는 연결 폰이다. 각 1회 측정이며 네트워크·장치·실시간 교통 차이가 포함된다. 평균 응답시간이나 모든 이용자의 지연을 보장하는 결과가 아니다.','',
'## 요청 수와 시간','', '|등록 수|REST 실제 HTTP|SDK 추천 최초 탐색|REST 누적 대기 합|SDK 누적 대기 합|마지막 추가 REST|마지막 추가 SDK|','|---:|---:|---:|---:|---:|---:|---:|']
for r in timing:
 lines.append(f'|{r["n"]}|{r["rest_calls"]}|{r["sdk_calls"]}|{r["rest_total_ms"]/1000:.3f}초|{r["sdk_total_ms"]/1000:.3f}초|{r["rest_last_add_ms"]/1000:.3f}초 / {r["rest_last_add_calls"]}회|{r["sdk_last_add_ms"]/1000:.3f}초 / {r["sdk_last_add_calls"]}회|')
lines+=['',f'추천과 별도로 SDK 초기화 확인용 경로를 1회 조회했고 {sdk["warmup_ms"]/1000:.3f}초가 걸렸다. 따라서 이 진단 실행의 SDK 실제 누적 총합은 5/10/20곳 시점에 26/101/401회다. 위 표는 추천 부분 25/100/400회와 단계별 대기를 분리해 REST와 비교한 것이다. 최종 진단 총시간은 약 {(timing[-1]["sdk_total_ms"]+sdk["warmup_ms"])/1000:.3f}초다. 실제 제품은 경로 조회 없이 SDK를 초기화할 수 있으므로 확인용 1회는 필수 설계 비용이 아니다.','',
'누적 대기 합은 1→N곳을 차례로 등록하며 각 추천 완료를 기다린 시간의 합이며 사용자의 입력 시간은 제외한다. N번째 등록 후 새 추천을 기다리는 시간은 마지막 추가 열이다. 현재 앱은 등록 저장 자체를 이 완료까지 막지 않는다. SDK 단계 시간에는 순서 계산을 넣지 않았고 REST 단계에는 넣었다. 아래 계산 시간처럼 비용이 매우 작아 순서를 뒤집는 요인은 아니다.','',
'REST는 같은 목록 5/10/20곳을 다시 확보할 때 추가 HTTP가 모두 0회였고 각각 약 0.65/1.89/6.22ms였다. SDK는 400개 기록의 방향 키가 전부 달라 순차 등록 과정에서 이미 구한 구간은 다시 조회하지 않은 것을 확인했다.','',
'## 비용과 기본 한도','',
'공개 요금표 기준 무료 쿼터를 이미 소진한 경우의 추천 비용이다. 실제 이번 계정 청구액은 확인하지 않았으며 무료 잔량이 있으면 이 범위의 청구는 0원일 수 있다. 부가세 별도 여부는 아래 표에서 임의로 더하지 않았다.','',
'SDK 실시간 길안내 모드: 일일 제공량 100,000건, 초과분 공개 단가 1원/건. 다중 목적지 REST: 일일 제공량 1,000건, 초과분 월 300,000건 이하 구간 20원/건. 다중 출발지 REST: 일일 제공량 1,000건이나 공개 가격표에 단가가 없다. 월간 공통 무료 쿼터 3,000,000건도 공식 문서에 별도로 제시되어 있으며 계정 권한·계약 적용은 확인이 필요하다. 쿼터는 앱 기준 합산이며 사용자마다 100,000건씩 제공되는 것이 아니다.','',
'다중 출발지의 계약 단가를 P원이라고 두면:','',
'|등록 수|REST 목적지 / 출발지 요청|REST 비용|SDK 추천 비용|SDK 확인용 초기 탐색 포함|','|---:|---:|---:|---:|---:|']
for r in timing:
 lines.append(f'|{r["n"]}|{r["rest_destination_calls"]} / {r["rest_origin_calls"]}|{r["rest_price_known_won"]}+{r["rest_origin_calls"]}P원|{r["sdk_price_won"]}원|{r["sdk_price_won"]+1}원|')
lines+=['','P=20원이라고 **가정할 경우에만** REST는 180/380/780원이며 SDK 25/100/400원 대비 각각 약 86.1%/73.7%/48.7% 감소다. 출발지 20원이 공식 단가라는 뜻은 아니다. SDK는 이 단가 기준으로 요청 수가 더 많아도 추천 비용은 낮다.','',
'SDK 100,000건을 추천에만 쓴다면 하루 5곳 약 4,000회·10곳 1,000회·20곳 250회 분량이다. 확인용 초기 탐색, 다른 사용자/기능, 안내 등의 소비와 월간 공통 제공량은 이 단순 나눗셈에서 제외했다. 일일 제공량을 무제한 처리량 보장이나 초당 허용량으로 해석하면 안 된다.','',
'공식 담당자 답변은 KNTrip 최초 생성/탐색에 /route 1건, 기존 KNTrip 재사용·경로 이탈 재탐색에는 /route 추가 0건, 안내 세션 시작에는 /safety 1건이다. 이번 실험은 안내 세션을 시작하지 않았다. 시간 숫자만 저장한 뒤 새 KNTrip을 만드는 것은 기존 객체 재사용과 다르므로 실제 안내에 추가 탐색이 필요할 수 있다. 무료 초과 사용·대량 사용·SDK를 추천 행렬 확보에 사용하는 운영 형태는 제휴 시 확인해야 한다. 이번 결과로 계약 승인을 받았다는 뜻은 아니다.','',
'## 추천 순서와 동일 기준 평가','',
'두 방식 모두 현재 production VisitOrderService.solve를 그대로 사용했다. 5·10곳은 정확 DP, 20곳은 현재 최근접+방향성 전체비용 2-opt 근사 계산이다. 엔진 자체가 방문 순서를 계산한 것이 아니다.','',
'|등록 수|REST로 구한 순서를 SDK 시간으로 평가|SDK로 구한 순서를 SDK 시간으로 평가|SDK 순서의 차이|','|---:|---:|---:|---:|']
for r in comparison:
 diff=r['sdk_order_sdk_seconds']-r['rest_order_sdk_seconds']
 lines.append(f'|{r["n"]}|{fmt(r["rest_order_sdk_seconds"])}|{fmt(r["sdk_order_sdk_seconds"])}|{abs(int(diff))}초 '+('길어짐' if diff>0 else '짧아짐')+'|')
lines+=['','실제 운전 시간이 아니라 같은 SDK 구간별 예측시간을 합산한 평가다. 교문 출입 가능성을 전수 검증한 정확도 지표도 아니다. 자신의 엔진 시간이 짧다는 이유로 다른 엔진보다 정확하다고 판단하지 않았다. 20곳에서는 SDK 입력으로 얻은 근사해가 REST 순서를 같은 SDK 행렬에 대입한 값보다 94초(약 1.10%) 길었다. 더 정확한 구간 정보가 있어도 현재 근사 계산기가 더 좋은 순서를 항상 찾지는 못한다.','']
for r in comparison:
 lines += [f'### {r["n"]}곳','',f'REST 순서: '+ ' → '.join(map(str,r['rest_order'])),'',f'SDK 순서: '+ ' → '.join(map(str,r['sdk_order'])),'',f'자체 엔진 평가: REST {fmt(r["rest_order_rest_seconds"])} / SDK {fmt(r["sdk_order_sdk_seconds"])}. 이 둘은 평가 기준이 달라 우열 판단에 사용하지 않는다.',f'순수 순서 계산 단일 측정: REST 행렬 {r["rest_solve_ms"]:.3f}ms / SDK 행렬 {r["sdk_solve_ms"]:.3f}ms. 첫 Java 실행의 클래스 초기화/JIT 영향이 있어 미세 속도 비교에 사용하지 않는다.','']
lines+=['## 방문지 번호','', '|번호|방문지|','|---:|---|']
for i,pt in enumerate(points):lines.append(f'|{i}|{pt["name"]}|')
lines+=['','## 판단','',
'현재 REST 재사용은 실제로 호출을 9/19/39회로 줄였으며 속도에서도 유리했다. SDK 전체 방향 조회는 공개 단가상 저렴하고 실제 안내와 같은 엔진을 쓰지만 순차 등록 추천 대기가 특히 10·20곳에서 길었다. 따라서 이 1회 표본만으로 전면 SDK 전환을 권하지 않는다. SDK 전체 조회를 즉시 운영 반영하지 않고, 도착점 정합성 개선과 조회 속도·근사 순서 품질 개선의 효과를 분리해서 검토하는 편이 맞다.','',
'## 원자료와 재현 소스','',
'- `tmp/rest-sdk-benchmark/points.json`, `rest.json`, `sdk.json`, `comparison.json`, `timing-cost-summary.json`.','- 실제 요청/실기기 원문: `tmp/rest-sdk-benchmark/rest-run.log`, `sdk-run.txt`.','- REST 실측: `tools/RestSdkLiveBenchmark.java`. SDK 계측: `tools/sdk-matrix-probe/`.','- 분석: `tools/analyze-rest-sdk-benchmark.py`, `tools/CompareRestSdkResults.java`, `tools/report-rest-sdk-benchmark.py`.','- 장소 입력 준비: `tools/prepare-rest-sdk-benchmark.py` (로컬 검색 실호출 1회).','',
'## 공식 출처','',
'- [카카오모빌리티 가격·일일 제공량](https://developers.kakaomobility.com/price/)','- [SDK 최초 탐색·재사용·안내시작 차감 공식 답변](https://devtalk.kakao.com/t/kntrip-route/151371)','- [카카오디벨로퍼스 앱별 합산·월간/일간 쿼터](https://developers.kakao.com/docs/ko/getting-started/quota)','']
dest=root/'docs/research/REST_KNTRIP_REUSE_BENCHMARK_2026-10-26.md';dest.write_text('\n'.join(lines),encoding='utf8');print(dest)
