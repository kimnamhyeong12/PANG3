import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { fetchGroupTasks } from '../../api/tasks';
import { fetchProjectTasks, linkProjectTasks, unlinkProjectTask } from '../../api/projects';
import { normalizeStatus, STATUS } from '../../utils/taskStatus';
import { koreaDay } from '../../lib/mapRegistration';
import Modal from '../Modal';
import StatusPill from '../StatusPill';
import ErrorBlock from '../ErrorBlock';
import { LoadingBlock } from '../Loading';
import ReportRecordFilters, { defaultRecordFilters, filterReportRecords } from './ReportRecordFilters';

export default function ProjectVisitsPanel({ project, user, collapsed, onToggle, revision, onChanged, onDirtyChange }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [adding, setAdding] = useState(false), [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState(null), [selected, setSelected] = useState(new Set()), [filters, setFilters] = useState(defaultRecordFilters), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    fetchProjectTasks(project.projectId, user.userId).then(data => active && setRows(data)).catch(e => active && setError(errorMessage(e)));
    return () => { active = false; };
  }, [project.projectId, user.userId, revision, retry]);
  useEffect(() => {
    if (!adding) return; let active = true; setCandidates(null);
    fetchGroupTasks(project.groupId, user.userId).then(data => active && setCandidates(data.map(t => ({ ...t, taskId: t.taskId || t.id, performedByUserId: t.assigneeUserId, performedByName: t.assigneeName, createdAt: t.workDate || t.createdAt })))).catch(e => active && setError(errorMessage(e)));
    return () => { active = false; };
  }, [adding, project.groupId, user.userId, retry]);
  useEffect(() => { onDirtyChange?.(adding || busy); return () => onDirtyChange?.(false); }, [adding, busy, onDirtyChange]);
  const ids = useMemo(() => new Set((rows || []).map(t => Number(t.taskId))), [rows]);
  const available = useMemo(() => (candidates || []).filter(t => !ids.has(Number(t.taskId))), [candidates, ids]);
  const visible = useMemo(() => filterReportRecords(available, filters), [available, filters]);
  const act = async fn => { if (busy) return; setBusy(true); setError(''); try { await fn(); setRetry(n => n + 1); onChanged(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const repeat = task => {
    if (!window.confirm(normalizeStatus(task) === STATUS.COMPLETE ? '같은 방문지에 새 업무를 등록할까요?' : '진행 중인 업무가 있습니다. 같은 방문지에 새 업무를 추가할까요?')) return;
    act(() => api.post('/api/locations', { projectId: project.projectId, projectPlaceId: task.projectPlaceId, groupId: project.groupId, createdByUserId: user.userId, detailAddress: task.detailAddress || task.roadAddress, roadAddress: task.roadAddress, lat: task.lat, lng: task.lng, task: task.taskCategory || '', adminDong: task.adminDong, status: 'pending', workDate: koreaDay(), scheduledDate: koreaDay() }));
  };
  return <section className="panel project-visits-panel"><header className="panel-header"><div className="project-heading-label"><h2 className="panel-title">프로젝트 방문지</h2><span className="panel-count">{rows?.length ?? 0}건</span></div><div className="action-row"><button className="btn-secondary" onClick={onToggle}>{collapsed ? '펼치기' : '접기'}</button><button className="btn-secondary" disabled={busy || project.status === 'ARCHIVED'} onClick={() => { setAdding(true); setSelected(new Set()); setFilters(defaultRecordFilters()); setError(''); }}>방문지 추가</button></div></header>
    {error && !adding && <ErrorBlock message={error} onRetry={() => setRetry(n => n + 1)}/>}
    {!collapsed && (!rows ? <LoadingBlock/> : <div className="project-visits-list">{rows.map(t => <div className="project-visit-row" key={t.taskId}><div className="project-visit-main"><strong>{t.detailAddress || t.roadAddress}</strong><small>{[t.roadAddress, t.adminDong, t.taskCategory, String(t.workDate || t.createdAt || '').slice(0, 10)].filter(Boolean).join(' · ')}</small></div><StatusPill status={normalizeStatus(t)}/><div className="action-row"><button className="btn-secondary" disabled={busy || project.status === 'ARCHIVED'} onClick={() => repeat(t)}>다시 등록</button><button className="btn-secondary" disabled={busy} onClick={() => { if (window.confirm('이 프로젝트에서 제외할까요? 이 프로젝트의 작성 중 보고서에서도 빠집니다. 원본 업무·기록과 확정본은 유지됩니다.')) act(() => unlinkProjectTask(project.projectId, t.taskId, user.userId)); }}>제외</button></div></div>)}{!rows.length && <p className="table-empty">프로젝트에 등록된 방문지가 없습니다.</p>}</div>)}
    {adding && <Modal title="프로젝트 방문지 추가" wide onClose={() => !busy && setAdding(false)} footer={<><span className="text-soft">선택 {selected.size}건</span><button className="btn-primary btn-inline" disabled={busy || !selected.size} onClick={() => act(async () => { await linkProjectTasks(project.projectId, user.userId, [...selected]); setAdding(false); })}>프로젝트에 추가</button></>}>
      {error && <ErrorBlock message={error} onRetry={!candidates ? () => setRetry(n => n + 1) : undefined}/>}
      {!candidates ? !error && <LoadingBlock/> : <><ReportRecordFilters rows={available} value={filters} onChange={setFilters} userId={user.userId} disabled={busy}/><div className="project-selection-scroll">{visible.map(t => <label className="project-candidate-row" key={t.taskId}><input type="checkbox" disabled={busy} checked={selected.has(t.taskId)} onChange={e => { const next = new Set(selected); e.target.checked ? next.add(t.taskId) : next.delete(t.taskId); setSelected(next); }}/><span><strong>{t.detailAddress || t.roadAddress}</strong><small>{t.roadAddress}</small></span><StatusPill status={normalizeStatus(t)}/></label>)}{!visible.length && <p className="table-empty">조건에 맞는 방문지가 없습니다.</p>}</div></>}
    </Modal>}
  </section>;
}
