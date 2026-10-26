"""Safely extract the observed ITS files and inspect schemas/region subset."""
import json
import sys
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
sys.path.insert(0,str(ROOT/'tmp/domestic-road-deps'))
import shapefile
from pyproj import CRS,Transformer

source=OUT/'its-source';source.mkdir(exist_ok=True)
allowed=[f'MOCT_{kind}.{ext}' for kind in ('LINK','NODE') for ext in ('shp','shx','dbf','prj')]+['TURNINFO.dbf','MULTILINK.dbf']
with zipfile.ZipFile(OUT/'its-node-link-2026-10-14.zip') as archive:
    for filename in allowed:
        target=source/filename
        if not target.exists():
            with archive.open(filename) as incoming,target.open('wb') as outgoing:
                import shutil
                shutil.copyfileobj(incoming,outgoing)
crs=CRS.from_wkt((source/'MOCT_LINK.prj').read_text());print('CRS '+crs.to_string())
for name in ('MOCT_LINK','MOCT_NODE','TURNINFO','MULTILINK'):
    reader=shapefile.Reader(str(source/name),encoding='cp949') if name.startswith('MOCT') else shapefile.Reader(dbf=str(source/(name+'.dbf')),encoding='cp949')
    print(json.dumps(dict(name=name,count=len(reader),fields=reader.fields[1:],sample=reader.record(0).as_dict()),ensure_ascii=True))
transform=Transformer.from_crs(4326,crs,always_xy=True)
minx,miny=transform.transform(128.87,34.98);maxx,maxy=transform.transform(129.16,35.23)
links=[]
reader=shapefile.Reader(str(source/'MOCT_LINK'),encoding='cp949')
for item in reader.iterShapeRecords(bbox=(minx,miny,maxx,maxy)):
    links.append(dict(attributes=item.record.as_dict(),points=list(item.shape.points),parts=list(item.shape.parts)))
(OUT/'busan-links.json').write_text(json.dumps(dict(crs=crs.to_string(),bbox=[minx,miny,maxx,maxy],links=links),ensure_ascii=False),encoding='utf-8')
print('REGIONAL_LINKS '+str(len(links)))
