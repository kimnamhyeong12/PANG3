// Platform-neutral transport shared by the web iframe and native WebView.
import { validReportMap, planReportMap } from './reportMapPlan.js';
export const REPORT_CHANNEL = 'pang3-local-report-v1';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes) {
  const chunks = [];
  for (let start = 0; start < bytes.length; start += 12288) {
    let text = '';
    for (let i = start; i < Math.min(start + 12288, bytes.length); i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      text += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63]
        + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=')
        + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
    }
    chunks.push(text);
  }
  return chunks.join('');
}
export function base64ToBytes(text) {
  if (typeof text !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))
    throw new Error('보고서 파일 전송을 확인해 주세요.');
  const bytes = new Uint8Array(text.length / 4 * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n = (alphabet.indexOf(text[i]) << 18) | (alphabet.indexOf(text[i + 1]) << 12)
      | (Math.max(0, alphabet.indexOf(text[i + 2])) << 6) | Math.max(0, alphabet.indexOf(text[i + 3]));
    if (at < bytes.length) bytes[at++] = n >>> 16;
    if (at < bytes.length) bytes[at++] = n >>> 8 & 255;
    if (at < bytes.length) bytes[at++] = n & 255;
  }
  return bytes;
}

export function localReportSession({ descriptor, send, fetchAsset, onProgress = () => {}, timeoutMs = 300000 }) {
  if (descriptor?.schema !== 1 || !Array.isArray(descriptor.assets) || descriptor.assets.length > 202)
    throw new Error('보고서 입력 형식을 확인해 주세요.');
  const allowed = /^\/api\/files\/\d+\/[^/\\?#]+$/;
  if (descriptor.assets.some((asset, index) => asset.path !== `/work/assets/${index}.jpg`
      || (asset.map ? asset.url || !validReportMap(asset.map) : !allowed.test(asset.url))))
    throw new Error('허용되지 않은 보고서 사진 경로입니다.');
  const allowedTiles = new Set();
  for (const asset of descriptor.assets) if (asset.map)
    for (const tile of planReportMap(asset.map).tiles) allowedTiles.add(`${tile.z}/${tile.x}/${tile.y}`);
  const job = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let resolve, reject, finished = false, started = false, chunks = [], total = 0, nextAsset = 0;
  const isHtml = descriptor.format === 'html';
  let nextTile = 0, tileBytes = 0;
  const controller = new AbortController();
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const finish = (value, error) => {
    if (finished) return;
    finished = true; clearTimeout(timer); controller.abort(); chunks = [];
    if (error) reject(error); else resolve(value);
  };
  const timer = setTimeout(() => finish(null, new Error('보고서 생성 시간이 초과되었습니다. 앱을 열어 둔 상태에서 다시 시도해 주세요.')), timeoutMs);
  const reply = value => { if (!finished) send({ channel: REPORT_CHANNEL, job, ...value }); };
  const receive = async message => {
    if (finished || message?.channel !== REPORT_CHANNEL) return;
    if (message.type === 'ready' && !started) {
      started = true;
      reply({ type: 'start', descriptor });
      return;
    }
    if (message.job !== job || !started) return;
    try {
      if (message.type === 'progress') onProgress(message.message);
      if (message.type === 'asset') {
        if (message.index !== nextAsset || !descriptor.assets[nextAsset]) throw new Error('사진 요청 순서가 올바르지 않습니다.');
        const asset = descriptor.assets[nextAsset++];
        if (asset.map) return reply({ type: 'asset-result', index: message.index, renderMap: true, map: asset.map });
        const response = await fetchAsset(asset.url, { cache: 'no-store', signal: controller.signal });
        if (response.status === 204 && asset.optional) return reply({ type: 'asset-result', index: message.index, empty: true });
        if (!response.ok) throw new Error(response.status === 403 ? '사진을 열 권한이 없습니다.' : '사진을 불러오지 못했습니다. 다시 시도해 주세요.');
        if (Number(response.headers?.get('content-length') || 0) > 15 * 1024 * 1024) throw new Error('사진 용량이 너무 큽니다.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 15 * 1024 * 1024) throw new Error('사진 용량이 너무 큽니다.');
        reply({ type: 'asset-result', index: message.index, data: bytesToBase64(bytes) });
      }
      if (message.type === 'tile') {
        if (message.index !== nextTile++ || nextTile > 4096 || !allowedTiles.has(`${message.z}/${message.x}/${message.y}`))
          throw new Error('허용되지 않은 지도 배경 요청입니다.');
        const response = await fetchAsset(`/api/local-report-map/tiles/${message.z}/${message.x}/${message.y}`, { cache: 'default', signal: controller.signal });
        if (!response.ok || Number(response.headers?.get('content-length') || 0) > 1024 * 1024)
          throw new Error('위치도 배경을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        tileBytes += bytes.length;
        if (!bytes.length || bytes.length > 1024 * 1024 || tileBytes > 128 * 1024 * 1024)
          throw new Error('위치도 용량이 큽니다. 보고서를 나누어 만들어 주세요.');
        reply({ type: 'tile-result', index: message.index, data: bytesToBase64(bytes),
          attribution: String(response.headers?.get('x-map-attribution') || '').slice(0, 160) });
      }
      if (message.type === 'chunk') {
        if (isHtml) throw new Error('보고서 파일 형식이 올바르지 않습니다.');
        if (message.index !== chunks.length || message.count < 1 || message.count > 342 || message.data?.length > 262144)
          throw new Error('보고서 파일 전송에 실패했습니다.');
        const bytes = base64ToBytes(message.data);
        total += bytes.length;
        if (total > 64 * 1024 * 1024) throw new Error('보고서 파일이 너무 큽니다. 나누어 만들어 주세요.');
        chunks.push(bytes);
      }
      if (message.type === 'html-chunk') {
        if (!isHtml || message.index !== chunks.length || message.count < 1 || message.count > 1024
            || typeof message.data !== 'string' || message.data.length > 65536)
          throw new Error('HTML 보고서 전송에 실패했습니다.');
        total += message.data.length;
        if (total > 64 * 1024 * 1024) throw new Error('보고서 파일이 너무 큽니다.');
        chunks.push(message.data);
      }
      if (message.type === 'done') {
        if (!total || total !== message.size || nextAsset !== descriptor.assets.length) throw new Error('보고서 파일이 완성되지 않았습니다.');
        if (isHtml) {
          finish({ html: chunks.join(''), fileName: descriptor.fileName });
          return;
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        finish({ bytes, fileName: descriptor.fileName, revision: descriptor.revision });
      }
      if (message.type === 'error') throw new Error(message.message || '보고서를 만들지 못했습니다.');
    } catch (error) { finish(null, error); }
  };
  return { promise, receive, cancel: () => finish(null, new Error('보고서 생성을 취소했습니다.')) };
}
