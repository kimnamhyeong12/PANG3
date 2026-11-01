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
  return (
    <div className={`app-shell${mapPage ? ' app-shell-map' : ''}${menuOpen ? ' mobile-nav-open' : ''}`}>
      <Header onToggleMenu={mapPage ? () => setMenuOpen(v => !v) : undefined} menuOpen={menuOpen} />
      <div className="app-body">
        {mapPage && menuOpen && <button className="app-mobile-nav-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}
        <Sidebar onNavigate={() => setMenuOpen(false)} />
        <main className={`app-main${pathname === '/map' || pathname === '/groups/status' ? ' app-main-map' : ''}`}>
          {(pathname.startsWith('/reports') || pathname.startsWith('/projects')) && <ReportNavigation />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
