"""Optimize domestic and Kakao matrices under identical open-route constraints.

No external requests. Compare selected orders using the SAME saved Kakao costs.
"""
import importlib.util
import itertools
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
spec=importlib.util.spec_from_file_location('benchmark',ROOT/'tools/benchmark-route-solvers.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=json.loads((OUT/'comparison.json').read_text(encoding='utf-8'));points=raw['points']
osm=json.loads((ROOT/'tmp/valhalla-comparison/order-comparison.json').read_text(encoding='utf-8'))
results=[]
for n in (5,20):
    d=[[0]*(n+1) for _ in range(n+1)];k=[[0]*(n+1) for _ in range(n+1)]
    for a in range(n+1):
        for b in range(1,n+1):
            if a==b:continue
            r=raw['routes'][f'{a}>{b}'];assert r['ok']
            d[a][b]=round(r['seconds']*1000);k[a][b]=round(r['kakao_cached_seconds']*1000)
    orders={};metadata={}
    for name,costs in [('domestic',d),('kakao',k)]:
        order,meta=m.cp_sat(costs,m.nearest(costs))
        assert sorted(order)==list(range(1,n+1))
        if meta['status']!='OPTIMAL':raise ValueError('Cannot call result optimum '+name+' '+str(meta))
        if n==5:
            brute=min(m.cost(list(order_),costs) for order_ in itertools.permutations(range(1,n+1)))
            assert m.cost(order,costs)==brute
        orders[name]=order;metadata[name]=meta
    base=m.cost(orders['kakao'],k)/1000;score=m.cost(orders['domestic'],k)/1000
    assert score>=base
    legs=[]
    for a,b in zip([0]+orders['domestic'][:-1],orders['domestic']):
        r=raw['routes'][f'{a}>{b}']
        legs.append(dict(key=f'{a}>{b}',from_name=points[a]['name'],to_name=points[b]['name'],domestic_seconds=r['seconds'],kakao_seconds=r['kakao_cached_seconds'],snap_start_m=r['snap_start_m'],snap_end_m=r['snap_end_m'],audit_error=r['audit_error'],audit_flags=r['violations']))
    row=dict(visits=n,mode='car',conditions=dict(fixed_origin=True,return_to_origin=False,service_times=False,time_windows=False),
        orders=orders,order_names={name:[points[i]['name'] for i in order] for name,order in orders.items()},solver=metadata,
        domestic_prediction_seconds=m.cost(orders['domestic'],d)/1000,kakao_optimum_seconds=base,
        domestic_order_scored_on_kakao_seconds=score,extra_seconds=score-base,extra_pct=(score/base-1)*100,
        osm_order_scored_on_kakao_seconds=next(r['same_order_kakao_seconds'] for r in osm if r['visits']==n and r['mode']=='car'),
        domestic_legs=legs,domestic_route_audit_unavailable=sum(bool(r['audit_error']) for r in legs),
        domestic_route_audit_flags=sum(bool(r['audit_flags']) for r in legs),domestic_route_legs_snap_over_100m=sum(max(r['snap_start_m'],r['snap_end_m'])>100 for r in legs))
    results.append(row)
    print(json.dumps({key:value for key,value in row.items() if key not in ('order_names','domestic_legs')},ensure_ascii=True),flush=True)
(OUT/'order-comparison.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
