const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const React = require('react');
// useState 는 호출 순서로 값을 넣는다: 1 = savedReports, 4 = downloadStates (ReportListScreen 의 선언 순서)
let stateIndex = 0;
const stateValues = {};
const hooks = { ...React, useState: initial => [stateIndex in stateValues ? stateValues[stateIndex++] : (stateIndex++, initial), () => {}],
  useEffect() {}, useRef: current => ({ current }), useMemo: create => create() };
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const code = babel.transformSync(source, { filename: path.join(__dirname, file), configFile: false, babelrc: false,
    presets: ['babel-preset-expo'], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react-native') return new Proxy({ StyleSheet: { create: x => x }, Platform: { OS: 'ios' } }, { get: (o, k) => o[k] || String(k) });
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.endsWith('/ui')) return { ScreenHeader: 'ScreenHeader', PrimaryButton: 'PrimaryButton' };
    if (name.endsWith('/CustomAlert')) return { showAlert() {} };
    if (name.startsWith('@babel/runtime/') || name === 'react/jsx-runtime') return require(name);
    if (dependencies[name]) return dependencies[name];
    throw Error(`Unexpected import ${name}`);
  } }, { filename: file });
  return module.exports;
}
const design = load('../constants/design.js');
const Screen = load('../screens/ReportListScreen.js', {
  '../constants/design': design,
  '../components/MapWorkspaceSwitcher': 'MapWorkspaceSwitcher',
  '../components/ProjectReportLink': 'ProjectReportLink',
  '../utils/screenBack': { useScreenBackHandler() {} },
  '../utils/auth': { apiFetch() {} },
  '../utils/api': { API_BASE_URL: 'http://test' },
  '../utils/reportAvailability': { canDownloadReport: () => true },
  '../utils/reportName': { cleanReportName: value => value || '' },
  '../utils/useReportDownloads': {
    // 3번 보고서(progressId 30)는 받은 뒤 고쳐짐
    useReportDownloads: () => ({ stateOf: report => report?.progressId === 30 ? 'changed' : 'new', downloading: false, busy: { current: false },
      toast: null, openFolder() {}, download: async (rows, { fallback }) => { fallback(rows); return []; } }),
    downloadCountText: (rows, stateOf) => rows.map(stateOf).join(','),
  },
  '../components/ReportFileCard': load('../components/ReportFileCard.js', { '../constants/design': design }),
}).default;
const locations = ['pending', 'working', 'complete'].map((status, index) => ({
  id: index + 1, status, detailAddress: `방문지 ${index + 1}`, workDate: '2026-10-16',
}));
// 2·3번은 저장된 보고서가 있어 받을 수 있다. 3번은 받은 뒤 고쳐짐.
stateValues[1] = { 2: { progressId: 20, downloadable: true }, 3: { progressId: 30, downloadable: true } };
const props = { locations, selectedIds: [], onSelectionChange: ids => { props.selectedIds = ids; },
  onSelectLocation: item => { edited = item.id; }, onCreateReport: rows => { generated = rows; } };
let edited = null, generated = null, tree;
// 함수 컴포넌트(ReportFileCard 등)는 펼쳐서 본다
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes)
  : typeof n.type === 'function' ? nodes(n.type(n.props)) : [n, ...nodes(n.props?.children)];
const render = () => { stateIndex = 0; tree = Screen(props); return nodes(tree); };
const find = label => render().find(n => n.props?.accessibilityLabel === label);
assert.ok(render().find(n => n.type === 'PrimaryButton').props.disabled, 'download action is disabled until reports are selected');
assert.equal(find('방문지 1 받기 선택, 보고서 저장 후 선택 가능').props.disabled, true);
assert.equal(find('방문지 2 받기 선택').props.disabled, false);
assert.equal(find('방문지 1 받기'), undefined, 'no download button before a report is saved');
find('방문지 1 보고서 작성').props.onPress();
assert.equal(edited, 1, 'pending cards also open the report form');
find('방문지 2 받기 선택').props.onPress();
assert.deepEqual(Array.from(props.selectedIds), [2]);
find('방문지 2 작성').props.onPress();
assert.equal(edited, 2);
assert.deepEqual(Array.from(props.selectedIds), [2], 'editing must not toggle selection');
find('방문지 3 수정').props.onPress();
assert.equal(edited, 3);
assert.ok(render().some(n => n.props?.children === '고쳐짐 · 다시 받기'), 'changed report is marked for re-download in the selected-report footer');
find('방문지 3 받기 선택').props.onPress();
const all = render();
const button = all.find(n => n.type === 'PrimaryButton');
assert.ok(render().some(n => n.props?.title === '보고서 작성'), 'personal report tab title');
assert.equal(button.props.title, '2건 보고서 다운로드');
assert.ok(all.some(n => n.props?.children === 'new,changed'), 'bottom hint counts new and changed');
button.props.onPress();
assert.deepEqual(Array.from(generated, row => [row.id, row.progressId]), [[2, 20], [3, 30]], 'iOS falls back to the download screen with progressIds');
find('방문지 2 받기 선택').props.onPress();
assert.deepEqual(Array.from(props.selectedIds), [3]);
let previewed = null;
props.onPreviewReport = report => { previewed = report; };
find('방문지 3 미리보기').props.onPress();
assert.equal(previewed.progressId, 30, 'saved report card opens preview');
find('방문지 1 보고서 작성').props.onPress();
assert.equal(edited, 1, 'pending card still opens the form');
const { coordinateInput } = load('../utils/coordinateInput.js');
assert.equal(coordinateInput('-', '129'), null);
assert.equal(coordinateInput('35.', '129'), null);
assert.equal(coordinateInput('', ''), null);
assert.equal(coordinateInput('91', '129'), null);
assert.equal(coordinateInput('35', '181'), null);
assert.equal(coordinateInput('NaN', '129'), null);
assert.deepEqual(JSON.parse(JSON.stringify(coordinateInput('-35.1', '129.123456'))), { lat: -35.1, lng: 129.123456 });
console.log('Report selection checks passed: checkboxes from the start, disabled download action until selected, download states, iOS fallback and coordinate validation');
