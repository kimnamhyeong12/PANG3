import { api } from './client.js';
import { webSession } from './session.js';
import { localReportSession } from '../../../frontend/utils/localReportProtocol.js';

let exporting = false;
export async function generateLocalReport(kind, id, onProgress) {
  return generate(kind, id, 'hwpx', onProgress);
}

export async function generateLocalReportHtml(kind, id, onProgress) {
  return (await generate(kind, id, 'html', onProgress)).html;
}

async function generate(kind, id, format, onProgress) {
  if (!['progress', 'compiled'].includes(kind) || !/^\d+$/.test(String(id))) throw new Error('보고서 번호를 확인해 주세요.');
  if (exporting) throw new Error('이미 보고서를 만들고 있습니다. 완료된 뒤 다시 시도해 주세요.');
  exporting = true;
  try { return await run(kind, id, format, onProgress); }
  finally { exporting = false; }
}

async function run(kind, id, format, onProgress) {
  const descriptor = await api.get(`/api/local-reports/${kind}/${id}${format === 'html' ? '/html-data' : ''}`);
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const source = new URL('/report-runtime/index.html', base);
  const frame = document.createElement('iframe');
  frame.title = '보고서 생성'; frame.hidden = true;
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.src = source.href;
  const job = localReportSession({ descriptor, onProgress,
    send: message => frame.contentWindow?.postMessage(message, source.origin),
    fetchAsset: (path, options) => webSession.fetch(new URL(path, base), options),
  });
  const receive = event => {
    if (event.source === frame.contentWindow && event.origin === source.origin) job.receive(event.data);
  };
  const cancel = () => job.cancel();
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', cancel);
  window.addEventListener('pang3:session-expired', cancel);
  document.body.appendChild(frame);
  try {
    const result = await job.promise;
    if (format === 'html') return result;
    return { blob: new Blob([result.bytes], { type: 'application/hwp+zip' }), fileName: result.fileName };
  } finally {
    frame.remove();
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', cancel);
    window.removeEventListener('pang3:session-expired', cancel);
  }
}
