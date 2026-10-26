"""Fetch five public Kakao route examples per mode; cache responses for geometry review."""
import html
import importlib.util
import json
import math
import urllib.parse
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/valhalla-comparison'
spec=importlib.util.spec_from_file_location('comparison',ROOT/'tools/compare-route-recommendations.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
provider=m.Provider(True)
raw=json.loads((OUT/'comparison.json').read_text(encoding='utf-8'));points=raw['points']
file=OUT/'route-examples.json';examples=json.loads(file.read_text(encoding='utf-8')) if file.exists() else {}

def decode(encoded):
    index=lat=lon=0;points_=[]
    while index<len(encoded):
        values=[]
        for _ in range(2):
            value=shift=0
            while True:
                b=ord(encoded[index])-63;index+=1;value|=(b&31)<<shift;shift+=5
                if b<32:break
            values.append(~(value>>1) if value&1 else value>>1)
        lat+=values[0];lon+=values[1];points_.append([lon/1e6,lat/1e6])
    return points_

for mode in ('car','walk'):
    rows=raw['modes'][mode]
    worst=min(rows,key=lambda e:rows[e]['valhalla_seconds']/rows[e]['kakao_seconds'])
    keys=list(dict.fromkeys(['0>17','0>2','1>4','4>1',worst]))
    for key in keys:
        record_key=mode+':'+key
        if record_key in examples:continue
        a,b=map(int,key.split('>'));start,end=points[a],points[b]
        if mode=='car':
            params=dict(origin=f'{start["lng"]},{start["lat"]}',destination=f'{end["lng"]},{end["lat"]}',priority='TIME')
            response=provider.request('car','https://apis-navi.kakaomobility.com/v1/directions?'+urllib.parse.urlencode(params))
            route=response['routes'][0]
            if route['result_code']!=0:raise RuntimeError('Car example unavailable')
            summary=route['summary'];path=[]
            for section in route['sections']:
                for road in section.get('roads',[]):
                    values=road['vertexes'];path += list(zip(values[::2],values[1::2]))
            meters,seconds=summary['distance'],summary['duration']
        else:
            params=dict(start_x=start['lng'],start_y=start['lat'],end_x=end['lng'],end_y=end['lat'],input_coord='WGS84',output_coord='WGS84',route_mode='BROAD_FIRST')
            response=provider.request('walk','https://dapi.kakao.com/v2/routing/walk?'+urllib.parse.urlencode(params))
            if response['status']!='OK':raise RuntimeError('Walking example unavailable')
            route=response['route'];path=[p for leg in route['legs'] for step in leg['steps'] for p in step['path']['points']]
            meters,seconds=route['properties']['totalDistance'],route['properties']['totalTime']
        local=rows[key];local_path=[p for shape in local['shapes'] for p in decode(shape)]
        examples[record_key]=dict(mode=mode,key=key,start=start['name'],end=end['name'],kakao_meters=meters,kakao_seconds=seconds,
                                  valhalla_meters=local['valhalla_meters'],valhalla_seconds=local['valhalla_seconds'],kakao_path=path,valhalla_path=local_path)
        file.write_text(json.dumps(examples,ensure_ascii=False),encoding='utf-8')
        print(json.dumps({k:v for k,v in examples[record_key].items() if not k.endswith('_path')},ensure_ascii=False),flush=True)

# Diagnostic: wide-road preference can be different from shortest-path preference.
key='walk:7>14:SHORTEST'
if key not in examples:
    start,end=points[7],points[14]
    params=dict(start_x=start['lng'],start_y=start['lat'],end_x=end['lng'],end_y=end['lat'],input_coord='WGS84',output_coord='WGS84',route_mode='SHORTEST')
    body=provider.request('walk','https://dapi.kakao.com/v2/routing/walk?'+urllib.parse.urlencode(params))
    examples[key]=dict(status=body.get('status'),properties=body.get('route',{}).get('properties'))
    file.write_text(json.dumps(examples,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(dict(diagnostic=key,**examples[key])),flush=True)

# Background-free shape overlays: these compare geometry, not legal walkability.
for key,r in examples.items():
    if 'kakao_path' not in r:continue
    coordinates=r['kakao_path']+r['valhalla_path'];latitude=sum(p[1] for p in coordinates)/len(coordinates)
    factor=math.cos(math.radians(latitude));xs=[p[0]*factor for p in coordinates];ys=[p[1] for p in coordinates]
    minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
    scale=min(660/max(maxx-minx,1e-5),380/max(maxy-miny,1e-5))
    def project(p):return 40+(p[0]*factor-minx)*scale,100+(maxy-p[1])*scale
    shapes=[]
    for field,color in [('kakao_path','#f59e0b'),('valhalla_path','#2563eb')]:
        vertices=' '.join(f'{x:.2f},{y:.2f}' for x,y in map(project,r[field]))
        shapes.append(f'<polyline points="{vertices}" fill="none" stroke="{color}" stroke-width="3" opacity=".8"/>')
    label=html.escape(r['start']+' → '+r['end'])
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="760" height="530"><rect width="100%" height="100%" fill="white"/><g font-family="Malgun Gothic, sans-serif"><text x="24" y="32" font-size="16">{label}</text><text x="24" y="60" fill="#b45309">Kakao {r["kakao_meters"]:.0f}m / {r["kakao_seconds"]:.0f}s</text><text x="380" y="60" fill="#2563eb">Valhalla {r["valhalla_meters"]:.0f}m / {r["valhalla_seconds"]:.0f}s</text>{"".join(shapes)}<text x="24" y="510" font-size="12" fill="#64748b">경로 모양 비교 · 배경지도 없음 · 현장 통행 가능 여부를 검증한 그림은 아님</text></g></svg>'
    (OUT/(key.replace(':','-').replace('>','-')+'.svg')).write_text(svg,encoding='utf-8')
print('NEW_REQUESTS '+json.dumps(provider.counts),flush=True)
