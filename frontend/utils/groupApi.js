import { API_BASE_URL } from './api';

export async function groupApi(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL이 설정되어 있지 않습니다.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
    const message =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data) ||
      `요청 실패 (${response.status})`;
    throw new Error(message);
  }

  return data;
}
