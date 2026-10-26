const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const root = path.join(__dirname, '..');
function loadExpo(relative, dependencies = {}) {
  const source = babel.transformSync(fs.readFileSync(path.join(root, 'node_modules/expo/src', relative), 'utf8'), {
    filename: relative, configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
(async () => {
  // Run the installed Expo serializer, including its rejection of legacy URI parts.
  const { installFormDataPatch } = loadExpo('winter/FormData.ts');
  const { convertFormDataAsync } = loadExpo('winter/fetch/convertFormData.ts', {
    '../../utils/blobUtils': { blobToArrayBufferAsync: blob => blob.arrayBuffer() },
  });
  class NativeForm { constructor() { this._parts = []; } }
  const Form = installFormDataPatch(NativeForm);
  const legacy = new Form();
  legacy.append('mapImage', { uri: 'file:///map.jpg', type: 'image/jpeg', name: 'map.jpg' });
  await assert.rejects(convertFormDataAsync(legacy), /Unsupported FormDataPart implementation/);

  const screen = fs.readFileSync(path.join(root, 'screens/FieldActionScreen.js'), 'utf8');
  const appendSource = screen.match(/const appendImage = async \(name, uri\) => \{([\s\S]*?)\n      \};/)[1];
  class DeviceFile {
    constructor(uri) { this.name = uri.split('/').pop(); this.type = 'image/jpeg'; }
    async bytes() { return new TextEncoder().encode(`image:${this.name}`); }
  }
  const form = new Form();
  form.append('taskId', '123'); form.append('fieldMemo', '현장 기록');
  const appendImage = new Function('form', 'File', 'ImageManipulator', `return async (name, uri) => {${appendSource}}`)(form, DeviceFile, { manipulateAsync: async uri => ({ uri }), SaveFormat: { JPEG: 'jpeg' } });
  for (const stage of ['before', 'during', 'after']) await appendImage('fieldPhotos', `file:///${stage}.jpg`);
  await appendImage('mapImage', 'file:///map.jpg');
  const { body } = await convertFormDataAsync(form, 'test-boundary');
  const multipart = new TextDecoder().decode(body);
  assert.equal((multipart.match(/name="fieldPhotos"/g) || []).length, 3);
  assert.ok(multipart.includes('name="mapImage"; filename="map.jpg"'));
  assert.ok(multipart.includes('현장 기록'));
  for (const filename of ['before.jpg', 'during.jpg', 'after.jpg', 'map.jpg']) assert.ok(multipart.includes(`image:${filename}`));
  assert.match(screen, /import \{ apiFetch as expoFetch \} from '\.\.\/utils\/auth'/);
  assert.match(screen, /await expoFetch\(\s*`\$\{API_BASE_URL\}\/api\/task-progress`/);
  console.log('Report upload checks passed: legacy error reproduced; text, three photos and map serialized by installed Expo');
})().catch(error => { console.error(error); process.exitCode = 1; });
