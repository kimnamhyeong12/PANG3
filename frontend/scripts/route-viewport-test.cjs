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
