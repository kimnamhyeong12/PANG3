"""Opt-in live Kakao comparison; no production changes, private keys never persisted.

Run from repository root. Caches scalar road durations under tmp/route-comparison.
Reports algorithm calls separately from measurement calls. Replays the repository's
actual Java solver. Live request caps: walking 200, multi-destination 30, search 5.
"""
import argparse
import hashlib
import json
import math
import statistics
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp' / 'route-comparison'
OUT.mkdir(parents=True, exist_ok=True)
CACHE_FILE = OUT / 'observations.json'


def read_key(path, name):
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip().strip('\"\'')
    raise RuntimeError('Required API credential not configured')


class Provider:
    def __init__(self, live):
        self.live = live
        self.data = json.loads(CACHE_FILE.read_text(encoding='utf-8')) if CACHE_FILE.exists() else {}
        self.counts = dict(walk=0, car=0, search=0)
        self.keys = {
            'walk': read_key(ROOT / 'frontend/.env', 'EXPO_PUBLIC_KAKAO_REST_API_KEY'),
            'car': read_key(ROOT / 'backend/.env', 'KAKAO_REST_API_KEY'),
        }

    def save(self):
        CACHE_FILE.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding='utf-8')

    def request(self, kind, url, payload=None):
        if not self.live:
            raise RuntimeError('Snapshot incomplete; --live is required for new observations')
        limit = dict(walk=200, car=30, search=5)[kind]
        if self.counts[kind] >= limit:
            raise RuntimeError('Live request cap reached: ' + kind)
        self.counts[kind] += 1
        headers = {'Authorization': 'KakaoAK ' + self.keys['car' if kind == 'car' else 'walk']}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode()
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, body, headers)
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # Never echo provider bodies, URLs or authentication headers.
            raise RuntimeError(f'{kind} HTTP {error.code}; stopped without retry') from None
        self.data['last_observed_utc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        if sum(self.counts.values()) % 10 == 0:
            print('LIVE_REQUESTS ' + json.dumps(self.counts), flush=True)
        return result

    def locations(self):
        if 'locations' in self.data:
            return self.data['locations']
        docs = []
        for page in (1, 2, 3):
            params = dict(query='공원', rect='128.955,35.035,129.015,35.115', size=15, page=page)
            result = self.request('search', 'https://dapi.kakao.com/v2/local/search/keyword.json?' + urllib.parse.urlencode(params))
            docs += result.get('documents', [])
            if result.get('meta', {}).get('is_end'):
                break
        unique = {}
        for row in docs:
            if '사하구' in row.get('address_name', ''):
                unique[row['id']] = dict(id=row['id'], name=row['place_name'], lat=float(row['y']), lng=float(row['x']))
        pool = sorted(unique.values(), key=lambda p: p['id'])
        if len(pool) < 20:
            raise RuntimeError(f'Only {len(pool)} public places found; do not invent remaining locations')
        origin = dict(id='origin', name='다대포해수욕장역 인근 출발점', lat=35.04853, lng=128.96464)
        selected = []
        # Deterministic spread, including short and long cross-neighborhood legs.
        while len(selected) < 20:
            point = max(pool, key=lambda p: min(distance(p, q) for q in [origin] + selected))
            pool.remove(point)
            selected.append(point)
        self.data['locations'] = [origin] + selected
        self.save()
        return self.data['locations']

    def walk(self, a, b):
        key = a['id'] + '>' + b['id']
        values = self.data.setdefault('walk', {})
        if key not in values:
            params = dict(start_x=a['lng'], start_y=a['lat'], end_x=b['lng'], end_y=b['lat'],
                          input_coord='WGS84', output_coord='WGS84', route_mode='BROAD_FIRST')
            result = self.request('walk', 'https://dapi.kakao.com/v2/routing/walk?' + urllib.parse.urlencode(params))
            if result.get('status') != 'OK':
                raise RuntimeError('Walking path unavailable: ' + str(result.get('status')))
            values[key] = result['route']['properties']['totalTime']
            self.save()
        return float(values[key])

    def car_row(self, origin, points):
        rows = self.data.setdefault('car', {})
        if origin['id'] not in rows:
            destinations = [dict(x=p['lng'], y=p['lat'], key=p['id']) for p in points if p['id'] != origin['id']]
            result = self.request('car', 'https://apis-navi.kakaomobility.com/v1/destinations/directions',
                                  dict(origin=dict(x=origin['lng'], y=origin['lat']), destinations=destinations,
                                       radius=10000, priority='TIME'))
            if any(r.get('result_code') != 0 for r in result.get('routes', [])) or len(result.get('routes', [])) != len(destinations):
                raise RuntimeError('Car matrix contains unavailable paths; no straight-line substitution')
            rows[origin['id']] = {r['key']: r['summary']['duration'] for r in result['routes']}
            self.save()
        return rows[origin['id']]


def distance(a, b):
    lat1, lat2 = map(math.radians, (a['lat'], b['lat']))
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b['lng']-a['lng'])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(x)))


def compile_solver():
    source = (ROOT / 'backend/src/main/java/com/fieldwork/service/VisitOrderService.java').read_text(encoding='utf-8')
    methods = source[source.index('    static List<Integer> solve('):source.index('    private static String id(')]
    main = '''
    public static void main(String[] args) {
        Scanner s=new Scanner(System.in); int n=s.nextInt(); double[][] c=new double[n+1][n+1];
        for(int i=0;i<=n;i++)for(int j=0;j<=n;j++)c[i][j]=s.nextDouble();
        System.out.println(solve(c,n,false,-1).toString());
    }
}'''
    java = OUT / 'ReplaySolver.java'
    java.write_text('import java.util.*;\npublic class ReplaySolver {\n' + methods + main, encoding='utf-8')
    subprocess.run(['javac', str(java)], check=True, capture_output=True)
    return hashlib.sha256(source.encode()).hexdigest()


def solve(matrix):
    n = len(matrix)-1
    request = str(n) + '\n' + '\n'.join(' '.join(str(v) for v in row) for row in matrix)
    result = subprocess.run(['java', '-cp', str(OUT), 'ReplaySolver'], input=request, text=True, capture_output=True, check=True)
    return [v+1 for v in json.loads(result.stdout)]


def edges(order):
    return list(zip([0] + order[:-1], order))


def neighbours(order):
    result = set()
    for i in range(len(order)):
        for j in range(len(order)):
            if i == j:
                continue
            route = order.copy()
            p = route.pop(i)
            route.insert(j, p)
            result.add(tuple(route))
            if i < j:
                result.add(tuple(order[:i] + list(reversed(order[i:j+1])) + order[j+1:]))
    return sorted(result)


class Case:
    def __init__(self, provider, points, mode):
        self.provider, self.points, self.mode = provider, points, mode
        self.dist = [[distance(a, b) for b in points] for a in points]
        self.used = set()
        self.rows = set()

    def query(self, a, b):
        if a == b:
            return 0.0
        self.used.add((a, b))
        if self.mode == 'walk':
            return self.provider.walk(self.points[a], self.points[b])
        self.rows.add(a)
        return float(self.provider.car_row(self.points[a], self.provider.locations())[self.points[b]['id']])

    def measure(self, order):
        # Evaluation only: does not count against either algorithm's budget.
        before = self.used.copy(), self.rows.copy()
        total = sum(self.query(a, b) for a, b in edges(order))
        self.used, self.rows = before
        return total

    def baseline(self):
        n = len(self.points)-1
        matrix = [[d/1.25*1.3 for d in row] for row in self.dist]
        for a in range(n+1):
            candidates = sorted((b for b in range(1,n+1) if a != b), key=lambda b: (self.dist[a][b], b))
            if self.mode == 'car':
                candidates = [b for b in range(n+1) if a != b]
            elif n > 8:
                candidates = candidates[:4]
            for b in candidates:
                matrix[a][b] = self.query(a,b)
        order = solve(matrix)
        if self.mode == 'walk' and n > 8:
            for _ in range(2):
                for a,b in edges(order):
                    matrix[a][b] = self.query(a,b)
                if _ == 0:
                    order = solve(matrix)
        return order

    def proposed(self):
        n = len(self.points)-1
        order = solve(self.dist)
        known = {edge:self.query(*edge) for edge in edges(order)}
        if self.mode == 'car':
            # One batch per origin: baseline successor + 2 geographically nearest alternatives.
            for a in range(n+1):
                near = sorted((b for b in range(1,n+1) if a != b),key=lambda b:(self.dist[a][b],b))[:2]
                for b in near:
                    known[(a,b)] = self.query(a,b)
        budget = 2*n
        while True:
            current = sum(known[e] for e in edges(order))
            candidates = neighbours(order)
            valid = [(sum(known[e] for e in edges(list(route))), route) for route in candidates if all(e in known for e in edges(list(route)))]
            best = min(valid + [(current, tuple(order))])
            if best[0] + .01 < current:
                order = list(best[1])
                continue
            if self.mode == 'car':
                break
            # Estimate unqueried alternatives with the observed typical seconds/metre.
            ratio = statistics.median(t/self.dist[a][b] for (a,b),t in known.items() if self.dist[a][b] > 1)
            shortlist = []
            for route in candidates:
                route_edges = edges(list(route))
                missing = [e for e in route_edges if e not in known]
                if not missing or len(known)+len(missing) > budget:
                    continue
                estimate = sum(known[e] if e in known else self.dist[e[0]][e[1]]*ratio for e in route_edges)
                if estimate < current:
                    shortlist.append((estimate, route, missing))
            if not shortlist:
                break
            _, _, missing = min(shortlist)
            for edge in missing:
                known[edge] = self.query(*edge)
        assert all(edge in known for edge in edges(order)), 'Final route must contain only verified edges'
        assert self.mode != 'walk' or len(self.used) <= budget
        return order


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()
    provider = Provider(args.live)
    source_hash = compile_solver()
    points = provider.locations()
    results = []
    for n in (5,20):
        for mode in ('car','walk'):
            row = dict(visits=n, mode=mode)
            for name in ('baseline','proposed'):
                case = Case(provider, points[:n+1], mode)
                started = time.monotonic()
                order = getattr(case,name)()
                calls = len(case.rows) if mode == 'car' else len(case.used)
                row[name] = dict(api_calls=calls, seconds=case.measure(order), order=[points[i]['name'] for i in order],
                                 order_indices=order, computation_and_acquisition_seconds=round(time.monotonic()-started,3))
                print('RESULT ' + json.dumps(dict(visits=n,mode=mode,algorithm=name,**row[name]),ensure_ascii=False),flush=True)
            row['time_change_pct'] = round((row['proposed']['seconds']/row['baseline']['seconds']-1)*100,2)
            row['call_reduction_pct'] = round((1-row['proposed']['api_calls']/row['baseline']['api_calls'])*100,2)
            results.append(row)
            report = dict(results=results, locations=points, live_requests_this_run=provider.counts, source_sha256=source_hash,
                          conditions='One cold recommendation, open route, no workplace return, no pinned destination. Shared road observations. Replay excludes production 25s deadline and cache expiry. Proposed heuristic is experimental, not deployed.')
            (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('COMPLETE ' + json.dumps(provider.counts),flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('STOPPED ' + type(error).__name__ + ': ' + str(error),flush=True)
        raise SystemExit(1)
