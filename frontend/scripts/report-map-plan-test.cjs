const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/reportMapPlan.js'), 'utf8');
  const { validReportMap, planReportMap } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const layoutSource = fs.readFileSync(path.join(__dirname, '../../backend/src/main/resources/report-marker-layout.js'), 'utf8');
  const { layoutReportMarkers } = await import(`data:text/javascript;base64,${Buffer.from(layoutSource).toString('base64')}`);
  const marker = { n: 1, lat: 35.1, lng: 128.9, color: '#2477F3' };
  const spec = { width: 960, height: 560, markers: [marker] };
  const single = planReportMap(spec);
  assert.equal(single.zoom, 17);
  assert.ok(Math.abs(single.points[0].x - 480) < .0001);
  assert.ok(Math.abs(single.points[0].y - 294) < .0001);
  assert.ok(single.tiles.length <= 20);
  const overlap = planReportMap({ ...spec, markers: [marker, { ...marker, n: 3, color: '#12A9A5' }] });
  const labels = layoutReportMarkers(overlap.points, 960, 560);
  assert.deepEqual(labels.map(label => label.point.n), [1, 3]);
  assert.ok(labels.every(label => label.moved));
  assert.ok(Math.hypot(labels[0].x - labels[1].x, labels[0].y - labels[1].y) > 40);
  for (const longitude of [-180, 180]) {
    const edge = planReportMap({ ...spec, markers: [{ ...marker, lng: longitude }] });
    assert.ok(edge.tiles.every(tile => tile.x >= 0 && tile.x < 2 ** tile.z && tile.y >= 0 && tile.y < 2 ** tile.z));
  }
  assert.equal(planReportMap({ ...spec, markers: [] }).tiles.length, 0);
  assert.equal(validReportMap({ ...spec, markers: [{ ...marker, lat: Infinity }] }), false);
  assert.equal(validReportMap({ ...spec, markers: [{ ...marker, color: 'url(https://evil.invalid)' }] }), false);
  console.log('Map geometry: fixed center/zoom, numbering, overlapping labels, world-edge tiles and invalid inputs passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
