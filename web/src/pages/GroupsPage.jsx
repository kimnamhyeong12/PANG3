import useLiveRevision from '../components/useLiveRevision.js';
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
  const liveRevision = useLiveRevision(['groups']);
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
  }, [user.userId, liveRevision]);
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
  useEffect(() => {
    if (!selected || !liveRevision) return;
    let active = true;
    api.get(`/api/groups/${selected.groupId}`, { userId: user.userId }).then(g => { if (active) setSelected(g); }).catch(e => { if (active) { setError(e.message); setSelected(null); } });
    return () => { active = false; };
  }, [liveRevision, selected?.groupId, user.userId]);
  const listHeading = <div className="panel-header groups-list-heading"><h2 className="panel-title">{tab === 'invitations' ? '초대 목록' : '그룹 목록'}</h2><div className="action-row"><button className="btn-primary btn-inline" onClick={() => setCreating(true)}>그룹 만들기</button><button className="btn-secondary" onClick={() => setTab(tab === 'invitations' ? 'groups' : 'invitations')}>{tab === 'invitations' ? '그룹 목록' : '초대 목록'}{invites.length > 0 && <span className="tab-badge">{invites.length}</span>}</button></div></div>;
  return <div className="groups-workspace">{error && <p role="alert" className="form-error">{error}</p>}{!selected && <>
    {notice && <p role="status" className="form-success">{notice}</p>}
    {tab === 'invitations' ? <section className="panel">{listHeading}<div className="groups-list-body">{!invites.length && <p className="table-empty">새 초대가 없습니다.</p>}{invites.map(i => <div className="group-row" key={i.invitationId}><div><strong>{i.groupName}</strong><p>{i.inviterName || i.inviterLoginId}님의 초대</p></div><div className="action-row">{['reject', 'accept'].map(action => <button key={action} disabled={busy} className={action === 'accept' ? 'btn-primary btn-inline' : 'btn-secondary'} onClick={() => run(async () => {
            await api.post(`/api/groups/invitations/${i.invitationId}/${action}`, {
              userId: user.userId
            });
            await Promise.all([reload(), loadInvites()]);
            setNotice(action === 'accept' ? '그룹에 참여했습니다.' : '초대를 거절했습니다.');
          })}>{action === 'accept' ? '수락' : '거절'}</button>)}</div></div>)}</div></section> : <section className="panel">{listHeading}<div className="groups-list-body">{groups.map(g => <div className="group-row" key={g.groupId}><div><strong>{groupDisplayName(g)}</strong><p className="text-soft">{personalGroup(g) ? '개인 업무공간' : `${g.memberCount || 1}명 · ${g.regionSigungu || '활동지역 미설정'}`}</p></div><div className="action-row">{g.groupId === groupId ? <span className="pill pill-navy">사용 중</span> : <button className="btn-secondary" onClick={() => setGroupId(g.groupId)}>선택</button>}<button className="btn-secondary" onClick={()=>{setGroupId(g.groupId);navigate('/groups/status');}}>업무현황</button>{!personalGroup(g) && <button className="btn-secondary" disabled={busy} onClick={() => open(g)}>그룹 관리</button>}</div></div>)}</div></section>}</>}
    {selected && <section className="group-management-workspace" aria-label="그룹 관리">
      <div className="panel group-management-heading"><h2 className="panel-title">{selected.groupName}</h2><button className="btn-secondary" onClick={() => { setSelected(null); setNotice(''); }}>닫기</button></div>
      <div className="group-management-grid"><MembersSection key={selected.groupId} groupId={selected.groupId} user={user} canManage={selected.role === 'LEADER'} onLeave={() => { setError(''); setLeaving(true); }} onChanged={async () => { await reload(); await open(selected); }} /><RegionSection groupId={selected.groupId} group={selected} user={user} onSaved={async () => { await reload(); await open(selected); }} /></div>
    </section>}
    {leaving && <IdentityDialog title="그룹 탈퇴" busy={busy} error={error} onClose={() => setLeaving(false)} onConfirm={password => run(async () => {
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
  </div>;
}
