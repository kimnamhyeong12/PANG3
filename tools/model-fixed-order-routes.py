"""Price model for fixed-order route drawing. No live provider requests."""
import json
import math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
previous=json.loads((ROOT/'tmp/route-comparison/subscription-economics.json').read_text())
rows=[]
for n in (5,10,20):
 for mode in ('car','walk'):
  old=next(c for c in previous['cases'] if c['visits']==n and c['mode']==mode)
  calls=1 if mode=='car' else math.ceil(n/6)
  cost=(8 if n<=6 else 16) if mode=='car' else calls*10
  rows.append(dict(visits=n,mode=mode,fixed_order_calls=calls,fixed_order_won=cost,reused_auto_order_only_calls=old['proposed_calls'],reused_auto_order_only_won=old['proposed_daily_won'],reused_auto_with_separate_path_calls=old['proposed_calls']+calls,reused_auto_with_separate_path_won=old['proposed_daily_won']+cost,current_order_with_separate_path_calls=old['current_calls']+calls,current_order_with_separate_path_won=old['current_daily_won']+cost,fixed_order_monthly_per_user=cost*22,fixed_order_monthly_800k=cost*22*800000,append_only_calls=n,append_only_won=n*(8 if mode=='car' else 10)))
(ROOT/'tmp/route-comparison/fixed-order-route-economics.json').write_text(json.dumps(rows,indent=2))
lines=['# 登録順'.replace('登録順','등록 순서')+' 전체 경로와 자동추천 비용 비교 (2026-10-26)','',
'실호출 없이 공식 API 제약과 기존 구간 재사용 모델로 계산했다. 현재 앱에 이 전체 경로 표시가 이미 구현돼 있다는 뜻은 아니다.','',
'## 비교 조건','',
'- 현재 위치에서 출발해 등록한 순서로 모든 방문지를 연결한다. 복귀 없음, 빈 캐시, 실패/재시도 없음, 등록 완료 후 전체 경로를 한 번 조회한다. API 일일 무료 제공량 초과분 공개 단가이며 대량 계약 견적이 아니다.',
'- 차량 5곳: 출발지 현재 위치, 목적지 5번, 경유지 1~4번으로 일반 자동차 길찾기 1회(8원). 10/20곳: 다중 경유지 1회(16원), 경유지는 각각 9/19개다. 최적 방문 순서 계산은 하지 않는다.',
'- 도보: 현재 위치→1→…→N의 N개 구간을 최대 6구간씩 나누므로 ceil(N/6)회다. 구간 경계의 마지막 도착지를 다음 요청의 출발지로 사용하고 결과 경로를 연결한다. 도보 한 요청은 10원이다. 실제 도보 연결 실패가 있으면 늘어난다.',
'- 비교 대상 자동추천은 등록 때마다 재추천하되 기존 이동시간을 보존하고 차량 행/열 조회 및 도보 묶음 조회를 적용한 설계안이다. 차량 다중 출발지 초과 단가 미공개로 20원이라고 가정한 종전 모델을 유지했다. 자동추천 10/20곳 도보의 현재 코드 기준은 일부 구간 조회라 새 전체 행렬 수집과 정보량도 다르다.',
'- 같은 화면 결과로 비교하기 위해 자동추천 쪽에도 최종 순서의 전체 경로 조회를 1세트 별도로 더했다. 추천 캐시에 시간만 저장하는 모델이다. 도보 수집 응답의 경로 좌표까지 적절히 재사용하면 이 별도 조회는 줄어들 수 있으므로 반드시 발생하는 최소 호출은 아니다.',
'- 길안내 시작/재탐색 SDK, 지도 표시, 검색, 사진·AI·서버 비용과 위치 이동에 따른 추천 재계산은 별도다.','',
'## 1회 등록 세트 비교','',
'|모드|방문지|등록 순서 전체 경로|재사용 자동추천 순서만|재사용 자동추천+전체 경로 별도|현재 추천 로직+전체 경로 별도|',
'|---|---:|---:|---:|---:|---:|']
for r in rows:
 lines.append(f"|{'차량' if r['mode']=='car' else '도보'}|{r['visits']}|{r['fixed_order_calls']}회 / {r['fixed_order_won']}원|{r['reused_auto_order_only_calls']}회 / {r['reused_auto_order_only_won']}원|{r['reused_auto_with_separate_path_calls']}회 / {r['reused_auto_with_separate_path_won']}원|{r['current_order_with_separate_path_calls']}회 / {r['current_order_with_separate_path_won']}원|")
lines+=['','## 월 22일, 하루 등록 후 경로 1회','', '|모드|방문지|기본 1인 원/월|기본 80만 명 억원/월|재사용 자동추천+전체경로 1인 원/월|','|---|---:|---:|---:|---:|']
for r in rows:lines.append(f"|{'차량' if r['mode']=='car' else '도보'}|{r['visits']}|{r['fixed_order_monthly_per_user']:,}|{r['fixed_order_monthly_800k']/1e8:.3f}|{r['reused_auto_with_separate_path_won']*22:,}|")
lines+=['','## 등록할 때마다 경로를 바로 표시한다면','',
'매번 전체를 새로 받지 않고 마지막 추가 구간의 경로를 별도로 조회해 기존 선에 이어 붙이는 설계를 사용하면, 현재 위치 고정·추가만 하는 경우 N개 등록에 N개 단일구간 요청이다. 차량 5/10/20곳 5/10/20회 및 40/80/160원, 도보 5/10/20회 및 50/100/200원이다. 등록 완료 뒤 한 번 조회하는 앞 표와 다르다.',
'기존 구간의 요청 응답 및 좌표를 유지해야 이 계산이 성립한다. 경유 통과 형태와 방문지별 도착·재출발 형태가 같은 경로를 보장하는 것은 아니며 연결점을 검증해야 한다. 중간 삽입/삭제/순서 변경은 영향을 받는 구간을 갱신한다. 전체를 n번 새로 조회하는 구현은 이보다 비효율적이다.','',
'## 판단','',
'기본 버전이 등록 순서의 전체 경로 표시라면 여러 방향을 비교하는 추천용 이동시간 행렬을 만들 필요가 없어 큰 폭으로 저렴해진다. 반면 방문 순서가 비효율적이면 사용자가 실제 이동에서 더 오래 걸릴 수 있다. 기본 전체 경로와 유료 순서 추천을 구분하는 상품 구조는 검토할 가치가 있지만 실제 안내·다른 운영비는 따로 예산을 잡아야 한다.','',
'근거: [차량 장소 제한과 제공 정보](https://developers.kakaomobility.com/guide/navi-api/start), [차량 가격](https://developers.kakaomobility.com/price/), [도보 경유지 및 응답](https://developers.kakao.com/docs/ko/kakaomap/rest-api), [도보 가격](https://developers.kakao.com/docs/ko/getting-started/quota).','']
(ROOT/'docs/research/FIXED_ORDER_ROUTE_COST_2026-10-26.md').write_text('\n'.join(lines),encoding='utf-8')
assert [(r['fixed_order_calls'],r['fixed_order_won']) for r in rows if r['mode']=='car']==[(1,8),(1,16),(1,16)]
assert [(r['fixed_order_calls'],r['fixed_order_won']) for r in rows if r['mode']=='walk']==[(1,10),(2,20),(4,40)]
print(json.dumps(rows,indent=2))
