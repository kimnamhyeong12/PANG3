import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SUPPORT_FAQ } from '../../../frontend/constants/support.js';
import SupportInquiryForm from './SupportInquiryForm.jsx';
import useLiveRevision from './useLiveRevision.js';
import AppIcon from './AppIcon.jsx';
import { api, errorMessage } from '../api/client.js';

const date=value=>value?new Date(value).toLocaleString('ko-KR'):'';
export default function CustomerSupport({user}) {
  const [params,setParams]=useSearchParams(),selected=params.get('inquiry');
  const [mode,setMode]=useState(selected?'inquiry':'help'),[tab,setTab]=useState(selected?'mine':'write');
  const [query,setQuery]=useState(''),[expanded,setExpanded]=useState(null),[busy,setBusy]=useState(false);
  const [rows,setRows]=useState([]),[detail,setDetail]=useState(null),[page,setPage]=useState(0),[more,setMore]=useState(false),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const liveRevision=useLiveRevision(['support']);
  useEffect(()=>{if(selected){setMode('inquiry');setTab('mine');}},[selected]);
  useEffect(()=>{
    if(mode!=='inquiry'||tab!=='mine')return;let active=true;const controller=new AbortController();setLoading(true);setError('');
    const path=selected?`/api/support/inquiries/${selected}`:'/api/support/inquiries';
    api.get(path,selected?undefined:{page},{signal:controller.signal,timeoutMs:20000}).then(data=>{
      if(!active)return;if(selected)setDetail(data);else{setRows(data.items);setMore(data.hasMore);}
    }).catch(failure=>{if(active)setError(errorMessage(failure,'문의 내역을 불러오지 못했습니다.'));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[mode,tab,selected,page,revision,liveRevision]);
  const refresh=()=>setRevision(v=>v+1);
  const changeTab=next=>{if(busy)return;setTab(next);setError('');setDetail(null);setPage(0);if(selected)setParams({tab:'support'});};
  const results=SUPPORT_FAQ.filter(item=>`${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()));
  const download=async file=>{
    try{const blob=await api.download(`/api/support/inquiries/${detail.id}/attachments/${file.id}`),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(failure){setError(errorMessage(failure,'첨부파일을 받지 못했습니다.'));}
  };
  return <div className="customer-support">
    {mode==='help'?<div className="customer-help">
      <header><h2>무엇을 도와드릴까요?</h2></header>
      <div className="customer-help-search"><AppIcon name="search-outline"/><input className="input" aria-label="도움말 검색" placeholder="위치, 사진, 보고서 등을 검색하세요" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="text-button" aria-label="검색어 지우기" onClick={()=>setQuery('')}><AppIcon name="close-circle"/></button>}</div>
      <section className="customer-faq"><h3>자주 묻는 질문</h3>{results.map(item=><div className="customer-faq-item" key={item.id}><button aria-expanded={expanded===item.id} onClick={()=>setExpanded(old=>old===item.id?null:item.id)}><span>Q</span><strong>{item.question}</strong><AppIcon name={expanded===item.id?'chevron-up':'chevron-down'}/></button>{expanded===item.id&&<p>{item.answer}</p>}</div>)}{!results.length&&<p className="field-hint">검색 결과가 없어요. 다른 검색어를 입력하거나 아래 문의하기를 이용해 주세요.</p>}</section>
      <section className="customer-contact"><h3>도움말로 해결되지 않았나요?</h3><p>문의를 남기시면 문의 내역에서 답변을 확인할 수 있어요.</p><button className="btn-primary btn-inline" onClick={()=>setMode('inquiry')}><AppIcon name="create-outline"/>문의하기</button></section>
    </div>:<div className="customer-inquiry-heading"><button className="text-button" disabled={busy} onClick={()=>setMode('help')}>← 고객센터</button><h2>문의하기</h2><div className="tabs" role="tablist" aria-label="고객센터 문의">{[['write','문의하기'],['mine','문의 내역']].map(([value,label])=><button key={value} role="tab" aria-selected={tab===value} className={`tab${tab===value?' active':''}`} disabled={busy} onClick={()=>changeTab(value)}>{label}</button>)}</div></div>}
    <div hidden={mode!=='inquiry'||tab!=='write'}><SupportInquiryForm user={user} onBusyChange={setBusy} onSubmitted={()=>{setTab('mine');setPage(0);refresh();}}/></div>
    {mode==='inquiry'&&tab==='mine'&&<div className="customer-history">
      <div className="action-row">{selected&&<button className="btn-secondary" onClick={()=>{setParams({tab:'support'});setDetail(null);}}>목록으로</button>}<button className="btn-secondary" disabled={loading} onClick={refresh}>새로고침</button></div>
      {error&&<div className="form-error" role="alert">{error}<button className="text-button" onClick={refresh}>다시 불러오기</button></div>}
      {loading&&<p role="status">문의 내역을 불러오는 중…</p>}
      {selected?detail&&String(detail.id)===String(selected)&&<article className="customer-history-detail"><h3>{detail.subject}</h3><p className="field-hint">{detail.category} · {date(detail.createdAt)}</p><p className="field-hint">답변 이메일: {detail.replyEmail}</p><p className="preserve-lines">{detail.message}</p>{!!detail.attachments?.length&&<section><h3>첨부파일</h3>{detail.attachments.map(file=><button className="inquiry-file download-file" key={file.id} onClick={()=>download(file)}><AppIcon name="attach"/><span>{file.name}</span><small>{(file.size/1024/1024).toFixed(1)}MB</small></button>)}</section>}<section className="customer-answer"><h3>{detail.status==='ANSWERED'?'핀워크 고객센터 답변':'답변 대기'}</h3>{detail.status==='ANSWERED'?<><p className="field-hint">{date(detail.answeredAt)}</p><p className="preserve-lines">{detail.answer}</p></>:<p>문의가 접수되었습니다. 답변이 등록되면 이곳에서 확인할 수 있어요.</p>}</section></article>
        :<>{rows.map(row=><button className="place-result" key={row.id} onClick={()=>{setDetail(null);setParams({tab:'support',inquiry:row.id});}}><span className="customer-history-meta"><span>{row.category}</span><span className={`support-badge${row.status==='ANSWERED'?' answered':''}`}>{row.status==='ANSWERED'?'답변 완료':'답변 대기'}</span></span><strong>{row.subject}</strong><span>{date(row.createdAt)}</span></button>)}{!loading&&!error&&!rows.length&&<p className="table-empty">문의 내역이 없습니다.</p>}<div className="support-pagination"><button className="btn-secondary" disabled={!page||loading} onClick={()=>setPage(v=>v-1)}>이전</button><span>{page+1} 페이지</span><button className="btn-secondary" disabled={!more||loading} onClick={()=>setPage(v=>v+1)}>다음</button></div></>}
    </div>}
  </div>;
}
