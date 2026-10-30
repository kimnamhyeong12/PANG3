import { useNavigate } from 'react-router-dom';
import IdentityDialog from '../components/IdentityDialog.jsx';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { api, errorMessage } from '../api/client.js';
import { groupDisplayName } from '../utils/groupDisplay.js';
import { MembersSection, RegionSection } from './SettingsPage.jsx';
import Modal from '../components/Modal.jsx';
import WorkRegionFields from '../components/WorkRegionFields.jsx';
import { serializeWorkRegion, isWorkRegionComplete } from '../lib/workRegion.js';
export const personalGroup = g => Boolean(g?.personal || g?.personalWorkspace || g?.workspaceType === 'PERSONAL');
export default function GroupsPage() {
  const navigate=useNavigate();
  const {
    user
  } = useAuth();
  const {
    groups,
    groupId,
    setGroupId,
    reload
  } = useGroup();
  const [tab, setTab] = useState('groups'),
    [invites, setInvites] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(''),
    [region, setRegion] = useState({
      sido: '',
      sigungu: '',
      gu: ''
    }),
    [selected, setSelected] = useState(null),
    [notice, setNotice] = useState('');
  const loadInvites = () => api.get('/api/groups/invitations', {
    userId: user.userId,
    status: 'PENDING'
  }).then(setInvites);
  useEffect(() => {
    let active = true;
    api.get('/api/groups/invitations', {
      userId: user.userId,
      status: 'PENDING'
    }).then(rows => {
      if (active) setInvites(rows);
    }).catch(e => {
      if (active) setError(errorMessage(e));
    });
    return () => {
      active = false;
    };
  }, [user.userId]);
  const run = async fn => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async group => run(async () => setSelected(await api.get(`/api/groups/${group.groupId}`, {
    userId: user.userId
  })));
  return <><div className="page-head"><h1 className="page-title">그룹</h1><div className="action-row"><button className="btn-primary btn-inline" onClick={() => setCreating(true)}>그룹 만들기</button><button className="btn-secondary" onClick={() => setTab(tab === 'invitations' ? 'groups' : 'invitations')}>초대 목록 {invites.length > 0 && <span className="tab-badge">{invites.length}</span>}</button></div></div>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="form-success">{notice}</p>}
    {tab === 'invitations' ? <section className="panel padded"><div className="page-head"><h2>초대 목록</h2><button className="btn-secondary" onClick={() => setTab('groups')}>그룹 목록</button></div>{!invites.length && <p className="table-empty">새 초대가 없습니다.</p>}{invites.map(i => <div className="group-row" key={i.invitationId}><div><strong>{i.groupName}</strong><p>{i.inviterName || i.inviterLoginId}님의 초대</p></div><div className="action-row">{['reject', 'accept'].map(action => <button key={action} disabled={busy} className={action === 'accept' ? 'btn-primary btn-inline' : 'btn-secondary'} onClick={() => run(async () => {
            await api.post(`/api/groups/invitations/${i.invitationId}/${action}`, {
              userId: user.userId
            });
            await Promise.all([reload(), loadInvites()]);
            setNotice(action === 'accept' ? '그룹에 참여했습니다.' : '초대를 거절했습니다.');
          })}>{action === 'accept' ? '수락' : '거절'}</button>)}</div></div>)}</section> : <section className="panel padded"><h2>그룹 목록</h2>{groups.map(g => <div className="group-row" key={g.groupId}><div><strong>{groupDisplayName(g)}</strong><p className="text-soft">{personalGroup(g) ? '개인 업무공간' : `${g.memberCount || 1}명 · ${g.regionSigungu || '활동지역 미설정'}`}</p></div><div className="action-row">{g.groupId === groupId ? <span className="pill pill-navy">사용 중</span> : <button className="btn-secondary" onClick={() => setGroupId(g.groupId)}>선택</button>}<button className="btn-secondary" onClick={()=>{setGroupId(g.groupId);navigate('/groups/status');}}>업무현황</button>{!personalGroup(g) && <button className="btn-secondary" disabled={busy} onClick={() => open(g)}>그룹 관리</button>}</div></div>)}</section>}
    {selected && <><div className="page-head section-gap"><h2>{selected.groupName}</h2><button className="btn-secondary" onClick={() => setSelected(null)}>닫기</button></div><MembersSection key={selected.groupId} groupId={selected.groupId} user={user} /><RegionSection groupId={selected.groupId} group={selected} user={user} onSaved={async () => {
        await reload();
        await open(selected);
      }} /><div className="action-row section-gap"><button className="btn-secondary" disabled={busy} onClick={() => run(async () => {
          const link = await api.post(`/api/groups/${selected.groupId}/invite-links`, {});
          const url = link.url || link.inviteUrl;
          if (url) {
            await navigator.clipboard.writeText(url);
            setNotice('초대 링크를 복사했습니다.');
          } else setNotice(`초대 링크: ${window.location.origin}/join/${link.token}`);
        })}>초대 링크 만들기</button><button className="btn-secondary" disabled={busy} onClick={() => setLeaving(true)}>그룹 탈퇴</button></div></>}
    {leaving && <IdentityDialog title="그룹 탈퇴" busy={busy} onClose={() => setLeaving(false)} onConfirm={password => run(async () => {
      await api.delete(`/api/groups/${selected.groupId}/members/me`, {
        userId: user.userId,
        password
      });
      setLeaving(false);
      setSelected(null);
      await reload();
    })} />}
    {creating && <Modal title="그룹 만들기" onClose={() => !busy && setCreating(false)}><form onSubmit={e => {
        e.preventDefault();
        run(async () => {
          const result = await api.post('/api/groups', {
            name,
            userId: user.userId,
            regionSido: region.sido,
            regionSigungu: serializeWorkRegion(region)
          });
          await reload();
          setGroupId(result.groupId);
          setCreating(false);
        });
      }}><label className="field">그룹명<input className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></label><WorkRegionFields label="활동 지역" value={region} onChange={setRegion} /><button className="btn-primary btn-inline section-gap" disabled={busy || !name.trim() || !isWorkRegionComplete(region)}>그룹 만들기</button></form></Modal>}
  </>;
}
