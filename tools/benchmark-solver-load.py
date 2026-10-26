"""Controlled offline Java solver comparison; never calls a routing API."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import queue
import random
import subprocess
import threading
import time
import psutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/solver-load-benchmark'

def prepare():
    source = (ROOT/'backend/src/main/java/com/fieldwork/service/VisitOrderService.java').read_text(encoding='utf-8')
    methods = source[source.index('    static List<Integer> solve('):source.index('    private static String id(')]
    methods = methods.replace('n <= 12', 'n <= DP_LIMIT')
    target = OUT/'src/SolverLoadHarness.java'
    target.parent.mkdir(exist_ok=True)
    target.write_text((ROOT/'tools/SolverLoadHarness.java').read_text().replace('// PRODUCTION_METHODS', methods))
    subprocess.run(['javac','-cp',str(OUT/'jars/*'),'-d',str(OUT/'classes'),str(target)],check=True)
    data = json.loads((OUT/'car-observations.json').read_text(encoding='utf-8'))
    locations=data['locations']; matrices={}
    for n in (8,12,13,14,15,16,20,29):
        sets=[]
        for sample in range(3):
            indices=list(range(30)); random.Random(1700+sample).shuffle(indices)
            selected=indices[:n+1]
            c=[[0 if a==b else data['car'][locations[a]['id']][locations[b]['id']] for b in selected] for a in selected]
            sets.append(c)
        matrices[n]=sets
        (OUT/f'matrix-{n}.txt').write_text(f'{n} 3\n'+'\n'.join(' '.join(map(str,row)) for c in sets for row in c))
    (OUT/'matrices.json').write_text(json.dumps(matrices))
    return hashlib.sha256(source.encode()).hexdigest(),matrices

def run_cell(algorithm,n,clients,repeats=2,parallelism=None,limit=.5):
    parallelism=parallelism or clients
    cmd=['java','-Xms64m','-Xmx512m','-XX:ActiveProcessorCount=2','-cp',str(OUT/'classes')+';'+str(OUT/'jars/*'),'SolverLoadHarness',algorithm,str(OUT/f'matrix-{n}.txt'),str(clients),str(repeats),str(parallelism),str(limit),'1']
    err=OUT/f'{algorithm}-{n}-{clients}-{parallelism}-{limit}.stderr'
    with err.open('w') as stderr:
        child=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,text=True)
        process=psutil.Process(child.pid)
        process.cpu_affinity(psutil.Process().cpu_affinity()[:2])
        messages=queue.Queue()
        def reader():
            for line in child.stdout:
                messages.put(line)
            messages.put(None)
        threading.Thread(target=reader,daemon=True).start()
        peak=0; baseline=None; result=None; ready=None; start=time.monotonic(); cpu_start=0
        while time.monotonic()-start<120:
            try:
                memory=process.memory_info().rss
                if baseline is not None: peak=max(peak,memory)
            except psutil.NoSuchProcess: pass
            try: line=messages.get(timeout=.01)
            except queue.Empty: continue
            if line is None: break
            event=json.loads(line)
            if event['event']=='READY':
                ready=event; baseline=process.memory_info().rss; peak=baseline
                cpu=process.cpu_times(); cpu_start=cpu.user+cpu.system
                child.stdin.write('GO\n');child.stdin.flush()
            elif event['event']=='RESULT': result=event; break
        cpu_seconds=None
        try:
            cpu=process.cpu_times(); cpu_seconds=cpu.user+cpu.system-cpu_start
        except psutil.NoSuchProcess: pass
        if result is None:
            child.kill()
        child.wait()
    record=dict(algorithm=algorithm,n=n,clients=clients,parallelism=parallelism,limit=limit,baseline_rss=baseline,peak_rss=peak,cpu_seconds=cpu_seconds,ready=ready,result=result,returncode=child.returncode,stderr=str(err.relative_to(ROOT)))
    if result:
        matrices=json.loads((OUT/'matrices.json').read_text())[str(n)]
        for row in result['rows']:
            if 'order' in row:
                order=row['order']; assert sorted(order)==list(range(1,n+1))
                c=matrices[row['sample']]; score=sum(c[a][b] for a,b in zip([0]+order,order))
                assert score==row['cost']
    print(json.dumps({k:record[k] for k in ('algorithm','n','clients','parallelism','peak_rss','returncode')}),flush=True)
    return record

def main():
    source_hash,matrices=prepare()
    path=OUT/'results.json'
    results=[]
    def save():path.write_text(json.dumps(dict(source_sha256=source_hash,profile=dict(cpu_count=2,heap_mib=512,host_logical_cpu=os.cpu_count(),cp_workers=1,repeats=2,samples=3),cells=results),indent=2))
    for n in (8,12,16,20,29):
        for algorithm in ('heuristic','dp','cp'):
            for clients in (1,4,8):
                results.append(run_cell(algorithm,n,clients,repeats=1 if algorithm=='dp' and n==29 else 2));save()
    for n in (20,29):
        results.append(run_cell('cp',n,8,parallelism=2));save()
    results.append(run_cell('cp',29,1,repeats=1,limit=10));save()

if __name__=='__main__': main()
