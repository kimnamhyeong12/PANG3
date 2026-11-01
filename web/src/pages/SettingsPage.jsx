import { visibleLoginId } from '../../../frontend/utils/accountIdentity.js';
import useLiveRevision from '../components/useLiveRevision.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { api, errorMessage } from '../api/client.js';
import { fetchGroupMembers, updateGroupRegion } from '../api/groups.js';
import { SIDO_LIST, fetchSigunguList } from '../api/regions.js';
import Modal from '../components/Modal.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { LoadingBlock, Spinner } from '../components/Loading.jsx';
import { IconLogout } from '../components/Icons.jsx';
import { EmailEnrollment } from './AccountRecoveryPage.jsx';

function InviteLinkModal({ groupId, onClose }) {
  const [link, setLink] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retry, setRetry] = useState(0);
  const creation = useRef(null);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const key = `${groupId}:${retry}`;
    if (creation.current?.key !== key) creation.current = { key, promise: api.post(`/api/groups/${groupId}/invite-links`, {}) };
    creation.current.promise.then(result => {
      if (!active) return;
      if (!result?.url) throw Error('초대 링크를 만들지 못했습니다.');
      setLink(result.url);
    }).catch(e => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, retry]);
  return <Modal title="팀원 초대" onClose={onClose}>
    {loading ? <LoadingBlock label="초대 링크를 만드는 중…" /> : error ? <ErrorBlock message={error} onRetry={() => setRetry(v => v + 1)} /> : <>
      <p>아래 링크를 공유하면 팀원을 초대할 수 있습니다.</p>
      <label className="field">초대 링크<input className="input" readOnly value={link} onFocus={e => e.target.select()} /></label>
      <button className="btn-primary btn-inline" onClick={async () => { try { await navigator.clipboard.writeText(link); setNotice('초대 링크를 복사했습니다.'); } catch { setNotice('초대 링크를 선택해 복사해 주세요.'); } }}>링크 복사</button>
      {notice && <p role="status" className="field-hint">{notice}</p>}
    </>}
  </Modal>;
}

export function MembersSection({ groupId, user, canManage = false, onLeave, onChanged }) {
  const liveRevision = useLiveRevision(['groups']);
  const [members, setMembers] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false), [removing, setRemoving] = useState(null), [busy, setBusy] = useState(false), [removeError, setRemoveError] = useState(''), [notice, setNotice] = useState('');
  const removeLock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    fetchGroupMembers(groupId, user.userId).then(rows => { if (active) setMembers(rows || []); }).catch(e => { if (active) setError(errorMessage(e, '팀원 목록을 불러오지 못했습니다.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, user.userId, revision, liveRevision]);
  async function removeMember() {
    if (removeLock.current || !removing) return;
    removeLock.current = true; setBusy(true); setRemoveError('');
    try {
      await api.delete(`/api/groups/${groupId}/members/${removing.userId}`, { userId: user.userId });
      setMembers(rows => rows.filter(m => m.userId !== removing.userId)); setNotice(`${removing.name}님을 그룹에서 제외했습니다.`); setRemoving(null);
      await onChanged?.();
    } catch (e) { setRemoveError(errorMessage(e)); }
    finally { removeLock.current = false; setBusy(false); }
  }
  return <section className="panel group-members-panel" aria-label="팀원 관리">
    <div className="panel-header"><h2 className="panel-title">팀원 관리 {!loading && !error && <span className="panel-count">{members.length}명</span>}</h2><div className="group-members-actions"><button className="btn-primary btn-inline" disabled={busy} onClick={() => setInviteOpen(true)}>팀원 초대</button>{onLeave && <button className="btn-secondary" disabled={busy} onClick={onLeave}>그룹 탈퇴</button>}</div></div>
    <div className="group-members-scroll" tabIndex={0} aria-label="팀원 목록">
      {notice && <p role="status" className="form-success panel-notice">{notice}</p>}
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={() => setRevision(v => v + 1)} /> : !members.length ? <p className="table-empty">팀원이 없습니다.</p> : <ul className="group-member-list">{members.map(m => <li key={m.userId}><span><strong>{m.name}</strong>{Number(m.userId) === Number(user.userId) && <span className="badge badge-navy badge-inline">나</span>}</span>{canManage && Number(m.userId) !== Number(user.userId) && m.role !== 'LEADER' && <button className="btn-secondary" disabled={busy} aria-label={`${m.name} 팀원 제외`} onClick={() => { setRemoveError(''); setRemoving(m); }}>팀원 제외</button>}</li>)}</ul>}
    </div>

    {inviteOpen && <InviteLinkModal groupId={groupId} onClose={() => setInviteOpen(false)} />}
    {removing && <Modal title="팀원 제외" onClose={() => !busy && setRemoving(null)}><p>{removing.name}님을 그룹에서 제외하시겠습니까?</p>{removeError && <p role="alert" className="form-error">{removeError}</p>}<div className="action-row"><button className="btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>취소</button><button className="btn-primary btn-inline" disabled={busy} onClick={removeMember}>{busy ? '처리 중…' : '팀원 제외'}</button></div></Modal>}
  </section>;
}

export function RegionSection({ groupId, group, user, onSaved }) {
  const initialSido = SIDO_LIST.find((s) => s.name === group?.regionSido);
  const [sidoCode, setSidoCode] = useState(initialSido?.code || '');
  const [sigunguList, setSigunguList] = useState([]);
  const [sigunguCode, setSigunguCode] = useState(group?.regionAdmCode ?? '');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(null);

  const regionBase=useRef({groupId,sido:initialSido?.code||'',sigungu:group?.regionAdmCode??''});
  // 다른 기기에서 설정이 바뀌어도 편집 중인 선택은 유지한다.
  useEffect(() => {
    const old=regionBase.current;
    const sido = SIDO_LIST.find((s) => s.name === group?.regionSido);
    regionBase.current={groupId,sido:sido?.code||'',sigungu:group?.regionAdmCode??''};
    if(old.groupId===groupId&&(sidoCode!==old.sido||sigunguCode!==old.sigungu)){setSaveError('다른 기기에서 활동 지역이 변경되었습니다. 현재 선택은 유지됩니다.');return;}
    setSidoCode(sido?.code || '');
    setSigunguCode(group?.regionAdmCode ?? '');
    setSaveError(null);
    setSaved(null);
  }, [groupId, group?.regionSido, group?.regionAdmCode]);

  const loadSigungu = useCallback(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    setSigunguList([]);
    if (!sidoCode) { setListLoading(false); return () => {}; }
    fetchSigunguList(sidoCode)
      .then((list) => {
        if (cancelled) return;
        setSigunguList(list);
        if (SIDO_LIST.find(s => s.code === sidoCode)?.name === group?.regionSido) {
          const match = list.find(s => s.name.replace(/\s+/g, '') === String(group?.regionSigungu || '').replace(/\s+/g, ''));
          if (match) setSigunguCode(current => current || match.code);
        }
      })
      .catch((e) => !cancelled && setListError(errorMessage(e, '시·군·구 목록을 불러오지 못했습니다.')))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sidoCode, group?.regionSido, group?.regionSigungu]);

  useEffect(() => loadSigungu(), [loadSigungu]);

  const sido = SIDO_LIST.find((s) => s.code === sidoCode);
  const sigungu = sigunguList.find((s) => s.code === sigunguCode);
  const unchanged = sido?.name === group?.regionSido && sigungu?.name?.replace(/\s+/g, '') === String(group?.regionSigungu || '').replace(/\s+/g, '');

  const onSave = async () => {
    if (!sido || !sigungu) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      await updateGroupRegion(groupId, {
        leaderUserId: user.userId,
        regionSido: sido.name,
        regionSigungu: sigungu.name,
        regionAdmCode: sigungu.code,
      });
      setSaved(`${sido.name} ${sigungu.name}(으)로 변경했습니다.`);
      onSaved();
    } catch (e) {
      // 권한 에러 등 백엔드 메시지를 그대로 노출 (깨진 메시지일 때만 대체 문구)
      setSaveError(errorMessage(e, '활동 지역을 변경하지 못했습니다. 다시 시도해 주세요.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel group-region-panel" aria-label="그룹 설정">
      <div className="panel-header">
        <h2 className="panel-title">그룹 설정</h2>
      </div>
      <div className="settings-body">
        <div className="settings-row">
          <span className="settings-label">그룹 이름</span>
          <span className="settings-value">{group?.groupName}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">현재 활동 지역</span>
          <span className="settings-value">
            {[group?.regionSido, group?.regionSigungu].filter(Boolean).join(' ') || '미설정'}
          </span>
        </div>

        {saveError && <p className="form-error">{saveError}</p>}
        {saved && <p className="form-success">{saved}</p>}

        <div className="region-form">
          <div className="field">
            <label htmlFor="region-sido">시/도</label>
            <select
              id="region-sido"
              className="input"
              value={sidoCode}
              onChange={(e) => {
                setSidoCode(e.target.value);
                setSigunguCode('');
              }}
            >
              <option value="">시·도를 선택하세요</option>
              {SIDO_LIST.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="region-sigungu">시/군/구</label>
            <select
              id="region-sigungu"
              className="input"
              value={sigunguCode}
              disabled={listLoading || !!listError}
              onChange={(e) => setSigunguCode(e.target.value)}
            >
              <option value="">{listLoading ? '불러오는 중…' : '시/군/구 선택'}</option>
              {sigunguList.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary btn-inline region-save"
            disabled={saving || !sigungu || unchanged}
            onClick={onSave}
          >
            {saving ? (
              <>
                <Spinner size={14} /> 저장 중…
              </>
            ) : (
              '지역 변경'
            )}
          </button>
        </div>
        {listError && <ErrorBlock message={listError} onRetry={loadSigungu} />}
        <p className="field-hint">
          활동 지역을 정하면 지도에서 해당 지역의 행정동 경계를 확인하고, 공공시설물을 지역별로 볼 수 있습니다.
        </p>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { groupId, currentGroup, reload } = useGroup();
  const navigate = useNavigate();

  return (
    <>

      <div className="settings-grid">
        <MembersSection groupId={groupId} user={user} />
        <div className="settings-side">
          <EmailEnrollment />
          <RegionSection groupId={groupId} group={currentGroup} user={user} onSaved={reload} />
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">계정</h2>
            </div>
            <div className="settings-body">
              <div className="settings-row">
                <span className="settings-label">로그인</span>
                <span className="settings-value">
                  {user.name}{visibleLoginId(user.loginId)&&` (${visibleLoginId(user.loginId)})`}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary btn-logout"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                <IconLogout size={16} />
                로그아웃
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
