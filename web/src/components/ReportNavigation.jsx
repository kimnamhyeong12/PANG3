import { NavLink, useLocation } from 'react-router-dom';
export default function ReportNavigation() {
  const {
    pathname
  } = useLocation();
  return <div className="tabs report-navigation"><NavLink className={`tab${pathname.startsWith('/reports') ? ' active' : ''}`} to="/reports">건별 보고서</NavLink><NavLink className={`tab${pathname.startsWith('/projects') ? ' active' : ''}`} to="/projects">프로젝트</NavLink></div>;
}
