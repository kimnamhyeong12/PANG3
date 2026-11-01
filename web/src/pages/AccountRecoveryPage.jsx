import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import IdentityDialog from '../components/IdentityDialog.jsx';

export function EmailEnrollment({ compact = false, initialEmail = '', onVerified }) {
  const [email,setEmail]=useState(initialEmail),[code,setCode]=useState('');
  const [authenticating,setAuthenticating]=useState(false),[authError,setAuthError]=useState('');
  const [challengeId,setChallengeId]=useState(null),[verified,setVerified]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false),emailField=useRef(null);
  const requestAuthentication=()=>{
    if(lock.current||!emailField.current.reportValidity())return;
    setAuthError('');setAuthenticating(true);
  };
  const send=async auth=>{
    if(lock.current||!auth)return;
    lock.current=true;setBusy(true);setMessage('');
    try{const result=await api.post('/api/auth/email/code/request',{email,password:auth});setChallengeId(result.challengeId);setCode('');setVerified(false);setMessage(result.message);setAuthenticating(false);}
    catch(error){setAuthError(error.message);}
    finally{lock.current=false;setBusy(false);}
  };
  const verify=async event=>{
    event.preventDefault();if(!challengeId){requestAuthentication();return;}
    if(lock.current||!/^\d{6}$/.test(code))return;
    lock.current=true;setBusy(true);setMessage('');
    try{const result=await api.post('/api/auth/email/code/verify',{challengeId,code});setVerified(true);setMessage(result.message);onVerified?.(result.email);setCode('');}
    catch(error){setMessage(error.message);}
    finally{lock.current=false;setBusy(false);}
  };
  return <><section className={compact?'email-enrollment':'card email-enrollment'}>{!compact&&<h3>복구 이메일</h3>}<form className="email-enrollment-form" onSubmit={verify}>
    <label>이메일<div className="email-action-row"><input ref={emailField} className="input" type="email" aria-label="복구 이메일" value={email} onChange={e=>{setEmail(e.target.value);setChallengeId(null);setVerified(false);setCode('');setMessage('');}} required disabled={busy}/><button type="button" className="btn-primary btn-inline" disabled={busy||!email.trim()} onClick={requestAuthentication}>{busy&&!challengeId?'발송 중…':'인증 메일 받기'}</button></div></label>
    <label>인증코드<div className="email-action-row"><input className="input" aria-label="이메일 인증코드" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 인증코드" disabled={!challengeId||busy||verified}/><button type="submit" className="btn-secondary" disabled={!challengeId||busy||verified||code.length!==6}>{verified?'인증 완료':'인증 확인'}</button></div></label>
    <p className="field-hint">메일 발송 시 현재 비밀번호 또는 연결된 Google·카카오 계정으로 확인합니다. 받은 인증코드는 10분 동안 사용할 수 있습니다.</p>
    {message&&<p role="status" className={`email-notice${verified?' verified':''}`}>{message}</p>}
  </form></section>{authenticating&&<IdentityDialog title="인증 후 메일 발송" busy={busy} error={authError} autoConfirmSocial onClose={()=>setAuthenticating(false)} onConfirm={send}/>}</>;
}

export default function AccountRecoveryPage({ mode }) {
  const [token] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    return value;
  });
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  const [loginId, setLoginId] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const title = mode === 'verify' ? '이메일 인증' : mode === 'reset' ? '비밀번호 재설정' : '비밀번호 찾기';
  const submit = async (event) => {
    event.preventDefault(); if (busy) return;
    if (mode === 'reset' && password !== confirm) { setMessage('비밀번호가 서로 일치하지 않습니다.'); return; }
    setBusy(true); setMessage('');
    try {
      const path = mode === 'verify' ? 'email/verify' : mode === 'reset' ? 'password/reset' : 'password/forgot';
      const result = await api.post(`/api/auth/${path}`, { token, password, loginId, email });
      setMessage(result.message); setDone(true); setPassword(''); setConfirm('');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <div className="full-center"><form className="card login-card" onSubmit={submit}>
    <h1>{title}</h1>
    {mode === 'forgot' && <><label>아이디<input className="input" value={loginId} onChange={event => setLoginId(event.target.value)} required /></label>
      <label>인증한 이메일<input className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label></>}
    {mode === 'reset' && <><label>새 비밀번호<input className="input" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" /></label>
      <label>새 비밀번호 확인<input className="input" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} required autoComplete="new-password" /></label></>}
    {mode !== 'forgot' && !token && <p>메일의 링크를 다시 열어 주세요.</p>}
    <p aria-live="polite">{message}</p>
    <button className="btn-primary" disabled={busy || done || mode !== 'forgot' && !token}>{busy ? '처리 중…' : mode === 'verify' ? '이메일 인증하기' : mode === 'reset' ? '비밀번호 변경' : '재설정 메일 받기'}</button>
    <Link to="/login">로그인으로 돌아가기</Link>
  </form></div>;
}
