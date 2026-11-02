import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import IdentityDialog from './IdentityDialog.jsx';
import { needsLoginSetup } from '../../../frontend/utils/accountIdentity.js';
import AppIcon from './AppIcon.jsx';
import Modal from './Modal.jsx';
import SocialAccounts from './SocialAccounts.jsx';
import { api } from '../api/client.js';

export default function LoginCredentialsSetup({ user, onCompleted }) {
  const setup = needsLoginSetup(user);
  const [loginId, setLoginId] = useState(setup ? '' : user.loginId), [checkedId, setCheckedId] = useState('');
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [checking, setChecking] = useState(false), [busy, setBusy] = useState(false), [authenticating, setAuthenticating] = useState(false);
  const [idMessage, setIdMessage] = useState(''), [error, setError] = useState('');
  const currentId = useRef(setup ? '' : user.loginId), lock = useRef(false);
  const valid = checkedId && checkedId === loginId.trim() && checkedId !== user.loginId && (!setup || password.length >= 8 && password === confirm);
  const check = async () => {
    const value = loginId.trim();
    if (checking || !value) return;
    setChecking(true); setCheckedId(''); setIdMessage('');
    try {
      const result = await api.get('/api/auth/login-id/availability', { loginId: value });
      if (currentId.current.trim() !== value) return;
      setCheckedId(result.available ? value : ''); setIdMessage(result.available ? '사용할 수 있는 아이디입니다.' : '이미 사용 중인 아이디입니다.');
    } catch (failure) { if (currentId.current.trim() === value) setIdMessage(failure.message); }
    finally { setChecking(false); }
  };
  const save = async credential => {
    if (lock.current || !valid) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await api.post(`/api/users/${user.userId}/login-credentials`, { loginId: checkedId, password: setup ? password : undefined, credential });
      setPassword(''); setConfirm(''); setAuthenticating(false); onCompleted();
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    <section className={setup ? "account-card account-password-card" : "account-login-id"}>{setup&&<header><AppIcon name="lock-closed-outline"/><h3>아이디·비밀번호 설정</h3></header>}
      {setup&&<p className="field-hint">아이디·비밀번호 로그인을 추가합니다. 기존 Google·카카오 로그인도 계속 사용할 수 있습니다.</p>}
      <div className="account-fields">
        <label>아이디<div className={`email-action-row${setup ? '' : ' login-id-action-row'}`}><input className="input" aria-label={setup ? "설정할 아이디" : "변경할 아이디"} autoComplete="username" maxLength={50} value={loginId} disabled={busy || authenticating} onChange={e => { currentId.current = e.target.value; setLoginId(e.target.value); setCheckedId(''); setIdMessage(''); }}/><button type="button" className="btn-secondary" disabled={checking || busy || authenticating || !loginId.trim()} onClick={check}>{checking ? '확인 중…' : '중복 확인'}</button>{!setup&&<button type="button" className="btn-primary btn-inline" disabled={!valid || checking || busy || authenticating} onClick={() => { setError(''); setAuthenticating(true); }}>{setup ? '아이디·비밀번호 설정' : '아이디 변경'}</button>}</div></label>
        <p className="field-hint" role="status">{idMessage || '영문·숫자 또는 _, ., -를 사용해 3~50자로 입력해 주세요.'}</p>
        {setup&&<><label>비밀번호<input className="input" type="password" autoComplete="new-password" aria-label="설정할 비밀번호" value={password} disabled={busy || authenticating} onChange={e => setPassword(e.target.value)}/></label>
        <label>비밀번호 확인<input className="input" type="password" autoComplete="new-password" aria-label="설정할 비밀번호 확인" value={confirm} disabled={busy || authenticating} onChange={e => setConfirm(e.target.value)}/></label>
        {confirm && password !== confirm && <p className="form-error">비밀번호가 서로 일치하지 않습니다.</p>}</>}
        {setup&&<button type="button" className="btn-primary btn-inline" disabled={!valid || checking || busy || authenticating} onClick={() => { setError(''); setAuthenticating(true); }}>{setup ? '아이디·비밀번호 설정' : '아이디 변경'}</button>}
      </div>
    </section>
    {authenticating && createPortal(setup ? <Modal title="연결된 계정으로 인증" onClose={() => !busy && setAuthenticating(false)}>
      <p>가입하거나 연결한 Google·카카오 계정으로 인증하면 아이디·비밀번호가 저장됩니다.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      {busy ? <p role="status">저장 중…</p> : <SocialAccounts mode="verify" onVerified={save}/>}
    </Modal> : <IdentityDialog title="인증 후 아이디 변경" busy={busy} error={error} autoConfirmSocial onClose={()=>setAuthenticating(false)} onConfirm={save}/>, document.body)}
  </>;
}
