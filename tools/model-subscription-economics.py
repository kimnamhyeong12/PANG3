"""Scenario arithmetic only. No live routing calls or billing/account access."""
from decimal import Decimal
import importlib.util
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('costs',ROOT/'tools/estimate-recommendation-api-cost.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
U=800_000;DAYS=22;PRICES=(990,4900,9900);ORIGIN_PRICE=20
cases=[]
for n in (5,10,20):
 for mode in ('car','walk'):
  if mode=='car':
   old=n*(n+3)//2;new=2*n-1
   old_daily=old*20;new_daily=n*20+(n-1)*ORIGIN_PRICE
   extra_calls=n-1;extra_cost=extra_calls*20
   old_calls_by_type={'destinations':old};new_calls_by_type={'destinations':n,'origins':n-1}
   rates={'destinations':20,'origins':ORIGIN_PRICE}
  else:
   old=base.walk_rows[n-1]['current_calls'];new=len(base.walking_incremental(n))
   old_daily=old*10;new_daily=new*10
   extra_calls=sum(math.ceil(m/6) for m in range(1,n));extra_cost=extra_calls*10
   old_calls_by_type={'walking':old};new_calls_by_type={'walking':new};rates={'walking':10}
  def month_bill(counts,days=DAYS,users=U):return sum(max(0,users*count-1000)*rates[k]*days for k,count in counts.items())
  row=dict(visits=n,mode=mode,current_calls=old,proposed_calls=new,call_reduction_pct=(1-new/old)*100,current_daily_won=old_daily,proposed_daily_won=new_daily,current_per_user_month_won=old_daily*DAYS,proposed_per_user_month_won=new_daily*DAYS,current_month_calls=old*U*DAYS,proposed_month_calls=new*U*DAYS,current_month_bill=month_bill(old_calls_by_type),proposed_month_bill=month_bill(new_calls_by_type),current_month_gross_api=old_daily*DAYS*U,proposed_month_gross_api=new_daily*DAYS*U,extra_origin_refresh_calls=extra_calls,extra_origin_refresh_month_per_user=extra_cost*DAYS,with_origin_refresh_month_per_user=(new_daily+extra_cost)*DAYS,balances={str(p):p*U-month_bill(new_calls_by_type) for p in PRICES},max_days_before_other_costs={str(p):p/new_daily for p in PRICES},sensitivity_per_user={str(days):new_daily*days for days in (4,10,22)},assumed_rates=rates)
  cases.append(row)

# Replay the same recorded walking sample through completion, retaining its
# current cache, and keeping each completion origin exactly at its visit point.
completion=[]
for n in (5,10,20):
 provider=base.Snapshot();order=None
 for size in range(1,n+1):order=base.m.Case(provider,base.points[:size+1],'walk').baseline()
 remaining=base.points[1:n+1].copy();start=base.points[0]
 while remaining:
  case=base.m.Case(provider,[start]+remaining,'walk');order=case.baseline()
  start=remaining.pop(order[0]-1)
 completion.append(dict(visits=n,current_walk_registration_and_completion_calls=len(provider.used)))

payload=dict(paid_subscribers=U,active_days=DAYS,prices=PRICES,assumed_origin_price=ORIGIN_PRICE,free_calls_per_api_per_day=1000,cases=cases,completion_replay=completion)
(ROOT/'tmp/route-comparison/subscription-economics.json').write_text(json.dumps(payload,indent=2))
def won(v):return f'{v:,.0f}'
def eok(v):return f'{v/100_000_000:,.2f}'
def name(mode):return '차량' if mode=='car' else '도보'
lines=['# 80만 유료 구독자: 자동추천 재사용과 구독료 손익 시나리오 (2026-10-26)','',
'운영 코드를 수정하거나 API를 실호출하지 않은 비용 모델이다. 사용자 제시 80만 명을 전원 월 유료 구독자로 가정했다. 실제 공무원 수나 유료 전환 가능성을 검증한 시장 예측은 아니다.','',
'## 가정과 공식 단가의 한계','',
'- 한 사람이 하루에 새 방문지 5/10/20곳을 하나씩 등록하는 1세트를 사용한다. 기본은 월 22일. 4일/10일 민감도도 계산했다. 전원 매일 활성이라는 강한 가정이며 가입자와 실제 활성 사용자는 구분해야 한다.',
'- 등록 중 출발점 고정, 근무지 복귀 없음, 실패/재시도 없음. 수정안은 등록이 오래 걸려도 활성 목록 데이터를 유지한다. 기존 기준값은 캐시가 5분 내 유효할 때의 유리한 조건이다. 등록이 느려 기존 도보 캐시가 만료되면 현재 비용이 더 커질 수 있다.',
'- 차량은 매일 새 목록이나 새 교통 스냅샷을 수집한다고 가정한다. 도보는 매일 새로운 장소 조합으로 보수적으로 계산한다. 같은 도보 구간을 7일 동안 재사용하면 호출은 더 줄지만, 실제 중복률을 알 수 없어 절감액을 임의로 가산하지 않았다.',
'- 서로 다른 사용자 사이 구간 공유 절감은 0%로 놓았다. 차량/도보를 둘 다 매번 조회하지 않고 선택한 모드만 조회한다. 아래 모드별 표는 각각 전원이 해당 모드를 쓰는 별도 시나리오다.',
'- 공개 차량 다중 목적지 단가는 초과 요청당 20원이다. 다중 출발지 초과 단가는 공개 가격표에 없어서 **20원이라고 가정했다**. 도보는 공개 초과 요청당 10원이다.',
'- 다중 목적지 20원은 공개 월 유료 30만 건 이하 구간이다. 이 모델은 수억~수십억 요청이므로 실제로는 대량 계약/쿼터 증설이 필요하다. 아래 금액은 공개 단가를 확장한 스트레스 시나리오이며 카카오 확정 견적이나 요금 상한이 아니다.',
'- 실제 요청 한 건이 과금 한 건으로 집계된다는 전제다. 묶음 도보 계획의 실제 쿼터 차감과 실패 분할 비용은 구현 후 계정 통계로 확인해야 한다.',
'- 무료 제공량은 사용자마다가 아니라 앱 사용량 기준이다. 관련 API별 일일 1,000건을 정확 모델에서는 각각 차감했다. 80만 명 규모에서는 결과의 큰 차이를 만들지 않아 본문 요약은 무료 차감 전 반올림 금액이다. 도보 무료 제공은 첫 활성 앱 조건이 있다.',
'- 본문의 잔액은 구독 결제액에서 추천 API만 뺀 금액이다. 실제 경로 조회/길안내, 지도·검색, AI·사진·보고서, 서버·DB·캐시·트래픽, 결제/스토어 수수료, VAT·인건비·마케팅·지원비는 별도다. 영업이익으로 해석하지 않는다. API 단가의 VAT 포함 여부도 계약 시 확인해야 한다.','',
'공식 근거: [모빌리티 가격·대량 할인 문의](https://developers.kakaomobility.com/price/), [카카오 쿼터·도보 단가](https://developers.kakao.com/docs/ko/getting-started/quota).','',
'## 1. 순차 등록 1세트의 호출과 비용','',
'차량 현재 호출 N(N+3)/2, 수정안 목적지 N + 출발지 N-1. 도보 현재는 저장된 사하구 이동시간을 현재 Java 순서 계산/후보 조회 흐름으로 오프라인 재생한 값이다. 수정안 도보는 전체 N²개 방향 구간을 6개 이하씩 연결하는 검증된 배치 계획이지 전체 순차 실호출 결과는 아니다. 8곳 초과 현재 도보는 일부 후보만 조회하므로 새 전체 구간 방식과 정보량도 다르다.','',
'|모드|등록 수|현재 호출|수정 호출|호출 감소|현재 원/세트|수정 원/세트|','|---|---:|---:|---:|---:|---:|---:|']
for r in cases:lines.append(f"|{name(r['mode'])}|{r['visits']}|{r['current_calls']}|{r['proposed_calls']}|{r['call_reduction_pct']:.1f}%|{won(r['current_daily_won'])}|{won(r['proposed_daily_won'])}|")
lines+=['','## 2. 1인 월 22일 추천 API 원가','', '|모드|하루 등록 수|현재 원/월|수정 원/월|절감 원/월|','|---|---:|---:|---:|---:|']
for r in cases:lines.append(f"|{name(r['mode'])}|{r['visits']}|{won(r['current_per_user_month_won'])}|{won(r['proposed_per_user_month_won'])}|{won(r['current_per_user_month_won']-r['proposed_per_user_month_won'])}|")
lines+=['','## 3. 80만 명 월 호출 수와 원가','', '|모드|등록 수|현재 월 호출|수정 월 호출|현재 원가 억원|수정 원가 억원|절감 억원|','|---|---:|---:|---:|---:|---:|---:|']
for r in cases:lines.append(f"|{name(r['mode'])}|{r['visits']}|{won(r['current_month_calls'])}|{won(r['proposed_month_calls'])}|{eok(r['current_month_gross_api'])}|{eok(r['proposed_month_gross_api'])}|{eok(r['current_month_gross_api']-r['proposed_month_gross_api'])}|")
lines+=['','## 4. 월 구독 매출','', '|월 구독료|80만 명 월 결제액|연 결제액|','|---:|---:|---:|']
for p in PRICES:lines.append(f'|{won(p)}원|{eok(p*U)}억원|{eok(p*U*12)}억원|')
lines+=['','## 5. 수정 후 API만 차감한 월 잔액 (80만 명, 억원)','', '무료 차감 전 반올림 수치다. 잔액은 영업이익이 아니다.','', '|모드|하루 등록 수|990원|4,900원|9,900원|','|---|---:|---:|---:|---:|']
for r in cases:lines.append(f"|{name(r['mode'])}|{r['visits']}|"+'|'.join(eok(p*U-r['proposed_month_gross_api']) for p in PRICES)+'|')
lines+=['','## 6. 사용일수 민감도: 수정 후 1인 월 원가','', '|모드|등록 수|월 4일|월 10일|월 22일|','|---|---:|---:|---:|---:|']
for r in cases:lines.append(f"|{name(r['mode'])}|{r['visits']}|"+'|'.join(won(r['proposed_daily_won']*days) for days in (4,10,22))+'|')
lines+=['','전체 구독자의 월 평균 사용일수가 4일/10일이라는 뜻이다. 예를 들어 22일 쓰는 사람이 20%이고 80%는 사용하지 않으면 평균 4.4일이며, 활성 사용자 1인당 원가와 유료 구독자 1인당 평균 원가는 다르다. 5·10·20곳 분포도 아직 관측값이 없어 평균 10곳으로 확정하지 않는다.','',
'## 7. 완료 처리와 위치 이동의 추가 비용','',
'수정 후 방문지 완료 자체는 전체 행렬 재조회를 하지 않는다. 완료 장소를 다음 출발점으로 쓸 수 있으면 저장된 출발행을 재사용한다. 반면 실제 현재 위치가 달라 그 행을 새로 채워야 한다면 추가 API가 발생한다. 아래는 완료 후 N-1번 모두 새 현재 위치 행을 조회하는 별도 예산이다. 차량은 매번 다중 목적지 1회, 도보는 남은 지점 m개를 6구간 이하 요청으로 채우는 배치 계획이며 실패 시 늘어난다. 연속 GPS 이동마다 호출하는 모델은 아니다.','',
'|모드|등록 수|등록 기본 호출|출발점 갱신 추가 호출|합계 호출|등록+갱신 1인 월 원가|','|---|---:|---:|---:|---:|---:|']
for r in cases:lines.append(f"|{name(r['mode'])}|{r['visits']}|{r['proposed_calls']}|{r['extra_origin_refresh_calls']}|{r['proposed_calls']+r['extra_origin_refresh_calls']}|{won(r['with_origin_refresh_month_per_user'])}|")
lines+=['','이 표도 실제 안내 경로 상세/SDK 호출 요금은 포함하지 않는다. 현재 차량에서 목록 변경 시 매번 전체 행을 조회하고 모든 완료 위치가 정확한 방문지 좌표라면 등록+완료 호출은 N²+2N-1(5곳 34회, 10곳 119회, 20곳 439회)이다. 이는 5분 캐시 만료/추가 모드 전환을 제외한 이상적인 코드 흐름 계산이다. 현재 도보 동일 기록의 등록+완료 재생 결과는 '+', '.join(f"{r['visits']}곳 {r['current_walk_registration_and_completion_calls']}회" for r in completion)+'다. 현재 캐시가 업무 내내 유효하다고 둔 낙관적인 기준이며 실서비스 세션 실측은 아니다.','',
'## 8. 동일 장소 반복과 도보 7일 보관','',
'동일한 N곳을 같은 출발점/모드/옵션으로 다음 날 반복하고 캐시가 온전히 유지되면 도보는 7일 유효기간 동안 방문지 사이 시간을 다시 수집하지 않아도 된다. 달력상 갱신일에 따라 달라지지만, 예를 들어 월 신규 수집을 5회로 가정하면 기본 도보 1인 월 원가는 5곳 350원, 10곳 1,100원, 20곳 3,850원이다. 출발점 변경/좌표 변경/캐시 축출/안내는 별도다. 반복 장소가 아닌데 이 절감을 적용하면 안 된다. 차량은 다음 날 갱신 정책이라 이 7일 효과를 적용하지 않는다.','',
'## 9. 단가와 가격 결정','',
'- 다중 출발지 단가 P일 때 하루 등록 추천의 차량 비용은 20N+P(N-1)원이다. P를 확정하지 않으면 차량 원가도 확정할 수 없다.',
'- 차량 10곳의 출발지 단가 P가 0/10/20/30원이면 등록 추천 1인 월 원가는 4,400/6,380/8,360/10,340원이다. 무조건 20원이라고 사업 계획을 확정하면 안 된다.',
'- 차량 10곳, 월 22일, 수정 후 19회/일을 모두 같은 평균 계약단가로 환산할 때 API만으로 구독료에 맞추는 단가 상한은 990원 2.37원, 4,900원 11.72원, 9,900원 23.68원이다. 다른 원가는 아직 0원으로 둔 상한이다.',
'- VAT 10% 포함 결제액에서 별도로 수수료 15%를 공제한다고 **가정한 예산 모델**의 수취 가능액은 p/1.1×0.85로, 990/4,900/9,900원 요금에서 약 765/3,786/7,650원이다. 실제 세무/플랫폼 수수료 적용 방식과 확정 요율은 별도로 확인해야 한다. 차량 10곳 등록만 월 8,360원이므로 이 가정에서는 9,900원도 API 원가를 못 채운다.',
'- 차량 80%·도보 20%, 전원 10곳씩 22일이라는 가정에서는 등록 추천만 1인 월 7,656원, 80만 명 합계 61.248억원이다. 여기에 출발점 갱신을 모두 더한 예산은 1인 11,352원이다. 실제 모드 비율은 아직 모른다.',
'- 따라서 공개 단가를 그대로 적용하면 990원 무제한 요금은 제안하기 어렵다. 4,900원은 이용량 한도가 있는 기본 요금 후보, 9,900원은 대량 계약과 평균 사용량 확인 후 확장 요금 후보로 검토한다. 20곳을 매일 새로 수집하는 무제한 상품은 세 요금 모두 현재 가정에서 성립하지 않는다.',
'- 순서 추천 버튼을 추가할 필요는 없다. 자동추천과 데이터 재사용은 유지하되 가격 결정에는 실제 월 활성일수·일일 새 방문지 수·반복 구간 비율·모드 비중·현재 위치 갱신 횟수·계약 단가를 넣어야 한다.','',
'## 재현','',
'`python tools/model-subscription-economics.py` 실행. 원본 `tmp/route-comparison/subscription-economics.json`에는 무료 제공량을 API별로 차감한 정확 계산값, 원가, 잔액, 호출 수가 있다. 코드 변경/서버 배포는 하지 않았다.','']
(ROOT/'docs/research/SUBSCRIPTION_ECONOMICS_800K_2026-10-26.md').write_text('\n'.join(lines),encoding='utf-8')
print('MODEL_WRITTEN',json.dumps(dict(revenue={p:p*U for p in PRICES},completion=completion)))
