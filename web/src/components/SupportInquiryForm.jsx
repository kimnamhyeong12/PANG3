import { useId, useRef, useState } from 'react';
import { upload } from '../api/uploads.js';
import AppIcon from './AppIcon.jsx';
import { INQUIRY_TYPES, EMAIL_DOMAINS, PRIVACY_NOTICE_VERSION } from '../../../frontend/constants/support.js';

export default function SupportInquiryForm({ user, onSubmitted, onBusyChange }) {
  const email=String(user.email||''),at=email.lastIndexOf('@'),domainId=useId();
  const [category,setCategory]=useState(INQUIRY_TYPES[0]),[emailName,setEmailName]=useState(at<0?email:email.slice(0,at)),[domain,setDomain]=useState(at<0?'':email.slice(at+1));
  const [subject,setSubject]=useState(''),[message,setMessage]=useState(''),[files,setFiles]=useState([]),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),request=useRef(null),fileInput=useRef(null);
  const bytes=files.reduce((n,file)=>n+file.size,0);
  const choose=event=>{
    const added=[...event.target.files];event.target.value='';setError('');
    const next=[...files];
    for(const file of added)if(!next.some(old=>old.name===file.name&&old.size===file.size&&old.lastModified===file.lastModified))next.push(file);
    if(next.length>5){setError('첨부파일은 최대 5개까지 등록할 수 있어요.');return;}
    if(next.some(file=>! /\.(jpe?g|png|pdf|xlsx|csv)$/i.test(file.name))){setError('JPG, PNG, PDF, XLSX, CSV 파일만 첨부할 수 있습니다.');return;}
    if(next.some(file=>file.size>15*1024*1024)||next.reduce((n,file)=>n+file.size,0)>30*1024*1024){setError('첨부파일은 파일당 15MB, 합계 30MB까지 등록할 수 있어요.');return;}
    setFiles(next);
  };
  const submit=async event=>{
    event.preventDefault();if(lock.current)return;
    const replyEmail=`${emailName.trim()}@${domain.trim()}`;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)||replyEmail.length>254){setError('답변 이메일 주소를 확인해 주세요.');return;}
    if(!subject.trim()||!message.trim()||!consent)return;
    lock.current=true;setBusy(true);onBusyChange?.(true);setError('');
    const fingerprint=JSON.stringify([replyEmail,category,subject.trim(),message.trim(),files.map(file=>[file.name,file.size,file.lastModified])]);
    if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,key:crypto.randomUUID()};
    try {
      const body=new FormData();body.append('inquiry',JSON.stringify({replyEmail,category,subject:subject.trim(),message:message.trim(),platform:'web',appVersion:'web',privacyConsent:true,privacyNoticeVersion:PRIVACY_NOTICE_VERSION,requestKey:request.current.key}));
      files.forEach(file=>body.append('files',file));await upload('/api/support/inquiries',body);
      setSubject('');setMessage('');setConsent(false);setFiles([]);request.current=null;onSubmitted?.();
    }catch(failure){setError(failure.message||'문의를 접수하지 못했습니다. 작성한 내용은 유지됩니다.');}
    finally{lock.current=false;setBusy(false);onBusyChange?.(false);}
  };
  return <form className="customer-inquiry-form" onSubmit={submit}>
    <label>문의 유형 <span className="required">*</span><select className="input" aria-label="문의 유형" value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}>{INQUIRY_TYPES.map(type=><option key={type}>{type}</option>)}</select></label>
    <fieldset className="inquiry-email"><legend>답변 이메일 <span className="required">*</span></legend><div className="inquiry-email-row"><input className="input" aria-label="이메일 아이디" autoComplete="off" value={emailName} onChange={e=>{const value=e.target.value;if(value.includes('@')){const index=value.lastIndexOf('@');setEmailName(value.slice(0,index));setDomain(value.slice(index+1));}else setEmailName(value);}} placeholder="이메일 아이디" maxLength={254} required disabled={busy}/><span>@</span><input className="input" aria-label="이메일 도메인 입력" value={domain} onChange={e=>setDomain(e.target.value)} list={domainId} placeholder="직접 입력" maxLength={253} required disabled={busy}/><datalist id={domainId}>{EMAIL_DOMAINS.map(value=><option key={value} value={value}/>)}</datalist></div></fieldset>
    <label>문의 제목 <span className="required">*</span><div className="inquiry-title-input"><input className="input" aria-label="문의 제목" value={subject} onChange={e=>setSubject(e.target.value)} maxLength={100} placeholder="제목을 입력해 주세요." required disabled={busy}/><span>{subject.length}/100</span></div></label>
    <label>문의 내용 <span className="required">*</span><textarea className="input" aria-label="문의 내용" value={message} onChange={e=>setMessage(e.target.value)} maxLength={4900} required disabled={busy} placeholder={'아래 내용을 알려주시면 확인에 도움이 됩니다.\n\n· 문제가 발생한 화면\n· 문제 발생 일시\n· 발생 상황과 문의 내용'}/><small className="inquiry-counter">{message.length}/4900</small></label>
    <section className="inquiry-attachments"><h3>파일 첨부</h3><input ref={fileInput} aria-label="문의 파일 첨부" type="file" hidden multiple accept=".jpg,.jpeg,.png,.pdf,.xlsx,.csv" onChange={choose}/><button type="button" className="btn-secondary inquiry-file-button" disabled={busy||files.length>=5} onClick={()=>fileInput.current.click()}><AppIcon name="add"/>파일 첨부<AppIcon name="attach"/></button>{files.map((file,index)=><div className="inquiry-file" key={`${file.name}-${index}`}><AppIcon name="document-text-outline"/><span><strong>{file.name}</strong><small>{(file.size/1024/1024).toFixed(1)}MB</small></span><button type="button" className="text-button" aria-label={`첨부파일 삭제 ${file.name}`} disabled={busy} onClick={()=>setFiles(old=>old.filter((_,i)=>i!==index))}><AppIcon name="close"/></button></div>)}<div className="inquiry-attachment-summary"><span>JPG·PNG·PDF·XLSX·CSV 최대 5개<br/>파일당 15MB, 합계 30MB</span><span>{(bytes/1024/1024).toFixed(1)}MB / 30MB</span></div></section>
    <section className="support-consent"><label className="check-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required disabled={busy}/>개인정보 수집·이용 동의 (필수)</label><details><summary>개인정보 수집·이용 안내</summary><div className="inquiry-privacy-table"><table><thead><tr><th>수집 항목</th><th>수집 목적</th><th>보유 기간</th></tr></thead><tbody><tr><td>답변 이메일, 계정 식별정보, 문의 유형·제목·내용, 앱 버전·운영체제, 첨부파일(선택)</td><td>문의 확인 및 처리, 답변 제공과 추가 연락</td><td>문의 처리 완료일부터 최대 1년 보관 후 파기</td></tr></tbody></table></div><p>보관 기간 전이라도 처리 목적을 달성하여 불필요해진 정보는 지체 없이 파기합니다. 다만 관계 법령에 따라 보존해야 하는 기록은 해당 법정 기간 동안 분리 보관합니다.</p><p>동의를 거부할 수 있으며, 거부하시면 이 문의 접수 기능을 이용할 수 없습니다. 문의 처리에 필요하지 않은 개인정보는 입력하지 마세요.</p></details></section>
    {error&&<p role="alert" className="form-error">{error}</p>}<button className="btn-primary" disabled={busy||!consent||!emailName.trim()||!domain.trim()||!subject.trim()||!message.trim()}>{busy?'접수 중…':'문의 접수'}</button>
  </form>;
}
