import IdentityDialog from '../components/IdentityDialog.jsx';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { upload } from '../api/uploads.js';
import WorkRegionFields from '../components/WorkRegionFields.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import { parseWorkRegion, serializeWorkRegion, isOptionalWorkRegionValid } from '../lib/workRegion.js';
import SocialAccounts from '../components/SocialAccounts.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';
import { EmailEnrollment } from './AccountRecoveryPage.jsx';
export function SupportPanel() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.has('inquiry') ? 'mine' : 'write'),
    [rows, setRows] = useState([]),
    [detail, setDetail] = useState(null),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (tab === 'mine') api.get('/api/support/inquiries', {
      page
    }).then(data => {
      if (active) {
        setRows(data.items);
        setMore(data.hasMore);
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [tab, page, version]);
  useEffect(() => {
    let active = true;
    const id = params.get('inquiry');
    setDetail(null);
    if (id) api.get(`/api/support/inquiries/${id}`).then(d => {
      if (active) {
        setTab('mine');
        setDetail(d);
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [params]);
  return <><div className="tabs"><button className={`tab${tab === 'write' ? ' active' : ''}`} onClick={() => setTab('write')}>문의 작성</button><button className={`tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>내 문의</button></div>{error && <p role="alert" className="form-error">{error}</p>}{tab === 'write' ? <form className="settings-form" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setError('');
      const form = new FormData(e.currentTarget),
        payload = {
          replyEmail: form.get('email'),
          subject: form.get('subject'),
          message: form.get('message'),
          platform: 'web',
          appVersion: 'web',
          category: 'OTHER',
          requestKey: crypto.randomUUID()
        };
      try {
        const body = new FormData();
        body.append('inquiry', JSON.stringify(payload));
        for (const file of form.getAll('files')) if (file.size) body.append('files', file);
        await upload('/api/support/inquiries', body);
        setTab('mine');
        setVersion(v => v + 1);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }}><label>회신 이메일<input className="input" type="email" name="email" required /></label><label>제목<input className="input" name="subject" required maxLength={200} /></label><label>내용<textarea className="input" name="message" required maxLength={5000} /></label><label>첨부파일<input className="input" type="file" name="files" multiple accept="image/*" /></label><button className="btn-primary btn-inline" disabled={busy}>문의 접수</button></form> : detail ? <><button className="btn-secondary" onClick={() => {
        setParams({
          tab: 'support'
        });
        setDetail(null);
      }}>문의 목록</button><h3>{detail.subject}</h3><p className="preserve-lines">{detail.message}</p>{detail.attachments?.map(file => <button key={file.id} className="btn-secondary" onClick={async () => {
        try {
          const blob = await api.download(`/api/support/inquiries/${detail.id}/attachments/${file.id}`);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
          setError(e.message);
        }
      }}>{file.name}</button>)}<hr /><h3>답변</h3><p className="preserve-lines">{detail.answer || '답변을 기다리고 있습니다.'}</p></> : <>{rows.map(r => <button className="place-result" key={r.id} onClick={() => setParams({
        tab: 'support',
        inquiry: r.id
      })}><strong>{r.subject}</strong><span>{r.status === 'ANSWERED' ? '답변 완료' : '답변 대기'} · {String(r.createdAt).slice(0, 10)}</span></button>)}{!rows.length && <p className="table-empty">작성한 문의가 없습니다.</p>}<div className="action-row"><button className="btn-secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button><span>{page + 1}</span><button className="btn-secondary" disabled={!more} onClick={() => setPage(p => p + 1)}>다음</button></div></>}</>;
}
export default function AccountSettingsPage() {
  const {
    user,
    updateUser,
    logout
  } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'account';
  const [name, setName] = useState(user.name || ''),
    [region, setRegion] = useState(() => parseWorkRegion(user.workSido, user.workSigungu)),
    [workplace, setWorkplace] = useState({
      workplaceAddress: user.workplaceAddress || '',
      workplaceLat: user.workplaceLat,
      workplaceLng: user.workplaceLng
    });
  const [deleting, setDeleting] = useState(false);
  const [credential, setCredential] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [picking, setPicking] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await api.patch(`/api/users/${user.userId}/account`, {
        currentPassword: credential,
        name,
        workSido: region.sido,
        workSigungu: serializeWorkRegion(region),
        ...workplace,
        newPassword: password
      });
      setCredential('');
      if (result.requiresLogin) logout();else {
        updateUser(result);
        setMessage('계정 정보를 저장했습니다.');
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <><h1 className="page-title">설정</h1><div className="settings-workspace"><nav className="settings-menu">{[['account', '내 계정'], ['notifications', '알림'], ['support', '고객센터'], ['info', '서비스 정보']].map(([key, label]) => <button key={key} className={`btn-secondary${tab === key ? ' selected' : ''}`} onClick={() => setParams({
          tab: key
        })}>{label}</button>)}</nav><section className="panel padded">{tab === 'account' ? <><h2>내 계정</h2><p>{user.loginId}</p><form className="settings-form" onSubmit={save}><label>이름<input className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={50} /></label><WorkRegionFields value={region} onChange={setRegion} /><label>근무지 주소<div className="action-row"><span>{workplace.workplaceAddress || '주소를 검색해 근무지를 등록하세요.'}</span><button type="button" className="btn-secondary" onClick={() => setPicking(true)}>주소 검색·변경</button></div><span className="field-hint">복귀 안내에 사용할 위치입니다.</span></label><label>새 비밀번호<input className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} /></label><label>새 비밀번호 확인<input className="input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label><label>현재 비밀번호<input className="input" type="password" autoComplete="current-password" value={credential} onChange={e => setCredential(e.target.value)} required={!credential.startsWith('social:')} /></label><SocialAccounts mode="verify" onVerified={setCredential} /><button className="btn-primary btn-inline" disabled={busy || password !== confirm || !isOptionalWorkRegionValid(region)}>변경사항 저장</button></form><h3 className="section-gap">간편 로그인 연결</h3><SocialAccounts /><EmailEnrollment /><button className="btn-secondary section-gap" disabled={busy} onClick={() => setDeleting(true)}>계정 탈퇴</button></> : tab === 'support' ? <SupportPanel /> : tab === 'notifications' ? <NotificationSettings /> : <><h2>핀워크</h2><p>앱과 웹에서 같은 계정의 방문지와 보고서를 관리합니다.</p><p>공지사항이 없습니다.</p></>}{message && <p role="status">{message}</p>}</section></div>{deleting && <IdentityDialog title="계정 탈퇴" onClose={() => setDeleting(false)} busy={busy} onConfirm={async password => {
      setBusy(true);
      try {
        await api.delete('/api/auth/account', {
          loginId: user.loginId,
          password
        });
        logout();
      } catch (e) {
        setMessage(e.message);
      } finally {
        setBusy(false);
      }
    }} />} {picking && <PlacePicker title="근무지 주소 검색" onClose={() => setPicking(false)} onPick={p => {
      setWorkplace({
        workplaceAddress: p.address || p.label,
        workplaceLat: p.lat,
        workplaceLng: p.lng
      });
      setPicking(false);
    }} />}</>;
}
