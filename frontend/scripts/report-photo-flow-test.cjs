const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const babel = require('../node_modules/@babel/core');
const generate = require('../node_modules/@babel/generator').default;
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'screens/FieldActionScreen.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const names = ['editSnapshot', 'hasLocalEdits', 'recoverPhotoPick', 'flushDraft', 'launchPhotoPick', 'takePhoto',
  'pickPhotoFromLibrary', 'finishPhotoEditor', 'closePhotoEditor', 'completePhotoEdit'];
const definitions = new Map(); let loader, dirty;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && names.includes(node.id?.name)) definitions.set(node.id.name, node.init);
  if (node.type === 'CallExpression' && node.callee?.name === 'useEffect' &&
    node.arguments[1]?.elements?.map(n => n?.name).join(',') === 'key,liveRevision') loader = node.arguments[0];
  if (node.type === 'CallExpression' && node.callee?.name === 'useLiveRevision') dirty = node.arguments[1].properties.find(p => p.key.name === 'dirty').value;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast); assert(loader && dirty && names.every(name => definitions.has(name)));
const functions = names.map(name => `const ${name}=${generate(definitions.get(name)).code};`).join('\n');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };

function makeHook() {
  let slots = [], cursor = 0, effects = [], listener;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) {
      const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  const module = { exports: {} };
  const code = babel.transformSync(fs.readFileSync(path.join(root, 'utils/useLiveRevision.js'), 'utf8'), {
    configFile: false, babelrc: false, plugins: [require('../node_modules/@babel/plugin-transform-modules-commonjs')],
  }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name === 'react' ? react : {
    liveSync: { subscribe(fn) { listener = fn; return () => {}; } },
  } });
  return { render(dirty) { cursor = 0; effects = []; const value = module.exports.default(['reports', 'tasks'], { dirty }); effects.forEach(fn => fn()); return value; },
    resync() { listener({ topics: ['resync'] }); } };
}

function makeForm(drafts = new Map(), { ready = true } = {}) {
  const photos = [0, 1, 2].map(i => ({ label: ['작업 전', '작업 중', '작업 후'][i], uri: null, path: null }));
  const base = { status: 'pending', latitude: '35', longitude: '129', locationAddress: '주소', photos,
    fieldMemo: '', mainComment: '', reportName: '현장 보고서', completedAt: '', markedMapUri: null,
    progressId: null, revision: null, recordedAt: '', photoEditor: { visible: false, uri: null, index: null } };
  const native = deferred(), response = deferred(); let owner = null;
  const ctx = { key: 'draft-1', taskId: 1, user: { userId: 1 }, workspaceKey: 'team',
    location: { lat: 35, lng: 129, roadAddress: '주소' }, defaultReportName: '현장 보고서', API_BASE_URL: 'https://test',
    currentFormRef: { current: clone(base) }, initialFormRef: { current: '' }, readyRef: { current: ready }, savedRef: { current: false },
    readyKeyRef: { current: ready ? 'draft-1' : null }, mountedRef: { current: true }, activeDraftKeyRef: { current: 'draft-1' },
    photoWorkRef: { current: null }, photoEditEpochRef: { current: 0 }, photoPicking: false, loadingReport: !ready,
    savingRef: { current: false }, positionSavingRef: { current: false }, mapEditor: { visible: false }, liveRevision: 0,
    failWrites: false, alerts: [], calls: [], editor: clone(base.photoEditor),
    preservePhoto: (key, uri) => !uri || uri.startsWith('saved:') ? uri : `saved:${uri}`,
    normalizeComments: x => x, restorePhotos: () => clone(photos), resolveApiUrl: x => x, statusFromRecords: status => status,
    fetch: async () => { ctx.calls.push('fetch-report'); return response.promise; },
    readDraft: async key => drafts.has(key) ? clone(drafts.get(key)) : null,
    writeDraft: async (key, form) => { if (ctx.failWrites) throw Error('disk full'); drafts.set(key, clone(form)); },
    beginPhotoPick: async (key, index, form) => { await ctx.writeDraft(key, form); owner = { key, index }; },
    pendingPhotoPick: async key => owner?.key === key ? owner : null,
    endPhotoPick: async key => { if (owner?.key === key) owner = null; },
    showAlert: (...args) => ctx.alerts.push(args),
    ImagePicker: { requestCameraPermissionsAsync: async () => { ctx.calls.push('permission'); return { granted: ctx.permission !== false }; },
      launchCameraAsync: async () => { ctx.calls.push('camera'); return native.promise; },
      launchImageLibraryAsync: async () => { ctx.calls.push('gallery'); return native.promise; },
      getPendingResultAsync: async () => null },
  };
  ctx.setPhotoPicking = value => { ctx.photoPicking = value; };
  ctx.setPhotoEditor = value => { ctx.editor = value; };
  ctx.setLoadingReport = value => { ctx.loadingReport = value; };
  for (const name of ['Status', 'Latitude', 'Longitude', 'LocationAddress', 'Photos', 'FieldMemo', 'MarkedMapUri',
    'MainComment', 'ReportName', 'CompletedAt', 'ProgressId', 'Revision', 'RecordedAt', 'LoadError']) ctx[`set${name}`] = () => {};
  vm.createContext(ctx);
  vm.runInContext(`${functions}\nthis.actions={${names.join(',')}, dirty:${generate(dirty).code}};this.load=${generate(loader).code};`, ctx);
  ctx.initialFormRef.current = ctx.actions.editSnapshot(base);
  return { ctx, drafts, native, response, base, owner: () => owner,
    start: mode => mode === 'camera' ? ctx.actions.takePhoto(0) : ctx.actions.pickPhotoFromLibrary(0) };
}

(async () => {
  for (const mode of ['camera', 'gallery']) {
    const app = makeForm(), { ctx } = app, hook = makeHook();
    assert.equal(hook.render(ctx.actions.dirty), 0);
    // A resync fetch already running before the camera opens must not overwrite its later result.
    ctx.liveRevision = 1; ctx.load();
    const pick = app.start(mode); await settle();
    assert(ctx.photoWorkRef.current); hook.resync(); assert.equal(hook.render(ctx.actions.dirty), 0);
    app.native.resolve({ canceled: false, assets: [{ uri: `file:///${mode}.jpg` }] }); await pick;
    assert.equal(ctx.editor.visible, true); assert.equal(app.drafts.get(ctx.key).photoEditor.visible, true);
    hook.resync(); assert.equal(hook.render(ctx.actions.dirty), 0, `${mode}: resync deferred throughout editing`);
    app.response.resolve({ ok: true, text: async () => '{}' }); await settle();
    assert.equal(ctx.editor.visible, true, `${mode}: late report response cannot close the editor`);
    assert.equal(ctx.initialFormRef.current, ctx.actions.editSnapshot(app.base), 'late query cannot change the baseline');

    const unfinished = makeForm(app.drafts, { ready: false }); unfinished.ctx.load();
    unfinished.response.resolve({ ok: true, text: async () => '{}' }); await settle();
    assert.equal(unfinished.ctx.editor.visible, true, 'unfinished editing is restored on reentry');

    await ctx.actions.closePhotoEditor();
    assert.equal(ctx.editor.visible, false); assert.equal(app.drafts.get(ctx.key).photoEditor.visible, false);
    assert.equal(app.drafts.get(ctx.key).photos[0].uri, null, 'cancel never adds the captured photo');
    assert.equal(hook.render(ctx.actions.dirty), 0); assert.equal(hook.render(ctx.actions.dirty), 1, 'deferred sync resumes after cancel');
    const canceled = makeForm(app.drafts, { ready: false }); canceled.ctx.load();
    canceled.response.resolve({ ok: true, text: async () => '{}' }); await settle();
    assert.equal(canceled.ctx.editor.visible, false, 'canceled editor does not reappear');

    const complete = makeForm(); const pending = complete.start(mode); await settle();
    complete.native.resolve({ canceled: false, assets: [{ uri: `file:///${mode}.jpg` }] }); await pending;
    await complete.ctx.actions.completePhotoEdit('file:///edited.jpg');
    assert.equal(complete.drafts.get(ctx.key).photos[0].uri, 'saved:file:///edited.jpg');
    assert.equal(complete.drafts.get(ctx.key).photoEditor.visible, false);
    const reopened = makeForm(complete.drafts, { ready: false }); reopened.ctx.load();
    reopened.response.resolve({ ok: true, text: async () => '{}' }); await settle();
    assert.equal(reopened.ctx.editor.visible, false); assert.equal(reopened.ctx.currentFormRef.current.photos[0].uri, 'saved:file:///edited.jpg');

    const nativeCancel = makeForm(), canceledPick = nativeCancel.start(mode); await settle();
    nativeCancel.native.resolve({ canceled: true }); await canceledPick;
    assert.equal(nativeCancel.ctx.editor.visible, false); assert.equal(nativeCancel.owner(), null); assert.equal(nativeCancel.ctx.photoWorkRef.current, null);
  }
  const restored = makeForm(new Map(), { ready: false });
  await restored.ctx.beginPhotoPick(restored.ctx.key, 1, restored.base);
  restored.ctx.ImagePicker.getPendingResultAsync = async () => ({ canceled: false, assets: [{ uri: 'file:///restored-camera.jpg' }] });
  restored.ctx.load(); restored.response.resolve({ ok: true, text: async () => '{}' }); await settle();
  assert.equal(restored.ctx.editor.visible, true); assert.equal(restored.ctx.editor.index, 1);
  assert.equal(restored.ctx.editor.uri, 'saved:file:///restored-camera.jpg'); assert.equal(restored.owner(), null, 'native pending result recovery still works after process loss');
  const clean = makeForm(); clean.ctx.liveRevision = 1; clean.ctx.load();
  clean.response.resolve({ ok: true, text: async () => JSON.stringify({ fieldMemo: '서버에서 변경된 메모' }) }); await settle();
  assert.equal(clean.ctx.currentFormRef.current.fieldMemo, '서버에서 변경된 메모', 'clean forms still receive committed server updates');
  const denied = makeForm(); denied.ctx.permission = false; await denied.start('camera');
  assert(!denied.ctx.calls.includes('camera')); assert.equal(denied.owner(), null); assert.equal(denied.ctx.photoPicking, false);
  const failure = makeForm(), capture = failure.start('camera'); await settle();
  failure.native.resolve({ canceled: false, assets: [{ uri: 'file:///camera.jpg' }] }); await capture;
  failure.ctx.failWrites = true; await failure.ctx.actions.closePhotoEditor();
  assert.equal(failure.ctx.editor.visible, true, 'failed cancel persistence keeps editing recoverable'); assert.equal(failure.ctx.alerts.length, 1);
  const switched = makeForm(), oldPick = switched.start('camera'); await settle();
  switched.ctx.activeDraftKeyRef.current = 'draft-2'; switched.native.resolve({ canceled: false, assets: [{ uri: 'file:///old.jpg' }] }); await oldPick;
  assert.equal(switched.ctx.editor.visible, false); assert.equal(switched.drafts.get('draft-1').photoEditor.visible, true, 'late native callback is preserved only for its own draft');
  const immediate = makeForm(), hook = makeHook(); hook.render(immediate.ctx.actions.dirty);
  immediate.ctx.photoWorkRef.current = { key: immediate.ctx.key }; // No React render yet.
  hook.resync(); assert.equal(hook.render(immediate.ctx.actions.dirty), 0, 'ref guard protects the pre-render native callback window');
  const booleanHook = makeHook(); booleanHook.render(true); booleanHook.resync(); booleanHook.render(false);
  assert.equal(booleanHook.render(false), 1, 'existing boolean consumers still receive deferred sync');
  console.log('PASS: real camera/gallery handlers and report loader preserve editing across resync, late responses, complete/cancel/reentry, denied permissions, disk errors and scope changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
