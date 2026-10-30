import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export function EmailEnrollment({ compact = false, initialEmail = '' }) {
  const [email, setEmail] = useState(initialEmail); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await api.post('/api/auth/email/request', { email, password }); setMessage(result.message); setPassword(''); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <section className={compact ? "account-security-section" : "card"}><h3>복구 이메일</h3><form className="settings-form" onSubmit={submit}>
    <label>현재 비밀번호<input className="input" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /></label>
    <label>이메일<input className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    {message && <p aria-live="polite">{message}</p>}<button className="btn-primary btn-inline" disabled={busy}>{busy ? '메일 요청 중…' : '인증 메일 받기'}</button>
  </form></section>;
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
