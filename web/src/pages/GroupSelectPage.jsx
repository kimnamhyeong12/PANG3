import { Navigate, useNavigate } from 'react-router-dom';
import { useGroup } from '../context/GroupContext.jsx';
import NoTeamNotice from '../components/NoTeamNotice.jsx';
import GroupLoadError from '../components/GroupLoadError.jsx';
import { LoadingScreen } from '../components/Loading.jsx';
import { groupDisplayName, groupMetaText } from '../utils/groupDisplay.js';

export default function GroupSelectPage() {
  const { groups, groupId, setGroupId, loading, loaded, error } = useGroup();
  const navigate = useNavigate();

  if (error) return <GroupLoadError message={error} />;
  if (!loaded || loading) return <LoadingScreen label="그룹 정보를 불러오는 중…" />;
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
              className={`card group-card${g.personal ? ' group-card-personal' : ''}`}
              onClick={() => {
                setGroupId(g.groupId);
                navigate('/dashboard', { replace: true });
              }}
            >
              <div>
                <div className="group-card-name">
                  {groupDisplayName(g)}
                </div>
                <div className="group-card-meta">{groupMetaText(g)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}