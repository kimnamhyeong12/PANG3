const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const babel = require('../node_modules/@babel/core');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = babel.transformSync(read(file), { configFile: false, babelrc: false, plugins: [[require('../node_modules/@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], require('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { module, exports: module.exports, process: { env: {} }, require: name => mocks[name] || (name === 'react-native' ? { StyleSheet: { create: value => value } } : {}) });
  return module.exports;
}
const viewport = load('frontend/utils/stableMapViewport.js');
let frames = [], observer, fitCount = 0;
const events = {}, box = { clientWidth: 318, clientHeight: 0, style: {}, addEventListener: (name, callback) => { events[name] = callback; }, removeEventListener() {} };
const camera = { level: 5, center: 'initial', relayout() {}, getLevel() { return this.level; }, getCenter() { return this.center; }, setLevel(level) { this.level = level; }, setCenter(center) { this.center = center; } };
const context = { requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, ResizeObserver: class { constructor(fn) { observer = fn; } observe() { observer(); } disconnect() {} }, window: { addEventListener() {}, removeEventListener() {} } };
vm.createContext(context); vm.runInContext(viewport.stableMapViewportSource, context);
const lifecycle = context.createStableMapViewport(camera, box, () => { fitCount++; camera.level = box.clientHeight < 160 ? 13 : 5; camera.center = 'visits'; });
const flush = () => { for (let limit = 0; frames.length && limit < 10; limit++) { const callbacks = frames; frames = []; callbacks.forEach(fn => fn()); } };
flush(); assert.equal(fitCount, 0); assert.equal(box.style.visibility, 'hidden');
box.clientHeight = 1; observer(); flush(); assert.equal(fitCount, 0, 'never fit a 1px map');
box.clientHeight = 300; observer(); flush(); assert.equal(camera.level, 5); assert.equal(fitCount, 1); assert.equal(box.style.visibility, 'visible');
observer(); flush(); assert.equal(fitCount, 1, 'ordinary redraw does not reset zoom');
box.clientHeight = 400; observer(); flush(); assert.equal(fitCount, 2, 'late initial resize refits after relayout');
events.touchstart(); camera.level = 3; camera.center = 'user'; box.clientWidth = 350; observer(); flush();
assert.equal(camera.level, 3); assert.equal(camera.center, 'user'); assert.equal(fitCount, 2, 'preserve a user-adjusted viewport');
lifecycle.requestFit(); flush(); assert.equal(fitCount, 3, 'explicit new report selection can fit new markers'); lifecycle.destroy();

const layer = load('frontend/utils/projectReportMarkerSource.js');
const report = load('frontend/components/ProjectReportMap.js', { '../utils/projectReportMarkerSource': layer, '../utils/stableMapViewport': viewport });
const dashboard = load('frontend/screens/WorkStatusScreen.js', { '../constants/design': { colors: {} }, '../utils/stableMapViewport': viewport });
const scripts = html => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
for (const html of [report.projectReportMapHtml([{ n: 1, lat: 35.1, lng: 129, color: '#2477F3' }], 'test'), dashboard.buildMapHtml({})]) {
  scripts(html).forEach(script => new vm.Script(script));
  assert(html.includes('createStableMapViewport(map,box'));
}
const preview = viewport.stabilizeReportHtmlViewport('<head></head><script>if(data.length>1)map.setBounds(bounds,72,64,72,64);</script>');
assert(preview.includes('createStableMapViewport(map,el')); scripts(preview).forEach(script => new vm.Script(script));
const runtime = load('frontend/utils/nativeReportRuntime.js');
const files = Object.fromEntries(runtime.nativePreviewScriptFiles.map(file => [file, read(`backend/src/main/resources/static/report-runtime/${file}`)]));
const index = read('backend/src/main/resources/static/report-runtime/index.html');
for (const sources of [files, Object.fromEntries(runtime.nativeMapScriptFiles.map(file => [file, files[file]]))]) {
  scripts(runtime.nativeReportRuntimeHtml(index, sources)).forEach(script => new vm.Script(script));
}
// URL is used only to resolve the public runtime directory.
const moduleWithUrl = { exports: {} };
const bridgeCode = babel.transformSync(read('frontend/utils/nativeReportPreview.js'), { configFile: false, babelrc: false, plugins: [require('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
vm.runInNewContext(bridgeCode, { URL, module: moduleWithUrl, exports: moduleWithUrl.exports });
new vm.Script(moduleWithUrl.exports.nativeReportPreviewBridge('https://api.test/report-runtime/index.html'));
console.log('PASS: 0/1px deferred fit, stable layout, late resize, manual viewport retention, explicit refit, both actual map scripts and native HTML/HWPX runtime bundles');
