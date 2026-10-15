const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const React = require('react');
const cache = new Map();
let slots = [], cursor = 0, pending = [], dirty = false;
const hooks = { ...React,
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
const rn = { StyleSheet: { create: value => value, absoluteFill: {} }, Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'Button' };
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false, plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'] }).code;
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
let picked, closed = 0, tree;
const props = { visible: true, value: '2026-10-31', title: '시작일', onSelect: date => { picked = date; }, onClose: () => closed++ };
function render() {
  do { dirty = false; cursor = 0; pending = []; tree = Picker(props); pending.forEach(effect => effect()); } while (dirty);
}
function click(label) {
  const button = descendants(tree).find(node => node.props.accessibilityLabel === label);
  assert.ok(button, 'Missing control: ' + label); button.props.onPress(); render();
}
render(); click('연도와 월 선택'); click('2031년'); click('2월');
assert.equal(picked, undefined, 'year/month selection must not commit an arbitrary day');
click('2031-02-28'); assert.equal(picked, '2031-02-28'); assert.equal(closed, 1);
props.visible = false; render(); props.visible = true; render();
click('이전 달'); assert.ok(descendants(tree).some(node => node.props.accessibilityLabel === '2026-09-30'));
click('연도와 월 선택'); tree.props.onRequestClose(); render();
assert.equal(closed, 1, 'back from the year chooser returns to dates before closing the picker');
console.log('Header/calendar checks passed: screen hierarchy, safe area, touch targets, direct year/month selection and calendar back');
