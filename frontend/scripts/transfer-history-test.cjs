const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('../node_modules/@babel/core');
const calls = [];
let failureStatus = null;
const moduleMock = { exports: {} };
const source = babel.transformFileSync(require.resolve('../utils/transferHistory.js'), {
  plugins: [require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')],
  configFile: false, babelrc: false,
}).code;
vm.runInNewContext(source, { module: moduleMock, exports: moduleMock.exports,
  require: () => ({ groupApi: async url => {
    calls.push(url);
    if (failureStatus && url.includes('/page?')) throw Object.assign(new Error('history failed'), { status: failureStatus });
    if (!url.includes('/page?')) return [
      { id: 1, senderUserId: 10, recipientUserId: 20, taskIds: [7], status: 'PENDING', requestedAt: new Date().toISOString() },
      { id: 2, senderUserId: 20, recipientUserId: 10, taskIds: [8], status: 'PENDING', requestedAt: '2026-01-01T00:00:00Z' },
    ];
    return { items: [], hasMore: false };
  } }),
});
const { transferHistoryPage, compareTransferHistory, mergeTransferHistory } = moduleMock.exports;
(async () => {
  await transferHistoryPage(5, 10);
  await transferHistoryPage(5, 10, 1);
  await transferHistoryPage(5, 10, 0, 'outgoing', 20);
  assert.deepEqual(calls, [
    '/api/groups/5/transfers/page?userId=10&page=0&direction=all',
    '/api/groups/5/transfers/page?userId=10&page=1&direction=all',
    '/api/groups/5/transfers/page?userId=10&page=0&direction=outgoing&recipientId=20',
  ]);
  const records = [
    { id: 1, recipientUserId: 20, status: 'PENDING', requestedAt: '2026-10-15T00:00:00Z' },
    { id: 2, recipientUserId: 10, status: 'ACCEPTED', requestedAt: '2026-10-16T00:00:00Z' },
    { id: 3, recipientUserId: 10, status: 'PENDING', requestedAt: '2026-08-01T00:00:00Z' },
  ];
  assert.deepEqual(records.sort(compareTransferHistory(10)).map(r => r.id), [3, 2, 1]);
  const merged = mergeTransferHistory([{ id: 1, status: 'PENDING' }], [{ id: 1, status: 'ACCEPTED' }, { id: 2 }]);
  assert.equal(merged.length, 2); assert.equal(merged[0].status, 'ACCEPTED');
  failureStatus = 404;
  const fallback = await transferHistoryPage(5, 10);
  assert.equal(fallback.items[0].id, 2, 'old-server fallback still prioritizes my unanswered requests');
  const sent = await transferHistoryPage(5, 10, 0, 'outgoing', 20);
  assert.equal(sent.items.length, 1); assert.equal(sent.pendingTaskIds[0], 7);
  failureStatus = 403;
  const before = calls.length;
  await assert.rejects(transferHistoryPage(5, 10), /history failed/);
  assert.equal(calls.length, before + 1, 'authorization failures must not fall back to the legacy endpoint');
  console.log('Transfer history checks passed: server pages, recipient filtering, incoming priority and overlapping page deduplication');
})().catch(error => { console.error(error); process.exitCode = 1; });
