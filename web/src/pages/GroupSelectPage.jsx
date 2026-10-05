import { Navigate, useNavigate } from 'react-router-dom';
import { useGroup } from '../context/GroupContext.jsx';
import NoTeamNotice from '../components/NoTeamNotice.jsx';

export default function GroupSelectPage() {
  const { groups, groupId, setGroupId, loading, loaded, error } = useGroup();
  const navigate = useNavigate();

  if (error) return <div className="full-center">{error}</div>;
  if (!loaded || loading) return <div className="full-center">그룹 정보를 불러오는 중…</div>;
  if (groups.length === 0) return <NoTeamNotice />;
  // 그룹이 1개면 GroupContext가 자동 선택하므로 바로 진입
  if (groups.length === 1 && groupId != null) return <Navigate to="/dashboard" replace />;

  return (
    <div className="full-center">
      <div className="group-select">
        <h1 className="group-select-title">그룹 선택</h1>
        <p className="group-select-desc">작업할 그룹을 선택하세요.</p>
        <div className="group-card-list">
          {groups.map((g) => (
            <button
              key={g.groupId}
              type="button"
              className="card group-card"
              onClick={() => {
                setGroupId(g.groupId);
                navigate('/dashboard', { replace: true });
              }}
            >
              <div>
                <div className="group-card-name">
                  {g.groupName}
                </div>
                <div className="group-card-meta">
                  {[g.regionSido, g.regionSigungu].filter(Boolean).join(' ') || '지역 미설정'} · 멤버{' '}
                  {g.memberCount}명
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
