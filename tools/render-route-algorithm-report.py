"""Render the completed offline benchmark to a reviewable Markdown report."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/route-comparison'
report=json.loads((OUT/'algorithm-benchmark.json').read_text(encoding='utf-8'))
assert len(report['results'])==4
names={
 'Nearest neighbour':'최근접 이웃',
 'Cheapest insertion':'최소 증가 삽입',
 'Regret-2 insertion':'Regret-2 삽입',
 'Multi-start relocate + directed 2-opt':'멀티스타트 + 위치 이동·방향성 2-opt',
 'OR-Tools GLS 1s':'OR-Tools GLS (1초)',
 'OR-Tools Tabu 1s':'OR-Tools Tabu (1초)',
 'OR-Tools SA 1s':'OR-Tools SA (1초)',
 'Genetic algorithm 1s':'기본 유전 알고리즘 (1초)',
 'Current solver with full matrix':'현재 계산기 + 전체 실제 시간',
 'Held-Karp exact DP':'Held–Karp 정확 DP',
 'CP-SAT exact reference':'CP-SAT (최근접 초기해)',
}

def hms(seconds):
    h,s=divmod(round(seconds),3600);mi,s=divmod(s,60)
    return f'{h}시간 {mi:02d}분 {s:02d}초' if h else f'{mi}분 {s:02d}초'

lines=['# 방문지 5곳·20곳 실제 이동시간 행렬 알고리즘 비교',
       '', '2026-10-26. 운영 코드·배포는 변경하지 않았다. 비교 도구와 임시 의존성만 추가했다.', '',
       '## 시험 조건', '',
       '- 동일한 사하구 실제 장소 집합에서 5곳/20곳을 비교했다. 5곳은 20곳의 부분집합이다. 다른 지역 여러 표본의 통계가 아니다.',
       '- 현재 위치 고정, 모든 방문지 필수, 마지막 방문지 자유, 근무지 복귀 없음, 작업시간 제외인 방향성 열린 경로 문제다.',
       '- 표의 이동시간은 카카오의 구간별 예상 시간을 합친 값이다. 실제로 운전/보행한 시간이 아니다.',
       '- 차량은 앞서 수집한 전체 행렬, 도보는 이번에 전체 400개 구간을 72개 묶음 요청으로 수집한 행렬을 사용했다.',
       '- 도보 묶음 72개는 모두 성공했다. 기존 관측이 있던 132개 방향 구간도 모두 동일했다. 앞서 말한 72회는 이제 이 표본에서 실제 검증된 수치다.',
       '- 모든 계산기가 같은 모드·크기의 동일한 전체 행렬을 사용했다. 따라서 아래 계산기마다 카카오를 다시 호출하지 않았다.',
       '- 순서 계산 1회 비교다. 등록 누적 호출 수를 비교한 결과가 아니다. API 통신 시간은 계산 시간에서 제외했다.',
       f'- OR-Tools {report["ortools_version"]}, Python 3.13, Java 17, Windows 개발 PC. Java와 Python/네이티브 구현의 실행 시간이므로 알고리즘 이론상의 속도 순위와 동일하지 않다.',
       '- 일반 휴리스틱은 3회 실행 중앙값. 유전 알고리즘은 seed 17/18/19, 개체 80, OX 계열 교차·교환 돌연변이·엘리트 보존인 기본 구현이며 최첨단 유전 알고리즘 전체를 대표하지 않는다.',
       '- GLS/Tabu/SA는 동일한 최근접 초기해에서 각 1초 제한. 유전 알고리즘도 약 1초. 지정 시간 전체를 사용하는 전략을 작은 문제에서 느리다고 단정하지 않는다.',
       '- DP는 Java 소스의 동일한 재귀식으로 5곳 15회, 20곳 3회 측정했다. JVM 기동은 제외하고 DP 배열 할당/계산은 포함했다. 20곳 DP에는 최대 1GB heap을 허용했으며 그 전체를 실제 사용했다는 뜻은 아니다.',
       '- CP-SAT는 다른 계산기의 최적 순서를 주지 않고 최근접 초기해만 사용했다. 각 3회, 최대 5초/30초(5곳/20곳), 4 worker를 사용했다. 모델 구성 포함, import/설치는 제외한 시간이다.',
       '- 정확 DP와 CP-SAT가 독립적으로 같은 값을 얻었고 CP-SAT의 모든 본 시험 실행이 OPTIMAL이었다. 이 자료의 정적 시간 행렬에 대해서만 최적성이 확인됐다.', '',
       '## 결과: 예상 이동시간', '', '괄호는 해당 전체 시간 행렬의 최적값보다 긴 비율이다. 낮을수록 좋다.', '']
for mode,label in [('car','차량'),('walk','도보')]:
    lines += [f'### {label}', '', '| 계산 방법 | 5곳 | 20곳 |', '|---|---|---|']
    cases={c['visits']:c for c in report['results'] if c['mode']==mode}
    for name,label_name in names.items():
        cells=[]
        for n in (5,20):
            row=next(r for r in cases[n]['algorithms'] if r['algorithm']==name)
            cells.append(f'{hms(row["seconds"])} (+{row["gap_pct"]:.2f}%)')
        lines.append('| '+label_name+' | '+' | '.join(cells)+' |')
    lines.append('')
lines += ['## 결과: 계산 시간 중앙값', '',
          '밀리초 단위다. 1,000ms=1초. 언어·CPU 병렬도·제한 시간 조건 차이를 함께 읽어야 한다.', '',
          '| 계산 방법 | 차량 5곳 | 도보 5곳 | 차량 20곳 | 도보 20곳 |','|---|---:|---:|---:|---:|']
for name,label in names.items():
    values=[]
    for n,mode in [(5,'car'),(5,'walk'),(20,'car'),(20,'walk')]:
        case=next(c for c in report['results'] if c['visits']==n and c['mode']==mode)
        row=next(r for r in case['algorithms'] if r['algorithm']==name)
        values.append(f'{row["runtime_ms"]:.3f}')
    lines.append('| '+label+' | '+' | '.join(values)+' |')
lines += ['', '## 현재 운영과 계산기 효과 분리', '',
          '| 모드/20곳 | 현재 운영 추천 | 같은 계산기에 전체 실제 시간 제공 | 이번 최적 기준 |', '|---|---|---|---|']
for mode,label in [('car','차량'),('walk','도보')]:
    case=next(c for c in report['results'] if c['visits']==20 and c['mode']==mode)
    current=next(r for r in case['algorithms'] if r['algorithm']=='Current solver with full matrix')
    lines.append(f'| {label} | {hms(case["current_operational_route_seconds"])} | {hms(current["seconds"])} | {hms(case["optimum_seconds"])} |')
lines += ['',
 '- 차량은 이미 전체 실제 시간 행렬을 사용했지만 기존 단일 초기해+2-opt가 이 표본의 더 좋은 순서를 놓쳤다.',
 '- 도보는 현재 운영의 일부 구간 추정 방식 영향과 계산기 영향이 모두 있었다. 전체 시간을 주는 것만으로도 크게 개선됐고, 계산기 개선으로 더 줄었다.',
 '- 도보 현재 운영 추천은 앞서 기록한 순서를 이번 전체 행렬로 다시 합산한 값이다. 이번에 운영 API를 다시 호출해 얻은 결과라고 표현하지 않는다.', '',
 '## 해석과 선정에 반영할 점', '',
 '1. 5곳은 작은 DP로 정확히 풀 수 있다. 이번 차량 표본에서는 모든 계산기가 우연히 같은 최적값에 도달했지만 최근접 방식의 일반적 정확성을 입증하지 않는다. 도보 최소 증가 삽입은 최적보다 4.72% 길었다.',
 '2. 20곳은 단일 최근접만으로 부족했다. 멀티스타트 로컬 탐색과 GLS가 양쪽 모드에서 이번 최적값에 도달했다. 이들이 모든 표본에서 정확하다는 보장은 아니다.',
 '3. 앞서 13곳 이상에 GLS를 우선하자고 한 제안은 실측 전의 선정이었다. 이번에는 CP-SAT도 약 수십 ms에 최적성까지 확인했다. CP-SAT를 오프라인 전용이라고 단정하지 않고 제한 시간/동시 부하 조건의 운영 후보로 함께 시험해야 한다.',
 '4. 20곳 정확 DP도 이 PC에서는 약 0.9초에 끝났다. 하지만 현재 2차원 DP는 수백 MB의 메모리를 요구할 수 있다. 현 서버에서 여러 사용자가 동시에 요청할 때도 적합하다고 바로 결론낼 수 없다.',
 '5. 운영 후보는 빠른 초기해/멀티스타트로 즉시 결과 확보 후, 제한 시간 CP-SAT의 OPTIMAL 여부를 확인하고, 증명을 못 끝내면 최선의 유효해를 반환하는 조합을 시험하는 것이다. GLS도 다른 표본에서 비교한다. 작은 DP는 기준/기본으로 유지한다.',
 '6. 모든 순서 계산은 같은 저장 행렬을 쓰므로 계산기를 여러 개 돌리는 것 자체에 카카오 API 호출이 추가되지는 않는다.', '',
 '## 실행하지 않은 항목', '',
 '- Dijkstra/A*: 도로 그래프 안에서 두 지점의 경로를 찾는 방법이다. 이 표의 방문 순서 계산기와 동일 문제의 비교 대상이 아니다. 독립 구현에는 도로 데이터/통행 규칙/시간 가중치가 필요하다.',
 '- LKH-3: upstream 학술·비상업 조건의 배포본을 이 앱 시험에 사용하지 않았다. 실제 실행 수치는 없다. 일반적으로 유명하다는 이유로 값을 만들어 넣지 않는다.',
 '- 신경망/강화학습: 방향성 실제 도로 시간 행렬에 맞춰 검증된 학습 모델/가중치를 준비하지 않았다. 좌표 기반 TSP 논문 수치를 이 앱 결과로 제시하지 않는다.',
 '- MIP 전체를 별도 구현하지 않았으며 CP-SAT를 정확 기준으로 실제 실행했다.', '',
 '## 자료와 출처', '',
 '- `tools/benchmark-route-solvers.py`: 알고리즘 구현과 실제 Java 계산기/정확 DP 재생.',
 '- `tools/collect-walking-benchmark-matrix.py`: 묶음 응답 수집. 이미 완료한 요청은 저장 파일로 재사용한다.',
 '- `tmp/route-comparison/algorithm-benchmark.json`: 실행별 순서·시간·구간합·상태·최적 오차.',
 '- `tmp/route-comparison/walking-full-matrix.json`: 도보 전체 400구간과 성공한 72개 묶음.',
 '- `tmp/route-comparison/observations.json`: 실제 공공 장소와 기존 차량 전체 관측값. 인증 키는 저장하지 않았다.',
 '- [OR-Tools 검색 전략](https://developers.google.com/optimization/routing/routing_options)',
 '- [CP-SAT 상태 의미](https://developers.google.com/optimization/cp/cp_solver)',
 '- [LKH-3 저자 대학 포털/이용 조건](https://forskning.ruc.dk/en/publications/an-extension-of-the-lin-kernighan-helsgaun-tsp-solver-for-constra/)',
 '- [카카오 도보 API](https://developers.kakao.com/docs/ko/kakaomap/rest-api)', '',
 '데이터 식별 해시:', '', '```text']
for filename in ['observations.json','walking-full-matrix.json','algorithm-benchmark.json']:
    lines.append(filename+' SHA256 '+hashlib.sha256((OUT/filename).read_bytes()).hexdigest())
lines += ['```','']
destination=ROOT/'docs/research/ROUTE_ALGORITHM_BENCHMARK_2026-10-26.md'
destination.write_text('\n'.join(lines),encoding='utf-8')
print(str(destination))
