import { webSession } from './session.js';
export async function upload(path,body) {
  const response=await webSession.fetch(new URL((import.meta.env.VITE_API_BASE_URL||'')+path,window.location.origin),{method:'POST',body});
  const data=await response.json();if(!response.ok)throw new Error(data.message||'업로드하지 못했습니다.');return data;
}
