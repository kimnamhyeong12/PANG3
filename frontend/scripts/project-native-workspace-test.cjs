const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const babel = require('../node_modules/@babel/core');
const root = path.join(__dirname, '..');
const jsx = (type, props) => ({ type, props: props || {} });
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const label = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(label).join('') : label(value?.props?.children || '');
let current;
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) { const h = current, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial; return [h.slots[i], value => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }]; },
  useRef(value) { const h = current, i = h.cursor++; return h.slots[i] ||= { current: value }; },
  useMemo(fn, deps) { const h = current, i = h.cursor++; if (!same(h.slots[i]?.deps, deps)) h.slots[i] = { deps, value: fn() }; return h.slots[i].value; },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  useEffect(fn, deps) { const h = current, i = h.cursor++; if (!same(h.effects[i]?.deps, deps)) h.pending.push(() => { h.effects[i]?.cleanup?.(); h.effects[i] = { deps, cleanup: fn() }; }); },
};
const native = new Proxy({ StyleSheet: { create: x => x } }, { get: (o, k) => o[k] || k });
const alerts = [];
function load(file, mocks = {}) {
  const result = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { configFile: false, babelrc: false, plugins: [[require('../node_modules/@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], require('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { module: result, exports: result.exports, Set, Map, console, require(name) {
    if (name in mocks) return mocks[name];
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.endsWith('/design')) return { colors: {}, workStatus: () => ({}) };
    if (name.endsWith('/projectWorkflow')) return workflow;
    if (name.endsWith('/useLiveRevision')) return () => 0;
    if (name.endsWith('/screenBack')) return { useScreenBackHandler() {} };
    if (name.endsWith('/CustomAlert')) return { showAlert: (...args) => alerts.push(args) };
    if (name.endsWith('/api')) return { resolveApiUrl: value => value };
    return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : String(key) });
  } });
  return result.exports;
}
const workflow = load('utils/projectWorkflow.js');
function mount(Component, props) {
  const h = { cursor: 0, slots: [], effects: [], pending: [], tree: null };
  h.render = () => { h.cursor = 0; current = h; h.tree = Component(props); current = null; const effects = h.pending.splice(0); effects.forEach(fn => fn()); return h.tree; };
  h.find = predicate => nodes(h.tree).find(predicate);
  h.button = title => h.find(n => n.props.title === title || n.type === 'TouchableOpacity' && label(n) === title);
  h.unmount = () => h.effects.forEach(effect => effect?.cleanup?.());
  h.render(); return h;
}
const tick = async h => { await new Promise(resolve => setImmediate(resolve)); h.render(); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
(async () => {
  const filters = workflow.emptyProjectFilters();
  const rows = [{ progressId: 1, taskId: 11, detailAddress: '학교', roadAddress: '부산', adminDong: '하단1동', assigneeUserId: 8, assigneeName: '현재 담당자', performedByUserId: 7, performedByName: '이전 작성자', createdAt: [2026, 11, 2], progressStatus: 'complete' }, { progressId: 2, taskId: 22, detailAddress: 'AED', assigneeUserId: 7, assigneeName: '팀원', createdAt: '2026-10-01', progressStatus: 'working' }, { progressId: 3, taskId: 33, detailAddress: '외부', assigneeUserId: 7, assigneeName: '팀원', createdAt: '2026-11-01', progressStatus: 'completed' }];
  assert.equal(workflow.filterProjectRecords(rows, { ...filters, worker: '8', start: '2026-11-01' })[0].progressId, 1);
  assert.equal(workflow.filterProjectRecords(rows, { ...filters, worker: '7', search: '학교' }).length, 0, 'filter uses current owner, not original writer');
  assert.equal(workflow.filterProjectRecords(rows, { ...filters, search: '이전 작성자' }).length, 1);
  assert.equal(workflow.filterProjectRecords(rows, { ...filters, dong: '하단1동', end: '2026-11-01' }).length, 0);
  assert.equal(rows.filter(workflow.isCompletedRecord).length, 2);
  assert.deepEqual([...workflow.toggleProjectSelection(new Set(['1']), [3], true)], ['1', '3']);
  const calls = [], project = { projectId: 5, groupId: 3, name: '프로젝트', status: 'ACTIVE' };
  let report = { report: { reportId: 9, title: '초안', status: 'DRAFT', updatedAt: 'rev1' }, sections: [{ items: [{ progressId: 1, taskId: 11, title: '학교', sourceRevision: 'source1' }] }] };
  let rejectSave = false, open = [], dirty = false;
  const api = {
    fetchProjectGroupReports: async () => rows,
    fetchCompiledReport: async () => report,
    replaceReportItems: async (...args) => { calls.push(['replace', ...args]); if (rejectSave) throw Error('서버 오류'); },
    createProjectReport: async (...args) => { calls.push(['create', ...args]); return { reportId: 10 }; },
  };
  const Workspace = load('components/ProjectReportWorkspace.js', { '../utils/projectApi': api }).default;
  const props = { project, tasks: [{ taskId: 11 }], userId: 7, reportId: 9, onClose() {}, onOpenReport: id => open.push(id), onChanged() {}, onDirtyChange: value => dirty = value };
  let h = mount(Workspace, props); await tick(h);
  assert(h.find(n => n.props.row?.progressId === 1));
  assert(!h.find(n => n.props.row?.progressId === 3), 'outside records hidden initially');
  h.button('프로젝트 외 업무 추가').props.onPress(); h.render();
  assert(h.find(n => n.props.row?.progressId === 3));
  h.find(n => n.props.row?.progressId === 3).props.onPress(); h.render();
  assert(dirty); assert.equal(h.button('2건 선택 적용').props.disabled, false);
  rejectSave = true; await h.button('2건 선택 적용').props.onPress(); h.render();
  assert.equal(h.find(n => n.props.message === '서버 오류').props.message, '서버 오류');
  assert(h.find(n => n.props.row?.progressId === 3).props.checked, 'error keeps selected input');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['replace', 9, 7, [1, 3], 'rev1']);
  rejectSave = false;
  h.button('프로젝트 내 업무 추가').props.onPress(); h.render();
  assert(h.find(n => n.props.row?.progressId === 1).props.checked, 'scope changes preserve selection');
  h.unmount();
  h = mount(Workspace, { ...props, reportId: null }); await tick(h);
  assert.equal(h.button('0건으로 보고서 만들기').props.disabled, true);
  h.find(n => n.props.accessibilityLabel === '통합보고서 이름').props.onChangeText('새 보고서'); h.render();
  h.find(n => n.props.row?.progressId === 1).props.onPress(); h.render();
  const delayed = deferred(); api.createProjectReport = async (...args) => { calls.push(['create', ...args]); return delayed.promise; };
  const pending = h.button('1건으로 보고서 만들기').props.onPress();
  h.unmount(); delayed.resolve({ reportId: 10 }); await pending;
  assert.equal(open.length, 0, 'late response never reopens closed report');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['create', 5, 7, '새 보고서', [1]], 'one atomic create with selected records');
  report = { ...report, report: { ...report.report, status: 'FINAL' } };
  h = mount(Workspace, props); await tick(h);
  assert(h.find(n => n.props.row?.progressId === 1).props.disabled);
  assert(h.button('수정본 만들기')); assert(!h.button('확정하기')); h.unmount();

  const Screen = load('screens/ProjectScreen.js', { '../utils/projectApi': {
    fetchProject: async () => project, fetchProjectTasks: async () => [{ taskId: 11 }], fetchProjectReports: async () => [{ reportId: 9, title: '초안', status: 'DRAFT' }],
  } }).default;
  h = mount(Screen, { user: { userId: 7 }, projectId: 5, initialProject: project, onBack() {} }); await tick(h);
  assert(!h.find(n => n.props.reportId === '9'), 'no automatic target draft');
  const reportButton = () => h.find(n => n.props.accessibilityState && n.props.accessibilityRole === 'button');
  reportButton().props.onPress(); h.render(); assert(h.find(n => n.props.reportId === '9'));
  h.button('새 보고서').props.onPress(); h.render(); assert(h.find(n => n.props.reportId === null && n.props.onOpenReport));
  h.button('새 보고서').props.onPress(); h.render(); assert(!h.find(n => n.props.onOpenReport), 'closing new never restores old report');
  reportButton().props.onPress(); h.render(); reportButton().props.onPress(); h.render(); assert(!h.find(n => n.props.onOpenReport), 'double tap closes all');
  h.unmount();
  console.log('PASS native project: owner/date/search filters, scope selection, atomic create, conflict/error retention, final read-only, stale response, exclusive report close');
})().catch(error => { console.error(error); process.exitCode = 1; });
