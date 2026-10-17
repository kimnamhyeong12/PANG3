const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('../node_modules/@babel/core');

async function screen(platform = 'android', fail = false, folderFail = false) {
  let cursor = 0, slots = [], effects = [], tree;
  const saved = [], shared = [], prepared = [], opened = [];
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((dep,j) => dep !== slots[i].deps[j])) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: platform }, ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    '../utils/auth': { apiFetch: async url => ({ ok: true, text: async () => JSON.stringify({ progressId: Number(url.match(/task-progress\/(\d+)/)[1]), progressStatus: 'complete', createdAt: '2026-10-15' }) }), downloadProtectedFile() {} },
    '../utils/reportFiles': { prepareIndividualReport: async ({ progressId }) => { prepared.push(progressId); return { progressId, name: `현장 ${progressId}`, filename: `현장_${progressId}.hwpx`, uri: `file:///cache/${progressId}.hwpx` }; } },
    '../utils/reportAvailability': { canDownloadReport: value => value.progressStatus === 'complete' },
    '../utils/api': { API_BASE_URL: 'https://test.local' },
    '../modules/kakao-navigation': {
      saveReportToDownloads: async (...args) => { if (fail) throw new Error('저장 공간 부족'); saved.push(args); },
      openReportDownloadsFolder: async () => { opened.push(saved.length); if (folderFail) throw new Error('폴더 앱 없음'); return true; },
    },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (...args) => shared.push(args) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../components/ui': { PrimaryButton: 'PrimaryButton', SecondaryButton: 'SecondaryButton', ScreenHeader: 'ScreenHeader' },
    '../constants/design': { colors: {}, radius: {} },
  };
  const code = babel.transformSync(fs.readFileSync(path.join(__dirname,'../screens/DownloadScreen.js'),'utf8'), { configFile:false,babelrc:false,
    plugins:[[require('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  const module = { exports: {} };
  new Function('require','module','exports',code)(name => { assert.ok(dependencies[name],name); return dependencies[name]; },module,module.exports);
  const props = { downloadInfo: { userId: 1, progressIds: [11,22] } };
  function render() { cursor=0; tree=module.exports.default(props); const pending=effects; effects=[]; pending.forEach(fn=>fn()); }
  const nodes = () => { const all=[]; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; all.push(node); walk(node.props.children); } walk(tree); return all; };
  const button = title => nodes().find(node=>node.props.title===title);
  const settle = async () => { for(let i=0;i<8;i++) await Promise.resolve(); render(); };
  render(); await settle();
  return { saved,shared,prepared,opened,render,settle,button,nodes };
}

(async()=>{
  const app=await screen();
  await app.button('다운로드').props.onPress(); await app.settle();
  assert.equal(app.saved.length,1); assert.deepEqual(app.prepared,[11]); assert.equal(app.shared.length,0,'Android download never opens the share sheet');
  assert.ok(app.nodes().some(node=>node.props.children==='Download/외근도우미/다운로드에 저장했습니다.'));
  assert.deepEqual(app.opened,[1]);
  await app.button('2개 모두 다운로드').props.onPress(); await app.settle();
  assert.equal(app.saved.length,3,'batch download saves both reports'); assert.deepEqual(app.prepared,[11,22],'prepared files are reused');
  assert.deepEqual(app.opened,[1,3],'opens folder once after all batch saves');
  const failed=await screen('android',true);
  await failed.button('다운로드').props.onPress(); await failed.settle();
  assert.ok(failed.nodes().some(node=>node.props.children==='저장 공간 부족')); assert.equal(failed.shared.length,0);
  assert.equal(failed.opened.length,0,'failed saves never launch file manager');
  const noFolder=await screen('android',false,true);
  await noFolder.button('다운로드').props.onPress(); await noFolder.settle();
  assert.equal(noFolder.saved.length,1);
  assert.ok(noFolder.nodes().some(node=>typeof node.props.children==='string' && node.props.children.startsWith('파일은 저장됐습니다.')));
  const ios=await screen('ios'); await ios.button('다운로드').props.onPress(); await ios.settle();
  assert.equal(ios.saved.length,0); assert.equal(ios.shared.length,1,'iOS retains the platform share/save flow');
  console.log('Report download checks passed: direct Android save, batch, cache reuse, failure and iOS');
})().catch(error=>{console.error(error);process.exitCode=1;});
