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
const InputSurface = ({ placeholder }) => React.createElement('input', { placeholder });
class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation(callback) { callback?.(this.value); } }
const noOp = () => {};
let searchSafeAreaEdges;
const rn = { Animated: { Value, View: Surface, spring: () => ({ start: noOp }), timing: () => ({ start: noOp }) }, ActivityIndicator: Surface, BackHandler: { addEventListener: () => ({ remove: noOp }) }, FlatList: Surface, Keyboard: { addListener: () => ({ remove: noOp }), dismiss: noOp }, KeyboardAvoidingView: Surface, Modal: ({ visible, children }) => visible ? React.createElement(Surface, null, children) : null, PanResponder: { create: () => ({ panHandlers: {} }) }, Platform: { OS: 'android' }, Pressable: Surface, ScrollView: Surface, Text: Surface, TextInput: Surface, TouchableOpacity: Surface, View: Surface, StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} } };
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false, plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'] }).code;
  const localRequire = name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return rn;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: ({ edges, children }) => { searchSafeAreaEdges = edges; return React.createElement(Surface, null, children); } };
    if (name === '@expo/vector-icons') return { Ionicons: Surface };
    if (name.includes('async-storage')) return { getItem: async () => null, setItem: async () => {} };
    if (name.includes('kakao-navigation')) return { KakaoNavigationView: Surface, isKakaoNavigationAvailable: () => false };
    if (name.includes('notificationService')) return { stopRouteNotification: noOp, updateRouteNotification: noOp };
    if (name.includes('busanDistricts')) return { BUSAN_DISTRICT_CODES: {} };
    if (name.includes('BulkUploadModal')) return { __esModule: true, default: Surface };
    if (name.includes('CustomAlert')) return { showAlert: noOp };
    if (name.includes('KakaoMapWebView') || name.includes('VoiceTextInput') || name.includes('WorkplaceField')) return { __esModule: true, default: Surface };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.js'));
    throw new Error('Unexpected dependency ' + name);
  };
  new Function('require', 'exports', 'module', source)(localRequire, exports, { exports });
  return exports;
}
const MapScreen = load(path.join(base, 'screens/MapScreen.js')).default;
rn.TextInput = InputSurface;
const html = renderToStaticMarkup(React.createElement(MapScreen, { user: { userId: 7, workSido: '부산광역시', workSigungu: '사상구' }, locations: [], routeSegments: [], groupAssignments: [] }));
assert.ok(html.includes('방문지를 추가해주세요')); assert.ok(!html.includes('근무지')); assert.ok(html.includes('미처리 업무'));
const { default: Search, HighlightedPlace } = load(path.join(base, 'components/PlaceSearchOverlay.js'));
let searchContainerStyle;
rn.KeyboardAvoidingView = ({ style, children }) => { searchContainerStyle = style; return React.createElement(Surface, null, children); };
const searchHtml = renderToStaticMarkup(React.createElement(Search, { userId: 7, onClose: noOp }));
assert.ok(searchHtml.includes('최근 검색'));
assert.ok(searchHtml.includes('placeholder="주소 또는 방문지 검색"'), 'search uses the ordinary text input');
assert.deepEqual(searchSafeAreaEdges, ['top'], 'search header respects the device status bar');
assert.equal(searchContainerStyle.position, 'absolute');
for (const edge of ['top', 'bottom', 'left', 'right']) assert.equal(searchContainerStyle[edge], 0, `Search must cover the map at ${edge}`);
const highlight = HighlightedPlace({ text: '동아대학교 부민캠퍼스', query: '동아대' });
const match = highlight.props.children.find(child => child.key === 'match0');
assert.equal(match.props.style.color, '#168DE2'); assert.equal(match.props.children, '동아대');
const Sheet = load(path.join(base, 'components/SearchResultSheet.js')).default;
let sheetGestures; let sheetPosition; let sheetScroll;
rn.PanResponder.create = config => { sheetGestures = config; return { panHandlers: {} }; };
rn.Animated.Value = class extends Value { constructor(value) { super(value); sheetPosition = this; } };
rn.Animated.spring = (value, options) => ({ start: callback => { value.setValue(options.toValue); callback?.({ finished: true }); } });
rn.ScrollView = props => { sheetScroll = props; return React.createElement(Surface, null, props.children); };
assert.ok(renderToStaticMarkup(React.createElement(Sheet, { height: 600, results: [], query: '동아대', locations: [] })).includes('검색 결과 0건'));
const gesture = (dy, vy = 0) => ({ dy, dx: 0, vy });
sheetGestures.onPanResponderGrant(null, gesture(6));
sheetGestures.onPanResponderMove(null, gesture(6));
assert.equal(sheetPosition.value, 200, 'taking the gesture must not jump by the capture threshold');
sheetGestures.onPanResponderMove(null, gesture(206));
assert.ok(sheetPosition.value > 200 && sheetPosition.value < 248, 'lower edge has bounded resistance');
sheetGestures.onPanResponderRelease(null, gesture(206));
assert.equal(sheetPosition.value, 200, 'over-pull settles back at the lower edge');
sheetGestures.onPanResponderGrant(null, gesture(-6));
sheetGestures.onPanResponderMove(null, gesture(-306));
sheetGestures.onPanResponderRelease(null, gesture(-306, -0.5));
assert.equal(sheetPosition.value, 0);
assert.equal(sheetGestures.onMoveShouldSetPanResponderCapture(null, gesture(-20)), true, 'first-row gestures belong to the entire sheet, including upward list handoff');
assert.equal(sheetGestures.onMoveShouldSetPanResponderCapture(null, { dy: 1, dx: 0 }), false, 'ordinary taps remain available for result selection');
sheetScroll.onScroll({ nativeEvent: { contentOffset: { y: 100 } } });
assert.equal(sheetGestures.onMoveShouldSetPanResponderCapture(null, gesture(20)), false, 'native list scroll must not be interrupted above its first row');
assert.equal(sheetGestures.onMoveShouldSetPanResponderCapture(null, gesture(-20)), false, 'native list retains upward scrolling away from its top');
sheetScroll.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
assert.equal(sheetGestures.onMoveShouldSetPanResponderCapture(null, gesture(20)), true, 'pulling down at the first row moves the sheet');
sheetGestures.onPanResponderGrant(null, gesture(6));
sheetGestures.onPanResponderMove(null, gesture(86));
assert.equal(sheetPosition.value, 80, 'downward pull from the first row moves the expanded sheet');
sheetGestures.onPanResponderRelease(null, gesture(86, 0.5));
assert.equal(sheetPosition.value, 200, 'downward pull settles in the half-height position');
rn.StatusBar = { currentHeight: 0 };
const ReportList = load(path.join(base, 'screens/ReportListScreen.js')).default;
let controls = [];
rn.TouchableOpacity = props => { controls.push(props); return React.createElement(Surface, null, props.children); };
const reportLocations = [
  { id: 1, status: 'pending', detailAddress: '작업 전 장소' },
  { id: 2, status: 'working', detailAddress: '작업 중 장소' },
  { id: 3, status: 'complete', detailAddress: '작업 후 장소' },
];
let selectedRows; let selectionChanges = 0;
const reportHtml = renderToStaticMarkup(React.createElement(ReportList, {
  locations: reportLocations, selectedIds: [1, 2, 3],
  onSelectionChange: () => selectionChanges++, onCreateReport: rows => { selectedRows = rows; },
}));
const checkboxes = controls.filter(control => control.accessibilityRole === 'checkbox');
assert.equal(checkboxes[0].disabled, true);
assert.equal(checkboxes[0].accessibilityState.checked, false, 'cached pre-work selection must not remain checked');
assert.equal(checkboxes[1].disabled, false);
assert.equal(checkboxes[2].disabled, false);
checkboxes[0].onPress();
assert.equal(selectionChanges, 0, 'pre-work selection is guarded even if its handler is invoked');
assert.ok(reportHtml.includes('작업 전 · 선택 불가'));
const isCreateReportButton = control => React.Children.toArray(control.children)
  .some(child => child.props?.children === '선택한 방문지로 보고서 만들기');
controls.find(isCreateReportButton).onPress();
assert.deepEqual(selectedRows.map(row => row.id), [2, 3], 'cached pre-work IDs must not reach report creation');
controls = [];
renderToStaticMarkup(React.createElement(ReportList, { locations: reportLocations.slice(0, 1), selectedIds: [1] }));
assert.equal(controls.find(isCreateReportButton).disabled, true);
console.log('Place screen render checks passed: map/search gestures and pre-work report selection guards');
