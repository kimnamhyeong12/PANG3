const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/routeProgress.js'), 'utf8');
  const { remainingRouteProgress, routeCompletion, routeTrafficRail } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(routeCompletion(1000,1000),0);
  assert.equal(routeCompletion(1000,500),0.5);
  assert.equal(routeCompletion(1000,0),1);
  assert.equal(routeCompletion(1000,1200),0);
  assert.equal(routeCompletion(0,0),null);
  assert.equal(routeCompletion(1000,null),null);
  assert.equal(routeCompletion(1000,-1),null);
  const rail = routeTrafficRail([
    { trafficState: 4, path: [{lat:35,lng:129},{lat:35.01,lng:129}] },
    { trafficState: 1, path: [{lat:35.01,lng:129},{lat:35.04,lng:129}] },
  ]);
  assert.ok(Math.abs(rail[0].fraction - 0.25) < 0.00001, 'rail section sizes follow road distance');
  assert.equal(rail[0].start,0);
  assert.equal(rail[0].color,'#16A34A');
  assert.ok(Math.abs(rail[1].start - 0.25) < 0.00001);
  assert.equal(rail[1].color,'#DC2626');
  assert.deepEqual(routeTrafficRail(null),[]);
  assert.deepEqual(routeTrafficRail([{path:[{lat:null,lng:null}]}]),[]);
  const route = { path: [{ lat: 35, lng: 129 }, { lat: 35, lng: 129.01 }], totalDistance: 1000, totalDuration: 600 };
  assert.equal(remainingRouteProgress(route, { lat: 35, lng: 129 }).distance, 1000);
  const half = remainingRouteProgress(route, { latitude: 35, longitude: 129.005 });
  assert.equal(half.distance, 500); assert.equal(half.duration, 300);
  assert.equal(remainingRouteProgress(route, { lat: 35, lng: 129.01 }).distance, 0);
  assert.equal(remainingRouteProgress(route, { lat: 35, lng: 129.02 }).duration, 0);
  assert.equal(remainingRouteProgress(route, { lat: 35, lng: 128.99 }).distance, 1000);
  assert.ok(remainingRouteProgress(route, { lat: 35.01, lng: 129.005 }).distanceFromPath > 1000);
  const corner = { ...route, path: [...route.path, { lat: 35.01, lng: 129.01 }] };
  const afterTurn = remainingRouteProgress(corner, { lat: 35.005, lng: 129.01 });
  assert.ok(afterTurn.distance > 250 && afterTurn.distance < 300, 'remaining distance follows the route around its corner');
  assert.equal(remainingRouteProgress(route, { lat: null, lng: null }), null);
  assert.equal(remainingRouteProgress({ path: [{ lat: 35, lng: 129 }] }, { lat: 35, lng: 129 }), null);
  assert.equal(remainingRouteProgress({ path: [{ lat: 35, lng: 129 }, { lat: null, lng: null }] }, { lat: 35, lng: 129 }), null);
  assert.equal(remainingRouteProgress({ path: [route.path[0], route.path[0]], totalDistance: 0, totalDuration: 0 }, route.path[0]).duration, 0);
  console.log('Route progress checks passed: segment projection, bends, endpoints, off-route distance and invalid GPS');
})().catch(error => { console.error(error); process.exitCode = 1; });
