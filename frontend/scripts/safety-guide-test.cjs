const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/safetyGuide.js'), 'utf8');
  const { safetyGuideNotice } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const base = { destinationKey: 'visit-1', visible: true, kind: 'camera', label: '과속 단속', distance: 530, speedLimit: 50 };
  assert.equal(safetyGuideNotice(base, 'visit-2'), null);
  assert.equal(safetyGuideNotice(null, 'visit-1'), null);
  for (const distance of [null, NaN, Infinity, -1, 1501, '530']) {
    assert.equal(safetyGuideNotice({ ...base, distance }, 'visit-1'), null);
  }
  assert.equal(safetyGuideNotice({ ...base, visible: false }, 'visit-1'), null);
  assert.equal(safetyGuideNotice({ ...base, kind: 'unknown' }, 'visit-1'), null);
  assert.equal(safetyGuideNotice({ ...base, speedLimit: 0 }, 'visit-1').speedLimit, null, 'missing speed limits must not be invented');
  assert.equal(safetyGuideNotice({ ...base, speedLimit: 300 }, 'visit-1').speedLimit, null);
  assert.equal(safetyGuideNotice({ ...base, kind: 'hump' }, 'visit-1'), null, 'speed bumps are disabled even for stale native events');
  for (const kind of ['camera', 'section', 'school', 'caution']) {
    const notice = safetyGuideNotice({ ...base, kind, distance: 0, overSpeed: true }, 'visit-1');
    assert.equal(notice.kind, kind); assert.equal(notice.distance, 0); assert.equal(notice.overSpeed, true);
  }
  console.log('Safety guide checks passed: destination isolation, distance validation, camera/caution types and unknown limits');
})().catch(error => { console.error(error); process.exitCode = 1; });
