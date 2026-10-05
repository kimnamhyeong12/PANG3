import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  IconDashboard,
  IconDatabase,
  IconLogout,
  IconMap,
  IconReport,
  IconSettings,
  IconTransfer,
} from '../Icons.jsx';

const MAIN_MENU = [
  { to: '/dashboard', label: '대시보드', Icon: IconDashboard },
  { to: '/transfers', label: '업무 이관', Icon: IconTransfer },
  { to: '/map', label: '지도 조회', Icon: IconMap },
  { to: '/reports', label: '보고서 보관함', Icon: IconReport },
  { to: '/public-data', label: '공공데이터 관리', Icon: IconDatabase },
];

function MenuLink({ to, label, Icon }) {
  return (
    <NavLink to={to} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
      <Icon />
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {MAIN_MENU.map((item) => (
          <MenuLink key={item.to} {...item} />
        ))}
        <div className="sidebar-divider" />
        <MenuLink to="/settings" label="설정" Icon={IconSettings} />
        <button
          type="button"
          className="sidebar-item sidebar-logout"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <IconLogout />
          로그아웃
        </button>
      </nav>
    </aside>
  );
}
