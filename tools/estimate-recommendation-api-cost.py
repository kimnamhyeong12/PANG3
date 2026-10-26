"""Offline call accounting. No provider credentials, network calls, or production changes."""
import importlib.util
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('replay',ROOT/'tools/compare-route-recommendations.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.compile_solver()
points=json.loads((ROOT/'tmp/route-comparison/observations.json').read_text(encoding='utf-8'))['locations']
walking=json.loads((ROOT/'tmp/route-comparison/walking-full-matrix.json').read_text())['durations']
class Snapshot:
 def __init__(self):self.used=set()
 def walk(self,a,b):
  i,j=points.index(a),points.index(b)
  self.used.add((i,j))
  return walking[f'{i}>{j}']
provider=Snapshot(); walk_rows=[]
for n in range(1,21):
 case=m.Case(provider,points[:n+1],'walk');case.baseline()
 walk_rows.append(dict(visits=n,current_calls=len(provider.used)))

def walking_incremental(n):
 # Skip recommendation for one stop. At two stops collect the four required
 # edges using [origin,A,B,A] and [origin,B]. Each later star is one trail.
 paths=[]
 if n>=2:paths += [[0,1,2,1],[0,2]]
 for x in range(3,n+1):
  trail=[0,x]
  for old in range(1,x):trail.extend([old,x])
  for at in range(0,len(trail)-1,6):paths.append(trail[at:at+7])
 covered=[(a,b) for path in paths for a,b in zip(path,path[1:])]
 expected={(a,b) for a in range(n+1) for b in range(1,n+1) if a!=b}
 assert set(covered)==expected and len(covered)==n*n
 assert all(2<=len(p)<=7 and p[0]!=p[-1] for p in paths)
 return paths

rows=[]
for n in (5,10,20,29):
 old=n*(n+3)//2;dest=n;orig=n-1
 row=dict(visits=n,current_car=dict(destinations=old,all_paid_won=old*20),proposed_car=dict(destinations=dest,origins=orig,total_http=dest+orig,all_paid_won_formula=f'{dest*20} + {orig} * origin_unit_price'))
 if n<=20:
  paths=walking_incremental(n)
  row['walking']=dict(current_sequential_calls=walk_rows[n-1]['current_calls'],proposed_sequential_http=len(paths),proposed_directed_edges=n*n,paths=paths)
 rows.append(row)
out=ROOT/'tmp/route-comparison/api-cost-estimate.json'
out.write_text(json.dumps(dict(conditions='One by one registration; fixed origin; valid initially empty caches; no return; no errors/retries; walking 20 recorded locations; new batching is an offline plan, not a live incremental execution; HTTP to billable-unit mapping must be verified.',rows=rows,walking_registration_steps=walk_rows),indent=2))
print(json.dumps([{k:v for k,v in r.items() if k!='walking'}|({'walking':{k:v for k,v in r['walking'].items() if k!='paths'}} if 'walking' in r else {}) for r in rows],indent=2))
