const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function load(file, dependencies = {}) {
  const result = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, result, result.exports);
  return result.exports;
}
const fixtures = new Map([
  ['file:///original.jpg', new Uint8Array([255, 216, 255, 225, 0, 9, 69, 120, 105, 102, 0, 255, 217])],
  ['file:///data.xlsx', new Uint8Array([80, 75, 3, 4, 0, 255, 12])],
  ['file:///data.csv', new TextEncoder().encode('이름,주소\r\n소화전,부산\r\n')],
]);
const { createUploadFile } = load('utils/uploadFile.js', { 'expo-file-system': { File: class {
  constructor(uri) { this.uri = uri; }
  get name() { return 'cache-file'; }
  get type() { return 'application/octet-stream'; }
  async bytes() { const bytes = fixtures.get(this.uri); if (!bytes) throw new Error('file missing'); return bytes; }
} } });
// Use the installed Expo FormData patch and encoder, which reject RN URI-only parts.
const { installFormDataPatch } = load('node_modules/expo/src/winter/FormData.ts');
class RNFormData { constructor() { this._parts = []; } }
const ExpoFormData = installFormDataPatch(RNFormData);
const { convertFormDataAsync } = load('node_modules/expo/src/winter/fetch/convertFormData.ts', {
  '../../utils/blobUtils': { blobToArrayBufferAsync: value => value.arrayBuffer() },
});
(async () => {
  const broken = new ExpoFormData(); broken.append('photo', { uri: 'file:///original.jpg', name: 'original.jpg', type: 'image/jpeg' });
  await assert.rejects(convertFormDataAsync(broken), /Unsupported FormDataPart implementation/);
  const form = new ExpoFormData();
  const application = JSON.stringify({ name: '시설물', kind: '소화전', requestKey: 'same-retry-key' });
  form.append('application', application);
  const photo = createUploadFile({ uri: 'file:///original.jpg', name: 'original.jpg', type: 'image/jpeg' });
  form.append('photo', photo);
  for (const [uri, name, type] of [
    ['file:///data.xlsx', '시설물.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['file:///data.csv', '시설물.csv', 'text/csv'],
  ]) form.append('files', createUploadFile({ uri, name, type }));
  const first = await convertFormDataAsync(form, 'test-boundary');
  const second = await convertFormDataAsync(form, 'test-boundary');
  assert.deepEqual(first.body, second.body, 'authenticated retries can read the same parts again');
  const body = Buffer.from(first.body), text = new TextDecoder().decode(first.body);
  assert.ok(text.includes(application), 'application JSON is preserved');
  assert.ok(text.includes('filename="original.jpg"'));
  assert.ok(text.includes('filename="' + encodeURIComponent('시설물.xlsx') + '"'));
  assert.ok(text.includes('content-type: text/csv'));
  assert.ok(text.includes('content-type: image/jpeg'));
  for (const bytes of fixtures.values()) assert.ok(body.includes(Buffer.from(bytes)), 'original file bytes are preserved');
  const missing = new ExpoFormData(); missing.append('photo', createUploadFile({ uri: 'file:///missing.jpg', name: 'missing.jpg' }));
  await assert.rejects(convertFormDataAsync(missing), /file missing/);
  console.log('Upload checks passed with installed Expo multipart encoder: original error reproduced, photo/XLSX/CSV bytes and filenames preserved, retries and missing files handled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
