"""Extract local OSM context and plot measured paths, without modifying screenshots."""
import json
import math
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
sys.path.insert(0,str(ROOT/'tmp/domestic-road-deps'))
import osmium
from PIL import Image,ImageDraw,ImageFont
result=json.loads((OUT/'dasun-engine-probe.json').read_text(encoding='utf-8'))
keys=['domestic:car:marker','osm:car:marker','kakao_rest:car:marker:TIME','osm:walk:marker','kakao_rest:walk:marker:BROAD_FIRST']
coords=[p for k in keys for p in result['records'][k]['path']]
bbox=[min(p[0] for p in coords)-.0008,min(p[1] for p in coords)-.0008,max(p[0] for p in coords)+.0008,max(p[1] for p in coords)+.0008]
arrival_only='--arrival-only' in sys.argv
if arrival_only:bbox=[128.9827,35.0623,128.9872,35.0648]
context=OUT/'dasun-osm-context.json'
if not context.exists():
    class Context(osmium.SimpleHandler):
        def __init__(self):super().__init__();self.features=[]
        def way(self,w):
            tags=dict(w.tags)
            if not any(k in tags for k in ('highway','building','landuse','leisure','amenity')):return
            try:pts=[[n.lon,n.lat] for n in w.nodes]
            except osmium.InvalidLocationError:return
            if not any(bbox[0]<=x<=bbox[2] and bbox[1]<=y<=bbox[3] for x,y in pts):return
            self.features.append(dict(id=w.id,tags=tags,points=pts))
    handler=Context();handler.apply_file(str(ROOT/'tmp/valhalla-comparison/south-korea-latest.osm.pbf'),locations=True,idx='flex_mem')
    context.write_text(json.dumps(dict(bbox=bbox,features=handler.features),ensure_ascii=False),encoding='utf-8')
features=json.loads(context.read_text(encoding='utf-8'))['features']
im=Image.new('RGB',(1600,1120),'#edf1f5');draw=ImageDraw.Draw(im);font=lambda n:ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',n)
draw.text((35,22),'다선초등학교: 도착 도로 확대 비교' if arrival_only else '다선초등학교: 같은 학교 좌표, 서로 다른 도착 도로',font=font(32),fill='#14213d')
draw.text((35,75),'차량 · 도보 실조회 비교 / 학교 중심 좌표를 입력한 결과',font=font(21),fill='#475569')
for panel,series in enumerate([
    [('국내 ITS + 발할라','domestic:car:marker','#2563eb'),('OSM + 발할라','osm:car:marker','#9333ea'),('카카오 REST TIME','kakao_rest:car:marker:TIME','#d97706')],
    [('OSM + 발할라','osm:walk:marker','#9333ea'),('카카오 도보 API','kakao_rest:walk:marker:BROAD_FIRST','#d97706')]]):
    left=20+panel*790;top=130;right=left+770;bottom=1015
    draw.rounded_rectangle((left,top,right,bottom),16,fill='white')
    draw.text((left+20,top+16),'차량' if panel==0 else '도보',font=font(25),fill='#14213d')
    for j,(label,key,color) in enumerate(series):
        row=result['records'][key];s=round(row['seconds']);draw.line((left+20,top+65+j*31,left+48,top+65+j*31),fill=color,width=4)
        draw.text((left+60,top+50+j*31),f'{label}: {row["meters"]:,.0f}m / {s//60}분 {s%60}초',font=font(20),fill='#334155')
    mapbox=(left+18,top+172,right-18,bottom-58);width=mapbox[2]-mapbox[0];height=mapbox[3]-mapbox[1]
    c=math.cos(math.radians(35.064));scale=min(width/((bbox[2]-bbox[0])*c),height/(bbox[3]-bbox[1]))
    offx=(width-(bbox[2]-bbox[0])*c*scale)/2;offy=(height-(bbox[3]-bbox[1])*scale)/2
    xy=lambda p:(offx+(p[0]-bbox[0])*c*scale,offy+(bbox[3]-p[1])*scale)
    main_draw=draw;map_image=Image.new('RGB',(width,height),'#f7f8f6');draw=ImageDraw.Draw(map_image)
    for f in features:
        tags=f['tags'];ps=[xy(p) for p in f['points']]
        if len(ps)<2:continue
        if ps[0]==ps[-1] and ('building' in tags or tags.get('amenity')=='school' or 'landuse' in tags or 'leisure' in tags):
            fill='#dcead9' if 'leisure' in tags or tags.get('amenity')=='school' else '#e4e6e3';draw.polygon(ps,fill=fill,outline='#d4d8d3')
    for f in features:
        if 'highway' not in f['tags']:continue
        ps=[xy(p) for p in f['points']];road=f['tags']['highway'];w=10 if road in ('primary','secondary','tertiary') else 5
        if len(ps)>1:draw.line(ps,fill='#d3d8d5',width=w+2);draw.line(ps,fill='white',width=w)
    for label,key,color in series:
        ps=[xy(p) for p in result['records'][key]['path']];draw.line(ps,fill=color,width=4)
        p=ps[-1];draw.ellipse((p[0]-6,p[1]-6,p[0]+6,p[1]+6),fill=color,outline='white',width=2)
    for name,p,color in [('출발',[result['origin']['lng'],result['origin']['lat']],'#111827'),('학교 중심',[result['goals']['marker']['lng'],result['goals']['marker']['lat']],'#111827'),('과거 SDK 남쪽 도착',[result['goals']['south_reference']['lng'],result['goals']['south_reference']['lat']],'#15803d')]:
        x,y=xy(p);draw.ellipse((x-5,y-5,x+5,y+5),fill=color);box=draw.textbbox((x+9,y-22),name,font=font(17));draw.rectangle((box[0]-2,box[1]-1,box[2]+2,box[3]+1),fill='white');draw.text((x+9,y-22),name,font=font(17),fill=color)
    draw.text((width-45,8),'북 ↑',font=font(17),fill='#334155')
    im.paste(map_image,(mapbox[0],mapbox[1]));draw=main_draw
    draw.text((left+20,bottom-40),'국내 보행망 미확보' if panel else '카카오맵 장소 선택의 남쪽 경로는 별도 캡처 참조',font=font(17),fill='#475569')
draw.text((30,1040),'배경 도로·건물: © OpenStreetMap contributors (ODbL) · 현장 통행 검증 아님',font=font(18),fill='#475569')
draw.text((30,1073),'초록점은 10/14 SDK 기록이며, 이번 카카오맵 웹 조회도 남쪽 경로를 확인함',font=font(18),fill='#475569')
output=OUT/('dasun-arrival-comparison.png' if arrival_only else 'dasun-geographic-comparison.png')
im.save(output);print('CONTEXT_FEATURES '+str(len(features)));print(output)
