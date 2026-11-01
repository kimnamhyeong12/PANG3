import useLiveRevision from '../components/useLiveRevision.js';
import SelectionEmpty from '../components/SelectionEmpty.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, errorMessage } from '../api/client.js';
import '../styles/support.css';
const STATUS={PENDING:'접수',REVIEWING:'검토 중',NEEDS_INFO:'보완 요청',APPROVED:'승인',REJECTED:'반려'};
const coordinates=value=>Number.isFinite(Number(value))?Number(value).toFixed(6):'-';
const reviewForm=data=>({status:'REVIEWING',note:'',name:data.name,categoryName:data.kind,address:data.address||'',lat:String(data.photoLat),lng:String(data.photoLng),sido:'',sigungu:'',adminDong:''});
function Evidence({id,kind,title}) {
  const [url,setUrl]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true,created;const controller=new AbortController();setUrl(null);setError('');
    api.download(`/api/admin/facility-applications/${id}/evidence/${kind}`,{signal:controller.signal}).then(blob=>{
      if(active){created=URL.createObjectURL(blob);setUrl(created);}
    }).catch(()=>{if(active)setError('사진을 불러오지 못했습니다.');});
    return()=>{active=false;controller.abort();if(created)URL.revokeObjectURL(created);};
  },[id,kind,retry]);
  return <figure className="facility-review-evidence"><figcaption>{title}</figcaption>{url
    ?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt={title}/></a>
    :<div className="facility-evidence-placeholder">{error||'사진을 불러오는 중…'}{error&&<button className="text-button" onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button>}</div>}</figure>;
}
export default function FacilityReviewPage() {
  const liveRevision=useLiveRevision(['applications']);
  const [params]=useSearchParams(),{user,logout}=useAuth();
  const allowed=['ADMIN','FACILITY_REVIEWER'].includes(user?.role);
  const [items,setItems]=useState([]),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[form,setForm]=useState({});
  const [page,setPage]=useState(0),[more,setMore]=useState(false),[revision,setRevision]=useState(0),[detailRetry,setDetailRetry]=useState(0);
  const [listError,setListError]=useState(''),[detailError,setDetailError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[dirty,setDirty]=useState(false);
  const lock=useRef(false);
  const detailLiveRevision=useLiveRevision(['applications'],{scope:selected,dirty:dirty||busy,onConflict:()=>setNotice('신청 정보가 변경되었습니다. 작성 중인 검토 내용은 유지됩니다.')});
  useEffect(()=>{setDirty(false);setSelected(params.get('application')||null);},[params]);
  useEffect(()=>{
    if(!allowed)return;let active=true;const controller=new AbortController();setLoading(true);setListError('');
    api.get('/api/admin/facility-applications',{page},{signal:controller.signal,timeoutMs:20000}).then(data=>{
      if(active){setItems(data.items);setMore(data.hasMore);}
    }).catch(failure=>{if(active)setListError(errorMessage(failure,'신청 목록을 불러오지 못했습니다.'));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[allowed,page,revision,user?.userId,liveRevision]);
  useEffect(()=>{
    if(!allowed||!selected){setDetail(null);setDetailLoading(false);return;}
    let active=true;const controller=new AbortController();
    setDetail(old=>String(old?.id)===String(selected)?old:null);setDetailLoading(true);setDetailError('');
    api.get(`/api/admin/facility-applications/${selected}`,undefined,{signal:controller.signal,timeoutMs:20000}).then(data=>{
      if(active){setDetail(data);setForm(reviewForm(data));}
    }).catch(failure=>{if(active)setDetailError(errorMessage(failure,'신청 내용을 불러오지 못했습니다.'));}).finally(()=>{if(active)setDetailLoading(false);});
    return()=>{active=false;controller.abort();};
  },[allowed,selected,revision,user?.userId,detailLiveRevision,detailRetry]);
  const change=(key,value)=>{setDirty(true);setForm(current=>({...current,[key]:value}));};
  const save=async event=>{
    event.preventDefault();if(lock.current||!detail)return;lock.current=true;setBusy(true);setDetailError('');setNotice('');
    try {
      const saved=await api.post(`/api/admin/facility-applications/${detail.id}/review`,{...form,lat:form.lat.trim()?Number(form.lat):null,lng:form.lng.trim()?Number(form.lng):null,version:detail.version});
      setDetail(saved);setDirty(false);setRevision(v=>v+1);setNotice('검토 결과를 저장했습니다.');
    } catch(failure){setDetailError(errorMessage(failure,'검토 결과를 저장하지 못했습니다. 작성 내용은 유지됩니다.'));}
    finally{lock.current=false;setBusy(false);}
  };
  if(!allowed)return <main className="support-denied"><h1>공공시설물 검토 권한이 필요합니다.</h1><Link to="/dashboard">서비스로 돌아가기</Link></main>;
  return <div className="support-admin">
    <header className="support-header"><div><span className="support-brand">핀워크</span><span>공공시설물 등록 검토</span></div><div><Link to="/dashboard">서비스로 이동</Link><button className="btn-secondary" onClick={logout}>로그아웃</button></div></header>
    <main className="support-main"><div className="support-workspace">
      <section className="support-list" aria-label="시설물 신청 목록">
        <div className="support-list-toolbar"><h2>시설물 등록 신청함</h2><button className="btn-secondary" disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}>새로고침</button></div>
        <div className="support-list-scroll">
          {listError&&<div role="alert" className="support-error">{listError}<button onClick={()=>setRevision(v=>v+1)}>다시 불러오기</button></div>}
          {loading&&<p role="status" className="support-loading">신청 목록을 불러오는 중…</p>}
          {items.map(item=><button key={item.id} disabled={busy} aria-pressed={String(selected)===String(item.id)} className={`support-list-item${String(selected)===String(item.id)?' selected':''}`} onClick={()=>{setDirty(false);setNotice('');setSelected(item.id);}}>
            <span className="support-item-meta"><span>신청 #{item.id}</span><span className={`support-badge facility-status-${item.status.toLowerCase()}`}>{STATUS[item.status]}</span></span><strong>{item.name}</strong><span className="support-muted">{item.kind}</span>
          </button>)}
          {!loading&&!listError&&!items.length&&<p className="support-list-empty">신청 내역이 없습니다.</p>}
        </div>
        <div className="support-pagination"><button disabled={!page||busy||loading} onClick={()=>setPage(v=>v-1)}>이전</button><span>{page+1} 페이지</span><button disabled={!more||busy||loading} onClick={()=>setPage(v=>v+1)}>다음</button></div>
      </section>
      <section className="support-detail facility-detail" aria-label="시설물 신청 상세와 검토" aria-busy={detailLoading||busy}>
        <div className="support-detail-scroll">
          {detailError&&<div role="alert" className="support-error">{detailError}{!detail&&selected&&<button onClick={()=>setDetailRetry(v=>v+1)}>다시 불러오기</button>}</div>}
          {notice&&<p role="status" className="support-success">{notice}</p>}
          {detailLoading&&<p role="status" className="support-loading">신청 내용을 불러오는 중…</p>}
          {!selected&&!detail&&<SelectionEmpty icon="business-outline">신청을 선택해 주세요</SelectionEmpty>}
          {detail&&<>
            <div className="facility-detail-heading"><span className="support-muted">시설물 등록 신청 #{detail.id}</span><div><h2>{detail.name}</h2><span className={`support-badge facility-status-${detail.status.toLowerCase()}`}>{STATUS[detail.status]}</span></div></div>
            <dl className="support-metadata facility-metadata"><div><dt>시설 종류</dt><dd>{detail.kind}</dd></div><div><dt>확인 날짜</dt><dd>{detail.confirmedDate}</dd></div><div><dt>주소</dt><dd>{detail.address||'주소 정보가 없습니다.'}{detail.detailLocation&&<span className="facility-location-detail">{detail.detailLocation}</span>}</dd></div><div><dt>촬영 위치</dt><dd><span>{coordinates(detail.photoLat)}, {coordinates(detail.photoLng)}</span><a className="facility-map-link" href={`https://map.kakao.com/link/map/${encodeURIComponent(detail.name)},${detail.photoLat},${detail.photoLng}`} target="_blank" rel="noreferrer">지도 확인 ↗</a></dd></div></dl>
            <div className="facility-evidence-grid"><Evidence key={`${detail.id}-photo`} id={detail.id} kind="photo" title="시설물 사진"/>{detail.hasScreenshot&&<Evidence key={`${detail.id}-screenshot`} id={detail.id} kind="screenshot" title="기존 지도 스크린샷"/>}</div>
            {detail.description&&<section className="facility-description"><h3>신청 내용</h3><p className="support-message">{detail.description}</p></section>}
            {['APPROVED','REJECTED'].includes(detail.status)?<section className="support-saved-answer"><h3>처리 완료</h3><p className="support-message">{detail.reviewNote}</p></section>
              :<form className="support-answer-form facility-review-form" onSubmit={save}>
                <h3>신청 검토</h3><label htmlFor="facility-status">처리 상태</label><select id="facility-status" className="input" value={form.status||'REVIEWING'} disabled={busy||detailLoading} onChange={e=>change('status',e.target.value)}>{[['REVIEWING','검토 중'],['NEEDS_INFO','보완 요청'],['REJECTED','반려'],['APPROVED','승인 및 공공데이터 등록']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
                {form.status==='APPROVED'&&<div className="facility-approval-fields">{[['name','등록 시설물 이름'],['categoryName','등록 카테고리 (새 이름 입력 시 생성)'],['address','최종 주소'],['lat','최종 위도'],['lng','최종 경도'],['sido','시·도 (예: 부산광역시)'],['sigungu','시·군·구 (예: 사하구)'],['adminDong','행정동 (예: 하단1동)']].map(([key,label])=><label key={key}>{label}<input required className="input" value={form[key]||''} disabled={busy||detailLoading} maxLength={key==='name'?100:key==='address'?300:80} onChange={e=>change(key,e.target.value)}/></label>)}</div>}
                <label htmlFor="facility-note">검토 내용 / 보완·반려 사유</label><textarea id="facility-note" required maxLength={2000} value={form.note||''} disabled={busy||detailLoading} onChange={e=>change('note',e.target.value)} placeholder="신청자에게 전달할 검토 내용을 입력해 주세요."/>
                <div className="support-answer-footer"><span>{(form.note||'').length}/2000</span><button className="btn-primary btn-inline" disabled={busy||detailLoading}>{busy?'저장 중…':'검토 결과 등록'}</button></div>
              </form>}
          </>}
        </div>
      </section>
    </div></main>
  </div>;
}
