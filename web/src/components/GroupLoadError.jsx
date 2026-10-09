import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';

// 그룹 목록 최초 로드 실패 화면 (다시 시도 / 로그아웃)
export default function GroupLoadError({ message }) {
  const { reload } = useGroup();
  const { logout } = useAuth();
  return (
    <div className="full-center">
      <div className="card login-card no-team">
        <p className="no-team-title">그룹 정보를 불러오지 못했습니다.</p>
        <p className="no-team-desc">{message}</p>
        <div className="button-row">
          <button type="button" className="btn-secondary" onClick={logout}>
            로그아웃
          </button>
          <button type="button" className="btn-primary btn-inline" onClick={reload}>
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
