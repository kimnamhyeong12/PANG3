const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../node_modules/typescript');
let status, body;
const source = ts.transpileModule(fs.readFileSync(require.resolve('../utils/groupApi.js'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const result = { exports: {} };
new Function('require', 'module', 'exports', source)(name => {
  if (name === '../utils/auth') return { apiFetch: async () => ({ ok: status < 400, status, text: async () => body }) };
  if (name === './api') return { API_BASE_URL: 'https://api.test' };
  throw new Error(name);
}, result, result.exports);
const { groupApi } = result.exports;
(async () => {
  status = 413; body = '<html><head><title>413 Request Entity Too Large</title></head><body>nginx/1.24.0</body></html>';
  await assert.rejects(groupApi('/api/facility-applications'), error => error.status === 413 && error.message === '서버의 업로드 용량 제한으로 파일을 전송하지 못했습니다.');
  body = JSON.stringify({ message: '첨부파일 저장 한도를 초과했습니다.' });
  await assert.rejects(groupApi('/api/support/inquiries'), error => error.message === '첨부파일 저장 한도를 초과했습니다.');
  status = 502; body = '<!DOCTYPE html><html><body>Bad Gateway</body></html>';
  await assert.rejects(groupApi('/api/facility-applications'), error => error.message === '요청 실패 (502)');
  status = 400; body = '사진의 촬영 위치를 확인해 주세요.';
  await assert.rejects(groupApi('/api/facility-applications'), error => error.message === body);
  status = 200; body = JSON.stringify({ id: 3 });
  assert.deepEqual(await groupApi('/api/facility-applications'), { id: 3 });
  console.log('Group API checks passed: Nginx HTML hidden, 413 explained, application quota messages preserved.');
})().catch(error => { console.error(error); process.exitCode = 1; });
