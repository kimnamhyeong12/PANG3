/* One disposable worker per export. The virtual filesystem stays in memory (no IDBFS). */
let pyodide;
const waiting = new Map();
let descriptor;
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;
const MAX_RESULT = 64 * 1024 * 1024;
const send = message => self.postMessage(message);
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
function encode(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 16384) result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
async function build(input) {
  descriptor = input;
  if (input.schema !== 1 || !['individual', 'compiled'].includes(input.kind) || !Array.isArray(input.assets) || input.assets.length > 202)
    throw new Error('보고서 입력 형식을 확인해 주세요.');
  send({ type: 'progress', message: '보고서 생성 환경을 준비하고 있어요.' });
  importScripts('vendor/pyodide.js');
  pyodide = await loadPyodide({ indexURL: new URL('vendor/', self.location.href).href, stdout: () => {}, stderr: () => {} });
  await pyodide.loadPackage(['pillow', 'lxml']);
  const source = await fetch('python.zip');
  if (!source.ok) throw new Error('보고서 생성 환경이 준비되지 않았습니다. 관리자에게 문의해 주세요.');
  pyodide.unpackArchive(await source.arrayBuffer(), 'zip', { extractDir: '/runtime' });
  await pyodide.runPythonAsync(`
import sys, os, warnings
sys.path[:0] = ['/runtime', '/runtime/engine']
os.environ['FIELDWORK_CLIENT_RUNTIME'] = '1'
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
import app, compiled_report
app.ENABLE_AI_ANALYSIS = False
Path('/work/assets').mkdir(parents=True, exist_ok=True)
`);
  let total = 0;
  for (let index = 0; index < input.assets.length; index++) {
    const asset = input.assets[index];
    if (asset.path !== `/work/assets/${index}.jpg`) throw new Error('사진 경로를 확인해 주세요.');
    send({ type: 'progress', message: `사진·위치도를 불러오고 있어요. (${index + 1}/${input.assets.length})` });
    const response = await new Promise(resolve => { waiting.set(index, resolve); send({ type: 'asset', index }); });
    if (response.error) throw new Error(response.error);
    if (response.empty && asset.optional) continue;
    const bytes = decode(response.data || '');
    total += bytes.length;
    if (!bytes.length || bytes.length > MAX_IMAGE || total > MAX_TOTAL) throw new Error('사진 용량이 큽니다. 보고서를 나누어 만들어 주세요.');
    pyodide.FS.writeFile('/work/input', bytes);
    pyodide.globals.set('asset_path', asset.path);
    // Decode one image at a time; only reduced JPEGs remain in the virtual filesystem.
    await pyodide.runPythonAsync(`
from PIL import ImageOps
with Image.open('/work/input') as original:
    image = ImageOps.exif_transpose(original)
    image.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
    image.convert('RGB').save(asset_path, 'JPEG', quality=85)
os.unlink('/work/input')
`);
  }
  send({ type: 'progress', message: '이 기기에서 HWPX 파일을 만들고 있어요.' });
  pyodide.globals.set('payload_json', JSON.stringify(input.payload));
  pyodide.globals.set('report_kind', input.kind);
  const path = await pyodide.runPythonAsync(`
import json
payload = json.loads(payload_json)
if report_kind == 'compiled':
    result_path = compiled_report.build(payload)
else:
    result_path = app.run_pipeline(payload)['report_file']
result_path
`);
  const bytes = pyodide.FS.readFile(path);
  if (bytes.length > MAX_RESULT) throw new Error('보고서 파일이 큽니다. 나누어 만들어 주세요.');
  const count = Math.ceil(bytes.length / 196608);
  for (let index = 0; index < count; index++)
    send({ type: 'chunk', index, count, data: encode(bytes.subarray(index * 196608, (index + 1) * 196608)) });
  send({ type: 'done', size: bytes.length, fileName: input.fileName, revision: input.revision });
}
self.onmessage = event => {
  const message = event.data;
  if (message?.type === 'asset-result') {
    const resolve = waiting.get(message.index);
    waiting.delete(message.index);
    resolve?.(message);
  } else if (message?.type === 'start' && !descriptor) {
    build(message.descriptor).catch(error => send({ type: 'error', message:
      error instanceof Error && /[가-힣]/.test(error.message) ? error.message : '이 기기에서 보고서를 만들지 못했습니다. 사진 용량과 기기 메모리를 확인해 주세요.' }));
  }
};
