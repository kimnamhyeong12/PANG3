"""Local Valhalla vs saved Kakao data; initial mode makes zero external API calls."""
import json
import math
import statistics
import sys
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/valhalla-comparison'
sys.path.insert(0,str(ROOT/'tmp/valhalla-deps'))
from valhalla import Actor
from valhalla.midgard.utils import decode_polyline

observations=json.loads((ROOT/'tmp/route-comparison/observations.json').read_text(encoding='utf-8'))
walking=json.loads((ROOT/'tmp/route-comparison/walking-full-matrix.json').read_text())
points=observations['locations']
output=OUT/'comparison.json'
result=json.loads(output.read_text(encoding='utf-8')) if output.exists() else dict(points=points,modes={})
config=json.loads((OUT/'valhalla.json').read_text())
config['logging']['type']=''
actor=Actor(config)
for mode,costing in [('car','auto'),('walk','pedestrian')]:
    rows=result['modes'].setdefault(mode,{})
    started=time.monotonic()
    for a in range(21):
        for b in range(1,21):
            if a==b:continue
            key=f'{a}>{b}'
            if key in rows:continue
            kakao=float(walking['durations'][key] if mode=='walk' else observations['car'][points[a]['id']][points[b]['id']])
            req=dict(locations=[dict(lat=points[i]['lat'],lon=points[i]['lng']) for i in (a,b)],costing=costing,units='kilometers')
            tick=time.monotonic()
            try:
                response=actor.route(req);trip=response['trip'];summary=trip['summary']
                rows[key]=dict(ok=True,kakao_seconds=kakao,valhalla_seconds=summary['time'],valhalla_meters=summary['length']*1000,
                               runtime_ms=(time.monotonic()-tick)*1000,shapes=[leg['shape'] for leg in trip['legs']],
                               snapped_locations=trip.get('locations',[]))
            except Exception as error:
                rows[key]=dict(ok=False,kakao_seconds=kakao,error=str(error),runtime_ms=(time.monotonic()-tick)*1000)
            if len(rows)%50==0:
                output.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
                print(f'LOCAL {mode} {len(rows)}/400',flush=True)
    good=[r for r in rows.values() if r['ok']]
    ratios=[r['valhalla_seconds']/r['kakao_seconds'] for r in good if r['kakao_seconds']>0]
    errors=[abs(v-1)*100 for v in ratios]
    result.setdefault('summary',{})[mode]=dict(success=len(good),total=len(rows),median_time_ratio=statistics.median(ratios) if ratios else None,
              median_absolute_percentage_difference=statistics.median(errors) if errors else None,
              p95_absolute_percentage_difference=sorted(errors)[math.ceil(.95*len(errors))-1] if errors else None,
              local_runtime_median_ms=statistics.median(r['runtime_ms'] for r in good) if good else None,
              elapsed_seconds=time.monotonic()-started)
    output.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    print('SUMMARY '+mode+' '+json.dumps(result['summary'][mode]),flush=True)
print('COMPLETE '+str(output),flush=True)
