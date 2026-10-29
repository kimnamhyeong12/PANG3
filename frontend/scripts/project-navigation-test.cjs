const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const transpile = (file) => ts.transpileModule(read(file), {
  fileName: file.replace(/\.js$/, '.jsx'), compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  },
}).outputText;

(async () => {
  // 1. projectApi: 경로·쿼리·응답 정규화
  const calls = [];
  let nextResult = null;
  const module = { exports: {} };
  vm.runInNewContext(transpile('../utils/projectApi.js'), {
    module, exports: module.exports,
    require: (name) => {
      if (name.endsWith('/groupApi')) return { groupApi: async (p, options = {}) => { calls.push({ path: p, ...options }); if (nextResult) { const r = nextResult; nextResult = null; if (r instanceof Error) throw r; return r; } return p.includes('prepare') ? { downloadUrl: '/api/x/download?userId=7', fileName: 'a.hwpx' } : {}; } };
      if (name.endsWith('/auth')) return { apiFetch: async () => ({ ok: true, status: 200, text: async () => '<html></html>' }) };
      if (name.endsWith('/localReports')) return { generateLocalReportHtml: async (kind, id) => { calls.push({ localHtml: kind, id }); return '<html></html>'; } };
      if (name.endsWith('/api')) return { API_BASE_URL: 'https://api.test', resolveApiUrl: (p) => `https://api.test${p}` };
      if (name.startsWith('@babel/runtime/')) return require(name);
      throw Error(`Unexpected import ${name}`);
    },
  }, { filename: 'projectApi.js' });
  const api = module.exports;

  assert.equal(api.projectPaths.projects(3, 7), '/api/groups/3/projects?userId=7');
  assert.equal(api.projectPaths.items(5, 7, { year: 2026, adminDong: '역삼1동', authorId: null, category: '' }),
    `/api/projects/5/items?userId=7&year=2026&adminDong=${encodeURIComponent('역삼1동')}`);
  assert.equal(api.projectPaths.reportHtmlData(9), '/api/local-reports/compiled/9/html-data');

  await api.addReportItems(9, 7, [1, 2]);
  assert.deepEqual(calls.at(-1), { path: '/api/compiled-reports/9/items', method: 'POST', body: JSON.stringify({ userId: 7, progressIds: [1, 2] }) });
  await api.removeReportItem(9, 2, 7);
  assert.deepEqual(calls.at(-1), { path: '/api/compiled-reports/9/items/2?userId=7', method: 'DELETE' });
  const prepared = await api.prepareCompiledHwpx(9, 7);
  assert.equal(calls.at(-1).path, '/api/compiled-reports/9/hwpx/prepare?userId=7');
  assert.equal(prepared.downloadUrl, 'https://api.test/api/x/download?userId=7');
  assert.equal(await api.fetchCompiledReportHtml(9, 7), '<html></html>');
  assert.deepEqual(calls.at(-1), { localHtml: 'compiled', id: 9 });
  assert.equal(await api.fetchProgressReportHtml(11), '<html></html>');
  assert.deepEqual(calls.at(-1), { localHtml: 'progress', id: 11 });

  assert.equal(api.addedCount({ added: [1, 2] }), 2);
  assert.equal(api.addedCount({ added: 3 }), 3);
  assert.deepEqual([...api.addedIds({ added: 3 })], []);
  assert.equal(api.skippedMessage([{ reason: 'ALREADY_IN_REPORT' }, { reason: 'ALREADY_IN_REPORT' }, { reason: 'EXPIRED' }]), '이미 담김 2건\n보존기간 지남 1건');

  assert.equal(api.injectKakaoKey('<html><head><title>t</title></head></html>', 'K'),
    '<html><head><script>window.REPORT_KAKAO_KEY="K";</script><title>t</title></head></html>');
  assert.equal(api.injectKakaoKey('<html><head></head></html>', ''), '<html><head></head></html>');

  // Phase 4: 작업 기록 저장 후 담기 — 절대 throw 하지 않음, 이미 담김은 성공
  assert.equal(api.projectPaths.taskContext(11, 7), '/api/tasks/11/project-context?userId=7');
  nextResult = { added: [], skipped: [{ progressId: 5, reason: 'ALREADY_IN_REPORT' }] };
  assert.equal((await api.addSavedProgressToReport(9, 7, 5)).ok, true);
  nextResult = { added: [], skipped: [{ progressId: 5, reason: 'NOT_COMPLETED' }] };
  assert.deepEqual({ ...(await api.addSavedProgressToReport(9, 7, 5)) }, { ok: false, message: '작업완료 아님 1건' });
  nextResult = new Error('서버 오류');
  assert.deepEqual({ ...(await api.addSavedProgressToReport(9, 7, 5)) }, { ok: false, message: '서버 오류' });

  // 2. 새 화면 파일이 변환되는지 (문법 확인)
  transpile('../screens/ProjectScreen.js');
  transpile('../screens/CompiledReportViewScreen.js');

  // WebView 이동 허용 범위: 초기 로드 + 카카오 SDK만
  const viewModule = { exports: {} };
  vm.runInNewContext(transpile('../screens/CompiledReportViewScreen.js'), {
    module: viewModule, exports: viewModule.exports, process: { env: {} },
    require: (name) => (name.startsWith('@babel/runtime/') || name === 'react/jsx-runtime' ? require(name) : new Proxy({ StyleSheet: { create: (x) => x } }, { get: (o, k) => o[k] || String(k) })),
  }, { filename: 'CompiledReportViewScreen.js' });
  const allow = viewModule.exports.allowReportNavigation;
  for (const url of ['about:blank', 'https://localhost/', 'https://dapi.kakao.com/v2/maps/sdk.js', 'https://t1.daumcdn.net/x.png', 'data:text/html,x']) assert.equal(allow(url), true, url);
  for (const url of ['https://evil.example/', 'https://kakao.com.evil.example/', 'https://localhost/other', 'javascript:alert(1)']) assert.equal(allow(url), false, url);

  // 보고서 양식에서 '보고서에도 담기'는 뺐다 (사용자 요청). 기존 저장 경로는 그대로
  const field = read('../screens/FieldActionScreen.js');
  assert.doesNotMatch(field, /ReportAddOption|addToReportAfterSave/);
  assert.match(field, /`\$\{API_BASE_URL\}\/api\/task-progress`,\s*\{\s*method: 'POST',\s*body: form,/);

  // 3. 그룹 작업공간 "프로젝트" 탭
  const workspace = read('../screens/GroupWorkspaceScreen.js');
  assert.match(workspace, /onTabChange\?\.\('projects'\)/);
  assert.match(workspace, />프로젝트</);
  assert.match(workspace, /tab === 'projects' \? \(/);
  // H5: 프로젝트 탭 안에 '프로젝트 | 건별 보고서' 칸, 건별은 그룹 보고서 화면을 그대로 품는다
  assert.match(workspace, /projectView === 'projects'\s*\?\s*<GroupProjectList/);
  assert.match(workspace, /<GroupReportsScreen user=\{user\} group=\{group\} embedded/);

  // 4. App.js 연결: 렌더 분기 + 이동 + 하단 탭 그룹 강조
  const app = read('../App.js');
  assert.match(app, /screen === 'project' && user && openedProject/);
  assert.match(app, /screen === 'compiledReportView' && user && openedCompiledReport/);
  assert.match(app, /go\('project'\)/);
  assert.match(app, /go\('compiledReportView'\)/);
  assert.match(app, /'project',\s*'compiledReportView',/);
  // 'projects' 탭은 업무 목록 새로고침 대상이 아님 (기존 조건 유지)
  assert.match(app, /if \(nextTab === 'dashboard' \|\| nextTab === 'transfer'\) refreshGroupAssignments\(\);/);

  // 5. 새 화면은 루트가 아니므로 뒤로가기 기록이 쌓인다
  const { ROOT_SCREENS, navigationHistory } = await import(`data:text/javascript;base64,${Buffer.from(read('../utils/navigation.js')).toString('base64')}`);
  assert.equal(ROOT_SCREENS.has('project'), false);
  assert.deepEqual(navigationHistory(['groupHome'], 'groupWorkspace', 'project'), ['groupHome', 'groupWorkspace']);
  assert.deepEqual(navigationHistory(['groupHome', 'groupWorkspace'], 'project', 'compiledReportView'), ['groupHome', 'groupWorkspace', 'project']);

  console.log('Project navigation checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
