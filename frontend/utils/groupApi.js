import { apiFetch as fetch, liveSync } from '../utils/auth';
import { API_BASE_URL } from './api';

export async function groupApi(path, options = {}) {
  const group = path.match(/^\/api\/(?:locations\/group\/(\d+)|groups\/(\d+)\/assignments\/mine)/);
  if (group && (!options.method || options.method === 'GET') && !options.syncBypass) {
    const owner = group[2] ? new URL(path, 'https://local').searchParams.get('userId') : null;
    return liveSync.tasks(Number(group[1] || group[2]), owner, () => groupApi(path, { ...options, syncBypass: true }));
  }
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL이 설정되어 있지 않습니다.');
  }

  const { syncBypass, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: {
      ...(typeof FormData !== 'undefined' && options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const fallback = response.status === 413
      ? '서버의 업로드 용량 제한으로 파일을 전송하지 못했습니다.'
      : `요청 실패 (${response.status})`;
    const plainMessage = typeof data === 'string' && !/<\s*(?:!doctype|html|head|body)\b/i.test(data)
      ? data.trim().slice(0, 300) : '';
    const message =
      (data && typeof data === 'object' && data.message) ||
      (response.status !== 413 && plainMessage) ||
      fallback;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}
