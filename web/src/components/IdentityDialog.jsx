import { useState } from 'react';
import Modal from './Modal.jsx';
import SocialAccounts from './SocialAccounts.jsx';
export default function IdentityDialog({
  title,
  onClose,
  onConfirm,
  busy = false,
  error = '',
  autoConfirmSocial = false
}) {
  const [credential, setCredential] = useState('');
  return <Modal title={title} onClose={() => !busy && onClose()}><form className="settings-form" onSubmit={e => {
      e.preventDefault();
      onConfirm(credential);
    }}>{error && <p role="alert" className="form-error">{error}</p>}<label>현재 비밀번호<input className="input" type="password" autoComplete="current-password" value={credential.startsWith('social:') ? '' : credential} onChange={e => setCredential(e.target.value)} disabled={busy}/></label><SocialAccounts mode="verify" onVerified={value => { setCredential(value); if (autoConfirmSocial) onConfirm(value); }} />{credential.startsWith('social:')&&<p role="status">연결된 계정으로 인증했습니다.</p>}<button className="btn-primary btn-inline" disabled={!credential || busy}>{busy ? '처리 중…' : title}</button></form></Modal>;
}
