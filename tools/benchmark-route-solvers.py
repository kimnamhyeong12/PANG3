"""Offline algorithm comparison on identical, complete Kakao time matrices.

Uses temporary OR-Tools install only; never calls a map API. Open directed route,
fixed origin, free end, no return/work times. Results aren't a cross-region claim.
"""
import importlib.util
import json
import random
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/route-comparison'
sys.path.insert(0,str(ROOT/'tmp/route-algorithm-deps'))
from ortools.constraint_solver import pywrapcp,routing_enums_pb2
from ortools.sat.python import cp_model
import ortools


def cost(order,c):
    return sum(c[a][b] for a,b in zip([0]+order[:-1],order))


def nearest(c,first=None):
    remaining=set(range(1,len(c)));order=[];cursor=0
    if first is not None:
        order=[first];remaining.remove(first);cursor=first
    while remaining:
        nxt=min(remaining,key=lambda i:(c[cursor][i],i))
        order.append(nxt);remaining.remove(nxt);cursor=nxt
    return order


def insertion(c,regret=False):
    order=[min(range(1,len(c)),key=lambda i:(c[0][i],i))]
    remaining=set(range(1,len(c)))-set(order)
    while remaining:
        options=[]
        for node in sorted(remaining):
            positions=[]
            for pos in range(len(order)+1):
                before=order[pos-1] if pos else 0
                after=order[pos] if pos<len(order) else None
                delta=c[before][node]+(c[node][after]-c[before][after] if after is not None else 0)
                positions.append((delta,pos))
            positions.sort()
            regret_value=positions[1][0]-positions[0][0] if len(positions)>1 else 0
            options.append((-regret_value if regret else positions[0][0],positions[0][0],node,positions[0][1]))
        _,_,node,pos=min(options)
        order.insert(pos,node);remaining.remove(node)
    return order


def local_improve(c,order,deadline):
    current=cost(order,c)
    while time.perf_counter()<deadline:
        best=current;winner=None
        for i in range(len(order)):
            for j in range(len(order)):
                if i==j:continue
                moved=order.copy();node=moved.pop(i);moved.insert(j,node)
                value=cost(moved,c)
                if value<best:best=value;winner=moved
                if i<j:
                    reversed_route=order[:i]+list(reversed(order[i:j+1]))+order[j+1:]
                    value=cost(reversed_route,c)
                    if value<best:best=value;winner=reversed_route
        if winner is None:break
        order=winner;current=best
    return order


def multistart(c):
    deadline=time.perf_counter()+1
    seeds=[nearest(c),insertion(c),insertion(c,True)]+[nearest(c,i) for i in range(1,len(c))]
    best=min(seeds,key=lambda r:cost(r,c))
    for seed in seeds:
        candidate=local_improve(c,seed,deadline)
        if cost(candidate,c)<cost(best,c):best=candidate
        if time.perf_counter()>=deadline:break
    return best


def routing(c,strategy):
    n=len(c)-1;end=n+1
    manager=pywrapcp.RoutingIndexManager(n+2,1,[0],[end])
    model=pywrapcp.RoutingModel(manager)
    def transit(a,b):
        a,b=manager.IndexToNode(a),manager.IndexToNode(b)
        return 0 if b==end or a==end else int(c[a][b])
    callback=model.RegisterTransitCallback(transit)
    model.SetArcCostEvaluatorOfAllVehicles(callback)
    params=pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy=routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic=getattr(routing_enums_pb2.LocalSearchMetaheuristic,strategy)
    params.time_limit.FromMilliseconds(1000)
    params.log_search=False
    initial=model.ReadAssignmentFromRoutes([nearest(c)],True)
    solution=model.SolveFromAssignmentWithParameters(initial,params)
    if solution is None:raise RuntimeError('Routing solver returned no route')
    order=[];index=model.Start(0)
    while not model.IsEnd(index):
        node=manager.IndexToNode(index)
        if node!=0:order.append(node)
        index=solution.Value(model.NextVar(index))
    return order


def genetic(c,seed):
    rng=random.Random(seed);n=len(c)-1
    population=[nearest(c),insertion(c),insertion(c,True)]
    population += [rng.sample(range(1,n+1),n) for _ in range(77)]
    deadline=time.perf_counter()+1;generations=0
    while time.perf_counter()<deadline:
        population.sort(key=lambda r:cost(r,c));children=population[:4]
        while len(children)<80:
            p1=min(rng.sample(population,4),key=lambda r:cost(r,c))
            p2=min(rng.sample(population,4),key=lambda r:cost(r,c))
            a,b=sorted(rng.sample(range(n+1),2))
            child=[None]*n;child[a:b]=p1[a:b]
            rest=[x for x in p2 if x not in child]
            for i in list(range(b,n))+list(range(a)):
                child[i]=rest.pop(0)
            if rng.random()<.25:
                i,j=rng.sample(range(n),2);child[i],child[j]=child[j],child[i]
            children.append(child)
        population=children;generations+=1
    return min(population,key=lambda r:cost(r,c)),dict(seed=seed,generations=generations)


def cp_sat(c,hint):
    model=cp_model.CpModel();arcs=[];variables={};n=len(c)-1
    for a in range(n+1):
        for b in range(n+1):
            if a==b:continue
            x=model.new_bool_var(f'e_{a}_{b}');variables[(a,b)]=x;arcs.append((a,b,x))
    model.add_circuit(arcs)
    model.minimize(sum(int(c[a][b])*x for (a,b),x in variables.items() if b!=0))
    hint_edges=set(zip([0]+hint,hint+[0]))
    for edge,x in variables.items():model.add_hint(x,int(edge in hint_edges))
    solver=cp_model.CpSolver();solver.parameters.max_time_in_seconds=30 if n==20 else 5
    solver.parameters.num_search_workers=4;solver.parameters.random_seed=17
    status=solver.solve(model)
    if status not in (cp_model.OPTIMAL,cp_model.FEASIBLE):
        raise RuntimeError('CP-SAT '+solver.status_name(status))
    next_node={a:b for (a,b),x in variables.items() if solver.value(x)}
    order=[];cursor=next_node[0]
    while cursor!=0:
        order.append(cursor);cursor=next_node[cursor]
    return order,dict(status=solver.status_name(status),bound=solver.best_objective_bound,workers=4,limit_seconds=solver.parameters.max_time_in_seconds)


def compile_java():
    source=(ROOT/'backend/src/main/java/com/fieldwork/service/VisitOrderService.java').read_text(encoding='utf-8')
    methods=source[source.index('    static List<Integer> solve('):source.index('    private static String id(')].replace('n <= 12','n <= LIMIT')
    main=r'''
    static int LIMIT=12;
    public static void main(String[] args) {
        LIMIT=Integer.parseInt(args[0]); Scanner s=new Scanner(System.in);int n=s.nextInt();
        double[][] c=new double[n+1][n+1];for(int i=0;i<=n;i++)for(int j=0;j<=n;j++)c[i][j]=s.nextDouble();
        solve(new double[6][6],5,false,-1);
        int repeats=n==20 && LIMIT==20 ? 3 : 15; List<Integer> order=null;double[] ms=new double[repeats];
        for(int repeat=0;repeat<repeats;repeat++) {
            System.gc();long start=System.nanoTime();order=solve(c,n,false,-1);ms[repeat]=(System.nanoTime()-start)/1e6;
        }
        Arrays.sort(ms);
        System.out.println("{\"order\":"+order+",\"runtime_ms\":"+ms[repeats/2]+",\"min_ms\":"+ms[0]+",\"max_ms\":"+ms[repeats-1]+",\"repeats\":"+repeats+"}");
    }
}'''
    java=OUT/'AlgorithmReferenceSolver.java'
    java.write_text('import java.util.*;\npublic class AlgorithmReferenceSolver {\n'+methods+main)
    subprocess.run(['javac',str(java)],check=True,capture_output=True)


def java_solver(c,limit):
    request=str(len(c)-1)+'\n'+'\n'.join(' '.join(str(v) for v in row) for row in c)
    process=subprocess.run(['java','-Xmx1g','-cp',str(OUT),'AlgorithmReferenceSolver',str(limit)],input=request,text=True,capture_output=True,check=True)
    result=json.loads(process.stdout)
    order=[i+1 for i in result.pop('order')]
    return order,result


def matrix(observations,walking,mode,n):
    points=observations['locations'];c=[[0.0]*(n+1) for _ in range(n+1)]
    for a in range(n+1):
        for b in range(1,n+1):
            if a!=b:
                c[a][b]=walking['durations'][f'{a}>{b}'] if mode=='walk' else float(observations['car'][points[a]['id']][points[b]['id']])
    return c


def measured(c,name,fn,repeats=3):
    runs=[]
    for seed in range(repeats):
        started=time.perf_counter();value=fn(seed)
        order,extra=value if isinstance(value,tuple) else (value,{})
        ms=(time.perf_counter()-started)*1000
        assert sorted(order)==list(range(1,len(c)))
        runs.append(dict(seconds=cost(order,c),runtime_ms=ms,order=order,**extra))
    best=min(runs,key=lambda r:r['seconds'])
    return dict(algorithm=name,seconds=statistics.median(r['seconds'] for r in runs),best_seconds=best['seconds'],
                worst_seconds=max(r['seconds'] for r in runs),runtime_ms=statistics.median(r['runtime_ms'] for r in runs),runs=runs)


def main():
    compile_java()
    observations=json.loads((OUT/'observations.json').read_text(encoding='utf-8'))
    walking=json.loads((OUT/'walking-full-matrix.json').read_text())
    assert walking['complete'] and len(walking['durations'])==400
    previous=json.loads((OUT/'results.json').read_text(encoding='utf-8'))
    results=[]
    for n in (5,20):
        for mode in ('car','walk'):
            c=matrix(observations,walking,mode,n);rows=[]
            for name,fn in [
                ('Nearest neighbour',lambda _:nearest(c)),
                ('Cheapest insertion',lambda _:insertion(c)),
                ('Regret-2 insertion',lambda _:insertion(c,True)),
                ('Multi-start relocate + directed 2-opt',lambda _:multistart(c)),
                ('OR-Tools GLS 1s',lambda _:routing(c,'GUIDED_LOCAL_SEARCH')),
                ('OR-Tools Tabu 1s',lambda _:routing(c,'TABU_SEARCH')),
                ('OR-Tools SA 1s',lambda _:routing(c,'SIMULATED_ANNEALING')),
                ('Genetic algorithm 1s',lambda seed:genetic(c,17+seed)),
            ]:
                r=measured(c,name,fn);rows.append(r)
                print(json.dumps(dict(visits=n,mode=mode,algorithm=name,seconds=r['seconds'],runtime_ms=round(r['runtime_ms'],3)),ensure_ascii=False),flush=True)
            for name,limit in [('Current solver with full matrix',12),('Held-Karp exact DP',20)]:
                order,timing=java_solver(c,limit)
                assert sorted(order)==list(range(1,n+1))
                rows.append(dict(algorithm=name,seconds=cost(order,c),best_seconds=cost(order,c),worst_seconds=cost(order,c),order=order,**timing))
                print(json.dumps(dict(visits=n,mode=mode,algorithm=name,seconds=cost(order,c),runtime_ms=round(timing['runtime_ms'],3))),flush=True)
            # Same nearest-neighbour hint as Routing; do not gift it another solver's optimum.
            r=measured(c,'CP-SAT exact reference',lambda _:cp_sat(c,nearest(c)),repeats=3);rows.append(r)
            optimum=next(r['seconds'] for r in rows if r['algorithm']=='Held-Karp exact DP')
            for r in rows:
                r['gap_pct']=round((r['seconds']/optimum-1)*100,4)
                assert r['seconds']>=optimum-.001
            cp=r['runs'][0]
            for trial in r['runs']:
                if trial['status']=='OPTIMAL':assert trial['seconds']==optimum
            old=next(r['baseline'] for r in previous['results'] if r['visits']==n and r['mode']==mode)
            case=dict(visits=n,mode=mode,optimum_seconds=optimum,algorithms=rows,
                      current_operational_route_seconds=cost(old['order_indices'],c),current_operational_api_calls=old['api_calls'])
            results.append(case)
            output=dict(results=results,ortools_version=ortools.__version__,conditions='Same complete directed snapshot; fixed origin, free end, no return/service time. Python OR-Tools, Java production/exact DP; runtime comparisons include language differences. Heuristics 3 trials; DP 3 or 15 trials; CP-SAT 3 trials with nearest-neighbour hint, up to30s/4workers; Routing same hint, heuristics up to1s.',
                        unexecuted={'Dijkstra/A*':'not a visit-order solver','LKH-3':'upstream academic/non-commercial terms; no licensed executable used','Neural/RL':'no task-matched validated model/weights; no fabricated benchmark'})
            (OUT/'algorithm-benchmark.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
            print('CASE_COMPLETE '+json.dumps(dict(visits=n,mode=mode,optimum_seconds=optimum,cp_sat=cp['status'])),flush=True)


if __name__=='__main__':
    main()
