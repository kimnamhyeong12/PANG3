import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useGroup } from './context/GroupContext.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import NoTeamNotice from './components/NoTeamNotice.jsx';
import { LoadingScreen } from './components/Loading.jsx';
import GroupLoadError from './components/GroupLoadError.jsx';
import LoginPage from './pages/LoginPage.jsx';
import GroupSelectPage from './pages/GroupSelectPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TransferPage from './pages/TransferPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import PublicDataPage from './pages/PublicDataPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectsDetailPage from './pages/ProjectsDetailPage.jsx';
import ReportEditorPage from './pages/ReportEditorPage.jsx';
import ProjectsProgressEditPage from './pages/ProjectsProgressEditPage.jsx';
import AccountRecoveryPage from './pages/AccountRecoveryPage.jsx';

function RequireAuth() {
  const { user, loading, error, restore } = useAuth();
  if (loading) return <LoadingScreen label="로그인을 확인하고 있습니다…" />;
  if (error) return <div style={{ padding: 32 }}><p>{error}</p><button onClick={restore}>다시 연결하기</button></div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireGroup() {
  const { groups, groupId, loading, loaded, error } = useGroup();
  if (error) return <GroupLoadError message={error} />;
  if (!loaded || loading) return <LoadingScreen label="그룹 정보를 불러오는 중…" />;
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
      <Route path="/forgot-password" element={<AccountRecoveryPage mode="forgot" />} />
      <Route path="/reset-password" element={<AccountRecoveryPage mode="reset" />} />
      <Route path="/verify-email" element={<AccountRecoveryPage mode="verify" />} />
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
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectsDetailPage />} />
            <Route path="/projects/:projectId/reports/:reportId" element={<ReportEditorPage />} />
            <Route path="/reports/:progressId/edit" element={<ProjectsProgressEditPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
