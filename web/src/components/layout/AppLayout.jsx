import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ReportNavigation from '../ReportNavigation.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const mapPage = pathname === '/map';
  const dashboardPage = pathname === '/dashboard';
  const inboxPage = pathname === '/admin/support' || pathname === '/admin/facilities';
  const settingsPage = pathname === '/settings';
  const projectPage = pathname.startsWith('/projects');
  const fixedWorkspace = mapPage || dashboardPage || inboxPage || settingsPage || projectPage || pathname.startsWith('/groups');
  return (
    <div className={`app-shell${fixedWorkspace ? ' app-shell-map' : ''}${menuOpen ? ' mobile-nav-open' : ''}`}>
      <Header onToggleMenu={fixedWorkspace ? () => setMenuOpen(v => !v) : undefined} menuOpen={menuOpen} />
      <div className="app-body">
        {fixedWorkspace && menuOpen && <button className="app-mobile-nav-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}
        <Sidebar onNavigate={() => setMenuOpen(false)} />
        <main className={`app-main${pathname === '/map' || pathname === '/groups/status' ? ' app-main-map' : dashboardPage ? ' app-main-dashboard' : inboxPage ? ' app-main-inbox' : settingsPage ? ' app-main-settings' : projectPage ? ' app-main-projects' : ''}`}>
          {(pathname.startsWith('/reports') || pathname.startsWith('/projects')) && <ReportNavigation />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
