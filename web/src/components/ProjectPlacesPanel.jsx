import { useEffect, useState, useRef } from 'react';
import { fetchProjectPlaces, registerProjectPlaces } from '../api/projects.js';
import { errorMessage } from '../api/client.js';
export default function ProjectPlacesPanel({projectId,userId,onChanged}) {
 const [places,setPlaces]=useState([]),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false);
 useEffect(()=>{let active=true;setSelected([]);setError('');fetchProjectPlaces(projectId).then(rows=>{if(active)setPlaces(rows);}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};},[projectId]);
 const register=async ids=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await registerProjectPlaces(projectId,userId,ids);setMessage(`${result.created.length}건 등록 · 진행 중인 ${result.skipped.length}곳 제외`);setSelected([]);setPlaces(await fetchProjectPlaces(projectId));onChanged?.();}catch(e){setError(errorMessage(e));}finally{lock.current=false;setBusy(false);}};
 return <section className="panel pj-section"><div className="panel-header"><h2 className="panel-title">저장된 방문지</h2><span>{places.length}곳</span></div>
 <p>장소를 선택해 새 업무로 등록합니다. 완료한 업무의 사진·메모는 복사하지 않습니다.</p>
 {error&&<p className="form-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {places.map(p=><label key={p.placeId} style={{display:'flex',gap:12,padding:'12px 0',alignItems:'center'}}><input type="checkbox" disabled={busy||p.activeTaskCount>0} checked={selected.includes(p.placeId)} onChange={()=>setSelected(old=>old.includes(p.placeId)?old.filter(id=>id!==p.placeId):[...old,p.placeId])}/><span>{p.name} · {p.roadAddress}{p.activeTaskCount>0?' · 진행 중인 업무 있음':''}</span></label>)}
 {!places.length&&<p className="table-empty">앱 지도에서 방문지를 등록할 때 이 프로젝트를 선택하면 장소가 저장됩니다.</p>}
 <div style={{display:'flex',gap:8}}><button className="btn-primary" disabled={busy||!selected.length} onClick={()=>register(selected)}>선택 등록 ({selected.length})</button><button className="btn-secondary" disabled={busy||!places.some(p=>!p.activeTaskCount)} onClick={()=>register(places.filter(p=>!p.activeTaskCount).map(p=>p.placeId))}>전체 등록</button></div></section>;
}
