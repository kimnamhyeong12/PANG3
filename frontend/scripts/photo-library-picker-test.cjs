const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
const element = (type, props) => ({ type, props: props || {} });
function harness(getAssetsAsync, props = {}) {
  const slots = [], effects = [], cleanups = [];
  let cursor = 0, tree, writes = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => { writes++; slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ||= { current: initial }; return slots[index]; },
    useEffect(effect) { const index = cursor++; if (!slots[index]) { slots[index] = {}; effects.push(effect); } },
  };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react/jsx-dev-runtime': { jsxDEV: element },
    'react-native': Object.fromEntries(['ActivityIndicator', 'FlatList', 'Image', 'Modal', 'Text', 'TouchableOpacity', 'View'].map(name => [name, name])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-media-library/legacy': { getAssetsAsync },
  };
  dependencies['react-native'].StyleSheet = { create: value => value };
  dependencies['react-native'].useWindowDimensions = () => ({ width: 400 });
  const exports = {};
  const source = babel.transformFileSync(path.join(__dirname, '../components/PhotoLibraryPicker.js'), {
    configFile: false, babelrc: false, presets: ['babel-preset-expo'],
  }).code;
  new Function('require', 'exports', source)(name => {
    if (name.startsWith('@babel/runtime/')) return require(name);
    assert.ok(name in dependencies, name); return dependencies[name];
  }, exports);
  const render = () => { cursor = 0; tree = exports.default({ onCancel() {}, onSelect() {}, ...props }); return tree; };
  render();
  for (const effect of effects) cleanups.push(effect());
  return { render, unmount: () => cleanups.forEach(fn => fn?.()), writes: () => writes };
}
const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const asset = id => ({ id, filename: 'same.jpg', uri: `file:///original/${id}.jpg` });
(async () => {
  const calls = [], selected = [];
  let fail = false;
  const h = harness(async options => {
    calls.push(options);
    if (fail) throw Error('Permission changed');
    return options.after
      ? { assets: [asset('b'), asset('c')], hasNextPage: false, endCursor: 'c' }
      : { assets: [asset('a'), asset('b')], hasNextPage: true, endCursor: 'b' };
  }, { maxSelection: 2, onSelect: value => selected.push(value) });
  await settle();
  const grid = () => find(h.render(), node => node.type === 'FlatList');
  const tile = id => { const list = grid(); return list.props.renderItem({ item: list.props.data.find(entry => entry.id === id) }); };
  assert.deepEqual(grid().props.data.map(x => x.id), ['a', 'b']);
  assert.deepEqual(calls[0], { first: 60, mediaType: ['photo'], sortBy: [['creationTime', false]] });
  tile('a').props.onPress(); tile('b').props.onPress();
  fail = true;
  find(grid().props.ListFooterComponent, node => node.type === 'TouchableOpacity').props.onPress();
  await settle();
  assert.equal(calls.at(-1).after, 'b');
  fail = false;
  find(grid().props.ListFooterComponent, node => node.type === 'TouchableOpacity').props.onPress();
  await settle();
  assert.deepEqual(grid().props.data.map(x => x.id), ['a', 'b', 'c']);
  assert.equal(tile('c').props.disabled, true);
  tile('a').props.onPress(); tile('c').props.onPress();
  find(h.render(), node => node.props.accessibilityRole === 'button' && node.props.disabled === false).props.onPress();
  assert.deepEqual(selected[0].map(x => x.id), ['b', 'c']);
  h.unmount();
  let finish;
  const delayed = harness(() => new Promise(resolve => { finish = resolve; }));
  delayed.unmount();
  const before = delayed.writes();
  finish({ assets: [asset('late')], hasNextPage: false });
  await settle();
  assert.equal(delayed.writes(), before);
  console.log('Gallery picker passed: paging, original identity, duplicate names, retry, selection limit, deselection and unmount cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
