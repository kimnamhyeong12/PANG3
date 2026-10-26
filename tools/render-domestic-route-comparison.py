"""Standalone geometry plots; no basemap or claim of field verification."""
import json
import math
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
sys.path.insert(0,str(ROOT/'tmp/valhalla-deps'))
from valhalla.midgard.utils import decode_polyline
from PIL import Image,ImageDraw,ImageFont
fresh=json.loads((OUT/'fresh-examples.json').read_text(encoding='utf-8'))
old=json.loads((ROOT/'tmp/valhalla-comparison/route-examples.json').read_text(encoding='utf-8'))
osm=json.loads((ROOT/'tmp/valhalla-comparison/comparison.json').read_text(encoding='utf-8'))
canvas=Image.new('RGB',(1600,1330),'#eef2f7');draw=ImageDraw.Draw(canvas)
font=lambda n:ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',n)
draw.text((35,22),'사하구 실제 API 응답 · 로컬 경로 비교',font=font(34),fill='#14213d')
draw.text((35,77),'차량: 카카오 TIME / 국내 ITS + Valhalla / OSM + Valhalla 기본 설정',font=font(21),fill='#475569')
colors=['#d97706','#2563eb','#a855f7']
for index,key in enumerate(['0>17','0>2','15>2','walk:7>14']):
    x=25+(index%2)*790;y=125+(index//2)*565
    draw.rounded_rectangle((x,y,x+765,y+540),20,fill='white')
    if index<3:
        r=fresh[key];o=osm['modes']['car'][key]
        title=r['start']+' → '+r['end'];title=title.replace('다대포해수욕장역 인근 출발점','다대포해수욕장역 인근')
        series=[('카카오',r['kakao_meters'],r['kakao_seconds'],r['kakao_path']),('국내 ITS',r['domestic']['meters'],r['domestic']['seconds'],decode_polyline(r['domestic']['shape'])),('OSM',o['valhalla_meters'],o['valhalla_seconds'],[p for s in o['shapes'] for p in decode_polyline(s)])]
        note='같은 입력 좌표여도 엔진별 도로 연결점은 다를 수 있음'
    else:
        r=old[key];title='도보: '+r['start']+' → '+r['end']
        series=[('카카오',r['kakao_meters'],r['kakao_seconds'],r['kakao_path']),('OSM',r['valhalla_meters'],r['valhalla_seconds'],r['valhalla_path'])]
        note='국내 보행망 미확보 · 이 패널은 국내 데이터 비교가 아님'
    draw.text((x+20,y+16),title,font=font(20),fill='#14213d')
    for j,(name,meters,secs,_) in enumerate(series):
        color=colors[j] if index<3 else [colors[0],colors[2]][j]
        draw.text((x+20,y+52+j*29),f'{name}: {meters:,.0f}m / {int(secs)//60}분 {int(secs)%60}초',font=font(19),fill=color)
    coords=[p for s in series for p in s[3]];lat=sum(p[1] for p in coords)/len(coords);c=math.cos(math.radians(lat));xs=[p[0]*c for p in coords];ys=[p[1] for p in coords]
    minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys);scale=min(690/max(maxx-minx,1e-6),310/max(maxy-miny,1e-6))
    offx=x+35+(690-(maxx-minx)*scale)/2;offy=y+162+(310-(maxy-miny)*scale)/2
    project=lambda p:(offx+(p[0]*c-minx)*scale,offy+(maxy-p[1])*scale)
    for j,s in enumerate(series):
        color=colors[j] if index<3 else [colors[0],colors[2]][j]
        vertices=list(map(project,s[3]));draw.line(vertices,fill=color,width=3)
        for p in [vertices[0],vertices[-1]]:draw.ellipse((p[0]-4,p[1]-4,p[0]+4,p[1]+4),fill=color)
    draw.text((x+20,y+500),note,font=font(17),fill='#64748b')
draw.text((35,1280),'배경지도 없는 경로 모양 비교 · 현장 실주행 검증 아님 · 실시간 교통 미연결',font=font(21),fill='#475569')
canvas.save(OUT/'route-comparison.png')
print(str(OUT/'route-comparison.png'))
