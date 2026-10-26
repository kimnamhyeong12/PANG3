import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('bench',Path(__file__).with_name('benchmark-solver-load.py'))
bench=importlib.util.module_from_spec(spec);spec.loader.exec_module(bench)
path=bench.OUT/'results.json';d=json.loads(path.read_text())
for n in (15,16):
 for algorithm in ('dp','cp'):
  d['cells'].append(bench.run_cell(algorithm,n,8,parallelism=2))
  path.write_text(json.dumps(d,indent=2))
