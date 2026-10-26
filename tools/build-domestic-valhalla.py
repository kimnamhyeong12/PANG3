"""Research-only ITS vehicle graph conversion; never infer pedestrian access."""
import collections
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/domestic-road-comparison'
sys.path[:0]=[str(ROOT/'tmp/domestic-road-deps'),str(ROOT/'tmp/valhalla-deps')]
import osmium
import shapefile
from pyproj import CRS,Transformer

source=json.loads((OUT/'busan-links.json').read_text(encoding='utf-8'))
transform=Transformer.from_crs(CRS.from_wkt((OUT/'its-source/MOCT_LINK.prj').read_text()),4326,always_xy=True)
rows=source['links'];kept={};excluded=collections.Counter()
for row in rows:
    a=row['attributes']
    if a['ROAD_USE']!='0':excluded['unused']+=1;continue
    if '1' in a['REST_VEH'] or '6' in a['REST_VEH']:excluded['car_or_unknown_restriction']+=1;continue
    if len(row['parts'])!=1:raise ValueError('Multipart link requires explicit handling')
    kept[a['LINK_ID']]=row
needed={a for r in kept.values() for a in (r['attributes']['F_NODE'],r['attributes']['T_NODE'])}
# Preserve official node IDs, not proximity. Crossings at different levels stay separate.
node_reader=shapefile.Reader(str(OUT/'its-source/MOCT_NODE'),encoding='cp949')
box=source['bbox'];box=[box[0]-20000,box[1]-20000,box[2]+20000,box[3]+20000]
nodes={r.record['NODE_ID']:tuple(r.shape.points[0]) for r in node_reader.iterShapeRecords(bbox=box) if r.record['NODE_ID'] in needed}
if needed-nodes.keys():raise ValueError('Missing official endpoint nodes: '+str(len(needed-nodes.keys())))
endpoint_errors=[];reversed_count=0
for r in kept.values():
    a=r['attributes'];p=r['points'];f=nodes[a['F_NODE']];t=nodes[a['T_NODE']]
    dist=lambda x,y:((x[0]-y[0])**2+(x[1]-y[1])**2)**.5
    if dist(p[0],t)+dist(p[-1],f)<dist(p[0],f)+dist(p[-1],t):p.reverse();reversed_count+=1
    endpoint_errors += [dist(p[0],f),dist(p[-1],t)]
    if max(endpoint_errors[-2:])>2:raise ValueError('Endpoint disagreement >2m '+a['LINK_ID'])
pbf=OUT/'its-busan.osm.pbf'
if not pbf.exists():
    partial=OUT/'its-busan.partial.osm.pbf'
    if partial.exists():partial.unlink()
    writer=osmium.SimpleWriter(str(partial))
    for identifier,xy in sorted(nodes.items(),key=lambda x:int(x[0])):
        lon,lat=transform.transform(*xy)
        writer.add_node(osmium.osm.mutable.Node(id=int(identifier),location=(lon,lat)))
    counter=20000000000;ways=[]
    for identifier,r in sorted(kept.items(),key=lambda x:int(x[0])):
        a=r['attributes'];refs=[int(a['F_NODE'])]
        for xy in r['points'][1:-1]:
            counter+=1;lon,lat=transform.transform(*xy)
            writer.add_node(osmium.osm.mutable.Node(id=counter,location=(lon,lat)));refs.append(counter)
        refs.append(int(a['T_NODE']))
        rank={'101':'motorway','102':'trunk','103':'primary','104':'tertiary','105':'secondary','106':'secondary','107':'residential','108':'unclassified'}[a['ROAD_RANK']]
        if a['CONNECT']=='1':rank=rank+'_link' if rank in ('motorway','trunk','primary','secondary','tertiary') else rank
        tags={'highway':rank,'oneway':'yes','motor_vehicle':'yes','foot':'no','bicycle':'no','source':'Korea ITS standard node-link 2026-10-14','name':a['ROAD_NAME'],'maxspeed':str(a['MAX_SPD']),'lanes':str(max(1,a['LANES'])),'its:link_id':identifier}
        if a['ROAD_TYPE'] in ('001','003'):tags['bridge']='yes';tags['layer']='1'
        if a['ROAD_TYPE'] in ('002','004'):tags['tunnel']='yes';tags['layer']='-1'
        ways.append(osmium.osm.mutable.Way(id=int(identifier),nodes=refs,tags=tags))
    for way in ways:writer.add_way(way)
    restrictions=[];skipped=collections.Counter();unresolved=[];via_way_count=0
    adjacency=collections.defaultdict(list)
    for lid,r in kept.items():adjacency[r['attributes']['F_NODE']].append(lid)
    for t in json.loads((OUT/'busan-turns.json').read_text(encoding='utf-8')):
        if t['TURN_TYPE'] not in ('002','003','101','102','103'):skipped[t['TURN_TYPE']]+=1;continue
        if t['ST_LINK'] not in kept or t['ED_LINK'] not in kept:skipped['excluded_link']+=1;continue
        f=kept[t['ST_LINK']]['attributes'];to=kept[t['ED_LINK']]['attributes'];via=t['NODE_ID']
        # Split intersection nodes require via-way restrictions. Trace directed links,
        # limited to 300m and eight links, without geometrically merging nodes.
        paths=[];queue=[(f['T_NODE'],[],0.0,{f['T_NODE']})]
        while queue:
            node,chain,length,visited=queue.pop()
            if node==to['F_NODE']:
                paths.append(chain)
                if len(paths)>40:break
                continue
            if len(chain)>=8:continue
            for lid in adjacency[node]:
                a=kept[lid]['attributes'];end=a['T_NODE'];total=length+a['LENGTH']
                if lid in (t['ST_LINK'],t['ED_LINK']) or end in visited or total>300:continue
                queue.append((end,chain+[lid],total,visited|{end}))
        if not paths or len(paths)>40:
            unresolved.append(t);continue
        # One timed restriction lacks an operating schedule: conservatively prohibit all day.
        restriction={'101':'no_left_turn','102':'no_straight_on','103':'no_right_turn','002':'no_straight_on','003':'no_straight_on'}[t['TURN_TYPE']]
        for chain in paths:
            members=[('w',int(t['ST_LINK']),'from')]+([('w',int(lid),'via') for lid in chain] if chain else [('n',int(f['T_NODE']),'via')])+[('w',int(t['ED_LINK']),'to')]
            rel=osmium.osm.mutable.Relation(id=len(restrictions)+1,members=members,tags={'type':'restriction','restriction':restriction,'source':'Korea ITS TURNINFO'})
            writer.add_relation(rel);restrictions.append(t);via_way_count+=bool(chain)
    writer.close()
    partial.replace(pbf)
    (OUT/'unresolved-turns.json').write_text(json.dumps(unresolved,ensure_ascii=False),encoding='utf-8')
    conversion=dict(links=len(kept),nodes=len(nodes),excluded=dict(excluded),restrictions=len(restrictions),via_way_restrictions=via_way_count,unresolved_turn_count=len(unresolved),conditional_conservatively_all_day=sum(t['TURN_OPER']=='1' for t in restrictions),skipped_turn_records=dict(skipped),endpoint_max_error_m=max(endpoint_errors),reoriented_geometries=reversed_count,pedestrian_supported=False,rank_mapping_is_approximate=True)
    (OUT/'conversion.json').write_text(json.dumps(conversion,indent=2));print(json.dumps(conversion),flush=True)
tiles=OUT/'tiles';tiles.mkdir(exist_ok=True)
config=json.loads((ROOT/'tmp/valhalla-comparison/valhalla.json').read_text())
config['mjolnir'].update(tile_dir=str(tiles),tile_extract='',concurrency=2)
path=OUT/'valhalla.json';path.write_text(json.dumps(config,indent=2))
done=OUT/'build-complete.json'
if not done.exists():
    deps=ROOT/'tmp/valhalla-deps';env=dict(os.environ,PATH=str(deps/'pyvalhalla.libs')+os.pathsep+os.environ.get('PATH',''))
    started=time.monotonic()
    with (OUT/'build.log').open('w',encoding='utf-8') as log:
        proc=subprocess.run([str(deps/'valhalla/bin/valhalla_build_tiles.exe'),'-c',str(path),str(pbf)],env=env,stdout=log,stderr=subprocess.STDOUT)
    if proc.returncode:print((OUT/'build.log').read_text(errors='replace')[-3000:]);raise SystemExit(proc.returncode)
    done.write_text(json.dumps(dict(seconds=time.monotonic()-started)))
print('DOMESTIC_GRAPH_READY',flush=True)
