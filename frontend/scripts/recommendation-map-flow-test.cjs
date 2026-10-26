const assert = require('node:assert/strict');
const { createScreen } = require('./map-recommendation-harness.cjs');
const visit = id => ({ id, lat: 35, lng: 129 + id / 1000, status: 'pending', markerNumber: id, visitOrderVersion: 2, detailAddress: `방문지 ${id}` });
const ids = app => Array.from(app.props.locations, row => row.id);
async function respond(app, pending, order, basis = 'roadDuration') {
  const byId = new Map(app.props.locations.map(row => [row.id, row]));
  pending.resolve({ ok: true, json: async () => ({ optimizedLocations: order.map(id => byId.get(id)), basis }) });
  await app.settle();
}
(async () => {
  const one = createScreen(); one.props.locations = [visit(1)]; one.render();
  one.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); one.render(); await one.settle();
  assert.equal(one.orderRequests.length, 0, 'a single visit needs no recommendation request');

  const app = createScreen({ nativeNavigation: true });
  app.props.locations = [visit(1), visit(2), visit(3)]; app.render();
  app.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); app.render();
  assert.equal(app.orderRequests.length, 0, 'registration and drawing are immediate before the debounce');
  await app.settle(); assert.equal(app.orderRequests.length, 1);
  assert.equal(app.orderRequests[0].cacheScope, '1:1:personal');
  assert.equal(app.orderRequests[0].guidanceStart, false);
  assert.equal(app.requests.length, 0, 'recommendation never starts native guidance or a route preview');
  await respond(app, app.pendingOrders.shift(), [3, 1, 2]); assert.deepEqual(ids(app), [3, 1, 2]);

  app.props.locations = [...app.props.locations, { ...visit(4), markerNumber: undefined }]; app.render();
  assert.deepEqual(ids(app), [3, 1, 2, 4], 'existing order stays visible while the new stop is appended');
  app.props.locations = [...app.props.locations, { ...visit(5), markerNumber: undefined }]; app.render(); await app.settle();
  assert.equal(app.orderRequests.length, 2, 'rapid registrations coalesce into one request');
  await respond(app, app.pendingOrders.shift(), [3, 5, 1, 2, 4]);

  app.props.locations = app.props.locations.map(row => row.id === 3 ? { ...row, status: 'complete' } : row); app.render(); await app.settle();
  assert.deepEqual(ids(app), [5, 1, 2, 4, 3]);
  assert.deepEqual(Array.from(app.props.locations, row => row.markerNumber), [1, 2, 3, 4, null]);
  assert.equal(app.orderRequests.length, 2, 'completion pulls numbers forward without recomputing');
  app.props.locations = app.props.locations.filter(row => row.id !== 1); app.render(); await app.settle();
  assert.equal(app.orderRequests.length, 2, 'removal preserves the remaining order too');

  app.props.locations = app.props.locations.map(row => row.id === 3 ? { ...row, status: 'pending' } : row); app.render(); await app.settle();
  assert.equal(app.orderRequests.length, 3, 'undo completion asks the server to solve with preserved legs');
  await respond(app, app.pendingOrders.shift(), [3, 5, 2, 4]);
  app.find('MapCanvas').props.onCurrentLocationChange({ lat: 35.01, lng: 129.01 }); app.render(); await app.settle();
  assert.equal(app.orderRequests.length, 3, 'continuous GPS movement alone never requests the provider');

  app.props.locations = [...app.props.locations, { ...visit(6), markerNumber: undefined }]; app.render(); await app.settle();
  const stale = app.pendingOrders.shift();
  assert.equal(stale.input.currentLocation.lat, 35.01, 'the next meaningful change uses the latest origin');
  app.props.locations = [...app.props.locations, { ...visit(7), markerNumber: undefined }]; app.render(); await app.settle();
  const latest = app.pendingOrders.shift();assert.equal(stale.signal.aborted, true);
  await respond(app, latest, [7, 6, 3, 5, 2, 4]);
  await respond(app, stale, [3, 5, 2, 4, 6]);
  assert.deepEqual(ids(app), [7, 6, 3, 5, 2, 4], 'a late response cannot remove or renumber the new list');

  const target = app.props.locations.find(row => row.id === 4);
  app.find('MapCanvas').props.onMarkerClick(target); app.render(); await app.settle();
  app.response(app.requests.shift(), { segments: [{ path: [{ lat: 35.01, lng: 129.01 }, { lat: target.lat, lng: target.lng }] }], totalDistance: 1000, totalDuration: 600 });
  await app.settle(); await app.find('TouchableOpacity', '안내 시작').props.onPress(); await app.settle();
  assert.equal(app.props.isGuiding, true);assert.equal(app.props.routeSegments[0].destinationKey, '4');
  const guidance = app.pendingOrders.shift();
  assert.equal(guidance.input.guidanceStart, true);assert.equal(guidance.input.pinnedKey, '4');
  await respond(app, guidance, [4, 7, 6, 3, 5, 2]);
  assert.equal(app.find('MapCanvas').props.guideTarget.id, 4, 'road-time updates keep the selected guidance destination');
  console.log('MapScreen reuse flow passed: coalescing, completion, undo, GPS gating, stale responses and pinned guidance');
})().catch(error => { console.error(error); process.exitCode = 1; });
