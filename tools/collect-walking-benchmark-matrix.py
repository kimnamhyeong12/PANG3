"""Collect a complete directed 20-stop walking matrix using <=72 planned batches.
Resume completed batches; no production writes and no secrets in output files.
"""
import importlib.util
import json
import urllib.parse
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('route_comparison',root/'tools/compare-route-recommendations.py')
m = importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
provider = m.Provider(True)
points = provider.locations()
plan = next(r for r in json.loads((m.OUT/'batch-plan.json').read_text()) if r['visits']==20)
output = m.OUT/'walking-full-matrix.json'
data = json.loads(output.read_text()) if output.exists() else dict(batches=[],durations={})
try:
    for number,indices in enumerate(plan['batches']):
        if number < len(data['batches']):
            continue
        stops = [points[i] for i in indices]
        params = dict(start_x=stops[0]['lng'],start_y=stops[0]['lat'],end_x=stops[-1]['lng'],end_y=stops[-1]['lat'],
                      via_x=','.join(str(p['lng']) for p in stops[1:-1]),via_y=','.join(str(p['lat']) for p in stops[1:-1]),
                      input_coord='WGS84',output_coord='WGS84',route_mode='BROAD_FIRST')
        body = provider.request('walk','https://dapi.kakao.com/v2/routing/walk?'+urllib.parse.urlencode(params))
        legs = body.get('route',{}).get('legs',[])
        if body.get('status')!='OK' or len(legs)!=len(stops)-1:
            raise RuntimeError('Batch failed: '+str(number)+' status '+str(body.get('status')))
        seconds = [float(leg['properties']['time']) for leg in legs]
        if any(t<0 for t in seconds) or abs(sum(seconds)-body['route']['properties']['totalTime'])>1:
            raise RuntimeError('Invalid leg times')
        for a,b,t in zip(indices,indices[1:],seconds):
            data['durations'][f'{a}>{b}']=t
        data['batches'].append(dict(indices=indices,seconds=seconds))
        data['observed_utc']=provider.data.get('last_observed_utc')
        data['complete']=len(data['durations'])==400
        output.write_text(json.dumps(data,indent=2))
        if (number+1)%12==0:
            print(f'BATCHES {number+1}/72 EDGES {len(data["durations"])}/400',flush=True)
    assert len(data['durations'])==400
    matched=compared=0
    for key,seconds in data['durations'].items():
        a,b=map(int,key.split('>'))
        old=provider.data.get('walk',{}).get(points[a]['id']+'>'+points[b]['id'])
        if old is not None:
            compared+=1;matched+=float(old)==seconds
    print(json.dumps(dict(complete=True,batches=len(data['batches']),edges=400,previous_edges_compared=compared,matching_previous_edges=matched,new_live_requests=provider.counts)),flush=True)
except Exception as error:
    print('STOPPED '+type(error).__name__+': '+str(error),flush=True)
    raise SystemExit(1)
