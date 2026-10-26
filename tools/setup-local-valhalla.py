"""Build a local Valhalla graph in tmp only, from the South Korea OSM extract."""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/valhalla-comparison';OUT.mkdir(exist_ok=True,parents=True)
DEPS=ROOT/'tmp/valhalla-deps'
sys.path.insert(0,str(DEPS))
import valhalla

parser=argparse.ArgumentParser();parser.add_argument('--download-only',action='store_true');args=parser.parse_args()
pbf=OUT/'south-korea-latest.osm.pbf'
if not pbf.exists():
    partial=pbf.with_suffix('.pbf.partial')
    with urllib.request.urlopen('https://download.geofabrik.de/asia/south-korea-latest.osm.pbf',timeout=90) as response, partial.open('wb') as destination:
        size=0;last=0
        while block:=response.read(1024*1024):
            destination.write(block);size+=len(block)
            if size-last>=32*1024*1024:
                print(f'DOWNLOADED {size//1024//1024} MiB',flush=True);last=size
    partial.replace(pbf)
    print(f'DOWNLOAD_COMPLETE {pbf.stat().st_size} bytes',flush=True)
if args.download_only:raise SystemExit(0)
tiles=OUT/'tiles';tiles.mkdir(exist_ok=True)
config=valhalla.get_config(tile_dir=tiles,tile_extract='',verbose=True)
config['mjolnir'].update(concurrency=2,admin=str(OUT/'admins.sqlite'),timezone=str(OUT/'timezones-not-configured.sqlite'))
config['mjolnir'].pop('transit_dir',None)
config['logging']['type']='std_out'
config['logging']['color']=False
config_path=OUT/'valhalla.json';config_path.write_text(json.dumps(config,indent=2))
environment=dict(os.environ,PATH=str(DEPS/'pyvalhalla.libs')+os.pathsep+os.environ.get('PATH',''))
bin_dir=DEPS/'valhalla/bin'
started=time.monotonic()
for name,done in [('valhalla_build_admins',OUT/'admins-complete.json'),('valhalla_build_tiles',OUT/'tiles-complete.json')]:
    if done.exists():continue
    print('BUILD_START '+name,flush=True)
    log=OUT/(name+'.log')
    with log.open('w',encoding='utf-8') as handle:
        process=subprocess.run([str(bin_dir/(name+'.exe')),'-c',str(config_path),str(pbf)],env=environment,stdout=handle,stderr=subprocess.STDOUT)
    if process.returncode:
        print('BUILD_FAILED '+name+' exit '+str(process.returncode)+' log '+str(log),flush=True)
        print(log.read_text(encoding='utf-8',errors='replace')[-3500:],flush=True)
        raise SystemExit(1)
    done.write_text(json.dumps(dict(seconds=time.monotonic()-started,source_bytes=pbf.stat().st_size)))
    print('BUILD_COMPLETE '+name,flush=True)
print('READY '+str(config_path),flush=True)
