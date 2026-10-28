import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { api, errorMessage } from '../api/client.js';
export default function GroupJoinPage(){
  const {token}=useParams(),{user}=useAuth(),{reload,setGroupId}=useGroup(),navigate=useNavigate();
  const [preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const valid=/^[A-Za-z0-9_-]{43}$/.test(token||'');
  useEffect(()=>{if(!user||!valid)return;let active=true;setPreview(null);setError('');api.get(`/api/group-invite-links/${token}`).then(data=>{if(active)setPreview(data);}).catch(failure=>{if(active)setError(errorMessage(failure,'초대를 확인하지 못했습니다.'));});return()=>{active=false;};},[token,user?.userId,valid]);
  const join=async()=>{if(busy||!preview)return;setBusy(true);setError('');try{const result=preview.alreadyMember?preview:await api.post(`/api/group-invite-links/${token}/join`);await reload();setGroupId(result.groupId);navigate('/dashboard',{replace:true});}catch(failure){setError(errorMessage(failure,'그룹 참여 실패'));}finally{setBusy(false);}};
  return <main className="full-center"><section className="card login-card" style={{gap:20}}><h1>핀워크 그룹 초대</h1>{!valid?<p>초대 링크를 확인해 주세요.</p>:<><a className="btn-primary" href={`pang3://join?token=${token}`}>핀워크 앱에서 열기</a>{!user?<><p>앱이 없다면 웹에서 로그인 후 그룹을 확인하고 참여할 수 있습니다.</p><Link className="btn-secondary" to="/login" state={{from:`/join/${token}`}}>로그인 후 초대 확인</Link></>:preview?<><h2>{preview.groupName}</h2><p>{preview.alreadyMember?'이미 참여 중인 그룹입니다.':'이 그룹에 참여하시겠어요?'}</p><button className="btn-primary" disabled={busy} onClick={join}>{busy?'참여 중…':preview.alreadyMember?'그룹으로 이동':'참여하기'}</button></>:!error&&<p>초대를 확인하는 중…</p>}{error&&<p role="alert" className="form-error">{error}</p>}</>}</section></main>;
}
