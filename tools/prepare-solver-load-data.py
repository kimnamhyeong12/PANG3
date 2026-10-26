"""Public Saha car matrix for load tests; no production changes or secret logging."""
import importlib.util
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request
import hashlib

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/solver-load-benchmark';OUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('provider',ROOT/'tools/compare-route-recommendations.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
provider=m.Provider(True);file=OUT/'car-observations.json'
data=json.loads(file.read_text(encoding='utf-8')) if file.exists() else dict(locations=provider.data['locations'].copy(),car={})
if len(data['locations'])<30:
    pool={p['id']:p for p in data['locations']}
    for page in range(1,4):
        query=urllib.parse.urlencode(dict(query='사하구 공원',rect='128.94,35.03,129.025,35.15',size=15,page=page))
        body=provider.request('search','https://dapi.kakao.com/v2/local/search/keyword.json?'+query)
        for r in body['documents']:
            p=dict(id=r['id'],name=r['place_name'],lat=float(r['y']),lng=float(r['x']))
            if '사하구' in r.get('address_name','') and p['id'] not in pool and all(m.distance(p,q)<9900 for q in data['locations']):pool[p['id']]=p
        if len(pool)>=30:break
    existing={p['id'] for p in data['locations']}
    data['locations'] += sorted([p for k,p in pool.items() if k not in existing],key=lambda p:p['id'])[:30-len(data['locations'])]
    if len(data['locations'])!=30:raise ValueError('Need 30 real public points; no synthetic coordinates substituted')
    file.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
for p in data['locations']:
    if p['id'] in data['car']:continue
    targets=[dict(x=q['lng'],y=q['lat'],key=q['id']) for q in data['locations'] if q['id']!=p['id']]
    body=provider.request('car','https://apis-navi.kakaomobility.com/v1/destinations/directions',dict(origin=dict(x=p['lng'],y=p['lat']),destinations=targets,radius=10000,priority='TIME'))
    rows=body.get('routes',[])
    if len(rows)!=29 or any(r.get('result_code')!=0 for r in rows):raise ValueError('Incomplete real car matrix')
    data['car'][p['id']]={r['key']:r['summary']['duration'] for r in rows}
    data['observed_utc']=provider.data['last_observed_utc'];file.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print('CAR_ROWS '+str(len(data['car']))+'/30',flush=True)
print('NEW_REQUESTS '+json.dumps(provider.counts),flush=True)

# Only official, public Maven artifacts; scoped to the research folder.
jars=OUT/'jars';jars.mkdir(exist_ok=True)
artifacts=[('com/google/ortools','ortools-java','9.15.6755'),('com/google/ortools','ortools-win32-x86-64','9.15.6755'),('net/java/dev/jna','jna','5.14.0'),('net/java/dev/jna','jna-platform','5.14.0'),('com/google/protobuf','protobuf-java','4.33.1')]
for group,name,version in artifacts:
    filename=f'{name}-{version}.jar';target=jars/filename
    if target.exists():continue
    url=f'https://repo.maven.apache.org/maven2/{group}/{name}/{version}/{filename}'
    with urllib.request.urlopen(url,timeout=60) as response:binary=response.read()
    with urllib.request.urlopen(url+'.sha1',timeout=20) as response:expected=response.read().decode().strip().split()[0]
    if hashlib.sha1(binary).hexdigest()!=expected:raise ValueError('Maven checksum mismatch '+filename)
    target.write_bytes(binary);print('JAR '+filename+' '+str(len(binary)),flush=True)
