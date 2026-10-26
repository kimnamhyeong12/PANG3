"""Prepare public fixed places; uses one official Local search, never prints keys."""
import importlib.util,json,urllib.parse
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'tmp/rest-sdk-benchmark';out.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('provider',root/'tools/compare-route-recommendations.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
data=m.Provider(True).request('search','https://dapi.kakao.com/v2/local/search/keyword.json?'+urllib.parse.urlencode({'query':'동아대학교 승학캠퍼스','x':128.968,'y':35.114,'sort':'distance'}))
matches=[r for r in data['documents'] if r['place_name']=='동아대학교 승학캠퍼스']
assert len(matches)==1,'Exact campus result required'
d=matches[0]
points=[dict(id='origin',name='다대동 고정 출발점',lat=35.0640682,lng=128.9837168),dict(id='8223574',name='다선초등학교',lat=35.0636823232284,lng=128.985493965177),dict(id=d['id'],name=d['place_name'],lat=float(d['y']),lng=float(d['x']))]
old=json.loads((root/'tmp/route-comparison/observations.json').read_text(encoding='utf8'))
points+=old['locations'][1:19]
assert len(points)==21 and len({(p['lat'],p['lng']) for p in points})==21
(out/'points.json').write_text(json.dumps(points,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(points[:3],ensure_ascii=False))
