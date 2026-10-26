import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('bench',Path(__file__).with_name('benchmark-solver-load.py'))
bench=importlib.util.module_from_spec(spec);spec.loader.exec_module(bench)
bench.prepare()
path=bench.OUT/'results.json'
d=json.loads(path.read_text())
for n in (13,14,15):
 for algorithm in ('dp','cp'):
  for clients in (1,8):
   d['cells'].append(bench.run_cell(algorithm,n,clients))
   path.write_text(json.dumps(d,indent=2))
for clients,parallelism in ((1,1),(8,2)):
 d['cells'].append(bench.run_cell('cpseed',29,clients,parallelism=parallelism))
 path.write_text(json.dumps(d,indent=2))
