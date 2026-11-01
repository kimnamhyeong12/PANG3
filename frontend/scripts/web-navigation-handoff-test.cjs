const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../screens/MapScreen.js'), 'utf8');
const start = source.indexOf('  const handleStartGuidance = async');
const end = source.indexOf('  const webHandoffAttempt', start);
const createGuidance = new Function('state', `with (state) { ${source.slice(start, end)} return handleStartGuidance; }`);
const effectStart = source.indexOf('    const request = webNavigationRequest;');
const effectEnd = source.indexOf('  }, [webNavigationRequest?.requestId', effectStart);
const consume = new Function('state', `with (state) { ${source.slice(effectStart, effectEnd)} }`);
const target = { id: 3, lat: 35.1, lng: 129, status: 'pending' };
const noop = () => {};
function state() {
  const calls = { alerts: [], sessions: 0, guiding: [], acknowledgements: [], handled: [], starts: [] };
  const value = { calls, cardTarget: null, segmentChanging: false, preview: { loading: true }, currentLocation: { lat: 35, lng: 129 },
    hasVisitCoordinates: p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng), isCompleted: p => p.status === 'complete',
    locationKey: p => String(p.id), visitDistance: () => 10, showAlert: (...args) => calls.alerts.push(args), transportMode: 'walk', activeSegment: null,
    isKakaoNavigationAvailable: () => true, guideRequestRef: { current: 0 }, workspaceScopeRef: { current: 'workspace' },
    setSegmentChanging: noop, returnDisplayMarker: { id: 'workplace', lat: 35.2, lng: 129.2, isReturnLocation: true },
    dailyReturnChoice: () => { throw Error('Web handoff must not ask a return confirmation'); }, dailyReturnPending: { current: null },
    fetchRouteSegment: async () => ({ segment: { path: [target] }, totalDuration: 100 }), cleanLocation: p => p,
    liveVisitsRef: { current: [target] }, manualOrderMembership: { current: null }, membershipKey: 'members', setLocations: noop,
    setRouteSegments: noop, setRoadPath: noop, setCurrentSegmentIndex: noop, setTotalDuration: noop, setTransportMode: noop,
    setNativeProgress: noop, setNativeSafety: noop, setNativeManeuver: noop, resumedRouteRef: { current: null }, scopeKey: 'scope', routeResumeToken: 0,
    setOptimized: noop, beginRouteSession: () => calls.sessions++, setGuidanceRecommendationToken: noop, setIsGuiding: v => calls.guiding.push(v),
    previewRequestRef: { current: 0 }, setPreview: noop, Platform: { OS: 'android' }, setKakaoDestination: noop,
    webNavigationRequest: { requestId: 'queued-request', groupId: 2, taskId: 3, mode: 'walk', expiresAt: new Date(Date.now() + 60000).toISOString() },
    isActive: true, activeGroup: { groupId: 2 }, webHandoffAttempt: { current: null }, markers: [target], pendingWork: [],
    onWebNavigationHandled: id => calls.handled.push(id), API_BASE_URL: 'https://local.invalid',
    fetch: async (...args) => { calls.acknowledgements.push(args); return { ok: true }; }, setWebHandoffRetry: noop,
  };
  return value;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const direct = state();
  assert.equal(await createGuidance(direct)(target, 'walk', { fromWeb: true }), true);
  assert.deepEqual(direct.calls.alerts, []); assert.equal(direct.calls.sessions, 1); assert.deepEqual(direct.calls.guiding, [true]);
  const car = state(); car.preview = { loading: true, mode: 'car', targetKey: '3', segment: { sdkPreviewId: 'stale-preview' } };
  car.previewVisit = () => { throw Error('web handoff must not ask to refresh a preview'); };
  car.isSdkPreviewAvailable = () => false;
  const carDestinations = []; car.setKakaoDestination = p => carDestinations.push(p);
  car.fetchRouteSegment = async (start, end, mode) => { assert.equal(mode, 'car'); return { segment: { path: [target], sdkPreviewId: 'phone-preview' }, totalDuration: 100 }; };
  assert.equal(await createGuidance(car)(target, 'car', { fromWeb: true }), true);
  assert.equal(car.calls.sessions, 1); assert.deepEqual(car.calls.alerts, []); assert.equal(carDestinations[0].previewId, 'phone-preview');
  const manual = state(); manual.preview = null; await createGuidance(manual)(target, 'walk'); assert.equal(manual.calls.alerts[0][0], '목적지 근처입니다'); assert.equal(manual.calls.sessions, 0);
  for (const destination of ['task', 'workplace']) {
    const phone = state(); phone.preview = null;
    if (destination === 'workplace') { phone.webNavigationRequest.destination = 'workplace'; phone.webNavigationRequest.taskId = 0; phone.liveVisitsRef.current.push(phone.returnDisplayMarker); }
    const begin = createGuidance(phone); phone.handleStartGuidance = (...args) => { phone.calls.starts.push(args); return begin(...args); };
    consume(phone); await flush();
    assert.equal(phone.calls.starts.length, 1); assert.equal(phone.calls.starts[0][2].fromWeb, true);
    assert.equal(phone.calls.guiding[0], true); assert.equal(phone.calls.acknowledgements.length, 1); assert.deepEqual(phone.calls.handled, ['queued-request']); assert.deepEqual(phone.calls.alerts, []);
    consume(phone); await flush(); assert.equal(phone.calls.starts.length, 1, 'same request is not started twice');
  }
  const waiting = state(); waiting.currentLocation = null; waiting.handleStartGuidance = () => { throw Error('must wait for phone GPS'); }; consume(waiting); assert.deepEqual(waiting.calls.handled, []);
  waiting.currentLocation = { lat: 35, lng: 129 }; waiting.segmentChanging = true; consume(waiting); assert.equal(waiting.webHandoffAttempt.current, null);
  const expired = state(); expired.webNavigationRequest.expiresAt = '2000-01-01T00:00:00Z'; expired.handleStartGuidance = () => { throw Error('expired request must not start'); }; consume(expired); assert.deepEqual(expired.calls.handled, ['queued-request']);
  console.log('Web-to-phone navigation checks passed: automatic start without extra confirmation, task/workplace, acknowledge once, GPS wait, busy wait, expiry; manual behavior preserved');
})().catch(e => { console.error(e); process.exit(1); });
