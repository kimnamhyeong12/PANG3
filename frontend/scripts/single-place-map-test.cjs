const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('../node_modules/@babel/core');

// Run the screen's hooks and rendered event handlers with native surfaces mocked.
// GPS, backend responses, and workspace refreshes are controlled by each scenario.
function createScreen({ nativeNavigation = false, taskRemoved = false } = {}) {
  let slots = [], cursor = 0, effects = [], dirty = true, tree;
  const calls = [], alerts = [], requests = [], storage = new Map(), sdkPreviews = new Set();
  let sdkSequence = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const emptySubscription = () => ({ remove() {} });
  class AnimatedValue { setValue() {} }
  const native = { Platform: { OS: nativeNavigation ? 'android' : 'test' }, StyleSheet: { create: s => s, absoluteFill: {}, absoluteFillObject: {} },
    Animated: { Value: AnimatedValue, View: 'AnimatedView', timing: () => ({ start(cb) { cb?.({ finished: true }); } }), spring: () => ({ start() {} }) },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    Keyboard: { addListener: emptySubscription }, BackHandler: { addEventListener: emptySubscription } };
  for (const name of ['View', 'Text', 'TextInput', 'TouchableOpacity', 'Pressable', 'FlatList', 'ScrollView', 'Modal', 'ActivityIndicator']) native[name] = name;
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false,
      plugins: [[require('../node_modules/@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], require('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
    const requireMock = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react-native') return native;
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async key => storage.get(key) || null,
        setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) };
      if (name.includes('CustomAlert')) return { showAlert: (...args) => alerts.push(args) };
      if (name === '../utils/auth') return { apiFetch: (...args) => context.fetch(...args) };
      if (name.includes('KakaoMapWebView')) return { __esModule: true, default: 'MapCanvas' };
      if (name.includes('kakao-navigation')) return { KakaoNavigationView: 'Navigation', isKakaoNavigationAvailable: () => nativeNavigation,
        beginRouteSession() { taskRemoved = false; calls.push(['begin-route']); },
        endRouteSession() { calls.push(['end-route']); }, wasRouteTaskRemoved: () => taskRemoved,
        isSdkPreviewAvailable: id => sdkPreviews.has(id), discardSdkPreview: id => sdkPreviews.delete(id),
        previewSdkRoute: body => nativeNavigation ? new Promise((resolve, reject) => requests.push({ url: 'sdk:preview', sdk: true, options: { body: JSON.stringify(body) }, resolve, reject })) : Promise.reject(new Error('No native SDK')) };
      if (name.includes('BulkUploadModal')) return { __esModule: true, default: 'BulkUpload' };
      if (name.includes('busanDistricts')) return { BUSAN_DISTRICT_CODES: { '사하구': '21100' } };
      if (name.includes('notificationService')) return { stopRouteNotification: async () => {}, updateRouteNotification: async () => {} };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name.endsWith('.js') ? name : `${name}.js`));
      throw Error('Unexpected import: ' + name);
    };
    const context = { module, exports: module.exports, require: requireMock, console, URLSearchParams, AbortController, setTimeout, clearTimeout,
      process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://backend.test', EXPO_PUBLIC_KAKAO_REST_API_KEY: 'test' } },
      fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) };
    vm.runInNewContext(code, context, { filename: file });
    return module.exports;
  }
  const Screen = load(path.join(__dirname, '../screens/MapScreen.js')).default;
  const props = { user: { userId: 1, workSido: '부산광역시', workSigungu: '사하구' },
    activeGroup: { groupId: 1, personalWorkspace: true }, locationScope: 'personal', locations: [], pendingWork: [],
    roadPath: [], routeSegments: [], currentSegmentIndex: 0, optimized: false, isGuiding: false,
    onLocationClick: (...args) => calls.push(args), onDataChanged: async () => {}, setPanelOpen() {}, onAddWork: async () => true };
  for (const [setter, key] of Object.entries({ setLocations: 'locations', setRoadPath: 'roadPath', setRouteSegments: 'routeSegments',
    setCurrentSegmentIndex: 'currentSegmentIndex', setOptimized: 'optimized', setIsGuiding: 'isGuiding', setTotalDuration: 'totalDuration' })) {
    props[setter] = value => { props[key] = typeof value === 'function' ? value(props[key]) : value; dirty = true; };
  }
  function render() {
    let rounds = 0;
    do {
      if (++rounds > 30) throw Error('Render loop');
      dirty = false; cursor = 0; effects = [];
      tree = Screen(props);
      while (typeof tree?.type === 'function') tree = tree.type(tree.props);
      const queued = effects;
      queued.forEach(effect => effect());
    } while (dirty);
    return tree;
  }
  function nodes(node) {
    if (arguments.length === 0) node = tree;
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const find = (type, label) => nodes().find(node => node.type === type &&
    (!label || text(node).includes(label) || node.props.accessibilityLabel === label));
  async function settle() { for (let i = 0; i < 3; i++) { await new Promise(setImmediate); if (dirty) render(); } }
  function response(request, data) {
    if (!request) return;
    if (request.sdk) {
      const segment = { ...data.segments[0], engine: 'kakao-sdk', sdkPreviewId: `sdk-${++sdkSequence}`,
        arrivalMode: JSON.parse(request.options.body).multiArrival ? 'MULTI' : 'DEFAULT',
        totalDistance: data.totalDistance, totalDuration: data.totalDuration };
      sdkPreviews.add(segment.sdkPreviewId); request.resolve(segment);
    } else request.resolve({ ok: true, text: async () => JSON.stringify(data), json: async () => data });
  }
  return { props, render, settle, find, nodes, text, requests, response, calls, alerts,
    markTaskRemoved: () => { taskRemoved = true; }, expireSdkPreviews: () => sdkPreviews.clear() };
}

const visit = (id, lng) => ({ id, lat: 35, lng, detailAddress: `장소 ${id}`, adminDong: `동 ${id}`, status: 'pending', markerNumber: id, visitOrderVersion: 2 });
const route = (target) => ({ segments: [{ routePriority: 'TIME', routeCompared: true, path: [{ lat: 35, lng: 129 }, { lat: target.lat, lng: target.lng }] }], totalDistance: 1000, totalDuration: 600 });

(async () => {
  const app = createScreen({ nativeNavigation: true });
  app.props.locations = [visit(1, 129.01), visit(2, 129.02), visit(3, 129.03)];
  app.render();
  const topOverlay = app.nodes().find(node => node.props.pointerEvents === 'box-none' && node.props.onLayout);
  topOverlay.props.onLayout({ nativeEvent: { layout: { y: 35, height: 210 } } });
  app.find('TouchableOpacity', '미처리 업무 목록 펼치기').props.onLayout({ nativeEvent: { layout: { height: 44 } } });
  app.render();
  assert.equal(app.find('MapCanvas').props.routeViewportPadding.top, 301, 'route fit clears the measured top overlay and marker height');
  assert.equal(app.find('MapCanvas').props.routeViewportPadding.bottom, 96, 'route fit clears the bottom action');
  topOverlay.props.onLayout({ nativeEvent: { layout: { y: 35, height: 300 } } }); app.render();
  assert.equal(app.find('MapCanvas').props.routeViewportPadding.top, 391, 'expanded UI updates the visible map region');
  app.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 });
  app.render();
  assert.equal(app.find('MapCanvas').props.locations.length, 3, 'all administrative dongs appear together');
  assert.equal(app.requests.length, 0, 'registration/GPS never requests a full road route');

  app.find('MapCanvas').props.onMarkerClick(app.props.locations[2]);
  app.render();
  const first = (await app.settle(), app.requests.shift());
  assert.equal(first.url, 'sdk:preview', 'vehicle preview uses SDK, never REST');
  app.response(first, route(app.props.locations[2])); await app.settle();
  assert.deepEqual(app.props.locations.map(row => row.id), [1, 2, 3], 'preview preserves numbering');
  assert.equal(app.props.routeSegments.length, 0, 'preview does not change active guidance');
  app.find('MapCanvas').props.onMarkerClick(app.props.locations[2]);
  assert.equal(app.calls.length, 1, 'second press opens report');

  const begin = app.find('TouchableOpacity', '안내 시작').props.onPress();
  app.render();
  app.response((await app.settle(), app.requests.shift()), route(app.props.locations[2])); await begin; await app.settle();
  assert.deepEqual(Array.from(app.props.locations, row => row.id), [3, 1, 2]);
  assert.deepEqual(Array.from(app.props.locations, row => row.markerNumber), [1, 2, 3]);
  assert.equal(app.props.routeSegments.length, 1);
  assert.equal(app.props.routeSegments[0].destinationKey, '3');
  assert.equal(app.props.isGuiding, true);

  app.find('MapCanvas').props.onMarkerClick(app.props.locations[1]); app.render();
  app.response((await app.settle(), app.requests.shift()), route(app.props.locations[1])); await app.settle();
  assert.equal(app.props.routeSegments[0].destinationKey, '3', 'browsing during guidance preserves destination');
  assert.equal(app.props.locations[0].id, 3);
  assert.equal(app.find('MapCanvas').props.guideTarget.id, 3, 'arrival detection follows committed destination');
  assert.equal(app.find('MapCanvas').props.previewRouteSegment.destinationKey, '1');

  app.props.locations = app.props.locations.filter(row => row.id !== 3); app.render();
  assert.equal(app.props.isGuiding, false, 'transferring out the destination stops guidance');
  assert.equal(app.props.routeSegments.length, 0);

  // Latest selection wins even when backend responses arrive out of order.
  app.find('MapCanvas').props.onMarkerClick(app.props.locations[1]); app.render();
  const slow = (await app.settle(), app.requests.shift());
  app.find('MapCanvas').props.onMarkerClick(app.props.locations[0]); app.render();
  const fast = (await app.settle(), app.requests.shift());
  app.response(fast, route(app.props.locations[0])); await app.settle();
  app.response(slow, route(app.props.locations[1])); await app.settle();
  assert.equal(app.find('MapCanvas').props.previewRouteSegment.destinationKey, '1');

  // Facility selection remains inside the same map and asks for a dong first.
  app.find('TouchableOpacity', '방문지 추가 방법').props.onPress(); app.render();
  app.find('TouchableOpacity', '공공시설물').props.onPress(); app.render();
  const region = (await app.settle(), app.requests.shift());
  assert(region.url.includes('/api/sgis/boundaries'));
  assert(!app.requests.some(request => request.url.includes('/api/public-data')));
  const dongA = { properties: { adm_nm: '부산광역시 사하구 A동', adm_cd: '2110010' },
    geometry: { type: 'Polygon', coordinates: [[[129.1, 35.1], [129.2, 35.2], [129.1, 35.1]]] } };
  const dongB = { properties: { adm_nm: '부산광역시 사하구 B동', adm_cd: '2110020' } };
  app.response(region, { features: [dongA, dongB] }); await app.settle();
  app.find('TouchableOpacity', 'A동').props.onPress(); app.render();
  assert.equal(app.find('MapCanvas').props.focusCoordinates.length, 2, 'facility dong moves the camera without drawing SGIS polygons');
  assert.equal(app.find('MapCanvas').props.boundaries, undefined);
  assert.equal(app.requests.length, 0, 'no facility request until category selection');
  app.find('TouchableOpacity', '심폐제세동기').props.onPress(); app.render();
  const facilities = (await app.settle(), app.requests.shift());
  assert(facilities.url.includes('category=aed') && facilities.url.includes(encodeURIComponent('A동')));
  app.response(facilities, { items: [] }); await app.settle();
  const regionButton = app.nodes().find(node => node.props?.accessibilityLabel === '공공시설물 조회 지역 선택');
  regionButton.props.onPress(); app.render();
  app.response((await app.settle(), app.requests.shift()), { features: [dongA, dongB] }); await app.settle();
  app.find('TouchableOpacity', 'B동').props.onPress(); app.render();
  const nextFacilities = (await app.settle(), app.requests.shift());
  assert(nextFacilities.url.includes('category=aed') && nextFacilities.url.includes(encodeURIComponent('B동')));
  assert.equal(app.find('MapCanvas').props.locations.length, 2, 'facility dong does not hide registered visits');
  const facility = { id: 'aed-b', lat: 35, lng: 129.04, detailAddress: 'B동 AED', adminDong: 'B동', task: 'AED' };
  app.response(nextFacilities, { items: [facility] }); await app.settle();
  app.find('TouchableOpacity', 'B동 AED').props.onPress(); app.render();
  const register = app.find('TouchableOpacity', '1건 등록').props.onPress(); app.render();
  const saving = (await app.settle(), app.requests.shift());
  assert(saving.url.endsWith('/api/locations'));
  assert.equal(JSON.parse(saving.options.body).adminDong, 'B동');
  app.response(saving, { ...facility, id: 99, status: 'pending' }); await register; await app.settle();
  assert.equal(app.find('MapCanvas').props.locations.length, 3, 'facility registration joins visits from other dongs');
  assert.equal(app.requests.length, 0, 'facility registration changes numbers without drawing a route');

  const failure = createScreen({ nativeNavigation: true });
  failure.props.locations = [visit(1, 129.01), visit(2, 129.02), visit(3, 129.03)];
  failure.render();
  failure.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); failure.render();
  failure.find('MapCanvas').props.onMarkerClick(failure.props.locations[2]); failure.render();
  failure.response((await failure.settle(), failure.requests.shift()), route(failure.props.locations[2])); await failure.settle();
  failure.expireSdkPreviews();
  const unsuccessful = failure.find('TouchableOpacity', '안내 시작').props.onPress(); failure.render();
  (await failure.settle(), failure.requests.shift()).reject(new Error('offline')); await unsuccessful; await failure.settle();
  assert.deepEqual(Array.from(failure.props.locations, row => row.id), [1, 2, 3], 'failed guidance never renumbers');
  assert.equal(failure.props.isGuiding, false);
  const successful = failure.find('TouchableOpacity', '안내 시작').props.onPress(); failure.render();
  failure.response((await failure.settle(), failure.requests.shift()), route(failure.props.locations[2])); await successful; await failure.settle();
  failure.props.locations = [...failure.props.locations, { ...visit(4, 129.001), visitOrderVersion: undefined }]; failure.render();
  assert.equal(failure.props.locations[0].id, 3, 'new nearby visit cannot displace the active destination');
  const pinnedOrder = Array.from(failure.props.locations, row => row.id);
  failure.find('MapCanvas').props.onCurrentLocationChange({ lat: 35.005, lng: 129.02 }); failure.render();
  assert.deepEqual(Array.from(failure.props.locations, row => row.id), pinnedOrder, 'GPS movement preserves numbers');
  const target = failure.props.locations.find(row => row.id === 2);
  failure.find('MapCanvas').props.onMarkerClick(target); failure.render();
  failure.response((await failure.settle(), failure.requests.shift()), route(target)); await failure.settle();
  assert.equal(failure.props.locations[0].id, 3);
  const change = failure.find('TouchableOpacity', '이곳으로 안내 변경').props.onPress(); failure.render();
  failure.response((await failure.settle(), failure.requests.shift()), route(target)); await change; await failure.settle();
  assert.deepEqual(Array.from(failure.props.locations, row => row.id), [2, ...pinnedOrder.filter(id => id !== 2)]);
  assert.equal(failure.props.routeSegments.length, 1);
  failure.props.locations = failure.props.locations.map(row => row.id === 2 ? { ...row, status: 'complete' } : row); failure.render();
  assert.equal(failure.props.isGuiding, false, 'report completion ends the single destination guidance');
  assert.equal(failure.find('MapCanvas').props.locations.find(row => row.id === 2).markerLabel, '✓');
  const nativeView = failure.find('Navigation');
  assert.equal(nativeView, undefined, 'completing the destination releases the SDK view');

  const car = createScreen({ nativeNavigation: true });
  car.props.locations = [visit(1, 129.01)]; car.render();
  car.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); car.render();
  car.find('MapCanvas').props.onMarkerClick(car.props.locations[0]); car.render();
  const carPreview = (await car.settle(), car.requests.shift());
  assert.equal(JSON.parse(carPreview.options.body).routePriority, 'TIME', 'vehicle preview prioritizes fastest SDK route');
  car.response(carPreview, route(car.props.locations[0])); await car.settle();
  const previewId = car.find('MapCanvas').props.previewRouteSegment.sdkPreviewId;
  const carStart = car.find('TouchableOpacity', '안내 시작').props.onPress(); await carStart; await car.settle();
  assert.equal(car.requests.length, 0, 'guidance starts the exact preview trip without recomputing');
  assert.equal(car.find('Navigation').props.destination.destinationKey, '1');
  assert.equal(car.find('Navigation').props.destination.previewId, previewId);
  assert.equal(car.find('MapCanvas').props.isGuiding, false, 'WebView must not run a second guidance engine');
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: 'old', distance: 10, duration: 5 } }); car.render();
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: '1', distance: 500, duration: 300 } }); car.render();
  await car.find('MapCanvas').props.onRerouteRequest({ lat: 35, lng: 129.001 });
  assert.equal(car.requests.length, 0, 'SDK handles vehicle rerouting without a second REST request');
  car.expireSdkPreviews();
  car.props.routeResumeToken = 1; car.render();
  assert.equal(car.find('Navigation'), undefined, 'old recommendation-only sessions are recalculated before SDK resumes');
  const restoredRoute = route(car.props.locations[0]);
  restoredRoute.segments[0].navigationDestination = { lat: 35.0008, lng: 129.01005 };
  restoredRoute.segments[0].routePriority = 'DISTANCE';
  car.response((await car.settle(), car.requests.shift()), restoredRoute); await car.settle();
  assert.equal(car.find('Navigation').props.destination.previewId, car.props.routeSegments[0].sdkPreviewId, 'restored SDK receives the freshly prepared trip');
  const updatedPath = [{ latitude: 35, longitude: 129 }, { latitude: 35.001, longitude: 129.01 }];
  car.find('Navigation').props.onRouteChanged({ nativeEvent: { destinationKey: 'old', path: updatedPath, totalDistance: 800, totalDuration: 400 } }); car.render();
  assert.notEqual(car.props.roadPath, updatedPath, 'stale destination events never replace the active route');
  const updatedTraffic = [{ trafficState: 1, path: updatedPath }];
  car.find('Navigation').props.onRouteChanged({ nativeEvent: { destinationKey: '1', path: updatedPath,
    trafficSections: updatedTraffic, totalDistance: 800, totalDuration: 400 } }); car.render();
  assert.equal(car.props.roadPath, updatedPath, 'SDK reroutes update the app geometry');
  assert.equal(car.props.routeSegments[0].trafficSections, updatedTraffic, 'SDK reroutes preserve traffic colors');
  car.find('Navigation').props.onArrived({ nativeEvent: { destinationKey: '1' } }); car.render();
  assert.equal(car.props.isGuiding, false);
  car.alerts.at(-1)[2].find(button => button.text === '작업 기록 작성').onPress();
  assert.equal(car.calls.at(-1)[1], 'report', 'SDK arrival returns to the task report');

  const experiment = createScreen({ nativeNavigation: true });
  experiment.props.locations = [visit(1, 129.01)]; experiment.render();
  experiment.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); experiment.render();
  experiment.find('MapCanvas').props.onMarkerClick(experiment.props.locations[0]); experiment.render();
  experiment.response((await experiment.settle(), experiment.requests.shift()), route(experiment.props.locations[0])); await experiment.settle();
  experiment.find('TouchableOpacity', '주변 도로 도착 허용').props.onPress(); experiment.render();
  const multiRequest = (await experiment.settle(), experiment.requests.shift());
  assert.equal(multiRequest.url, 'sdk:preview');
  assert.equal(JSON.parse(multiRequest.options.body).multiArrival, true);
  experiment.response(multiRequest, route(experiment.props.locations[0])); await experiment.settle();
  const multiToken = experiment.find('MapCanvas').props.previewRouteSegment.sdkPreviewId;
  await experiment.find('TouchableOpacity', '안내 시작').props.onPress(); await experiment.settle();
  assert.equal(experiment.find('Navigation').props.destination.previewId, multiToken, 'multi-arrival guidance uses the exact compared preview');
  assert.equal(experiment.requests.length, 0);

  const walk = createScreen();
  walk.props.locations = [visit(1, 129.01)]; walk.render();
  walk.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); walk.render();
  walk.find('MapCanvas').props.onMarkerClick(walk.props.locations[0]); walk.render();
  await walk.settle();
  walk.find('TouchableOpacity', '도보 경로').props.onPress(); walk.render();
  walk.response((await walk.settle(), walk.requests.shift()), route(walk.props.locations[0])); await walk.settle();
  const walkStart = walk.find('TouchableOpacity', '안내 시작').props.onPress(); walk.render();
  walk.response((await walk.settle(), walk.requests.shift()), route(walk.props.locations[0])); await walkStart; await walk.settle();
  assert.equal(walk.find('Navigation'), undefined);
  assert.equal(walk.find('MapCanvas').props.isGuiding, true);

  const restarting = createScreen({ nativeNavigation: true, taskRemoved: true });
  restarting.props.locations = [visit(1, 129.01)];
  restarting.props.routeSegments = [{ ...route(restarting.props.locations[0]).segments[0], mode: 'car', destinationKey: '1', sdkPreviewId: 'old-process-trip' }];
  restarting.props.optimized = true; restarting.props.isGuiding = true; restarting.render();
  restarting.find('MapCanvas').props.onCurrentLocationChange({ lat: 35.001, lng: 129.002 }); restarting.render();
  await restarting.settle();
  assert.equal(restarting.requests.length, 1, 'unfinished destination resumes without a button');
  assert.equal(restarting.requests[0].url, 'sdk:preview');
  assert.equal(JSON.parse(restarting.requests[0].options.body).startLat, 35.001, 'restart uses current GPS');
  assert.ok(restarting.calls.some(call => call[0] === 'begin-route'), 'restart clears native task-removed gate');
  restarting.response((await restarting.settle(), restarting.requests.shift()), route(restarting.props.locations[0])); await restarting.settle();
  assert.equal(restarting.find('Navigation').props.destination.destinationKey, '1');
  restarting.markTaskRemoved();
  restarting.find('Navigation').props.onEnded({ nativeEvent: { reason: 'ended', destinationKey: '1' } }); restarting.render();
  assert.equal(restarting.props.isGuiding, true, 'task removal cleanup does not end saved destination');
  assert.ok(!restarting.calls.some(call => call[0] === 'end-route'));
  restarting.find('TouchableOpacity', '안내 종료').props.onPress(); restarting.render();
  assert.equal(restarting.props.isGuiding, false);
  assert.ok(restarting.calls.some(call => call[0] === 'end-route'), 'explicit stop disables automatic restart');

  const walkingRestart = createScreen({ taskRemoved: true });
  walkingRestart.props.locations = [visit(1, 129.01)];
  walkingRestart.props.routeSegments = [{ ...route(walkingRestart.props.locations[0]).segments[0], mode: 'walk', destinationKey: '1' }];
  walkingRestart.props.optimized = true; walkingRestart.props.isGuiding = true; walkingRestart.render();
  walkingRestart.find('MapCanvas').props.onCurrentLocationChange({ lat: 35.002, lng: 129.003 }); walkingRestart.render();
  assert.equal(walkingRestart.requests.length, 1, 'walking also recalculates automatically from current GPS');
  walkingRestart.response((await walkingRestart.settle(), walkingRestart.requests.shift()), route(walkingRestart.props.locations[0])); await walkingRestart.settle();
  assert.equal(walkingRestart.find('MapCanvas').props.isGuiding, true);
  walk.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129.005 }); walk.render();
  assert.ok(walk.nodes().some(node => walk.text(node).includes('500m')), 'walking card shows the remaining half of a route');
  assert.equal(walk.requests.length, 0, 'GPS progress does not request another route');
  const returning = createScreen({ nativeNavigation: true });
  returning.props.user = { ...returning.props.user, workplaceAddress: '테스트 근무지', workplaceLat: 35.02, workplaceLng: 129.02 };
  returning.render();
  returning.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); returning.render();
  assert.equal(returning.find('MapCanvas').props.locations.some(item => item.isReturnLocation), false, 'workplace marker stays hidden before choosing return');
  returning.find('TouchableOpacity', '방문지 추가 방법').props.onPress(); returning.render();
  returning.find('TouchableOpacity', '근무지 복귀').props.onPress(); await returning.settle();
  assert.equal(returning.props.isGuiding, false, 'return button previews without starting guidance');
  assert.ok(returning.find('MapCanvas').props.locations.some(item => item.isReturnLocation), 'return preview reveals workplace marker');
  const returnRequest = returning.requests.shift();
  returning.response(returnRequest, route({ lat: 35.02, lng: 129.02 })); await returning.settle();
  await returning.find('TouchableOpacity', '안내 시작').props.onPress(); await returning.settle();
  assert.equal(returning.props.isGuiding, true, 'guidance starts only after confirmation');
  returning.find('TouchableOpacity', '안내 종료').props.onPress(); await returning.settle();
  assert.equal(returning.find('MapCanvas').props.locations.some(item => item.isReturnLocation), false, 'ending return hides the marker again');
  console.log('Single-place map checks passed: SDK ownership, recommendation, progress, arrival and walking guidance');
})().catch(error => { console.error(error); process.exitCode = 1; });
