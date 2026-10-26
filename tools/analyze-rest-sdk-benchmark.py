"""Extract on-device public SDK callbacks without dumping the full instrument log."""
from pathlib import Path
import json,statistics
root=Path(__file__).resolve().parents[1];out=root/'tmp/rest-sdk-benchmark'
raw=(out/'sdk-run.txt').read_text(encoding='utf8')
assert 'INSTRUMENTATION_CODE: -1' in raw,'SDK benchmark not successfully completed'
def value(name):
    prefix='INSTRUMENTATION_RESULT: '+name+'='
    return next(l[len(prefix):] for l in raw.splitlines() if l.startswith(prefix))
sdk=dict(engine='KNTrip',records=json.loads(value('records')),stages=json.loads(value('stages')),warmup_ms=float(value('warmup_ms')),warmup_routes=int(value('warmup_routes')),recommendation_requests=int(value('recommendation_requests')))
assert len(sdk['records'])==400==len({(r['from'],r['to']) for r in sdk['records']})
assert not any('error' in r for r in sdk['records'])
(out/'sdk.json').write_text(json.dumps(sdk,ensure_ascii=False,indent=2),encoding='utf8')
rest=json.loads((out/'rest.json').read_text(encoding='utf8'))
summary=[]
for n in (5,10,20):
    rs=rest['stages'][:n];ss=sdk['stages'][:n];rc=sum(s['new_calls'] for s in rs)
    calls=rest['calls'][:rc];dest=sum('/destinations/' in r['endpoint'] for r in calls);origin=len(calls)-dest
    summary.append(dict(n=n,rest_calls=rc,rest_destination_calls=dest,rest_origin_calls=origin,sdk_calls=ss[-1]['cumulative_calls'],sdk_including_warmup_calls=ss[-1]['cumulative_calls']+sdk['warmup_routes'],rest_total_ms=sum(s['ms'] for s in rs),sdk_total_ms=sum(s['ms'] for s in ss),rest_last_add_ms=rs[-1]['ms'],sdk_last_add_ms=ss[-1]['ms'],rest_last_add_calls=rs[-1]['new_calls'],sdk_last_add_calls=ss[-1]['new_calls'],rest_price_known_won=dest*20,rest_unpublished_origin_count=origin,sdk_price_won=ss[-1]['cumulative_calls'],rest_assuming_origin20_won=(dest+origin)*20))
(out/'timing-cost-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(summary=summary,sdk_warmup_ms=sdk['warmup_ms'],sdk_edge_median_ms=statistics.median(r['ms'] for r in sdk['records']),rest_http_median_ms=statistics.median(r['ms'] for r in rest['calls'])),ensure_ascii=False,indent=2))
