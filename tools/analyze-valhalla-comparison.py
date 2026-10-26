"""Optimize saved Valhalla matrices then score those orders on the same Kakao matrix."""
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/valhalla-comparison'
spec=importlib.util.spec_from_file_location('benchmark',ROOT/'tools/benchmark-route-solvers.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=json.loads((OUT/'comparison.json').read_text(encoding='utf-8'))
reference=json.loads((ROOT/'tmp/route-comparison/algorithm-benchmark.json').read_text(encoding='utf-8'))
results=[]
for n in (5,20):
    for mode in ('car','walk'):
        c=[[0]*(n+1) for _ in range(n+1)];k=[[0.]*(n+1) for _ in range(n+1)]
        for a in range(n+1):
            for b in range(1,n+1):
                if a==b:continue
                edge=raw['modes'][mode][f'{a}>{b}'];assert edge['ok']
                c[a][b]=round(edge['valhalla_seconds']*1000);k[a][b]=edge['kakao_seconds']
        order,metadata=m.cp_sat(c,m.nearest(c))
        optimum=next(r['optimum_seconds'] for r in reference['results'] if r['visits']==n and r['mode']==mode)
        score=m.cost(order,k)
        row=dict(visits=n,mode=mode,valhalla_order=order,valhalla_prediction_seconds=m.cost(order,c)/1000,
                 valhalla_solver_status=metadata['status'],same_order_kakao_seconds=score,kakao_optimum_seconds=optimum,
                 extra_kakao_seconds=score-optimum,extra_kakao_pct=(score/optimum-1)*100)
        assert score>=optimum-.001
        results.append(row);print(json.dumps(row),flush=True)
(OUT/'order-comparison.json').write_text(json.dumps(results,indent=2))
