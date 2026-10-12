const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../utils/routeSession.js'), 'utf8');
  const routeUrl = `data:text/javascript;base64,${Buffer.from(routeSource).toString('base64')}`;
  const orderSource = fs.readFileSync(path.join(__dirname, '../utils/visitOrder.js'), 'utf8').replace("'./routeSession'", JSON.stringify(routeUrl));
  const { recommendVisitOrder, promoteVisit, visitSetKey, hasVisitCoordinates } = await import(`data:text/javascript;base64,${Buffer.from(orderSource).toString('base64')}`);
  const { numberVisits, restoreRouteSession } = await import(routeUrl);
  const day = '2026-10-12';
  const rows = [1, 2, 3, 4, 5].map(id => ({ id, lat: 35, lng: 129 + id / 100, status: 'pending' }));
  const start = { lat: 35, lng: 129 };
  const recommended = recommendVisitOrder(rows, start);
  assert.deepEqual(recommended.map(row => row.id), [1, 2, 3, 4, 5]);
  const committed = promoteVisit(recommended, '3');
  assert.deepEqual(committed.map(row => row.id), [3, 1, 2, 4, 5]);
  assert.deepEqual(committed.map(row => row.markerNumber), [1, 2, 3, 4, 5]);
  assert.equal(visitSetKey(committed), visitSetKey(recommended), 'preview/commit order does not trigger a new recommendation');
  assert.deepEqual(rows.map(row => row.markerNumber), Array(5).fill(undefined), 'input server rows are not mutated');

  const added = recommendVisitOrder([...committed, { id: 6, lat: 35, lng: 129.001, status: 'pending' }], start, '3');
  assert.equal(added[0].id, 3, 'new registrations preserve the guidance destination');
  assert.deepEqual(added.map(row => row.markerNumber), [1, 2, 3, 4, 5, 6]);
  const completed = recommendVisitOrder(rows.map(row => row.id === 2 ? { ...row, status: 'complete' } : row), start);
  assert.equal(completed.at(-1).id, 2);
  assert.equal(completed.at(-1).markerNumber, null);
  assert.deepEqual(completed.slice(0, -1).map(row => row.markerNumber), [1, 2, 3, 4]);
  assert.equal(hasVisitCoordinates({ lat: null, lng: 129 }), false);
  assert.equal(hasVisitCoordinates({ lat: 100, lng: 129 }), false);

  const numbers = Object.fromEntries(committed.map(row => [String(row.id), row.markerNumber]));
  const numbered = numberVisits(rows, numbers, { visitOrderVersion: 2 });
  assert.deepEqual(numbered.map(row => row.id), [3, 1, 2, 4, 5], 'restart preserves the committed numbering');
  const session = { day, order: committed.map(row => String(row.id)), visitNumbers: numbers, visitOrderVersion: 2,
    routeSegments: [{ destinationKey: '3', path: [start, rows[2]], mode: 'car' }], optimized: true, isGuiding: true };
  const restored = restoreRouteSession(numbered, session, day, { singleDestinationOnly: true });
  assert.equal(restored.segments.length, 1);
  assert.equal(restored.segments[0].destinationKey, '3');
  assert.deepEqual(restored.locations.map(row => row.id), [3, 1, 2, 4, 5]);
  assert.equal(restoreRouteSession(numbered.filter(row => row.id !== 3), session, day, { singleDestinationOnly: true }), null, 'transferred-out destination is not restored');
  assert.equal(restoreRouteSession(numbered.map(row => row.id === 3 ? { ...row, status: 'complete' } : row), session, day, { singleDestinationOnly: true }), null);
  const oldSession = { ...session, routeSegments: rows.map(row => ({ to: row.id })) };
  assert.equal(restoreRouteSession(rows, oldSession, day, { singleDestinationOnly: true }), null, 'legacy full routes are discarded');
  console.log('Visit recommendation and single-place session checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
