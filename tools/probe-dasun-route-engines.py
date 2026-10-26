"""Public fixed Dasun test points, fresh Kakao responses and local Valhalla paths."""
import importlib.util
import json
from pathlib import Path
import sys
import urllib.parse
from datetime import datetime,timezone,timedelta

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
sys.path.insert(0,str(ROOT/'tmp/valhalla-deps'))
from valhalla import Actor
from valhalla.midgard.utils import decode_polyline
spec=importlib.util.spec_from_file_location('provider',ROOT/'tools/compare-route-recommendations.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);provider=mod.Provider(True)
path=OUT/'dasun-engine-probe.json'
result=json.loads(path.read_text(encoding='utf-8')) if path.exists() else dict(origin=dict(lat=35.0640682,lng=128.9837168),
    goals=dict(marker=dict(lat=35.0636823232284,lng=128.985493965177),south_reference=dict(lat=35.0630442,lng=128.9849105)),
    records={},note='south_reference is the archived SDK arrival, manually fixed diagnostic; no automatic entrance implementation')
origin=result['origin']
for name,folder in [('domestic','domestic-road-comparison'),('osm','valhalla-comparison')]:
    config=json.loads((ROOT/'tmp'/folder/'valhalla.json').read_text());config['logging']['type']='';actor=Actor(config)
    for mode,costing in [('car','auto'),('walk','pedestrian')]:
        if name=='domestic' and mode=='walk':continue
        for goal_name,goal in result['goals'].items():
            key=f'{name}:{mode}:{goal_name}'
            if key in result['records']:continue
            trip=actor.route(dict(locations=[dict(lat=p['lat'],lon=p['lng']) for p in (origin,goal)],costing=costing,units='kilometers'))['trip']
            geometry=[list(p) for leg in trip['legs'] for p in decode_polyline(leg['shape'])]
            result['records'][key]=dict(meters=trip['summary']['length']*1000,seconds=trip['summary']['time'],path=geometry,arrival=dict(lng=geometry[-1][0],lat=geometry[-1][1]),instructions=[m.get('instruction') for leg in trip['legs'] for m in leg['maneuvers']])
for priority in ['RECOMMEND','TIME','DISTANCE']:
    key='kakao_rest:car:marker:'+priority
    if key in result['records']:continue
    g=result['goals']['marker'];params=dict(origin=f'{origin["lng"]},{origin["lat"]}',destination=f'{g["lng"]},{g["lat"]}',priority=priority)
    r=provider.request('car','https://apis-navi.kakaomobility.com/v1/directions?'+urllib.parse.urlencode(params))['routes'][0]
    assert r['result_code']==0
    geometry=[]
    for section in r['sections']:
        for road in section['roads']:
            vs=road['vertexes'];geometry.extend(zip(vs[::2],vs[1::2]))
    result['records'][key]=dict(meters=r['summary']['distance'],seconds=r['summary']['duration'],path=geometry,arrival=dict(lng=geometry[-1][0],lat=geometry[-1][1]),captured_at=datetime.now(timezone(timedelta(hours=9))).isoformat())
for route_mode in ['BROAD_FIRST','SHORTEST']:
    key='kakao_rest:walk:marker:'+route_mode
    if key in result['records']:continue
    g=result['goals']['marker'];params=dict(start_x=origin['lng'],start_y=origin['lat'],end_x=g['lng'],end_y=g['lat'],input_coord='WGS84',output_coord='WGS84',route_mode=route_mode)
    body=provider.request('walk','https://dapi.kakao.com/v2/routing/walk?'+urllib.parse.urlencode(params));assert body['status']=='OK';r=body['route']
    geometry=[p for leg in r['legs'] for step in leg['steps'] for p in step['path']['points']]
    result['records'][key]=dict(meters=r['properties']['totalDistance'],seconds=r['properties']['totalTime'],path=geometry,arrival=dict(lng=geometry[-1][0],lat=geometry[-1][1]),captured_at=datetime.now(timezone(timedelta(hours=9))).isoformat())
path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for key,r in result['records'].items():print(json.dumps(dict(key=key,**{k:v for k,v in r.items() if k in ('meters','seconds','arrival')})),flush=True)
print('NEW_KAKAO_REQUESTS '+json.dumps(provider.counts),flush=True)
