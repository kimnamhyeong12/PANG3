// Render initial screen trees with native surfaces mocked. Device gestures are tested separately.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const base = path.join(__dirname, '..');
const cache = new Map();
const Surface = ({ children }) => React.createElement('div', null, children);
class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation(callback) { callback?.(this.value); } }
const noOp = () => {};
const rn = { Animated: { Value, View: Surface, spring: () => ({ start: noOp }), timing: () => ({ start: noOp }) }, ActivityIndicator: Surface, BackHandler: { addEventListener: () => ({ remove: noOp }) }, FlatList: Surface, Keyboard: { addListener: () => ({ remove: noOp }), dismiss: noOp }, KeyboardAvoidingView: Surface, Modal: ({ visible, children }) => visible ? React.createElement(Surface, null, children) : null, PanResponder: { create: () => ({ panHandlers: {} }) }, Platform: { OS: 'android' }, Pressable: Surface, ScrollView: Surface, Text: Surface, TextInput: Surface, TouchableOpacity: Surface, View: Surface, StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} } };
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false, plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'] }).code;
  const localRequire = name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return rn;
    if (name === '@expo/vector-icons') return { Ionicons: Surface };
    if (name.includes('async-storage')) return { getItem: async () => null, setItem: async () => {} };
    if (name.includes('kakao-navigation')) return { KakaoNavigationView: Surface, isKakaoNavigationAvailable: () => false };
    if (name.includes('notificationService')) return { stopRouteNotification: noOp, updateRouteNotification: noOp };
    if (name.includes('PublicDataMapMode')) return { BUSAN_DISTRICT_CODES: {} };
    if (name.includes('CustomAlert')) return { showAlert: noOp };
    if (name.includes('KakaoMapWebView') || name.includes('VoiceTextInput') || name.includes('WorkplaceField')) return { __esModule: true, default: Surface };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.js'));
    throw new Error('Unexpected dependency ' + name);
  };
  new Function('require', 'exports', 'module', source)(localRequire, exports, { exports });
  return exports;
}
const MapScreen = load(path.join(base, 'screens/MapScreen.js')).default;
const html = renderToStaticMarkup(React.createElement(MapScreen, { user: { userId: 7, workSido: '부산광역시', workSigungu: '사상구' }, locations: [], routeSegments: [], groupAssignments: [] }));
assert.ok(html.includes('주소 또는 방문지 검색')); assert.ok(html.includes('근무지')); assert.ok(html.includes('미처리 업무'));
const { default: Search, HighlightedPlace } = load(path.join(base, 'components/PlaceSearchOverlay.js'));
assert.ok(renderToStaticMarkup(React.createElement(Search, { userId: 7, onClose: noOp })).includes('최근 검색'));
const highlight = HighlightedPlace({ text: '동아대학교 부민캠퍼스', query: '동아대' });
const match = highlight.props.children.find(child => child.key === 'match0');
assert.equal(match.props.style.color, '#168DE2'); assert.equal(match.props.children, '동아대');
const Sheet = load(path.join(base, 'components/SearchResultSheet.js')).default;
assert.ok(renderToStaticMarkup(React.createElement(Sheet, { height: 600, results: [], query: '동아대', locations: [] })).includes('검색 결과 0건'));
console.log('Place screen render checks passed: map entry, recent searches, query highlight and result sheet');
