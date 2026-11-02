const assert = require('node:assert/strict');
const { createScreen } = require('./map-recommendation-harness.cjs');
const visits = () => [3, 1, 2].map((id, index) => ({ id, lat: 35, lng: 129 + id / 1000, markerNumber: index + 1, visitOrderVersion: 2, status: 'pending', detailAddress: `방문지 ${id}` }));
(async () => {
  for (const mode of ['car', 'walk']) for (const accept of [true, false]) {
    const app = createScreen({ nativeNavigation: mode === 'car', taskRemoved: true });
    app.props.locations = visits();
    app.props.routeSegments = [{ mode, destinationKey: '3', sdkPreviewId: 'expired-process-preview', totalDistance: 2000, totalDuration: 900, path: [{ lat: 35, lng: 129 }, { lat: 35, lng: 129.003 }] }];
    const saved = JSON.stringify(app.props.routeSegments);
    app.props.optimized = true; app.props.isGuiding = true; app.render();
    app.find('MapCanvas').props.onCurrentLocationChange({ lat: 35.03, lng: 129.03 }); app.render(); await app.settle();
    const prompt = app.alerts.find(alert => alert[0] === '길안내 이어서 보기'); assert(prompt);
    assert.equal(app.requests.length, 0); assert.equal(app.orderRequests.length, 0);
    prompt[2].find(button => button.text === (accept ? '계속 안내' : '안내 종료')).onPress(); app.render(); await app.settle();
    assert.equal(app.props.isGuiding, accept);
    assert.deepEqual(Array.from(app.props.locations, row => row.id), [3, 1, 2], 'saved recommendation order is unchanged');
    if (accept) {
      assert.equal(JSON.stringify(app.props.routeSegments), saved, 'cached geometry is reused');
      app.find('MapCanvas').props.onRerouteRequest({ lat: 35.1, lng: 129.1 }); app.render(); await app.settle();
      assert.equal(app.find('Navigation'), undefined, 'a missing SDK preview is not rebuilt');
    }
    assert.equal(app.requests.length, 0, `${mode} ${accept ? 'resume' : 'decline'} makes no route requests`);
    assert.equal(app.orderRequests.length, 0, 'no recommendation request after changed GPS');
  }
  const ended = createScreen(); ended.props.locations = visits(); ended.render();
  ended.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); ended.render(); await ended.settle();
  assert(!ended.alerts.some(alert => alert[0] === '길안내 이어서 보기'));
  console.log('PASS: car/walk cold resume and decline preserve saved order, request zero new routes/orders, and completed sessions do not prompt');
})().catch(error => { console.error(error); process.exitCode = 1; });
