import { liveSync } from '../lib/liveSync.js';
import { webSession } from './session.js';
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request(method, path, { params, body, signal, timeoutMs } = {}) {
  const url = new URL(BASE_URL + path, window.location.origin);
  if (params) Object.entries(params).forEach(([key,value]) => { if(value!==undefined&&value!==null)url.searchParams.set(key,value); });
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timer=timeoutMs?setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs):null;
  try {
    const res=await webSession.fetch(url,{method,signal:controller.signal,
      headers:body!==undefined?{'Content-Type':'application/json'}:undefined,
      body:body!==undefined?JSON.stringify(body):undefined});
    const text=await res.text();let data=null;
    if(text){try{data=JSON.parse(text);}catch{/* Gateways may return HTML. */}}
    if(!res.ok)throw toApiError(res.status,data,`요청 실패 (${res.status})`);
    if(['POST','PATCH','PUT','DELETE'].includes(method))liveSync.noteMutation(method,path,data);
    return data;
  } catch(error) {
    if(timedOut)throw new ApiError('서버 응답이 지연되고 있습니다. 다시 불러오기를 눌러 주세요.',0);
    // A failed resource read must not restart the healthy global event stream.
    throw error;
  } finally { clearTimeout(timer);signal?.removeEventListener('abort',cancel); }
}

export class ApiError extends Error {
  constructor(message, status, data, unreadable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 네트워크 오류면 undefined
    this.data = data;
    this.unreadable = unreadable; // 서버 메시지가 깨져 있어 대체 문구를 쓴 경우
  }
}

// 백엔드 GroupService/TaskService 일부 한글 메시지 리터럴이 소스에서 이미 깨져 있다
// (예: "그룹을 찾을 수 없습니다." → "洹몃９??李얠쓣 ???놁뒿?덈떎."). 한자나 '?'+한글 조합이 보이면 깨진 것으로 본다.
export function isGarbledMessage(text) {
  return /[\u4e00-\u9fff]|\?[\uac00-\ud7a3]|\?\?/.test(String(text ?? ''));
}

function toApiError(status, data, fallback) {
  const raw = data && (data.message || data.error);
  if (raw && isGarbledMessage(raw)) {
    console.warn('[api] 서버 오류 메시지를 읽을 수 없음', status, raw);
    return new ApiError(`요청을 처리하지 못했습니다. (오류 ${status})`, status, data, true);
  }
  return new ApiError(raw || fallback, status, data);
}

// 화면별 상황에 맞는 문구: 서버 메시지가 깨졌을 때만 fallback 사용
export function errorMessage(error, fallback) {
  return error instanceof ApiError && error.unreadable ? fallback : error?.message || fallback;
}

// 서버 자체 장애(게이트웨이 오류, 네트워크 끊김) 여부
export function isServerDown(error) {
  return !(error instanceof ApiError) || [502, 503, 504].includes(error.status);
}

// 파일 다운로드: Blob으로 받는다 (실패 시 ApiError)
async function download(path, { signal } = {}) {
  const res = await webSession.fetch(new URL(BASE_URL + path, window.location.origin), { cache: 'no-store', signal });
  if (!res.ok) {
    let data = null;
    try {
      data = JSON.parse(await res.text());
    } catch {
      data = null;
    }
    throw toApiError(
      res.status,
      data,
      res.status === 404 ? '보고서 파일을 찾을 수 없습니다.' : `다운로드 실패 (${res.status})`
    );
  }
  return res.blob();
}

export const api = {
  download,
  delete: (path, body) => request('DELETE', path, { body }),
  get: (path, params, options) => request('GET', path, { params, ...options }),
  post: (path, body, params) => request('POST', path, { body, params }),
  patch: (path, body, params) => request('PATCH', path, { body, params }),
  put: (path, body) => request('PUT', path, { body }),
};
