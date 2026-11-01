import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readImportWorkbook } from '../src/lib/importWorkbook.js';
import { usablePhotoCoordinates, suggestedPhotoName } from '../src/lib/photoValidation.js';
import { locationError } from '../src/lib/bulkValidation.js';
test('Korean UTF-8 CSV headers without BOM and worksheet row numbers remain intact', () => {
  const book = readImportWorkbook(new TextEncoder().encode('방문지명,도로명주소,위도,경도\n현장,부산 사하구,35.1,128.9'), 'visits.csv', XLSX);
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 });
  assert.equal(rows[0][0], '방문지명'); assert.equal(rows[1][0], '현장');
});
test('zero-pair GPS is unresolved while valid equator/meridian coordinates are retained', () => {
  assert.equal(usablePhotoCoordinates(0,0), false); assert.equal(usablePhotoCoordinates(0,128), true); assert.equal(usablePhotoCoordinates(35,0), true); assert.equal(usablePhotoCoordinates(NaN,128), false);
  assert.equal(suggestedPhotoName('부산', [{ name: '부산' }, { name: '부산 (2)' }]), '부산 (3)');
});
test('bulk validation accepts zero coordinates and rejects blank, infinite or out-of-range coordinates', () => {
  assert.equal(locationError({ name: '현장', lat: '0', lng: '0' }), '');
  for (const row of [{ lat: '', lng: '128' }, { lat: 'Infinity', lng: '128' }, { lat: '91', lng: '128' }, { lat: '35', lng: '181' }]) assert.notEqual(locationError({ name: '현장', ...row }), '');
});
