const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/routeSession.js'), 'utf8');
  const { restoreRouteSession } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const day = '2026-09-27';
  const rows = [{ id: 1, status: 'complete' }, { id: 2, status: 'complete' }, { id: 3, status: 'pending' }];
  const session = { day, order: ['1', '2', '3'], optimized: true, isGuiding: true, currentSegmentIndex: 1, routeSegments: [{ to: 1 }, { to: 2 }, { to: 3 }] };
  const restored = restoreRouteSession(rows, session, day);
  assert.deepEqual(restored.locations.map(row => row.id), [3, 1, 2]);
  assert.deepEqual(restored.segments, [{ to: 3 }]);
  assert.equal(restored.currentSegmentIndex, 0);
  assert.equal(restored.isGuiding, true);
  assert.equal(restoreRouteSession(rows, session, '2026-09-28'), null);
  assert.equal(restoreRouteSession([...rows, { id: 4, status: 'pending' }], session, day), null);
  assert.equal(restoreRouteSession(rows, { ...session, routeSegments: [] }, day), null);
  assert.equal(restoreRouteSession(rows.map(row => ({ ...row, status: 'complete' })), session, day).optimized, false);
  const pending = rows.map(row => ({ ...row, status: 'pending' }));
  assert.equal(restoreRouteSession(pending, session, day).currentSegmentIndex, 1);
  console.log('Route session checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
