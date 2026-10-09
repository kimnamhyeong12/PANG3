import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// 개인 그룹만 있는 유저(팀 미소속)에게 보여주는 안내 화면
export default function NoTeamNotice() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="full-center">
      <div className="card login-card no-team">
        <p className="no-team-title">소속된 팀이 없습니다.</p>
        <p className="no-team-desc">팀에 초대받은 뒤 다시 로그인해주세요.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
