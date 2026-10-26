"""Offline packing only. Cover directed matrix edges with <=6-edge, non-repeating paths.

Counts HTTP requests assuming documented waypoint support; does not call Kakao.
"""
import json
import random
from pathlib import Path


def pack(n, seed):
    rng = random.Random(seed)
    missing = {(a,b) for a in range(n+1) for b in range(1,n+1) if a != b}
    batches = []
    while missing:
        outgoing = {a:[] for a in range(n+1)}
        for a,b in sorted(missing):
            outgoing[a].append(b)
        start = max(range(n+1), key=lambda a:(len(outgoing[a]),rng.random()))
        path = [start]
        while len(path) < 7:
            options = [b for b in outgoing[path[-1]] if b not in path and (path[-1],b) in missing]
            if not options:
                break
            nxt = max(options,key=lambda b:(len(outgoing[b]),rng.random()))
            missing.remove((path[-1],nxt))
            path.append(nxt)
        assert len(path) > 1
        batches.append(path)
    return batches


if __name__ == '__main__':
    results = []
    for n in (5,20):
        trials = [(len(paths:=pack(n,seed)),seed,paths) for seed in range(50)]
        count,seed,paths = min(trials)
        covered = [(a,b) for path in paths for a,b in zip(path,path[1:])]
        expected = {(a,b) for a in range(n+1) for b in range(1,n+1) if a != b}
        assert len(covered)==n*n and set(covered)==expected
        assert all(len(path)<=7 and len(set(path))==len(path) for path in paths)
        results.append(dict(visits=n,directed_edges=n*n,requests=count,seed=seed,batches=paths))
    out = Path(__file__).resolve().parents[1]/'tmp/route-comparison/batch-plan.json'
    out.write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(json.dumps([{k:v for k,v in r.items() if k!='batches'} for r in results],indent=2))
