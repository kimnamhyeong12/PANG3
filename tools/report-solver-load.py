import json, math, statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'tmp/solver-load-benchmark/results.json').read_text())
cells=d['cells']; optimum={}
for c in cells:
 if c['result']:
  for r in c['result']['rows']:
   if r['status']=='OPTIMAL':
    key=(c['n'],r['sample'])
    if key in optimum: assert optimum[key]==r['cost']
    optimum[key]=r['cost']
def p95(values):return sorted(values)[math.ceil(.95*len(values))-1]
lines=['# DP·CP-SAT·기존 TSP 휴리스틱 동시 요청 실측 (2026-10-26)', '',
'운영 코드와 배포는 변경하지 않았다. 사하구권 실제 장소 30곳의 차량 예상 이동시간을 새로 수집해 사용했다. 조회는 차량 30회(출발점별 목적지 29개)와 장소 검색 1회였으며, 아래 계산기 실행은 추가 경로 API를 호출하지 않는다.', '',
'## 조건과 해석', '',
'- Java 17, OR-Tools 9.15.6755. 같은 Java 프로세스 구성, CPU affinity 2개, JVM ActiveProcessorCount=2, 힙 상한 512MiB. 전체 프로세스 메모리 상한 512MiB라는 뜻은 아니다. 개발 PC는 논리 CPU 12개이며 실제 운영 서버 부하 시험이 아니다.',
'- 현재 출발점 고정, 방문지 전부 방문, 마지막 지점 자유, 근무지 복귀 없음. 방향별 차량 예상 시간의 합을 최소화한다. 실제 주행 실측이나 도보 시험은 아니다.',
'- 크기별 동일한 3개 조건을 모든 계산기에 사용했다. 30곳을 고정 seed로 섞고 출발점과 방문지를 선택했다. 29곳은 같은 30곳에서 출발점을 달리한 조건이며, 서로 다른 3개 지역 표본은 아니다.',
'- 기존 휴리스틱과 DP는 VisitOrderService의 solve/cost 코드를 추출하고 DP 분기 기준만 각각 0/29로 바꿨다. 기존 앱은 12곳 이하에서 이미 DP를 사용한다. 아래 휴리스틱 8/12곳은 해당 방식을 강제로 적용한 비교다.',
'- CP-SAT는 모든 지점을 포함하는 방향성 circuit 모델에서 출발점으로 돌아오는 마지막 간선 비용을 0으로 둬 열린 경로를 표현했다. 최근접 초기해, worker 1개, 탐색 제한 0.5초. 모델 구성까지 지연에 포함했다. 29곳 기준 검증에는 별도로 10초 제한도 실행했다.',
'- TSP는 문제 이름이다. 여기서 사용자가 말한 “그냥 TSP”는 기존 최근접 + 방향성 2-opt 휴리스틱으로 정의했다. DP와 CP-SAT 역시 같은 TSP 문제를 푼다.',
'- JVM 기동 및 작은 별도 행렬의 8회 준비 실행은 시간에서 제외했다. 각 셀은 새 JVM으로 실행해 실제 크기의 JIT/GC 영향은 포함한다. 일반 셀은 3조건×2회×동시 요청 수(단일 요청 6개, 동시 8명 48개). 소표본 P95는 장기 운영 지표로 해석하지 않는다.',
'- 시간은 요청 제출부터 결과까지(큐 대기 포함), P95는 최근접 순위 방식. 메모리는 10ms 간격으로 관측한 프로세스 전체 RSS 최고값이며 공통 JVM/OR-Tools 라이브러리도 포함한다. 아주 짧은 실행의 메모리 피크는 놓칠 수 있다. 힙 실제 최고값이나 서버 전체 메모리가 아니다.',
'- 모든 성공 결과의 방문지 누락·중복 및 합산 비용을 Python에서 다시 검증했다. OPTIMAL은 해당 고정 행렬의 최적값이 증명됐다는 뜻이며, FEASIBLE은 그 보장이 없다. 실시간 교통 변화나 도로 데이터 오차를 제거한다는 뜻도 아니다.', '',
'## 실행 결과', '', '|방문지|방법|동시 요청|동시 계산 상한|중앙 지연 ms|P95 ms|프로세스 RSS MiB|메모리 실패/요청|최적 증명/성공|', '|---:|---|---:|---:|---:|---:|---:|---:|---:|']
names={'dp':'DP','cp':'CP-SAT','cpseed':'CP-SAT + 기존 결과 보존','heuristic':'최근접+2-opt'}
for c in cells:
 if c['limit']!=.5:continue
 rows=c['result']['rows'] if c['result'] else []
 good=[r for r in rows if 'cost' in r];lat=[r['latency_ms'] for r in good]
 lines.append(f"|{c['n']}|{names[c['algorithm']]}|{c['clients']}|{c['parallelism']}|{statistics.median(lat):.2f}|{p95(lat):.2f}|{c['peak_rss']/1048576:.1f}|{len(rows)-len(good)}/{len(rows)}|{sum(r['status']=='OPTIMAL' for r in good)}/{len(good)}|" if lat else f"|{c['n']}|{names[c['algorithm']]}|{c['clients']}|{c['parallelism']}|—|—|{c['peak_rss']/1048576:.1f}|{len(rows)}/{len(rows)}|0/0|")
lines+=['','## 推薦結果の品質'.replace('推薦結果の品質','추천 결과 품질'),'', '최적값 대비 증가율은 3개 조건의 결과를 각각 비교한 범위다. 동일 조건의 반복 실행을 서로 다른 지역 표본처럼 세지 않았다.','', '|방문지|방법|최적값 대비 증가율 범위|최적 기준 확인 조건|', '|---:|---|---:|---:|']
for n in (8,12,16,20,29):
 for alg in ('heuristic','dp','cp','cpseed'):
  if alg=='cpseed' and n!=29:continue
  values=[]
  for c in cells:
   if c['n']==n and c['algorithm']==alg and c['limit']==.5 and c['result']:
    for r in c['result']['rows']:
     if 'cost' in r and (n,r['sample']) in optimum:values.append(100*(r['cost']/optimum[n,r['sample']]-1))
  span=f'{min(values):.2f}% ~ {max(values):.2f}%' if values else '성공 결과 없음 또는 최적 미확인'
  lines.append(f'|{n}|{names[alg]}|{span}|{sum((n,s) in optimum for s in range(3))}/3|')
lines+=['','## 재현 및 원본','','- 실행: `python tools/prepare-solver-load-data.py` (API 수집), `python tools/benchmark-solver-load.py` (저장 행렬만 계산), `python tools/benchmark-solver-boundary.py` (13~15곳 및 기존 결과 보존), `python tools/benchmark-solver-queue.py` (15~16곳 계산 상한), `python tools/report-solver-load.py`.', '- 원본: `tmp/solver-load-benchmark/results.json`, `matrices.json`, `car-observations.json`.', '- 도구: `tools/SolverLoadHarness.java`, `tools/benchmark-solver-load.py`. 운영 원본 SHA256: `'+d['source_sha256']+'`.', '- CP-SAT 상태 정의: https://developers.google.com/optimization/cp/cp_solver', '- TSP 설명: https://developers.google.com/optimization/routing/tsp','']
lines+=['## 적용 판단', '',
'- 이 표본과 자원 조건의 권장 분기는 DP 15곳 이하, CP-SAT 16곳 이상이다. 13~15곳을 추가 실측했으며 15곳까지 DP가 빨랐다. 8명 요청·동시 계산 2개에서도 15곳 DP 중앙 126ms/CP-SAT 176ms, 16곳 DP 206ms/CP-SAT 110ms로 전환 양상이 유지됐다. 장소나 서버에 관계없이 항상 성립하는 이론적 경계는 아니다.',
'- 두 계산기에 공통으로 동시 계산 상한 2개를 두고 나머지는 큐에 넣는 것을 제안한다. CP-SAT worker도 1개로 제한한다. 이 상한은 2 CPU 시험에 맞춘 값이며 실제 서버의 앱·AI 프로세스 여유를 보고 조정해야 한다.',
'- 최근접+2-opt는 빠른 초기 결과와 실패 시 대체 결과로 유지한다. CP-SAT는 이 결과를 초기해로 받고 종료 시 둘 중 비용이 작은 유효한 경로를 반환한다. 이전 계산과 비교할 때는 동일한 현재 방문지/출발점 조건으로 비용을 다시 평가해야 한다.',
'- 29곳 CP-SAT에 0.5초만 주고 최근접 초기해만 쓰면 동시 부하에서 최적 대비 최대 24.61% 증가했다. 기존 2-opt 초기해 및 더 좋은 결과 보존을 넣은 별도 실측에서는 최대 3.29%로 줄었다. 이 상한은 이번 관측값이지 앞으로의 오차 보장이 아니다. 후자는 8명 요청·계산 상한 2개에서 중앙 1.282초, P95 2.080초, RSS 110.7MiB였다.',
'- 29곳의 기준 최적값은 별도 CP-SAT 10초 제한 실행에서 3조건 모두 OPTIMAL(9938/9769/10088초)로 확인했다. 0.5초 실행의 정확도를 최적 기준 없이 추정한 것이 아니다.',
'- DP 29곳은 현재 배열 원소 데이터만 약 174GiB가 필요해 운영 대상으로 적합하지 않다. 512MiB 힙 시험에서는 할당 초기에 실패했으므로 RSS가 낮게 보이는 것이 메모리 효율을 뜻하지 않는다.',
'- 결과 표 지연은 성공 요청만 집계했다. 특히 DP 20곳의 동시 요청 결과는 실패가 많으므로 성공 지연만 보고 운영 가능하다고 판단하면 안 된다.',
'- 순서 계산 방법을 바꿔도 같은 전체 구간 행렬을 사용하면 경로 API 호출 수는 동일하다. 호출 절감은 방향별 구간 캐시, 동일 조건 요청 합치기, 묶음 조회 등 데이터 수집 계층에서 별도로 구현해야 한다.',
'- 도보는 이번 부하 시험에 포함하지 않았다. DP 메모리 증가 구조는 같지만 도보 행렬에서 CP-SAT 탐색 난도와 해 품질도 같다고 단정할 수 없다. 실제 운영 서버와 도보 표본을 확인한 뒤 분기 기준을 확정하는 것이 적절하다.', '']
(ROOT/'docs/research/SOLVER_LOAD_BENCHMARK_2026-10-26.md').write_text('\n'.join(lines),encoding='utf-8')
print('REPORT_WRITTEN',len(cells),'cells; certified optima',len(optimum))
