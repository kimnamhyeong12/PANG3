import { File, Directory, Paths } from 'expo-file-system';
import { apiFetch } from './auth';
import { API_BASE_URL } from './api';

let host = null;
export function registerLocalReportHost(handler) {
  host = handler;
  return () => { if (host === handler) host = null; };
}

async function generate(kind, id, format, { signal } = {}) {
  if (!['progress', 'compiled'].includes(kind) || !/^\d+$/.test(String(id))) throw new Error('보고서 번호를 확인해 주세요.');
  if (!host) throw new Error('보고서 화면을 다시 열어 주세요.');
  if (signal?.aborted) throw new Error('보고서 생성을 취소했습니다.');
  const response = await apiFetch(`${API_BASE_URL}/api/local-reports/${kind}/${id}${format === 'html' ? '/html-data' : ''}`, { cache: 'no-store', signal });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || '보고서 자료를 불러오지 못했습니다.');
  }
  const descriptor = await response.json();
  if (signal?.aborted) throw new Error('보고서 생성을 취소했습니다.');
  if (!host) throw new Error('보고서 화면을 다시 열어 주세요.');
  return host(descriptor, { signal });
}

export async function generateLocalReportHtml(kind, id, options) {
  return (await generate(kind, id, 'html', options)).html;
}

export async function generateLocalReport(kind, id) {
  const result = await generate(kind, id, 'hwpx');
  // Only the completed HWPX is written to disk. Source photos never pass through FileSystem.
  const directory = new Directory(Paths.cache, 'local-reports');
  directory.create({ intermediates: true, idempotent: true });
  const fileName = String(result.fileName || '보고서.hwpx').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  const file = new File(directory, `${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`);
  try { file.write(result.bytes); }
  catch (error) { if (file.exists) file.delete(); throw error; }
  return { uri: file.uri, fileName, revision: result.revision };
}
