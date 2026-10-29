const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const code = fs.readFileSync(path.join(__dirname, '../utils/localReportProtocol.js'), 'utf8');
  const plan = fs.readFileSync(path.join(__dirname, '../utils/reportMapPlan.js'), 'utf8');
  const moduleSource = code.replace("'./reportMapPlan.js'", `'data:text/javascript;base64,${Buffer.from(plan).toString('base64')}'`);
  const { localReportSession, bytesToBase64, base64ToBytes, REPORT_CHANNEL: channel } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  for (const size of [0, 1, 2, 3, 12287, 12288, 12289, 262144]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  }
  const descriptor = { schema: 1, assets: [], fileName: 'test.hwpx' };
  assert.throws(() => localReportSession({ descriptor: { ...descriptor, assets: [{ path: '/work/assets/0.jpg', url: 'https://evil.invalid/api/files/1/x.jpg' }] } }), /허용되지/);
  const sent = [];
  const session = localReportSession({ descriptor, send: value => sent.push(value) });
  await session.receive({ channel, type: 'ready' });
  const job = sent[0].job;
  await session.receive({ channel, job: 'wrong', type: 'done', size: 3 });
  await session.receive({ channel, job, type: 'chunk', index: 0, count: 1, data: 'AQID' });
  await session.receive({ channel, job, type: 'done', size: 3 });
  assert.deepEqual((await session.promise).bytes, Uint8Array.of(1, 2, 3));
  const cancel = localReportSession({ descriptor, send() {} });
  const cancelled = assert.rejects(cancel.promise, /취소/); cancel.cancel(); await cancelled;
  const short = localReportSession({ descriptor, send() {}, timeoutMs: 1 });
  await assert.rejects(short.promise, /초과/);
  const denied = localReportSession({ descriptor: { ...descriptor, assets: [{ path: '/work/assets/0.jpg', url: '/api/files/1/photo.jpg' }] },
    send: message => sent.push(message), fetchAsset: async () => ({ ok: false, status: 403 }) });
  await denied.receive({ channel, type: 'ready' });
  const deniedJob = sent.at(-1).job;
  const rejected = assert.rejects(denied.promise, /권한/);
  await denied.receive({ channel, job: deniedJob, type: 'asset', index: 0 }); await rejected;
  const html = localReportSession({ descriptor: { ...descriptor, format: 'html' }, send: value => sent.push(value) });
  await html.receive({ channel, type: 'ready' });
  const htmlJob = sent.at(-1).job;
  const text = '<html>보고서 😀</html>';
  await html.receive({ channel, job: htmlJob, type: 'html-chunk', index: 0, count: 2, data: text.slice(0, 11) });
  await html.receive({ channel, job: htmlJob, type: 'html-chunk', index: 1, count: 2, data: text.slice(11) });
  await html.receive({ channel, job: htmlJob, type: 'done', size: text.length });
  assert.equal((await html.promise).html, text);
  const spec = { width: 960, height: 560, markers: [{ n: 1, lat: 35.1, lng: 128.9, color: '#2477F3' }] };
  const requests = [];
  const maps = localReportSession({ descriptor: { ...descriptor, assets: [{ path: '/work/assets/0.jpg', map: spec, optional: false }] },
    send: message => sent.push(message), fetchAsset: async (url, options) => {
      requests.push({ url, cache: options.cache }); return new Response(new Uint8Array([1, 2, 3]));
    } });
  await maps.receive({ channel, type: 'ready' });
  const mapJob = sent.at(-1).job;
  await maps.receive({ channel, job: mapJob, type: 'asset', index: 0 });
  assert.equal(sent.at(-1).renderMap, true); assert.equal(requests.length, 0, 'map images must not be fetched from server');
  const { planReportMap } = await import(`data:text/javascript;base64,${Buffer.from(plan).toString('base64')}`);
  const firstTile = planReportMap(spec).tiles[0];
  await maps.receive({ channel, job: mapJob, type: 'tile', index: 0, ...firstTile });
  assert.equal(requests[0].url, `/api/local-report-map/tiles/${firstTile.z}/${firstTile.x}/${firstTile.y}`);
  assert.equal(requests[0].cache, 'default');
  const blockedTile = assert.rejects(maps.promise, /허용되지/);
  await maps.receive({ channel, job: mapJob, type: 'tile', index: 1, z: 7, x: 0, y: 0 }); await blockedTile;
  assert.throws(() => localReportSession({ descriptor: { ...descriptor, assets: [{ path: '/work/assets/0.jpg', url: '/api/local-reports/progress/1/map' }] } }), /허용되지/);
  const failedMap = localReportSession({ descriptor: { ...descriptor, assets: [{ path: '/work/assets/0.jpg', map: spec }] },
    send: message => sent.push(message), fetchAsset: async () => ({ ok: false, status: 503 }) });
  await failedMap.receive({ channel, type: 'ready' });
  const failedJob = sent.at(-1).job;
  const failed = assert.rejects(failedMap.promise, /위치도 배경/);
  await failedMap.receive({ channel, job: failedJob, type: 'tile', index: 0, ...firstTile }); await failed;
  console.log('Local report protocol: binary transfer, URL isolation, job isolation, cancel, timeout and denied photos passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
