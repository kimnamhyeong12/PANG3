import { Outlet, useLocation } from 'react-router-dom';
import ReportNavigation from '../ReportNavigation.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <Sidebar />
        <main className={`app-main${pathname === '/map' || pathname === '/groups/status' ? ' app-main-map' : ''}`}>
          {(pathname.startsWith('/reports') || pathname.startsWith('/projects')) && <ReportNavigation />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
