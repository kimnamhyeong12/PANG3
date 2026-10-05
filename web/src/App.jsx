import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useGroup } from './context/GroupContext.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import NoTeamNotice from './components/NoTeamNotice.jsx';
import LoginPage from './pages/LoginPage.jsx';
import GroupSelectPage from './pages/GroupSelectPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TransferPage from './pages/TransferPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import PublicDataPage from './pages/PublicDataPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

function RequireAuth() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireGroup() {
  const { groups, groupId, loading, loaded, error } = useGroup();
  if (error) return <div className="full-center">{error}</div>;
  if (!loaded || loading) return <div className="full-center">그룹 정보를 불러오는 중…</div>;
  if (groups.length === 0) return <NoTeamNotice />;
  if (groupId == null || !groups.some((g) => g.groupId === groupId)) {
    return <Navigate to="/groups/select" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/groups/select" element={<GroupSelectPage />} />
        <Route element={<RequireGroup />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transfers" element={<TransferPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/public-data" element={<PublicDataPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
