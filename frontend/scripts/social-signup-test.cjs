const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function load(file, dependencies) {
  const result = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    fileName: file, compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, result, result.exports);
  return result.exports;
}
const region = load('utils/workRegion.js', { '../constants/koreaRegions.json': require('../constants/koreaRegions.json') });
function screen() {
  let cursor = 0, tree, response = async () => ({ ok: true, json: async () => ({ userId: 7, name: '확인한 이름', socialProfilePending: false }) });
  const slots = [], calls = [], completed = [], cancellations = [];
  const react = {
    useState(initial) { const index = cursor++; slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = value; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; }, useEffect() {},
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
  };
  const native = { Platform: { OS: 'android' }, StyleSheet: { create: value => value }, BackHandler: { addEventListener: () => ({ remove() {} }) } };
  for (const name of ['KeyboardAvoidingView', 'ScrollView', 'Text', 'TextInput', 'View']) native[name] = name;
  const Component = load('screens/SocialSignupScreen.js', {
    react, 'react-native': native, '../components/ui': { ScreenHeader: 'Header', PrimaryButton: 'Button' },
    '../components/WorkRegionField': 'Region', '../components/WorkplaceField': 'Workplace',
    '../constants/design': { colors: {} }, '../utils/api': { API_BASE_URL: 'https://api.test' }, '../utils/workRegion': region,
    '../utils/auth': { apiFetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response(); } },
  }).default;
  const user = { userId: 7, name: '구글에서 받은 이름', socialProfilePending: true };
  function render() { cursor = 0; tree = Component({ user, onComplete: value => completed.push(value), onCancel: () => cancellations.push(true) }); }
  function nodes(node = tree) { if (Array.isArray(node)) return node.flatMap(nodes); return node?.props ? [node, ...nodes(node.props.children)] : []; }
  const find = type => nodes().find(node => node.type === type);
  render();
  return { render, find, nodes, user, calls, completed, cancellations, setResponse: value => { response = value; } };
}
(async () => {
  const form = screen();
  assert.equal(form.find('TextInput').props.value, form.user.name, 'provider name is prefilled');
  assert.ok(!form.nodes().some(node => node.props.secureTextEntry), 'no local password is requested');
  form.find('TextInput').props.onChangeText('  '); form.render();
  assert.equal(form.find('Button').props.disabled, true);
  await form.find('Button').props.onPress(); assert.equal(form.calls.length, 0);
  form.find('TextInput').props.onChangeText(' 확인한 이름 '); form.render();
  form.find('Region').props.onChange({ sido: '부산광역시', sigungu: '', gu: '' }); form.render();
  assert.equal(form.find('Button').props.disabled, true, 'partial region is invalid');
  form.find('Region').props.onChange(region.emptyWorkRegion()); form.render();
  assert.equal(form.find('Button').props.disabled, false, 'region and workplace remain optional');
  form.setResponse(async () => ({ ok: false, json: async () => ({ message: '저장 실패' }) }));
  await form.find('Button').props.onPress(); form.render();
  assert.equal(form.completed.length, 0); assert.equal(form.find('TextInput').props.value, ' 확인한 이름 ');
  let finish;
  form.setResponse(() => new Promise(resolve => { finish = resolve; }));
  const first = form.find('Button').props.onPress(); form.render();
  await form.find('Button').props.onPress(); assert.equal(form.calls.length, 2, 'double taps are ignored');
  form.find('Header').props.onBack(); assert.equal(form.cancellations.length, 0, 'cannot leave during save');
  finish({ ok: true, json: async () => ({ userId: 7, name: '확인한 이름', socialProfilePending: false }) });
  await first; form.render(); assert.equal(form.completed.length, 1);
  assert.equal(form.calls.at(-1).body.name, '확인한 이름');
  assert.equal(form.calls.at(-1).body.userId, undefined, 'server determines ownership from the session');
  assert.equal(form.calls.at(-1).body.workSido, '');

  const complete = screen();
  complete.find('Region').props.onChange({ sido: '부산광역시', sigungu: '사하구', gu: '' });
  complete.find('Workplace').props.onChange({ workplaceAddress: '부산광역시 사하구', workplaceLat: 35.1, workplaceLng: 129.0 }); complete.render();
  await complete.find('Button').props.onPress();
  assert.equal(complete.calls[0].body.workSigungu, '사하구'); assert.equal(complete.calls[0].body.workplaceLat, 35.1);
  const wrong = screen();wrong.setResponse(async () => ({ ok: true, json: async () => ({ userId: 8, socialProfilePending: false }) }));
  await wrong.find('Button').props.onPress();assert.equal(wrong.completed.length, 0, 'wrong-account response cannot log in');

  const { createSessionClient } = load('utils/sessionClient.js', {});
  let stored, pending = true;
  const result = () => ({ userId: 7, name: '이름', socialProfilePending: pending, accessToken: 'access', refreshToken: 'refresh', expiresAt: new Date(Date.now() + 60000).toISOString() });
  const client = createSessionClient({ baseUrl: 'https://api.test', storage: { get: async () => stored, set: async value => { stored = value; }, remove: async () => { stored = null; } }, transport: async () => ({ ok: true, status: 200, json: async () => result() }) });
  assert.equal((await client.loginWithSocialResult(result())).socialProfilePending, true);
  assert.equal((await client.restore()).socialProfilePending, true, 'unfinished signup resumes on session restore');
  pending = false;
  assert.equal((await client.restore()).socialProfilePending, false, 'completed signup stays complete after restart');
  console.log('Social signup checks passed: name confirmation, optional fields, failed-save retry, account binding, duplicate taps and session restore.');
})().catch(error => { console.error(error); process.exitCode = 1; });
