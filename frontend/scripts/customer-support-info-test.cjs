const assert = require('node:assert/strict');
const babel = require('../node_modules/@babel/core');

function load(file, dependencies = {}, props = {}) {
  const slots = []; let cursor = 0, tree; const effects = [], cleanups = [];
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useMemo(fn) { return fn(); },
    useEffect(fn) { cursor++; if (!slots[cursor - 1]) { slots[cursor - 1] = {}; effects.push(fn); } },
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
  };
  const native = Object.fromEntries(['View', 'Text', 'TextInput', 'TouchableOpacity'].map(name => [name, name]));
  const defaults = { react, 'react-native': { ...native, StyleSheet: { create: s => s }, Platform: { OS: 'android' } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, './ui': { PrimaryButton: 'Button' }, '../constants/design': { colors: {} } };
  const module = { exports: {} };
  const code = babel.transformFileSync(require.resolve(`../components/${file}.js`), { configFile: false, babelrc: false,
    plugins: [[require.resolve('../node_modules/@babel/plugin-transform-react-jsx'), { runtime: 'classic' }], require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require', 'module', 'exports', code)(name => { const value = dependencies[name] || defaults[name]; assert.ok(value, name); return value; }, module, module.exports);
  function render() { cursor = 0; tree = module.exports.default(props); while (effects.length) cleanups.push(effects.shift()()); }
  function nodes(n = tree) { if (!n || typeof n !== 'object') return []; return [n, ...(n.props?.children || []).flat(Infinity).flatMap(item => nodes(item))]; }
  function text() { return nodes().filter(n => n.type === 'Text').map(n => n.props.children.flat(Infinity).join('')).join('\n'); }
  render();
  return { render, nodes, text, exports: module.exports, cleanup() { cleanups.forEach(fn => fn?.()); } };
}
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
(async () => {
  let inquiries = 0;
  const faq = load('CustomerSupportContent', {}, { onInquiry: () => inquiries++ });
  const question = faq.nodes().find(n => n.type === 'TouchableOpacity' && n.props.accessibilityState?.expanded === false);
  question.props.onPress(); faq.render(); assert.ok(faq.text().includes('실내나 지하'));
  faq.nodes().find(n => n.type === 'TextInput').props.onChangeText('없는검색어123'); faq.render(); assert.ok(faq.text().includes('검색 결과가 없어요'));
  faq.nodes().find(n => n.type === 'Button').props.onPress(); assert.equal(inquiries, 1);
  faq.nodes().find(n => n.type === 'TextInput').props.onChangeText(''); faq.render();
  faq.nodes().find(n => n.type === 'TextInput').props.onChangeText('다운로드'); faq.render();
  assert.ok(faq.text().includes('보고서를 다운로드할 수 없어요')); assert.ok(!faq.text().includes('길안내가 시작되지 않아요'));
  let listener, removed = false, openCount = 0, allowed = false;
  const read = async () => ({ granted: allowed, status: allowed ? 'granted' : 'denied' });
  const dependencies = {
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', Platform: { OS: 'android' }, StyleSheet: { create: s => s },
      Linking: { openSettings: async () => openCount++ }, AppState: { addEventListener: (_, fn) => { listener = fn; return { remove() { removed = true; } }; } } },
    'expo-constants': { expoConfig: { version: '1.0.0' } }, 'expo-location': { getForegroundPermissionsAsync: read },
    'expo-image-picker': { getCameraPermissionsAsync: async () => { throw Error('Unavailable'); } },
    'expo-media-library': { getPermissionsAsync: async () => ({ granted: true, accessPrivileges: 'limited' }) },
    'expo-notifications': { getPermissionsAsync: read, IosAuthorizationStatus: { PROVISIONAL: 3 } }, './CustomAlert': { showAlert() {} },
    '../constants/openSourceLicenses.json': [{ name: 'react', version: '19.2.3', license: 'MIT', notice: 'License text' }],
  };
  const info = load('AppInfoContent', dependencies, { page: 'version' }); await settle(); info.render();
  assert.ok(info.text().includes('선택한 사진만 허용'));
  assert.ok(info.text().includes('확인할 수 없음')); assert.ok(info.text().includes('허용 안 됨'));
  await info.nodes().find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.startsWith('위치 권한')).props.onPress(); assert.equal(openCount, 1);
  allowed = true; listener('active'); await settle(); info.render(); assert.ok(info.text().includes('허용됨'));
  assert.ok(info.text().includes('스토어 배포를 준비')); info.cleanup(); assert.equal(removed, true);
  const license = load('AppInfoContent', dependencies, { page: 'licenses' });
  license.nodes().find(n => n.type === 'TouchableOpacity').props.onPress(); license.render(); assert.ok(license.text().includes('License text'));
  console.log('Customer support/app info checks passed: FAQ search, categories, inquiry, partial permission failures, settings refresh and license details.');
})().catch(error => { console.error(error); process.exitCode = 1; });
