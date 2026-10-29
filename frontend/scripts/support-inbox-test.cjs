const assert = require('node:assert/strict');
const babel = require('../node_modules/@babel/core');
function panel(behavior) {
  const slots = []; let cursor = 0, tree, foreground; const pending = [], calls = [];
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) { old?.cleanup?.(); const slot = { deps }; slots[i] = slot; pending.push(() => { slot.cleanup = fn(); }); }
    },
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
  };
  const module = { exports: {} };
  const code = babel.transformFileSync(require.resolve('../components/SupportInquiryPanel.js'), { configFile: false, babelrc: false,
    plugins: [[require.resolve('../node_modules/@babel/plugin-transform-react-jsx'), { runtime: 'classic' }], require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  const dependencies = {
    react, 'react-native': { StyleSheet: { create: s => s }, View: 'View', Text: 'Text', TouchableOpacity: 'Button', AppState: { addEventListener(_, fn) { foreground = fn; return { remove() {} }; } } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, './SupportInquiryForm': 'Form', './ui': { SecondaryButton: 'SecondaryButton' }, '../constants/design': { colors: {} },
    'expo-sharing': { isAvailableAsync: async()=>true, shareAsync:async()=>{} }, '../utils/api': { API_BASE_URL:'https://example.test' }, '../utils/auth': { downloadProtectedFile:async()=> 'file:///test.jpg' },
    '../utils/groupApi': { groupApi: async path => { calls.push(path); return behavior(path); } },
  };
  new Function('require', 'module', 'exports', code)(name => { assert.ok(dependencies[name], name); return dependencies[name]; }, module, module.exports);
  function render() { cursor = 0; tree = module.exports.default({ user: { userId: 1 }, onBusyChange() {} }); while (pending.length) pending.shift()(); }
  function nodes(n = tree) { if (!n || typeof n !== 'object') return []; return [n, ...(n.props?.children || []).flat(Infinity).flatMap(c => nodes(c))]; }
  const text = n => nodes(n).filter(item => item.type === 'Text').map(item => item.props.children.flat(Infinity).join('')).join('\n');
  function button(label) { return nodes().find(n => n.type === 'Button' && text(n).includes(label)); }
  async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); render(); } }
  render(); return { render, nodes, text, button, settle, calls, foreground: () => foreground?.('active') };
}
(async () => {
  let answered = false;
  const summary = { id: 10, category: '오류 신고', subject: '사진 오류', status: 'WAITING', createdAt: '2026-10-29T00:00:00Z' };
  const app = panel(async path => path.includes('?') ? { items: [summary], page: 0, hasMore: false }
    : { ...summary, status: answered ? 'ANSWERED' : 'WAITING', message: '사진을 선택할 수 없어요.', replyEmail: 'reply@example.test', answer: answered ? '권한 설정을 확인해 주세요.' : null });
  app.button('문의 내역').props.onPress(); await app.settle();
  assert.ok(app.text().includes('사진 오류')); app.button('사진 오류').props.onPress(); await app.settle();
  assert.ok(app.text().includes('사진을 선택할 수 없어요.')); assert.ok(app.text().includes('담당자가 확인 후'));
  const beforeForeground = app.calls.length;
  answered = true; app.foreground(); await app.settle();
  assert.equal(app.calls.length, beforeForeground, 'returning to the app does not reload inquiries');
  assert.ok(!app.text().includes('핀워크 고객센터 답변'));
  app.nodes().find(n => n.props?.title === '새로고침').props.onPress(); await app.settle();
  assert.ok(app.text().includes('핀워크 고객센터 답변')); assert.ok(app.text().includes('권한 설정을 확인해 주세요.'));
  app.nodes().find(n => n.props?.title === '목록으로').props.onPress(); await app.settle(); assert.ok(!app.text().includes('사진을 선택할 수 없어요.'));
  app.button('문의하기').props.onPress(); app.render();
  const form = app.nodes().find(n => n.type === 'Form'); form.props.onBusyChange(true); app.render();
  assert.equal(app.button('문의 내역').props.disabled, true, 'cannot switch away while submitting');
  form.props.onBusyChange(false); form.props.onSubmitted(10); await app.settle();
  assert.ok(app.calls.filter(path => path.includes('?')).length >= 3, 'new submission refreshes history');
  const empty = panel(async () => ({ items: [], page: 0, hasMore: false })); empty.button('문의 내역').props.onPress(); await empty.settle(); assert.ok(empty.text().includes('문의 내역이 없습니다.'));
  const failed = panel(async () => { throw Object.assign(new Error('not deployed'), { status: 404 }); });
  failed.button('문의 내역').props.onPress(); await failed.settle(); assert.ok(failed.text().includes('서버 업데이트 후')); assert.ok(!failed.text().includes('문의 내역이 없습니다.'));
  console.log('Support inbox checks passed: own history, waiting/answered detail, no foreground reload, manual/submission refresh, busy tabs, empty/error states.');
})().catch(error => { console.error(error); process.exitCode = 1; });
