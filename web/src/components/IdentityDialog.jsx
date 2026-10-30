import { useState } from 'react';
import Modal from './Modal.jsx';
import SocialAccounts from './SocialAccounts.jsx';
export default function IdentityDialog({
  title,
  onClose,
  onConfirm,
  busy = false
}) {
  const [credential, setCredential] = useState('');
  return <Modal title={title} onClose={() => !busy && onClose()}><form className="settings-form" onSubmit={e => {
      e.preventDefault();
      onConfirm(credential);
    }}><label>현재 비밀번호<input className="input" type="password" autoComplete="current-password" value={credential} onChange={e => setCredential(e.target.value)} /></label><SocialAccounts mode="verify" onVerified={setCredential} /><button className="btn-primary btn-inline" disabled={!credential || busy}>{busy ? '처리 중…' : title}</button></form></Modal>;
}
