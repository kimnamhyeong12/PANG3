const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('../node_modules/@babel/core');

// Run the screen's hooks and rendered event handlers with native surfaces mocked.
// GPS, backend responses, and workspace refreshes are controlled by each scenario.
function createScreen({ nativeNavigation = false, nativeWalking = false, taskRemoved = false } = {}) {
  let slots = [], cursor = 0, effects = [], dirty = true, tree;
  const pendingOrders = [];
  const calls = [], alerts = [], requests = [], orderRequests = [], storage = new Map(), sdkPreviews = new Set();
  let sdkSequence = 0;
  const tabTimers = new Set(), recommendationTimers = new Set(), tabEvents = [];
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
      if (name.endsWith('/auth')) return { apiFetch: (...args) => context.fetch(...args) };
      if (name.includes('KakaoMapWebView')) return { __esModule: true, default: 'MapCanvas' };
      if (name.includes('SafetyGuideBadge')) return { __esModule: true, default: 'SafetyBadge' };
      if (name.includes('ManeuverGuideCard')) return { __esModule: true, default: 'ManeuverCard' };
      if (name.includes('RegistrationFab')) return { __esModule: true, default: 'RegistrationFab' };
      if (name.includes('PhotoUploadScreen')) return { __esModule: true, default: 'PhotoUpload' };
      if (name.includes('ProjectBrowser')) return { __esModule: true, default: 'ProjectBrowser' };
      if (name.includes('FacilityApplicationScreen')) return { __esModule: true, default: 'FacilityApplication' };
      if (name.includes('kakao-navigation')) return { KakaoNavigationView: 'Navigation', KakaoWalkingMapView: 'WalkingMap', isWalkingMapAvailable: () => nativeWalking, isKakaoNavigationAvailable: () => nativeNavigation,
        beginRouteSession() { taskRemoved = false; calls.push(['begin-route']); },
        endRouteSession() { calls.push(['end-route']); }, wasRouteTaskRemoved: () => taskRemoved,
        isSdkPreviewAvailable: id => sdkPreviews.has(id), discardSdkPreview: id => sdkPreviews.delete(id),
        previewSdkRoute: body => nativeNavigation ? new Promise((resolve, reject) => requests.push({ url: 'sdk:preview', sdk: true, options: { body: JSON.stringify(body) }, resolve, reject })) : Promise.reject(new Error('No native SDK')) };
      if (name.includes('BulkUploadModal')) return { __esModule: true, default: 'BulkUpload' };
      if (name.includes('busanDistricts')) return { BUSAN_DISTRICT_CODES: { '사하구': '21100' } };
      if (name.includes('notificationService')) return { stopRouteNotification: async () => {}, updateRouteNotification: async () => {} };
      if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), name), 'utf8'));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name.endsWith('.js') ? name : `${name}.js`));
      throw Error('Unexpected import: ' + name);
    };
    const context = { module, exports: module.exports, require: requireMock, console, URLSearchParams, AbortController,
      setTimeout: (fn, ms) => { if (ms === 200) { const timer = { fn }; recommendationTimers.add(timer); return timer; } if (ms !== 5000) return setTimeout(fn, ms); const timer = { fn }; tabTimers.add(timer); return timer; },
      clearTimeout: timer => { if (!recommendationTimers.delete(timer) && !tabTimers.delete(timer)) clearTimeout(timer); }, setInterval, clearInterval,
      process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://backend.test', EXPO_PUBLIC_KAKAO_REST_API_KEY: 'test' } },
      fetch: (url, options = {}) => {
        if (url.includes('/geo/coord2address.json')) return Promise.resolve({ ok: true,
          json: async () => ({ documents: [{ road_address: { address_name: '부산 사하구 현재 위치' } }] }) });
        if (url.endsWith('/api/routes/order')) {
          orderRequests.push(JSON.parse(options.body));
          return new Promise(resolve => pendingOrders.push({ input: JSON.parse(options.body), resolve, signal: options.signal }));
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
  async function settle() { for (let i = 0; i < 3; i++) { for (const timer of [...recommendationTimers]) { recommendationTimers.delete(timer); timer.fn(); } await new Promise(setImmediate); if (dirty) render(); } }
  function response(request, data) {
    if (!request) return;
    if (request.sdk) {
      const segment = { ...data.segments[0], engine: 'kakao-sdk', sdkPreviewId: `sdk-${++sdkSequence}`,
        arrivalMode: JSON.parse(request.options.body).multiArrival ? 'MULTI' : 'DEFAULT',
        totalDistance: data.totalDistance, totalDuration: data.totalDuration };
      sdkPreviews.add(segment.sdkPreviewId); request.resolve(segment);
    } else request.resolve({ ok: true, text: async () => JSON.stringify(data), json: async () => data });
  }
  return { props, render, settle, find, nodes, text, requests, orderRequests, pendingOrders, response, calls, alerts, tabEvents,
    expireTabTimers: () => { for (const timer of [...tabTimers]) { tabTimers.delete(timer); timer.fn(); } },
    markTaskRemoved: () => { taskRemoved = true; }, expireSdkPreviews: () => sdkPreviews.clear() };
}

module.exports = { createScreen };
