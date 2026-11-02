import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGroup } from '../context/GroupContext';
import { fetchProject, fetchProjectReports, updateProject } from '../api/projects';
import { errorMessage } from '../api/client';
import useLiveRevision from '../components/useLiveRevision';
import ErrorBlock from '../components/ErrorBlock';
import { LoadingBlock } from '../components/Loading';
import ProjectVisitsPanel from '../components/project/ProjectVisitsPanel';
import ReportRecordSelection from '../components/project/ReportRecordSelection';
import { ReportStatusBadge } from '../components/project/ProjectBadges';
import ReportEditorPage from './ReportEditorPage';
import { ProjectsFormModal } from './ProjectsPage';
import { formatDateTime } from '../utils/format';
import '../styles/projects.css';

export { ReportStatusBadge, MineBadge } from '../components/project/ProjectBadges';

export default function ProjectsDetailPage() {
  const { projectId } = useParams(), { user } = useAuth();
  const { groupId } = useGroup(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [project, setProject] = useState(null), [reports, setReports] = useState(null), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [editing, setEditing] = useState(false), [selection, setSelection] = useState(false), [collapsed, setCollapsed] = useState(false);
  const [dirty, setDirty] = useState(false), [notice, setNotice] = useState('');
  const openReportId = params.get('report');
  const liveRevision = useLiveRevision(['projects', 'reports', 'tasks'], { dirty });
  useEffect(() => {
    if (!project || groupId == null || String(project.groupId) === String(groupId)) return;
    if (dirty) setNotice('다른 그룹을 선택했습니다. 현재 프로젝트의 작성 중인 내용은 유지되며, 편집을 닫으면 선택한 그룹으로 이동합니다.');
    else navigate('/projects', { replace: true });
  }, [project?.groupId, groupId, dirty, navigate]);
  useEffect(() => {
    let active = true; setError('');
    Promise.all([fetchProject(projectId, user.userId), fetchProjectReports(projectId, user.userId)]).then(([p, list]) => {
      if (active) { setProject(p); setReports(list); }
    }).catch(e => active && setError(errorMessage(e)));
    return () => { active = false; };
  }, [projectId, user.userId, revision, liveRevision]);
  useEffect(() => { setSelection(false); setProject(null); setReports(null); setCollapsed(Boolean(openReportId)); }, [projectId]);
  const changed = useCallback(() => { setRevision(n => n + 1); }, []);
  const openReport = useCallback(id => { setSelection(false); setCollapsed(true); setNotice(''); setParams(id ? { report: id } : {}); }, [setParams]);
  if (!project) return <section className="panel">{error ? <ErrorBlock message={error} onRetry={changed}/> : <LoadingBlock/>}</section>;
  return <div className="project-workspace">
    <Link to="/projects" className="pj-back">← 프로젝트 목록</Link>
    <div className="project-workspace-heading"><h1>{project.name}</h1><button className="btn-secondary" disabled={dirty} onClick={() => setEditing(true)}>이름 변경</button></div>
    {error && <ErrorBlock message={error} onRetry={changed}/>}{notice && <p role="status" className="panel-notice">{notice}</p>}
    <ProjectVisitsPanel project={project} user={user} collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} revision={`${revision}:${liveRevision}`} onChanged={changed} onDirtyChange={setDirty}/>
    <section className="panel project-reports-panel"><header className="panel-header"><div className="project-heading-label"><h2 className="panel-title">통합 보고서</h2><span className="panel-count">{reports?.length ?? 0}건</span></div><button className="btn-primary btn-inline" disabled={dirty || project.status === 'ARCHIVED'} onClick={() => { setSelection(true); setCollapsed(true); setParams({}); }}>새 보고서</button></header>
      {!reports ? <LoadingBlock/> : !reports.length ? <p className="table-empty">아직 보고서가 없습니다.</p> : <div>{reports.map(report => <button type="button" key={report.reportId} className={`project-report-row${String(report.reportId) === String(openReportId) ? ' selected' : ''}`} disabled={dirty} aria-expanded={String(report.reportId) === String(openReportId)} onClick={() => openReport(String(report.reportId) === String(openReportId) ? null : report.reportId)}><div><strong>{report.title}</strong><small>{report.itemCount ?? 0}건 · {formatDateTime(report.finalizedAt || report.updatedAt)}</small></div><ReportStatusBadge report={report}/><span aria-hidden="true">{String(report.reportId) === String(openReportId) ? '⌃' : '⌄'}</span></button>)}</div>}
    </section>
    {selection && <ReportRecordSelection key={projectId} project={project} user={user} onDirtyChange={setDirty} onCancel={() => setSelection(false)} onSaved={result => { changed(); openReport(result.reportId); }}/>}
    {openReportId && <section className="project-inline-report" aria-label="통합 보고서 편집"><ReportEditorPage key={openReportId} embedded reportId={openReportId} onNavigateReport={openReport} onReportChange={changed} onDirtyChange={setDirty}/></section>}
    {editing && <ProjectsFormModal title="프로젝트 이름 변경" submitLabel="저장" initial={{ name: project.name }} onClose={() => setEditing(false)} onSubmit={async form => { await updateProject(projectId, user.userId, form); setEditing(false); changed(); }}/ >}
  </div>;
}
