// 백엔드는 토큰 인증이 없고 userId를 쿼리/바디로 직접 넘긴다 (AuthController /api/auth/login 응답의 userId 사용).
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request(method, path, { params, body } = {}) {
  const url = new URL(BASE_URL + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });
  }
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null; // 게이트웨이 HTML 에러 페이지 등 JSON이 아닌 응답
    }
  }
  if (!res.ok) {
    // ApiExceptionHandler 응답: { timestamp, status, error, message } — 권한 에러 등은 message를 그대로 노출
    const message = (data && (data.message || data.error)) || `요청 실패 (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 네트워크 오류면 undefined
    this.data = data;
  }
}

// 서버 자체 장애(게이트웨이 오류, 네트워크 끊김) 여부
export function isServerDown(error) {
  return !(error instanceof ApiError) || [502, 503, 504].includes(error.status);
}

// 파일 다운로드: Blob으로 받는다 (실패 시 ApiError)
async function download(path) {
  const res = await fetch(new URL(BASE_URL + path, window.location.origin));
  if (!res.ok) {
    let data = null;
    try {
      data = JSON.parse(await res.text());
    } catch {
      data = null;
    }
    const message =
      (data && (data.message || data.error)) ||
      (res.status === 404 ? '보고서 파일을 찾을 수 없습니다.' : `다운로드 실패 (${res.status})`);
    throw new ApiError(message, res.status, data);
  }
  return res.blob();
}

export const api = {
  download,
  get: (path, params) => request('GET', path, { params }),
  post: (path, body, params) => request('POST', path, { body, params }),
  patch: (path, body, params) => request('PATCH', path, { body, params }),
};
