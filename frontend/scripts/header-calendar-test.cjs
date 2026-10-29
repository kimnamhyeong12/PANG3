const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const cache = new Map();
let slots = [], cursor = 0, pending = [], dirty = false;
const hooks = { ...React,
  useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; dirty = true; }];
  },
  useEffect(effect, deps) {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, i) => value !== previous[i])) pending.push(effect);
    slots[index] = deps;
  },
};
const animated = { ScrollView: 'ScrollView', Text: 'AnimatedText', event: (_mapping, config) => config.listener, Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate(config) { return config; } } };
const rn = { Animated: animated, PixelRatio: { roundToNearestPixel: value => Math.round(value * 2.625) / 2.625 }, StyleSheet: { create: value => value, absoluteFill: {} }, Platform: { OS: 'android' }, PanResponder: { create: () => ({ panHandlers: {} }) }, ScrollView: 'ScrollView', Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'Button' };
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return rn;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 31, bottom: 24 }) };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.js'));
    throw Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}
const base = path.join(__dirname, '..');
const { ScreenHeader, BackButton, EmptyState } = load(path.join(base, 'components/ui.js'));
assert.doesNotThrow(() => EmptyState({ title: '기록이 없습니다' }));
const outer = ScreenHeader({ title: '그룹', root: true, onBack() {} });
const inner = ScreenHeader({ title: '보고서 다운로드', onBack() {} });
const titleStyle = tree => descendants(tree).find(node => node.type === 'Text').props.style.filter(Boolean).reduce((all, item) => ({ ...all, ...item }), {});
assert.equal(descendants(outer).filter(node => node.type === BackButton).length, 0, 'root screens must not display back buttons');
assert.equal(descendants(inner).filter(node => node.type === BackButton).length, 1, 'nested screens retain back buttons');
assert.equal(titleStyle(outer).fontSize, 24);
assert.equal(titleStyle(inner).fontSize, 24);
assert.equal(outer.props.style[1].paddingTop, 32, 'header follows safe area rather than a device-specific offset');
assert.equal(BackButton({ onPress() {} }).props.style.height, 44, 'small inner icons retain a usable touch target');

const Picker = load(path.join(base, 'components/ReportDatePicker.js')).default;
slots = []; cursor = 0; pending = [];
let picked, closed = 0, tree;
const props = { visible: true, value: '2026-10-31', title: '시작일', onSelect: date => { picked = date; }, onClose: () => closed++ };
function render() {
  do { dirty = false; cursor = 0; pending = []; tree = Picker(props); pending.forEach(effect => effect()); } while (dirty);
}
function click(label) {
  const button = descendants(tree).find(node => node.props.accessibilityLabel === label);
  assert.ok(button, 'Missing control: ' + label); button.props.onPress(); render();
}
render(); click('연도와 월 선택');
const wheels = () => descendants(tree).filter(node => node.type.name === 'PeriodWheel');
assert.equal(wheels().length, 2, 'year and month are visible together');
const wheelComponent = wheels()[0].type;
wheels().find(node => node.props.label === '년').props.onChange(2031); render();
wheels().find(node => node.props.label === '월').props.onChange(2); render();
click('년월 선택 확인');
assert.equal(picked, undefined, 'year/month selection must not commit an arbitrary day');
click('2031-02-28'); assert.equal(picked, '2031-02-28'); assert.equal(closed, 1);
props.visible = false; render(); props.visible = true; render();
click('이전 달'); assert.ok(descendants(tree).some(node => node.props.accessibilityLabel === '2026-09-30'));
click('연도와 월 선택'); tree.props.onRequestClose(); render();
assert.equal(closed, 1, 'back from the year chooser returns to dates before closing the picker');
click('연도와 월 선택'); wheels().find(node => node.props.label === '월').props.onChange(12); render(); click('년월 선택 취소');
assert.ok(descendants(tree).some(node => node.props.accessibilityLabel === '2026-09-30'), 'cancel keeps the original month');
assert.ok(!descendants(tree).some(node => node.props.name === 'chevron-down'), 'month heading has no down chevron');
slots = []; cursor = 0; let wheelValue;
const wheelTree = wheelComponent({ label: '월', items: Array.from({ length: 12 }, (_, i) => i + 1), value: 10, onChange: value => { wheelValue = value; } });
const scroll = descendants(wheelTree).find(node => node.type === 'ScrollView');
assert.equal(scroll.props.contentOffset.y, Math.round(9 * 44 * 2.625) / 2.625, 'wheel starts at the current month');
assert.equal(scroll.props.snapToInterval, undefined, 'never use an interval that Android truncates before multiplying');
assert.equal(scroll.props.snapToOffsets.length, 12);
for (let index = 0; index < 12; index++) assert.ok(Math.abs(scroll.props.snapToOffsets[index] * 2.625 - index * 44 * 2.625) <= 0.500001, 'every offset is within half a physical pixel');
let snapped;
slots[0].current = { scrollTo: options => { snapped = options; } };
assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
const row = descendants(wheelTree).find(node => node.props.accessibilityLabel === '10월');
const text = descendants(row).find(node => node.type === 'AnimatedText');
assert.deepEqual(text.props.style[2].transform[0].scale.outputRange, [0.64, 0.82, 1, 0.82, 0.64], 'items shrink with distance from center');
assert.equal(text.props.style[0].includeFontPadding, false);
assert.equal(text.props.style[0].height, 44);
scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 45 } } }); assert.equal(wheelValue, 2); assert.equal(snapped, undefined, 'native snap completion must not issue a second scroll');
scroll.props.onScrollEndDrag({ nativeEvent: { contentOffset: { y: -44 } } }); assert.equal(wheelValue, 1); assert.equal(snapped, undefined, 'drag release must not force movement');
scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 9999 } } }); assert.equal(wheelValue, 12);
scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 44 * 5 } } }); assert.equal(wheelValue, 6); assert.equal(snapped, undefined, 'scrolling updates selection without changing position');
assert.equal(text.props.style[1].fontWeight, undefined, 'selected row must not change font metrics');
slots = []; cursor = 0;
const yearWheel = wheelComponent({ label: '년', items: Array.from({ length: 227 }, (_, i) => 1900 + i), value: 2030, onChange() {} });
const yearScroll = descendants(yearWheel).find(node => node.type === 'ScrollView');
assert.equal(yearScroll.props.snapToOffsets[130], Math.round(130 * 44 * 2.625) / 2.625, '2030 remains centered without accumulated interval rounding');
assert.equal(yearScroll.props.contentOffset.y, yearScroll.props.snapToOffsets[130], 'initial and snapped positions agree');
console.log('Header/calendar checks passed: screen hierarchy, safe area, touch targets, direct year/month selection and calendar back');
