const assert = require('node:assert/strict');
const { createScreen } = require('./map-recommendation-harness.cjs');
const ids = app => Array.from(app.props.locations, row => row.id);
async function start(app, id) {
  const target = app.props.locations.find(row => row.id === id);
  app.find('MapCanvas').props.onMarkerClick(target); app.render(); await app.settle();
  app.response(app.requests.shift(), { segments: [{ path: [{ lat: 35, lng: 129 }, { lat: target.lat, lng: target.lng }] }], totalDistance: 2000, totalDuration: 600 });
  await app.settle(); await app.find('TouchableOpacity', '안내 시작').props.onPress(); await app.settle();
  assert.equal(app.props.isGuiding, true);
}
async function stop(app) {
  app.find('TouchableOpacity', '안내 종료').props.onPress();
  app.alerts.at(-1)[2].find(button => button.text === '안내 종료').onPress();
  app.render(); await app.settle();
}
(async () => {
  const app = createScreen({ nativeNavigation: true });
  app.props.locations = [1, 2, 3, 4, 5, 6].map(id => ({ id, lat: 35, lng: 129 + id / 100,
    markerNumber: id, visitOrderVersion: 2, status: 'pending', detailAddress: `방문지 ${id}` }));
  app.render(); app.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); app.render(); await app.settle();
  await start(app, 1);
  assert.deepEqual(ids(app), [1, 2, 3, 4, 5, 6], 'starting at the current first stop retains order');
  await stop(app);
  await start(app, 6);
  assert.deepEqual(ids(app), [6, 5, 4, 3, 2, 1], 'a new first stop orders the remaining visits locally from that stop');
  assert.equal(app.orderRequests.length, 0, 'neither start calls the order API');
  app.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: '6', distance: 1500, duration: 450 } }); app.render();
  const controls = app.nodes().find(node => node.props.onLayout && Array.isArray(node.props.style) && node.props.style[0]?.zIndex === 18);
  assert(controls); controls.props.onLayout({ nativeEvent: { layout: { height: 260 } } }); app.render();
  const rail = app.find('View', '목적지까지 이동 진행률');
  assert(rail.props.style[1].bottom >= controls.props.style[1].bottom + 260 + 24, 'rail clears measured controls and its position indicator');
  await stop(app);
  assert.deepEqual(ids(app), [6, 5, 4, 3, 2, 1], 'ending guidance preserves the new order');
  app.find('MapCanvas').props.onCurrentLocationChange({ lat: 35.2, lng: 129.2 }); app.render(); await app.settle();
  assert.deepEqual(ids(app), [6, 5, 4, 3, 2, 1], 'GPS changes preserve order');
  assert.equal(app.orderRequests.length, 0);
  console.log('PASS: first-stop selection, ordinary start/stop, GPS stability, no order API, and measured rail separation');
})().catch(error => { console.error(error); process.exitCode = 1; });
