const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('../node_modules/@babel/core');

// Run the screen's hooks and rendered event handlers with native surfaces mocked.
// GPS, backend responses, and workspace refreshes are controlled by each scenario.
function createScreen({ nativeNavigation = false, nativeWalking = false, taskRemoved = false } = {}) {
  let slots = [], cursor = 0, effects = [], dirty = true, tree;
  const calls = [], alerts = [], requests = [], orderRequests = [], storage = new Map(), sdkPreviews = new Set();
  let sdkSequence = 0;
  const tabTimers = new Set(), tabEvents = [];
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
  const native = { Platform: { OS: nativeNavigation ? 'android' : 'test' }, StyleSheet: { create: s => s, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
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
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) };
      if (name === '@expo/vector-icons') return { Ionicons: 'Icon', MaterialCommunityIcons: 'Icon' };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async key => storage.get(key) || null,
        setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) };
      if (name.includes('CustomAlert')) return { showAlert: (...args) => alerts.push(args) };
      if (name === '../utils/auth') return { apiFetch: (...args) => context.fetch(...args) };
      if (name.includes('KakaoMapWebView')) return { __esModule: true, default: 'MapCanvas' };
      if (name.includes('SafetyGuideBadge')) return { __esModule: true, default: 'SafetyBadge' };
      if (name.includes('ManeuverGuideCard')) return { __esModule: true, default: 'ManeuverCard' };
      if (name.includes('RegistrationFab')) return { __esModule: true, default: 'RegistrationFab' };
      if (name.includes('PhotoUploadScreen')) return { __esModule: true, default: 'PhotoUpload' };
      if (name.includes('kakao-navigation')) return { KakaoNavigationView: 'Navigation', KakaoWalkingMapView: 'WalkingMap', isWalkingMapAvailable: () => nativeWalking, isKakaoNavigationAvailable: () => nativeNavigation,
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
    const context = { module, exports: module.exports, require: requireMock, console, URLSearchParams, AbortController,
      setTimeout: (fn, ms) => { if (ms !== 5000) return setTimeout(fn, ms); const timer = { fn }; tabTimers.add(timer); return timer; },
      clearTimeout: timer => { if (!tabTimers.delete(timer)) clearTimeout(timer); }, setInterval, clearInterval,
      process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://backend.test', EXPO_PUBLIC_KAKAO_REST_API_KEY: 'test' } },
      fetch: (url, options = {}) => {
        if (url.includes('/geo/coord2address.json')) return Promise.resolve({ ok: true,
          json: async () => ({ documents: [{ road_address: { address_name: '부산 사하구 현재 위치' } }] }) });
        if (url.endsWith('/api/routes/order')) {
          orderRequests.push(JSON.parse(options.body));
          return Promise.resolve({ ok: false }); // Exercise offline distance recommendations independently of guidance.
        }
        return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
      } };
    vm.runInNewContext(code, context, { filename: file });
    return module.exports;
  }
  const Screen = load(path.join(__dirname, '../screens/MapScreen.js')).default;
  const props = { user: { userId: 1, workSido: '부산광역시', workSigungu: '사하구' },
    activeGroup: { groupId: 1, personalWorkspace: true }, locationScope: 'personal', locations: [], pendingWork: [],
    roadPath: [], routeSegments: [], currentSegmentIndex: 0, optimized: false, isGuiding: false,
    onGuidanceTabsChange: visible => tabEvents.push(visible),
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
  return { props, render, settle, find, nodes, text, requests, orderRequests, response, calls, alerts, tabEvents,
    expireTabTimers: () => { for (const timer of [...tabTimers]) { tabTimers.delete(timer); timer.fn(); } },
    markTaskRemoved: () => { taskRemoved = true; }, expireSdkPreviews: () => sdkPreviews.clear() };
}

const visit = (id, lng) => ({ id, lat: 35, lng, detailAddress: `장소 ${id}`, adminDong: `동 ${id}`, status: 'pending', markerNumber: id, visitOrderVersion: 2 });
const route = (target) => ({ segments: [{ routePriority: 'TIME', routeCompared: true, path: [{ lat: 35, lng: 129 }, { lat: target.lat, lng: target.lng }] }], totalDistance: 1000, totalDuration: 600 });

(async () => {
  const list = createScreen();
  list.props.locations = Array.from({ length: 30 }, (_, index) => visit(index + 1, 129 + (index + 1) / 1000));
  list.render();
  list.find('TouchableOpacity', '방문지 목록 펼치기').props.onPress(); list.render();
  const visitScroll = list.find('ScrollView', '방문지 목록');
  assert.ok(visitScroll, 'expanded visits scroll vertically');
  assert.ok(visitScroll.props.style.maxHeight < 600, 'the visit list has a bounded viewport');
  assert.ok(list.text(visitScroll).includes('장소 30'), 'the last visit remains inside the scrollable list');
  list.find('TouchableOpacity', '방문지 목록 접기').props.onPress(); list.render();
  assert.equal(list.find('ScrollView', '방문지 목록'), undefined);

  const app = createScreen({ nativeNavigation: true });
  app.props.locations = [visit(1, 129.01), visit(2, 129.02), visit(3, 129.03)];
  app.render();
  assert.equal(app.find('TouchableOpacity', '뒤로가기'), undefined, 'root map has no back button');
  app.props.root = false; app.render();
  assert.ok(app.find('TouchableOpacity', '뒤로가기'), 'nested map retains its back button');
  app.props.root = true; app.render();
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
  assert.equal(app.orderRequests.length, 1, 'registration requests summary costs for visit ordering only');

  app.find('MapCanvas').props.onMarkerClick(app.props.locations[2]);
  app.render();
  const first = (await app.settle(), app.requests.shift());
  assert.equal(first.url, 'sdk:preview', 'vehicle preview uses SDK, never REST');
  app.response(first, route(app.props.locations[2])); await app.settle();
  assert.deepEqual(Array.from(app.props.locations, row => row.id), [1, 2, 3], 'preview preserves numbering');
  assert.equal(app.props.routeSegments.length, 0, 'preview does not change active guidance');
  app.find('MapCanvas').props.onMarkerClick(app.props.locations[2]);
  assert.equal(app.calls.length, 1, 'second press opens report');

  const begin = app.find('TouchableOpacity', '안내 시작').props.onPress();
  app.render();
  app.response((await app.settle(), app.requests.shift()), route(app.props.locations[2])); await begin; await app.settle();
  assert.deepEqual(Array.from(app.props.locations, row => row.id), [3, 2, 1], 'remaining visits are recommended from the user-selected first stop');
  assert.deepEqual(Array.from(app.props.locations, row => row.markerNumber), [1, 2, 3]);
  assert.equal(app.props.routeSegments.length, 1);
  assert.equal(app.props.routeSegments[0].destinationKey, '3');
  assert.equal(app.props.isGuiding, true);

  app.find('MapCanvas').props.onMarkerClick(app.props.locations[1]); app.render();
  app.response((await app.settle(), app.requests.shift()), route(app.props.locations[1])); await app.settle();
  assert.equal(app.props.routeSegments[0].destinationKey, '3', 'browsing during guidance preserves destination');
  assert.equal(app.props.locations[0].id, 3);
  assert.equal(app.find('MapCanvas').props.guideTarget.id, 3, 'arrival detection follows committed destination');
  assert.equal(app.find('MapCanvas').props.previewRouteSegment.destinationKey, '2');

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
  app.find('RegistrationFab').props.items.find(item => item.label === '공공시설물').onPress(); app.render();
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
  assert.equal(car.find('Navigation').props.style[0].position, 'absolute', 'navigation must overlay the map rather than collapse below it');
  assert.equal(car.find('Navigation').props.style[0].bottom, 0);
  assert.equal(car.find('MapCanvas').props.isGuiding, false, 'WebView must not run a second guidance engine');
  car.find('TouchableOpacity', '주변 주유소').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.nearbyCategory, 'gas');
  car.find('TouchableOpacity', '주변 주차장').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.nearbyCategory, 'parking');
  car.find('TouchableOpacity', '주변 주차장').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.nearbyCategory, null, 'tapping the selected nearby category clears its pins');
  assert.equal(car.requests.length, 0, 'browsing nearby gas/parking must not replace the active route');
  const modePreview = car.find('Navigation').props.destination.previewId;
  assert.equal(car.find('Navigation').props.map3D, true, 'guidance starts in 3D');
  assert.equal(car.text(car.find('TouchableOpacity', '2D 지도로 전환')), '2D', 'mode label shows the view selected by pressing the button');
  car.find('TouchableOpacity', '2D 지도로 전환').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.map3D, false);
  assert.equal(car.text(car.find('TouchableOpacity', '3D 지도로 전환')), '3D');
  assert.equal(car.find('Navigation').props.destination.previewId, modePreview, 'camera toggle preserves the active route');
  car.find('TouchableOpacity', '3D 지도로 전환').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.map3D, true);
  assert.equal(car.requests.length, 0, 'camera mode does not request a new route');
  assert.equal(car.find('Navigation').props.recenterRequest, 0);
  car.find('TouchableOpacity', '내 위치로 돌아가기').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.recenterRequest, 1);
  car.find('TouchableOpacity', '내 위치로 돌아가기').props.onPress(); car.render();
  assert.equal(car.find('Navigation').props.recenterRequest, 2, 'each recenter press reaches the native guide');
  assert.equal(car.find('Navigation').props.destination.previewId, modePreview, 'recentering preserves guidance');
  const maneuver = { destinationKey: '1', visible: true, primary: { code: 'RightTurn', distance: 120, road: '다송로' },
    secondary: { code: 'LeftTurn', distance: 100 } };
  car.find('Navigation').props.onManeuverUpdate({ nativeEvent: { ...maneuver, destinationKey: 'old' } }); car.render();
  assert.equal(car.find('ManeuverCard').props.guide, null);
  car.find('Navigation').props.onManeuverUpdate({ nativeEvent: maneuver }); car.render();
  assert.equal(car.find('ManeuverCard').props.guide.primary.label, '우회전');
  assert.equal(car.find('ManeuverCard').props.guide.secondary.distance, 100);
  car.find('Navigation').props.onManeuverUpdate({ nativeEvent: { ...maneuver, primary: { ...maneuver.primary, distance: 80 } } }); car.render();
  assert.equal(car.find('ManeuverCard').props.guide.primary.distance, 80);
  car.find('Navigation').props.onManeuverUpdate({ nativeEvent: { destinationKey: '1', visible: false } }); car.render();
  assert.equal(car.find('ManeuverCard').props.guide, null, 'route replacement clears stale turn instructions');
  const retainedDestination = car.find('Navigation').props.destination;
  car.props.isActive = false; car.render();
  assert.equal(car.find('Navigation').props.mapActive, false, 'leaving the map pauses its native surface');
  assert.equal(car.props.isGuiding, true, 'tab changes preserve guidance');
  car.props.isActive = true; car.render();
  assert.equal(car.find('Navigation').props.mapActive, true, 'returning resumes the native surface');
  assert.deepEqual(car.find('Navigation').props.destination, retainedDestination, 'tab changes retain the same guidance destination');
  assert.equal(car.find('Navigation').props.style[1].top, 0, 'SDK fills the complete screen without a WebView strip above it');
  assert.equal(car.nodes().some(node => node.props.pointerEvents === 'box-none' && node.props.onLayout), false, 'visit selection is hidden during guidance');
  assert.equal(car.nodes().some(node => node.props.onPanResponderRelease && node.props.onLayout), false,
    'guidance footer cannot reveal app tabs with a swipe');
  car.find('TouchableOpacity', '현재 위치와 목적지 번갈아 보기').props.onPress(); await car.settle();
  assert(car.text(car.find('TouchableOpacity', '현재 위치와 목적지 번갈아 보기')).includes('부산 사하구 현재 위치'));
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: 'old', distance: 10, duration: 5 } }); car.render();
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: '1', distance: 500, duration: 300 } }); car.render();
  assert.equal(String(car.find('Text', '현재 속도').props.children), '—', 'missing GPS speed must not look like a measured zero');
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: '1', distance: 480, duration: 290, speed: 42, speedValid: true } }); car.render();
  assert.equal(String(car.find('Text', '현재 속도').props.children), '42', 'bare map uses the SDK speed data in our own speed display');
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: 'old', distance: 10, duration: 5, speed: 100, speedValid: true } }); car.render();
  assert.equal(String(car.find('Text', '현재 속도').props.children), '42', 'old-session speed must not replace current-session speed');
  car.find('Navigation').props.onProgress({ nativeEvent: { destinationKey: '1', distance: 480, duration: 290, speed: 42, speedValid: false } }); car.render();
  assert.equal(String(car.find('Text', '현재 속도').props.children), '—', 'untrusted GPS speed must not be displayed as reliable');
  const safetyEvent = { destinationKey: '1', visible: true, kind: 'camera', label: '과속 단속', distance: 800, speedLimit: 50 };
  car.find('Navigation').props.onSafetyUpdate({ nativeEvent: { ...safetyEvent, destinationKey: 'old' } }); car.render();
  assert.equal(car.find('SafetyBadge'), undefined, 'safety events from another destination must be ignored');
  car.find('Navigation').props.onSafetyUpdate({ nativeEvent: safetyEvent }); car.render();
  assert.equal(car.find('SafetyBadge').props.notice.speedLimit, 50);
  car.find('Navigation').props.onSafetyUpdate({ nativeEvent: { ...safetyEvent, distance: 300 } }); car.render();
  assert.equal(car.find('SafetyBadge').props.notice.distance, 300, 'camera distance updates while approaching');
  car.find('Navigation').props.onSafetyUpdate({ nativeEvent: { destinationKey: '1', visible: false } }); car.render();
  assert.equal(car.find('SafetyBadge'), undefined, 'passing the camera clears the badge');
  await car.find('MapCanvas').props.onRerouteRequest({ lat: 35, lng: 129.001 });
  assert.equal(car.requests.length, 0, 'SDK handles vehicle rerouting without a second REST request');
  const routeBeforeRefresh = car.find('Navigation').props.destination.previewId;
  const failedRefresh = car.find('TouchableOpacity', '교통정보 반영해 경로 새로고침').props.onPress(); car.render();
  const failedRefreshRequest = (await car.settle(), car.requests.shift());
  assert.equal(failedRefreshRequest.url, 'sdk:preview', 'refresh asks the SDK for current traffic');
  failedRefreshRequest.reject(new Error('offline')); await failedRefresh; await car.settle();
  assert.equal(car.find('Navigation').props.destination.previewId, routeBeforeRefresh, 'failed refresh preserves guidance');
  const refresh = car.find('TouchableOpacity', '교통정보 반영해 경로 새로고침').props.onPress(); car.render();
  const refreshRequest = (await car.settle(), car.requests.shift());
  assert.equal(JSON.parse(refreshRequest.options.body).routePriority, 'TIME');
  car.response(refreshRequest, route(car.props.locations[0])); await refresh; await car.settle();
  assert.notEqual(car.find('Navigation').props.destination.previewId, routeBeforeRefresh, 'successful refresh starts the fresh trip');
  assert.equal(car.props.isGuiding, true);
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
  assert.equal(experiment.find('TouchableOpacity', '주변 도로 도착 허용'), undefined);
  const previewToken = experiment.find('MapCanvas').props.previewRouteSegment.sdkPreviewId;
  await experiment.find('TouchableOpacity', '안내 시작').props.onPress(); await experiment.settle();
  assert.equal(experiment.find('Navigation').props.destination.previewId, previewToken, 'guidance uses the displayed preview');
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
  returning.find('RegistrationFab').props.onToggle(); returning.render();
  returning.find('RegistrationFab').props.items.find(item => item.label === '근무지').onPress(); await returning.settle();
  assert.equal(returning.props.isGuiding, false, 'return button previews without starting guidance');
  assert.ok(returning.find('MapCanvas').props.locations.some(item => item.isReturnLocation), 'return preview reveals workplace marker');
  const returnRequest = returning.requests.shift();
  returning.response(returnRequest, route({ lat: 35.02, lng: 129.02 })); await returning.settle();
  await returning.find('TouchableOpacity', '안내 시작').props.onPress(); await returning.settle();
  assert.equal(returning.props.isGuiding, true, 'guidance starts only after confirmation');
  returning.find('TouchableOpacity', '안내 종료').props.onPress(); await returning.settle();
  assert.equal(returning.find('MapCanvas').props.locations.some(item => item.isReturnLocation), false, 'ending return hides the marker again');
  // Direct selection accepts both map drags and valid numeric input without a lock/apply step.
  const direct = createScreen(); direct.render();
  direct.find('RegistrationFab').props.items.find(item => item.label === '지도에서 선택').onPress(); direct.render();
  assert.equal(direct.find('MapCanvas').props.mapSelectMode, true);
  direct.find('MapCanvas').props.onCenterChange({ lat: 35.1, lng: 129.1 }); direct.render();
  const latitude = direct.find('TextInput', '위도 직접 입력');
  latitude.props.onFocus(); latitude.props.onChangeText('35.2'); direct.render();
  assert.equal(direct.find('MapCanvas').props.selectionCoordinateRequest.lat, 35.2);
  assert.equal(direct.find('MapCanvas').props.selectionCoordinateRequest.lng, 129.1);
  const token = direct.find('MapCanvas').props.selectionCoordinateRequest.token;
  direct.find('TextInput', '위도 직접 입력').props.onChangeText('-'); direct.render();
  assert.equal(direct.find('MapCanvas').props.selectionCoordinateRequest.token, token, 'incomplete input must not move the map');
  direct.find('TextInput', '위도 직접 입력').props.onBlur();
  direct.find('MapCanvas').props.onCenterChange({ lat: 36, lng: 128 }); direct.render();
  assert.equal(direct.find('TextInput', '위도 직접 입력').props.value, '36.000000');

  // The compact guidance menu switches mode only after the new route succeeds.
  const menu = createScreen({ nativeNavigation: true });
  menu.props.locations = [visit(1, 129.01)]; menu.render();
  menu.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); menu.render();
  menu.find('MapCanvas').props.onMarkerClick(menu.props.locations[0]); menu.render();
  menu.response((await menu.settle(), menu.requests.shift()), route(menu.props.locations[0])); await menu.settle();
  await menu.find('TouchableOpacity', '안내 시작').props.onPress(); await menu.settle();
  menu.props.renderGuidanceNavigation = closeMenu => ({ type: 'GuideNavigation', props: { onReport: closeMenu } });
  menu.render();
  menu.find('TouchableOpacity', '안내 메뉴').props.onPress(); menu.render();
  assert.equal(menu.find('Modal').props.visible, true);
  menu.find('GuideNavigation').props.onReport(); menu.render();
  assert.equal(menu.find('Modal').props.visible, false, 'choosing an app tab dismisses the guidance menu');
  assert.equal(menu.props.isGuiding, true, 'opening another app tab does not stop guidance');
  menu.find('TouchableOpacity', '안내 메뉴').props.onPress(); menu.render();
  menu.find('TouchableOpacity', '도보').props.onPress(); await menu.settle();
  assert.equal(menu.props.routeSegments[0].mode, 'car', 'old guidance survives while the replacement route loads');
  menu.requests.shift().reject(new Error('offline')); await menu.settle();
  assert.equal(menu.props.routeSegments[0].mode, 'car', 'failed mode switch preserves the active route');
  assert.equal(menu.props.isGuiding, true);
  menu.find('TouchableOpacity', '안내 메뉴').props.onPress(); menu.render();
  menu.find('TouchableOpacity', '도보').props.onPress(); await menu.settle();
  menu.response(menu.requests.shift(), route(menu.props.locations[0])); await menu.settle();
  assert.equal(menu.props.routeSegments[0].mode, 'walk');
  assert.equal(menu.find('Navigation'), undefined, 'walking releases the vehicle SDK overlay');

  const phoneWalk = createScreen({ nativeWalking: true });
  phoneWalk.props.locations = [visit(1, 129.01)];
  phoneWalk.props.routeSegments = [{ ...route(phoneWalk.props.locations[0]).segments[0], mode: 'walk', destinationKey: '1' }];
  phoneWalk.props.isGuiding = true; phoneWalk.render();
  phoneWalk.find('MapCanvas').props.onCurrentLocationChange({ lat: 35, lng: 129 }); phoneWalk.render();
  await phoneWalk.settle();
  phoneWalk.response(phoneWalk.requests.shift(), route(phoneWalk.props.locations[0])); await phoneWalk.settle();
  assert.equal(phoneWalk.find('WalkingMap').props.headingFollow, true, 'walking defaults to phone heading, independently of GPS bearing');
  assert.equal(phoneWalk.find('WalkingMap').props.route.length, 2);
  assert.equal(phoneWalk.find('WalkingMap').props.userLocation.lat, 35);
  assert.equal(phoneWalk.find('WalkingMap').props.position, undefined, 'GPS coordinates must not override the native layout position prop');
  assert.ok(phoneWalk.find('WalkingMap').props.style.some(style => style?.height > 0), 'walking native surface receives a measured height before rendering');
  phoneWalk.find('WalkingMap').props.onReady({ nativeEvent: { headingAvailable: true } }); phoneWalk.render();
  assert.equal(phoneWalk.find('TouchableOpacity', '북쪽 고정으로 전환'), undefined, 'phone heading needs no separate control');
  phoneWalk.find('TouchableOpacity', '내 위치로 돌아가기').props.onPress(); phoneWalk.render();
  assert.equal(phoneWalk.find('WalkingMap').props.recenterRequest, 1);
  assert.equal(phoneWalk.find('WalkingMap').props.headingFollow, true);
  phoneWalk.find('WalkingMap').props.onMapPress(); phoneWalk.render();
  assert.equal(phoneWalk.props.isGuiding, true, 'closing the bottom card never stops guidance');
  assert.ok(phoneWalk.find('TouchableOpacity', '안내 정보 펼치기'));
  phoneWalk.find('TouchableOpacity', '안내 정보 펼치기').props.onPress(); phoneWalk.render();
  phoneWalk.find('WalkingMap').props.onError({ nativeEvent: { message: 'map unavailable' } }); phoneWalk.render();
  assert.equal(phoneWalk.find('WalkingMap'), undefined);
  assert.equal(phoneWalk.find('MapCanvas').props.isGuiding, true, 'map initialization failure retains walking guidance on the fallback surface');
  console.log('Single-place map checks passed: SDK ownership, recommendation, progress, arrival, native walking controls and fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
