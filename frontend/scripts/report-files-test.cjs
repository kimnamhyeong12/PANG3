const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../utils/reportFiles.js'), 'utf8');
  const names = fs.readFileSync(require('node:path').join(__dirname, '../utils/reportName.js'), 'utf8');
  const moduleSource = source.replace("'./reportName'", `'data:text/javascript;base64,${Buffer.from(names).toString('base64')}'`);
  const { prepareIndividualReport } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  const requests = [], downloads = [];
  const fetchReport = async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ detailAddress: '학교/현장' }) };
  };
  const generate = async (kind, id) => { downloads.push({ kind, id }); return { uri: `file:///cache/${id}.hwpx`, revision: `revision-${id}` }; };
  const files = [];
  for (const progressId of [11, 22]) files.push(await prepareIndividualReport({ progressId, userId: 1, baseUrl: 'https://test.local', fetchReport, generate }));
  assert.equal(requests.length, 2);
  assert.ok(requests[0].includes('/task-progress/11?'));
  assert.ok(requests[1].includes('/task-progress/22?'));
  assert.notEqual(files[0].uri, files[1].uri, 'each selected report gets its own HWPX');
  assert.deepEqual(files.map(item => item.filename), ['학교_현장_11.hwpx', '학교_현장_22.hwpx']);
  assert.deepEqual(downloads, [{ kind: 'progress', id: 11 }, { kind: 'progress', id: 22 }]);
  assert.ok(!requests.some(url => url.includes('/prepare')), 'downloads never start server-side Python');
  await assert.rejects(prepareIndividualReport({ progressId: 33, userId: 1, baseUrl: 'https://test.local', generate,
    fetchReport: async () => ({ ok: false, status: 403, json: async () => ({ message: '접근 권한이 없습니다.' }) }) }), /접근 권한/);
  assert.equal(files.length, 2, 'a later failure does not discard previous files');
  const renamed = await prepareIndividualReport({ progressId: 44, userId: 1, baseUrl: 'https://test.local', generate,
    fetchReport: async () => ({ ok: true, json: async () => ({ reportName: '수정한/보고서', detailAddress: '원래 방문지', reportDownloadUrl: '/report' }) }) });
  assert.equal(renamed.name, '수정한/보고서');
  assert.equal(renamed.filename, '수정한_보고서_44.hwpx');
  console.log('Individual report file checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
