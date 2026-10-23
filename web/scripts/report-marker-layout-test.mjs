import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../backend/src/main/resources/report-marker-layout.js', import.meta.url), 'utf8');
const { layoutReportMarkers, createReportMarkerLayer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const arrange = points => layoutReportMarkers(points, 960, 560);
function check(points) {
  const labels = arrange(points);
  assert.equal(labels.length, points.length);
  assert.deepEqual(labels, arrange([...points].reverse()));
  labels.forEach(label => {
    assert.ok(points.includes(label.point));
    if (label.moved) assert.ok(label.x >= 20 && label.x <= 940 && label.y >= 20 && label.y <= 524);
    labels.forEach(other => {
      if (other.point.n !== label.point.n) assert.ok(Math.hypot(label.x - other.x, label.y - other.y) >= 36);
    });
  });
  return labels;
}
assert.equal(check([{ n: 1, x: 300, y: 300 }])[0].moved, false);
assert.ok(check([{ n: 1, x: 100, y: 100 }, { n: 2, x: 800, y: 450 }]).every(x => !x.moved));
assert.equal(check([{ n: 1, x: 462, y: 282 }, { n: 2, x: 464, y: 310 }, { n: 3, x: 480, y: 288 }]).filter(x => x.moved).length, 3);
for (const [x, y] of [[22, 46], [938, 46], [22, 522], [938, 522], [480, 280]]) {
  check(Array.from({ length: 12 }, (_, i) => ({ n: i + 1, x, y })));
}
// Exercise live zoom/resize and teardown with a fake SDK, without a real map key.
const listeners = new Map(), overlays = [], picked = [];
const node = () => ({ style: {}, children: [], classList: { toggle() {} }, setAttribute() {}, appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; } });
globalThis.document = { createElement: node, createElementNS: node };
let observer;
globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; observer = this; } observe() {} disconnect() { this.disconnected = true; } };
const kakao = { maps: {
  LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
  CustomOverlay: class { constructor(options) { Object.assign(this, options); overlays.push(this); } setMap(map) { this.map = map; } setVisible(value) { this.visible = value; } setZIndex(value) { this.zIndex = value; } },
  event: { addListener(map, event, fn) { listeners.set(event, fn); }, removeListener(map, event) { listeners.delete(event); } },
} };
let zoom = 1;
const map = { getProjection: () => ({ containerPointFromCoords: p => ({ x: 400 + p.lng * zoom, y: 250 + p.lat * zoom }) }) };
const markers = [{ n: 1, lat: 0, lng: 0, color: '#2477F3' }, { n: 2, lat: 5, lng: 5, color: '#12A9A5' }];
const layer = createReportMarkerLayer(map, kakao, { clientWidth: 960, clientHeight: 560 }, markers, () => node(), n => picked.push(n));
assert.ok(overlays[0].content.children.length > 1); // dot + line + moved badge
overlays[0].content.children.at(-1).onclick();
assert.deepEqual(picked, [1]);
assert.equal(overlays[0].position.lat, 0);
layer.setActive(2); assert.equal(overlays[1].zIndex, 10);
zoom = 20; listeners.get('idle')();
assert.equal(overlays[0].content.children.length, 1); // no overlap at closer zoom
observer.fn(); layer.destroy();
assert.ok(observer.disconnected); assert.equal(listeners.size, 0);
assert.ok(overlays.every(o => o.map === null));
console.log('Report markers passed: collisions, exact coordinates, boundaries, duplicate coordinates, click targets, zoom, resize and cleanup');
