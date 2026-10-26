const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const generate = require('@babel/generator').default;

const source = fs.readFileSync(path.join(__dirname, '../components/KakaoMapWebView.js'), 'utf8');
let bridge;
babel.transformSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
  plugins: [() => ({ visitor: { VariableDeclarator(node) {
    if (node.node.id.name !== 'mapRef') return;
    bridge = node.node.init.arguments[0].properties.find(property => property.key.name === 'fitToCoordinates').value;
  } } })] });
let command;
const fit = vm.runInNewContext(`(${generate(bridge).code})`, { sendMapCommand: value => { command = value; } });
const coordinates = [{ latitude: 35.0, longitude: 129.0 }, { latitude: 35.1, longitude: 129.1 }];
const padding = { top: 391, right: 40, bottom: 96, left: 40 };
fit(coordinates, { edgePadding: padding });
assert.equal(command.type, 'FIT');
assert.equal(command.padding, padding, 'Native bridge must use the padding field read by the map');

// Execute the actual HTML fit handler with an SDK boundary stub to verify all four margins.
const start = source.indexOf('  function fitCoordinates(');
const end = source.indexOf('\n  /*', start);
let boundsCall;
class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }
class LatLngBounds { constructor() { this.points = []; } extend(point) { this.points.push(point); } }
const context = { map: { setBounds: (...args) => { boundsCall = args; } },
  window: { kakao: { maps: { LatLng, LatLngBounds } } },
  toLatLng: point => new LatLng(point.latitude, point.longitude) };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
context.fitCoordinates(command.coordinates, command.padding);
assert.deepEqual(boundsCall.slice(1), [391, 40, 96, 40]);
assert.equal(boundsCall[0].points.length, 2);
console.log('Route viewport checks passed: measured margins reach Kakao setBounds');

// Exercise the embedded camera handler: expanding the visit list changes padding,
// but only a new preview or an explicit detail/overview action may fit again.
let previewFits = 0, detailMoves = 0;
const cameraContext = { previewCameraKey: null, previewCameraInteracted: false,
  cancelPreviewFocus() { cameraContext.previewCameraInteracted = true; },
  fitCoordinates() { previewFits++; }, moveToPosition() { detailMoves++; } };
vm.createContext(cameraContext);
const cameraStart = source.indexOf('  function updatePreviewCamera(');
vm.runInContext(source.slice(cameraStart, source.indexOf('\n  /*', cameraStart)), cameraContext);
const camera = { key: 'visit:car:false', coordinates, padding, destination: { lat: 35.1, lng: 129.1 }, detail: false };
cameraContext.updatePreviewCamera(camera);
cameraContext.updatePreviewCamera({ ...camera, padding: { ...padding, top: 720 } });
cameraContext.updatePreviewCamera(camera);
assert.equal(previewFits, 1, 'opening and closing the visit list must preserve preview zoom');
cameraContext.updatePreviewCamera({ ...camera, key: 'visit:car:true', detail: true });
assert.equal(detailMoves, 1, 'explicit destination zoom still works');
cameraContext.updatePreviewCamera({ ...camera, key: 'next:car:false' });
assert.equal(previewFits, 2, 'a new preview still fits its route');

let viewportEffect;
babel.transformSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
  plugins: [() => ({ visitor: { CallExpression(node) {
    if (node.node.callee.name === 'useEffect' && generate(node.node.arguments[0]).code.includes('const targetPath =')) viewportEffect = node.node.arguments[0];
  } } })] });
let fitCount = 0; const previewCommands = [];
const viewport = { sendMapCommand(command) { previewCommands.push(command); }, previewDestination: null, previewDetailView: false, guideTarget: null, segmentFocusKeyRef: { current: null }, mapRef: { current: { fitToCoordinates: () => fitCount++ } },
  segmentFocusTimerRef: { current: null }, segmentFocusKeyRef: { current: null },
  isGuiding: true, previewRouteSegment: null, routeSegments: [], currentSegmentIndex: 0, roadPath: [],
  routeViewportPadding: { top: 400, bottom: 180 }, clearTimeout };
vm.createContext(viewport);
vm.runInContext(`(${generate(viewportEffect).code})()`, viewport);
viewport.routeViewportPadding.top = 600;
vm.runInContext(`(${generate(viewportEffect).code})()`, viewport);
assert.equal(fitCount, 0, 'opening and closing visits during guidance must not zoom out to the full route');
viewport.previewDestination = { lat: 35.1, lng: 129.1 };
viewport.previewRouteSegment = { destinationKey: 'next', path: [{ lat: 35, lng: 129 }, { lat: 35.1, lng: 129.1 }] };
vm.runInContext(`(${generate(viewportEffect).code})()`, viewport);
assert.ok(previewCommands.some(command => command.type === 'PREVIEW_CAMERA' && command.key), 'browsing a destination sends its dedicated preview camera request');

// Group overview must fit its administrative district, even when a visit is far away.
const groupSource = fs.readFileSync(path.join(__dirname, '../screens/WorkStatusScreen.js'), 'utf8');
let buildGroupMap;
babel.transformSync(groupSource, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
  plugins: [() => ({ visitor: { VariableDeclarator(node) {
    if (node.node.id.name === 'buildMapHtml') buildGroupMap = node.node.init;
  } } })] });
const groupHtml = vm.runInNewContext(`(${generate(buildGroupMap).code})`, {
  safeJson: JSON.stringify, KAKAO_JAVASCRIPT_KEY: '', UNASSIGNED_COLOR: '#999', MIXED_AREA_COLOR: '#888',
  colors: { pending: '#c87', warning: '#be9', success: '#4F9588' },
})({ boundaries: { features: [{ properties: { adm_cd: '2110010', adm_nm: '하단동' },
  geometry: { type: 'Polygon', coordinates: [[[128.9, 35], [129, 35.1], [128.9, 35]]] } }] },
  assignments: [{ latitude: 37.5, longitude: 127, status: 'complete' }], memberColors: {} });
const overlays = [];
const maps = { LatLng, LatLngBounds,
  Map: class { setBounds(...args) { boundsCall = args; } },
  CustomOverlay: class { constructor(options) { overlays.push(options); } },
  event: { addListener() {} }, load: fn => fn(),
};
vm.runInNewContext(groupHtml.split('<script>').at(-1).split('</script>')[0], {
  kakao: { maps }, document: { getElementById: () => ({}), createElement: () => ({ style: {} }) },
});
assert(boundsCall[0].points.every(point => point.lat < 36), 'distant visits must not widen the district viewport');
assert.deepEqual(Array.from(boundsCall.slice(1)), [12, 12, 12, 12]);
assert(overlays[0].content.innerHTML.includes('#4F9588'), 'finished group markers use the work-after color');
console.log('Group viewport checks passed: district bounds ignore distant visits and finished pins are green');
