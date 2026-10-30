import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  { to: '/map', label: '지도', Icon: IconMap },
  { to: '/reports', label: '보고서', Icon: IconReport },
  { to: '/groups', label: '그룹', Icon: IconDatabase },
  { to: '/transfers', label: '업무 이관', Icon: IconTransfer },
];

function MenuLink({ to, label, Icon }) {
  const { pathname } = useLocation();
  return (
    <NavLink to={to} className={({ isActive }) => `sidebar-item${isActive || (to === '/reports' && pathname.startsWith('/projects')) ? ' active' : ''}`}>
      <Icon />
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {MAIN_MENU.map((item) => (
          <MenuLink key={item.to} {...item} />
        ))}
        <div className="sidebar-divider" />
        {['ADMIN', 'SUPPORT_AGENT'].includes(user?.role) && <MenuLink to="/admin/support" label="고객센터 문의함" Icon={IconReport} />}
        {['ADMIN', 'FACILITY_REVIEWER'].includes(user?.role) && <MenuLink to="/admin/facilities" label="시설물 등록 신청함" Icon={IconReport} />}
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
