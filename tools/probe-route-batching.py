"""Small contract probe for API batching documented by Kakao; no production changes."""
import json
import urllib.parse
import importlib.util
import sys
from pathlib import Path

base = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('route_comparison', base/'compare-route-recommendations.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
provider = module.Provider(True)
points = provider.locations()
report = json.loads((module.OUT/'results.json').read_text(encoding='utf-8'))
observed = []
matrix_five = '--matrix-five' in sys.argv
repeated = '--repeated-waypoint' in sys.argv
try:
    if repeated:
        cases = [[0,5,1,5,2,5],[5,1,5,2,5,3]]
    elif matrix_five:
        plan = json.loads((module.OUT/'batch-plan.json').read_text(encoding='utf-8'))
        cases = next(r['batches'] for r in plan if r['visits']==5)
    else:
        cases = []
        for size in (5,6):
            row = next(r for r in report['results'] if r['mode']=='walk' and r['visits']==(5 if size==5 else 20))
            cases.append([0]+row['proposed']['order_indices'][:size])
    for indices in cases:
        size = len(indices)-1
        stops = [points[i] for i in indices]
        params = dict(start_x=stops[0]['lng'],start_y=stops[0]['lat'],end_x=stops[-1]['lng'],end_y=stops[-1]['lat'],
                      via_x=','.join(str(p['lng']) for p in stops[1:-1]),via_y=','.join(str(p['lat']) for p in stops[1:-1]),
                      input_coord='WGS84',output_coord='WGS84',route_mode='BROAD_FIRST')
        body = provider.request('walk','https://dapi.kakao.com/v2/routing/walk?'+urllib.parse.urlencode(params))
        legs = body.get('route',{}).get('legs',[])
        expected = [provider.data['walk'].get(stops[i]['id']+'>'+stops[i+1]['id']) for i in range(size)]
        actual = [leg.get('properties',{}).get('time') for leg in legs]
        observed.append(dict(kind='walk',segments=size,status=body.get('status'),leg_count=len(legs),
                             expected_individual_seconds=expected,actual_leg_seconds=actual,
                             total_seconds=body.get('route',{}).get('properties',{}).get('totalTime'),indices=indices))
        print(json.dumps(observed[-1]),flush=True)
    if not matrix_five and not repeated:
        target = points[5]
        origins = [points[i] for i in (0,1,2)]
        body = provider.request('car','https://apis-navi.kakaomobility.com/v1/origins/directions',
                                dict(origins=[dict(x=p['lng'],y=p['lat'],key=p['id']) for p in origins],
                                     destination=dict(x=target['lng'],y=target['lat']),radius=10000,priority='TIME'))
        routes = body.get('routes',[])
        observed.append(dict(kind='car_origins',route_count=len(routes),result_codes=[r.get('result_code') for r in routes],
                             duration_seconds=[r.get('summary',{}).get('duration') for r in routes]))
        print(json.dumps(observed[-1]),flush=True)
    else:
        matched = all(r['status']=='OK' and r['expected_individual_seconds']==r['actual_leg_seconds'] for r in observed)
        print(json.dumps(dict(all_observed_legs_match=matched,compared_legs=sum(r['segments'] for r in observed),requests=len(observed))),flush=True)
finally:
    filename = 'batching-repeated-probe.json' if repeated else ('batching-five-matrix-probe.json' if matrix_five else 'batching-probe.json')
    (module.OUT/filename).write_text(json.dumps(dict(observations=observed,live_requests=provider.counts),indent=2),encoding='utf-8')
