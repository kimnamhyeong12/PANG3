const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../utils/reportFiles.js'), 'utf8');
  const { prepareIndividualReport } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const requests = [], downloads = [];
  const fetchReport = async url => {
    requests.push(url);
    const id = url.match(/task-progress\/(\d+)/)[1];
    return { ok: true, json: async () => ({ detailAddress: '학교/현장', reportDownloadUrl: `/api/task-progress/${id}/report/download` }) };
  };
  const download = async (url, name) => { downloads.push({ url, name }); return `file:///cache/${name}`; };
  const files = [];
  for (const progressId of [11, 22]) files.push(await prepareIndividualReport({ progressId, userId: 1, baseUrl: 'https://test.local', fetchReport, download }));
  assert.equal(requests.length, 2);
  assert.ok(requests[0].includes('/11/report/prepare'));
  assert.ok(requests[1].includes('/22/report/prepare'));
  assert.notEqual(files[0].uri, files[1].uri, 'each selected report gets its own HWPX');
  assert.deepEqual(downloads.map(item => item.name), ['학교_현장_11.hwpx', '학교_현장_22.hwpx']);
  assert.ok(!requests.some(url => url.includes('/reports/prepare')), 'multiple selection no longer merges into one report');
  await assert.rejects(prepareIndividualReport({ progressId: 33, userId: 1, baseUrl: 'https://test.local', download,
    fetchReport: async () => ({ ok: false, status: 403, json: async () => ({ message: '접근 권한이 없습니다.' }) }) }), /접근 권한/);
  assert.equal(files.length, 2, 'a later failure does not discard previous files');
  console.log('Individual report file checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
