import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { errorMessage } from '../api/client.js';
import { fetchGroupMembers, inviteMember, updateGroupRegion } from '../api/groups.js';
import { SIDO_LIST, fetchSigunguList } from '../api/regions.js';
import { formatDate } from '../utils/format.js';
import Modal from '../components/Modal.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { SkeletonTable, Spinner } from '../components/Loading.jsx';
import { IconLogout, IconPlus } from '../components/Icons.jsx';

function InviteModal({ groupId, user, onClose, onInvited }) {
  const [loginId, setLoginId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    const target = loginId.trim();
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await inviteMember(groupId, user.userId, target);
      onInvited(result);
    } catch (err) {
      setError(
        errorMessage(
          err,
          '초대하지 못했습니다. 아이디가 맞는지, 이미 팀원이거나 초대 대기 중인 사용자가 아닌지 확인해주세요.'
        )
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="팀원 초대"
      onClose={() => !submitting && onClose()}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={onClose}>
            취소
          </button>
          <button
            type="submit"
            form="invite-form"
            className="btn-primary btn-inline"
            disabled={submitting || !loginId.trim()}
          >
            {submitting ? '초대 중…' : '초대 보내기'}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={onSubmit}>
        {error && <p className="form-error">{error}</p>}
        <div className="field">
          <label htmlFor="invitee">초대할 사용자 아이디</label>
          <input
            id="invitee"
            className="input"
            placeholder="로그인 아이디 입력"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoFocus
          />
          <span className="field-hint">초대받은 사용자가 앱에서 수락하면 팀원으로 추가됩니다.</span>
        </div>
      </form>
    </Modal>
  );
}

function MembersSection({ groupId, user }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGroupMembers(groupId, user.userId)
      .then((list) => !cancelled && setMembers(list ?? []))
      .catch((e) => {
        if (cancelled) return;
        setMembers([]);
        setError(errorMessage(e, '팀원 목록을 불러오지 못했습니다.'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId, user.userId]);

  useEffect(() => {
    setNotice(null);
    return load();
  }, [load]);

  let body;
  if (loading) body = <SkeletonTable rows={4} columns={4} />;
  else if (error) body = <ErrorBlock message={error} onRetry={load} />;
  else if (members.length === 0) body = <div className="table-empty">팀원이 없습니다.</div>;
  else
    body = (
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>아이디</th>
              <th>근무 지역</th>
              <th>가입일</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td className="cell-strong">
                  {m.name}
                  {m.userId === user.userId && <span className="badge badge-navy badge-inline">나</span>}
                </td>
                <td>{m.loginId}</td>
                <td>{[m.workSido, m.workSigungu].filter(Boolean).join(' ') || '-'}</td>
                <td className="cell-date">{formatDate(m.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          팀원 관리 {!loading && !error && <span className="panel-count">{members.length}명</span>}
        </h2>
        <button type="button" className="btn-primary btn-inline" onClick={() => setInviteOpen(true)}>
          <IconPlus size={16} />
          팀원 초대
        </button>
      </div>
      {notice && <p className="form-success panel-notice">{notice}</p>}
      {body}
      {inviteOpen && (
        <InviteModal
          groupId={groupId}
          user={user}
          onClose={() => setInviteOpen(false)}
          onInvited={(result) => {
            setInviteOpen(false);
            setNotice(`${result?.inviteeName ?? result?.inviteeLoginId ?? '사용자'}님에게 초대를 보냈습니다.`);
          }}
        />
      )}
    </section>
  );
}

function RegionSection({ groupId, group, user, onSaved }) {
  const initialSido = SIDO_LIST.find((s) => s.name === group?.regionSido) ?? SIDO_LIST[1];
  const [sidoCode, setSidoCode] = useState(initialSido.code);
  const [sigunguList, setSigunguList] = useState([]);
  const [sigunguCode, setSigunguCode] = useState(group?.regionAdmCode ?? '');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(null);

  // 그룹이 바뀌면 현재 값으로 초기화
  useEffect(() => {
    const sido = SIDO_LIST.find((s) => s.name === group?.regionSido) ?? SIDO_LIST[1];
    setSidoCode(sido.code);
    setSigunguCode(group?.regionAdmCode ?? '');
    setSaveError(null);
    setSaved(null);
  }, [groupId, group?.regionSido, group?.regionAdmCode]);

  const loadSigungu = useCallback(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    setSigunguList([]);
    fetchSigunguList(sidoCode)
      .then((list) => !cancelled && setSigunguList(list))
      .catch((e) => !cancelled && setListError(errorMessage(e, '시·군·구 목록을 불러오지 못했습니다.')))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sidoCode]);

  useEffect(() => loadSigungu(), [loadSigungu]);

  const sido = SIDO_LIST.find((s) => s.code === sidoCode);
  const sigungu = sigunguList.find((s) => s.code === sigunguCode);
  const unchanged = sido?.name === group?.regionSido && sigunguCode === group?.regionAdmCode;

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
      setSaveError(errorMessage(e, '활동 지역을 변경하지 못했습니다. 그룹 리더 권한이 있는지 확인해주세요.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
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
          활동 지역은 지도 조회의 행정동 경계와 공공데이터 &lsquo;우리 지역&rsquo; 범위에 사용됩니다. 그룹 리더만 변경할 수
          있습니다. (AED·버스정류장 데이터는 현재 부산광역시만 제공)
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
      <h1 className="page-title">설정</h1>
      <p className="page-desc">팀원과 그룹 활동 지역을 관리합니다.</p>

      <div className="settings-grid">
        <MembersSection groupId={groupId} user={user} />
        <div className="settings-side">
          <RegionSection groupId={groupId} group={currentGroup} user={user} onSaved={reload} />
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">계정</h2>
            </div>
            <div className="settings-body">
              <div className="settings-row">
                <span className="settings-label">로그인</span>
                <span className="settings-value">
                  {user.name} ({user.loginId})
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
