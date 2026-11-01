import AppIcon from '../components/AppIcon.jsx';
import CustomerSupport from '../components/CustomerSupport.jsx';
import '../styles/settings.css';
import IdentityDialog from '../components/IdentityDialog.jsx';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import WorkRegionFields from '../components/WorkRegionFields.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import { parseWorkRegion, serializeWorkRegion, isOptionalWorkRegionValid } from '../lib/workRegion.js';
import SocialAccounts from '../components/SocialAccounts.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';
import { EmailEnrollment } from './AccountRecoveryPage.jsx';
export function SupportPanel() {
  const {user}=useAuth();return <CustomerSupport user={user}/>;
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
  const profileBase=useRef(user);
  useEffect(()=>{
    const old=profileBase.current; profileBase.current=user;
    if(JSON.stringify(old)===JSON.stringify(user))return;
    if(name===(user.name||'')&&region.sido===parseWorkRegion(user.workSido,user.workSigungu).sido&&serializeWorkRegion(region)===serializeWorkRegion(parseWorkRegion(user.workSido,user.workSigungu))&&['workplaceAddress','workplaceLat','workplaceLng'].every(k=>(workplace[k]??'')===(user[k]??'')))return;
    const clean=name===(old.name||'')&&region.sido===parseWorkRegion(old.workSido,old.workSigungu).sido&&serializeWorkRegion(region)===serializeWorkRegion(parseWorkRegion(old.workSido,old.workSigungu))&&['workplaceAddress','workplaceLat','workplaceLng'].every(k=>(workplace[k]??'')===(old[k]??''))&&!password&&!confirm;
    if(clean){setName(user.name||'');setRegion(parseWorkRegion(user.workSido,user.workSigungu));setWorkplace({workplaceAddress:user.workplaceAddress||'',workplaceLat:user.workplaceLat,workplaceLng:user.workplaceLng});}
    else setMessage('다른 기기에서 계정 정보가 변경되었습니다. 작성 중인 내용은 유지됩니다.');
  },[user]);
  const save = async e => {
    e.preventDefault();
    if(password!==confirm){setMessage('새 비밀번호가 서로 일치하지 않습니다.');return;}
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
  return <><div className="settings-workspace">
    <nav className="settings-menu" aria-label="설정 메뉴">{[['account','내 계정','person-circle-outline'],['notifications','알림','notifications-outline'],['support','고객센터','chatbubbles-outline'],['info','공지사항','information-circle-outline']].map(([key,label,icon])=><button key={key} className={`btn-secondary${tab===key?' selected':''}`} aria-current={tab===key?'page':undefined} onClick={()=>setParams({tab:key})}><AppIcon name={icon}/>{label}<AppIcon name="chevron-forward"/></button>)}</nav>
    <section className={`settings-content${tab==='account'?' settings-account':''}`}>
      {tab==='account'?<>
        <header className="account-profile"><span className="account-avatar">{(user.name||user.loginId||'?').slice(0,1)}</span><div><h2>내 계정</h2><strong>{user.name}</strong><span>@{user.loginId}</span></div></header>
        <div className="account-grid">
          <form id="account-profile-form" className="account-form account-main-form" onSubmit={save}>
            <section className="account-card account-basic-card"><header><AppIcon name="person-outline"/><h3>기본 정보</h3></header><div className="account-fields"><label>이름<input className="input" value={name} onChange={e=>setName(e.target.value)} required maxLength={50}/></label><WorkRegionFields value={region} onChange={setRegion}/></div></section>
            <div className="account-workplace-stack">
              <section className="account-card account-workplace-card"><header><AppIcon name="business-outline"/><h3>근무지</h3></header><p className="field-label">근무지 주소</p><div className="account-workplace"><AppIcon name="location-outline"/><strong>{workplace.workplaceAddress||'등록된 근무지가 없습니다.'}</strong></div><p className="field-hint">복귀 안내에 사용할 위치입니다.</p><div className="account-workplace-actions"><button type="button" className="btn-secondary" onClick={()=>setPicking(true)}>주소 검색·변경</button>{workplace.workplaceLat!=null&&<button type="button" className="text-button" onClick={()=>setWorkplace({workplaceAddress:null,workplaceLat:null,workplaceLng:null})}>근무지 삭제</button>}</div></section>
              <section className="account-card account-social-card"><header><AppIcon name="link-outline"/><h3>간편 로그인</h3></header><SocialAccounts/></section>
            </div>
            <section className="account-card account-password-card"><header><AppIcon name="lock-closed-outline"/><h3>비밀번호 및 본인 확인</h3></header><div className="account-fields"><label>현재 비밀번호<input className="input" type="password" autoComplete="current-password" value={credential.startsWith('social:')?'':credential} onChange={e=>setCredential(e.target.value)} required={!credential.startsWith('social:')}/></label><label>새 비밀번호<input className="input" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8}/></label><label>새 비밀번호 확인<input className="input" type="password" autoComplete="new-password" placeholder="새 비밀번호 다시 입력" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><div className="account-verify"><h4>Google·카카오 본인 인증</h4><SocialAccounts mode="verify" showAll onVerified={setCredential}/>{credential.startsWith('social:')&&<p role="status" className="field-hint">본인 인증이 완료되었습니다.</p>}</div></div></section>
          </form>
          <section className="account-card account-email-card"><header><AppIcon name="mail-outline"/><h3>복구 이메일</h3></header><EmailEnrollment compact credential={credential} initialEmail={user.email||''} onVerified={email=>updateUser({email})}/></section>
        </div>
        {message&&<p role="status" className="settings-notice">{message}</p>}
        <div className="account-form-footer"><button type="submit" form="account-profile-form" className="btn-primary btn-inline" disabled={busy||password!==confirm||!isOptionalWorkRegionValid(region)}>변경사항 저장</button><button type="button" className="btn-secondary account-delete-button" disabled={busy} onClick={()=>setDeleting(true)}>계정 탈퇴</button></div>
      </>:tab==='support'?<SupportPanel/>:tab==='notifications'?<NotificationSettings/>:<><h2>공지사항</h2><p className="table-empty">등록된 공지사항이 없습니다.</p></>}
      {tab!=='account'&&message&&<p role="status" className="settings-notice">{message}</p>}
    </section>
  </div>{deleting && <IdentityDialog title="계정 탈퇴" onClose={() => setDeleting(false)} busy={busy} onConfirm={async password => {
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
