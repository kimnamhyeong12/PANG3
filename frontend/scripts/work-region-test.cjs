const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('../node_modules/@babel/core');
const root = path.join(__dirname, '..');
const source = babel.transformFileSync(path.join(root, 'utils/workRegion.js'), {
  configFile: false, babelrc: false,
  plugins: [require('../node_modules/@babel/plugin-transform-modules-commonjs')],
}).code;
const exportsObject = {};
new Function('exports', 'require', source)(exportsObject, name => require(path.resolve(root, 'utils', name)));
const { emptyWorkRegion, selectWorkRegion, childDistricts, serializeWorkRegion, parseWorkRegion, isWorkRegionComplete } = exportsObject;
const data = require('../constants/koreaRegions.json');
assert.equal(exportsObject.isOptionalWorkRegionValid(emptyWorkRegion()), true, 'an optional region may be omitted');
assert.equal(exportsObject.isOptionalWorkRegionValid({sido:'부산광역시',sigungu:'',gu:''}), false, 'a selected region must be complete');
assert.deepEqual(data, JSON.parse(fs.readFileSync(path.join(root, '../backend/src/main/resources/korea-regions.json'), 'utf8')), 'app/server must use the same hierarchy');
let value = emptyWorkRegion();
assert.equal(isWorkRegionComplete(value), false);
value = selectWorkRegion(value, 'sido', '충청남도');
value = selectWorkRegion(value, 'sigungu', '천안시');
assert.deepEqual(childDistricts(value), ['동남구', '서북구']);
assert.equal(isWorkRegionComplete(value), false, 'a city containing gu is incomplete until its gu is selected');
value = selectWorkRegion(value, 'gu', '동남구');
assert.equal(isWorkRegionComplete(value), true);
assert.equal(serializeWorkRegion(value), '천안시 동남구');
assert.deepEqual(parseWorkRegion('충청남도', '천안시 동남구'), value);
value = selectWorkRegion(value, 'sigungu', '아산시');
assert.equal(value.gu, ''); assert.equal(childDistricts(value).length, 0); assert.equal(isWorkRegionComplete(value), true);
value = selectWorkRegion(value, 'sido', '부산광역시');
assert.equal(value.sigungu, ''); assert.equal(value.gu, ''); assert.equal(isWorkRegionComplete(value), false);
value = selectWorkRegion(value, 'sigungu', '사하구');
assert.equal(childDistricts(value).length, 0); assert.equal(isWorkRegionComplete(value), true);
assert.equal(serializeWorkRegion(value), '사하구');
for (const sido of data.regions) for (const sigungu of data.districtsByRegion[sido]) {
  const region = { sido, sigungu, gu: '' };
  const children = childDistricts(region);
  if (children.length) {
    assert.equal(isWorkRegionComplete(region), false);
    for (const gu of children) {
      const full = { ...region, gu };
      assert.equal(isWorkRegionComplete(full), true);
      assert.deepEqual(parseWorkRegion(sido, serializeWorkRegion(full)), full);
    }
    assert.equal(isWorkRegionComplete({ ...region, gu: '다른 지역의 구' }), false);
  } else assert.equal(isWorkRegionComplete(region), true);
}
assert.equal(parseWorkRegion('전라북도', '전주시 완산구').sido, '전북특별자치도');
console.log('Conditional work-region selection passed: nationwide hierarchy, required gu, parent resets, storage round trips and shared server data');
