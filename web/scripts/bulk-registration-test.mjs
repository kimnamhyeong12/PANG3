import test from 'node:test';
import assert from 'node:assert/strict';
import { registerBulkRows } from '../src/lib/bulkRegistration.js';
const rows = Array.from({ length: 201 }, (_, i) => ({ rowNumber: i + 2 }));
test('splits worksheets into at most 200 rows while preserving original row numbers', async () => {
  const calls = [];
  const result = await registerBulkRows(rows, async chunk => { calls.push(chunk); return { totalCount: chunk.length, savedCount: chunk.length, failedCount: 0, failures: [] }; });
  assert.deepEqual(calls.map(chunk => chunk.length), [200, 1]);
  assert.equal(calls[1][0].rowNumber, 202);
  assert.equal(result.savedCount, 201);
});
test('retains failed rows without resending saved rows', async () => {
  const result = await registerBulkRows(rows.slice(0, 2), async () => ({ totalCount: 2, savedCount: 1, failedCount: 1, failures: [{ rowNumber: 3, reason: '위도 확인' }] }));
  assert.deepEqual(result.savedRows, [2]);
  assert.equal(result.failures[0].rowNumber, 3);
  assert.equal(result.uncertain, false);
});
test('lost or inconsistent responses stop the upload without retrying possibly committed rows', async () => {
  for (const send of [async () => { throw Error('connection lost'); }, async () => ({ totalCount: 200, savedCount: 200, failedCount: 1, failures: [] })]) {
    let calls = 0;
    const result = await registerBulkRows(rows, async chunk => { calls++; return send(chunk); });
    assert.equal(calls, 1);
    assert.equal(result.uncertain, true);
    assert.equal(result.failures.length, 201);
    assert.equal(result.failures.at(-1).reason, '미전송');
  }
});
