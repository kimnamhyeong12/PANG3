import { webSession } from './session.js';
export async function upload(path,body) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response=await webSession.fetch(new URL((import.meta.env.VITE_API_BASE_URL||'')+path,window.location.origin),{method:'POST',body,signal:controller.signal});
    const data=await response.json().catch(() => null);
    if(!response.ok){const error=new Error(data?.message || data?.detail || `업로드하지 못했습니다. (HTTP ${response.status})`);error.status=response.status;throw error;}
    if (data == null) throw new Error('서버의 저장 결과를 확인할 수 없습니다.');
    return data;
  } finally { clearTimeout(timer); }
}
