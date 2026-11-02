import { useCallback, useEffect, useRef, useState } from 'react';
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
import { IconChevronDown } from '../components/Icons';

export { ReportStatusBadge, MineBadge } from '../components/project/ProjectBadges';

export default function ProjectsDetailPage() {
  const { projectId } = useParams(), { user } = useAuth();
  const { groupId } = useGroup(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [project, setProject] = useState(null), [reports, setReports] = useState(null), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [editing, setEditing] = useState(false), [collapsed, setCollapsed] = useState(true);
  const [recordDirty, setRecordDirty] = useState(false), [editorDirty, setEditorDirty] = useState(false), [visitsDirty, setVisitsDirty] = useState(false);
  const dirty = recordDirty || editorDirty || visitsDirty;
  const [notice, setNotice] = useState(''), [selectionRevision, setSelectionRevision] = useState(0);
  const viewEpoch = useRef(0), live = useRef(true), currentView = useRef(null);
  const reportView = params.get('report');
  currentView.current = { projectId, reportView };
  const renderedViewEpoch = viewEpoch.current;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const creating = reportView === 'new';
  const openReportId = creating ? null : reportView;
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
  useEffect(() => { setProject(null); setReports(null); setCollapsed(Boolean(reportView)); }, [projectId]);
  const changed = useCallback(() => { setRevision(n => n + 1); }, []);
  const openReport = useCallback(id => { viewEpoch.current++; if (id) setCollapsed(true); setNotice(''); setRecordDirty(false); setEditorDirty(false); setParams(id ? { report: id } : {}, { replace: true }); }, [setParams]);
  if (!project) return <section className="panel">{error ? <ErrorBlock message={error} onRetry={changed}/> : <LoadingBlock/>}</section>;
  return <div className="project-workspace">
    <Link to="/projects" className="pj-back">← 프로젝트 목록</Link>
    <div className="project-workspace-heading"><h1>{project.name}</h1><button className="btn-secondary" disabled={dirty} onClick={() => setEditing(true)}>이름 변경</button></div>
    {error && <ErrorBlock message={error} onRetry={changed}/>}{notice && <p role="status" className="panel-notice">{notice}</p>}

    <ProjectVisitsPanel project={project} user={user} collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} revision={`${revision}:${liveRevision}`} onChanged={changed} onDirtyChange={setVisitsDirty}/>
    <section className="panel project-reports-panel"><header className="panel-header"><div className="project-heading-label"><h2 className="panel-title">통합 보고서</h2><span className="panel-count">{reports?.length ?? 0}건</span></div><button className="btn-primary btn-inline" aria-expanded={creating} disabled={visitsDirty || editorDirty || (!creating && recordDirty) || project.status === 'ARCHIVED'} onClick={() => openReport(creating ? null : 'new')}>새 보고서</button></header>
      {!reports ? <LoadingBlock/> : !reports.length ? <p className="table-empty">아직 보고서가 없습니다.</p> : <div>{reports.map(report => <button type="button" key={report.reportId} className={`project-report-row${String(report.reportId) === String(openReportId) ? ' selected' : ''}`} disabled={visitsDirty || (dirty && String(report.reportId) !== String(openReportId))} aria-expanded={String(report.reportId) === String(openReportId)} onClick={() => openReport(String(report.reportId) === String(openReportId) ? null : report.reportId)}><div><strong>{report.title}</strong><small>{report.itemCount ?? 0}건 · {formatDateTime(report.finalizedAt || report.updatedAt)}</small></div><ReportStatusBadge report={report}/><span className={`project-report-chevron${String(report.reportId) === String(openReportId) ? ' is-open' : ''}`}><IconChevronDown size={18}/></span></button>)}</div>}
    </section>
    {(creating || openReportId) && <ReportRecordSelection key={`${projectId}:${openReportId || 'new'}`} project={project} user={user} reportId={openReportId || undefined} refreshKey={`${revision}:${liveRevision}`} onDirtyChange={setRecordDirty} onClose={() => openReport(null)} onSaved={result => { if (!live.current || currentView.current?.projectId !== projectId) return; changed(); if (viewEpoch.current !== renderedViewEpoch || currentView.current?.reportView !== reportView) return; setSelectionRevision(n => n + 1); if (!openReportId) openReport(result.reportId); }}/>}
    {openReportId && <section className="project-inline-report" aria-label="통합 보고서 편집"><ReportEditorPage key={openReportId} embedded reportId={openReportId} onNavigateReport={openReport} refreshKey={selectionRevision} onReportChange={changed} onDirtyChange={setEditorDirty}/></section>}

    {editing && <ProjectsFormModal title="프로젝트 이름 변경" submitLabel="저장" initial={{ name: project.name }} onClose={() => setEditing(false)} onSubmit={async form => { await updateProject(projectId, user.userId, form); setEditing(false); changed(); }}/ >}
  </div>;
}
