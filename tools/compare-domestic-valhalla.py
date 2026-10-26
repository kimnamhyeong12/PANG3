"""Compare ITS+Valhalla vehicle routes with cached Kakao; audit source restrictions."""
import importlib.util
import json
import math
from pathlib import Path
import statistics
import sys
import time
import urllib.parse

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
sys.path.insert(0,str(ROOT/'tmp/valhalla-deps'))
from valhalla import Actor
from valhalla.midgard.utils import decode_polyline
config=json.loads((OUT/'valhalla.json').read_text());config['logging']['type']='';actor=Actor(config)
obs=json.loads((ROOT/'tmp/route-comparison/observations.json').read_text(encoding='utf-8'));points=obs['locations']
source={r['attributes']['LINK_ID']:r['attributes'] for r in json.loads((OUT/'busan-links.json').read_text(encoding='utf-8'))['links']}
turns=json.loads((OUT/'busan-turns.json').read_text(encoding='utf-8'))
prohibitions=[t for t in turns if t['TURN_TYPE'] in ('002','003','101','102','103')]
by_start={}
for t in prohibitions:by_start.setdefault(int(t['ST_LINK']),[]).append(t)
def haversine(a,b):
    p,q=map(math.radians,[a[1],b[1]]);dp=q-p;dl=math.radians(b[0]-a[0]);v=math.sin(dp/2)**2+math.cos(p)*math.cos(q)*math.sin(dl/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(v)))
path=OUT/'comparison.json';result=json.loads(path.read_text(encoding='utf-8')) if path.exists() else dict(points=points,routes={})
for a in range(21):
    for b in range(1,21):
        if a==b:continue
        key=f'{a}>{b}'
        if key in result['routes']:continue
        row=dict(kakao_cached_seconds=obs['car'][points[a]['id']][points[b]['id']])
        tick=time.monotonic()
        try:
            r=actor.route(dict(locations=[dict(lat=points[i]['lat'],lon=points[i]['lng']) for i in (a,b)],costing='auto',units='kilometers'))
            trip=r['trip'];shape=trip['legs'][0]['shape'];coords=decode_polyline(shape)
            # Library returns (lon,lat); route locations retain input rather than snapped coords.
            try:
                trace=actor.trace_attributes(dict(encoded_polyline=shape,shape_match='edge_walk',costing='auto'))
                edges=trace['edges'];audit_error=None
            except Exception as error:edges=[];audit_error=str(error)
            way_ids=[e['way_id'] for e in edges];violations=[]
            for i,e in enumerate(edges):
                if not e['forward']:violations.append(dict(kind='reverse_of_source_oneway',way=e['way_id']))
                attr=source[str(e['way_id'])]
                if attr['ROAD_USE']!='0' or '1' in attr['REST_VEH'] or '6' in attr['REST_VEH']:violations.append(dict(kind='excluded_link',way=e['way_id']))
                # A sequence audit, independent of Valhalla's imported relations.
                for t in by_start.get(e['way_id'],[]):
                    distance=0
                    for j in range(i+1,min(i+10,len(edges))):
                        if way_ids[j]==int(t['ED_LINK']):
                            violations.append(dict(kind='source_prohibited_turn_sequence',from_link=t['ST_LINK'],to_link=t['ED_LINK'],turn=t));break
                        distance+=edges[j]['length']*1000
                        if distance>300:break
            row.update(ok=True,seconds=trip['summary']['time'],meters=trip['summary']['length']*1000,shape=shape,way_ids=way_ids,audit_error=audit_error,
                snap_start_m=haversine([points[a]['lng'],points[a]['lat']],coords[0]),snap_end_m=haversine([points[b]['lng'],points[b]['lat']],coords[-1]),violations=violations)
        except Exception as e:row.update(ok=False,error=str(e))
        row['runtime_ms']=(time.monotonic()-tick)*1000;result['routes'][key]=row
    path.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
good=[r for r in result['routes'].values() if r['ok']]
result['summary']=dict(total=len(result['routes']),success=len(good),median_time_ratio=statistics.median(r['seconds']/r['kakao_cached_seconds'] for r in good),
    median_absolute_time_difference_pct=statistics.median(abs(r['seconds']/r['kakao_cached_seconds']-1)*100 for r in good),
    routes_with_audit_flags=sum(bool(r['violations']) for r in good),routes_with_unavailable_audit=sum(bool(r['audit_error']) for r in good),max_snap_m=max(max(r['snap_start_m'],r['snap_end_m']) for r in good),
    median_runtime_including_audit_ms=statistics.median(r['runtime_ms'] for r in good))
path.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');print(json.dumps(result['summary']),flush=True)

# Fresh, identical-coordinate examples. TIME vehicle option, no shortest-distance change.
spec=importlib.util.spec_from_file_location('provider',ROOT/'tools/compare-route-recommendations.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);provider=mod.Provider(True)
example_path=OUT/'fresh-examples.json';examples=json.loads(example_path.read_text(encoding='utf-8')) if example_path.exists() else {}
for key in ['0>17','0>2','1>4','4>1','15>2']:
    if key in examples:continue
    a,b=map(int,key.split('>'));start,end=points[a],points[b]
    params=dict(origin=f'{start["lng"]},{start["lat"]}',destination=f'{end["lng"]},{end["lat"]}',priority='TIME')
    response=provider.request('car','https://apis-navi.kakaomobility.com/v1/directions?'+urllib.parse.urlencode(params));route=response['routes'][0]
    if route['result_code']!=0:raise ValueError('Kakao route unavailable')
    geometry=[]
    for section in route['sections']:
        for road in section['roads']:
            vs=road['vertexes'];geometry.extend(zip(vs[::2],vs[1::2]))
    examples[key]=dict(start=start['name'],end=end['name'],kakao_seconds=route['summary']['duration'],kakao_meters=route['summary']['distance'],kakao_path=geometry,domestic=result['routes'][key],kakao_summary=route['summary'])
    example_path.write_text(json.dumps(examples,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(dict(key=key,kakao_meters=examples[key]['kakao_meters'],domestic_meters=examples[key]['domestic'].get('meters'),kakao_seconds=examples[key]['kakao_seconds'],domestic_seconds=examples[key]['domestic'].get('seconds'))),flush=True)
print('NEW_KAKAO_REQUESTS '+json.dumps(provider.counts),flush=True)
