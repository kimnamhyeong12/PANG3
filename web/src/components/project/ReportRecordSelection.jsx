import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchGroupReports } from '../../api/reports';
import { createProjectReport, fetchCompiledReport, fetchProjectTasks, replaceReportItems } from '../../api/projects';
import { normalizeStatus, STATUS } from '../../utils/taskStatus';
import ReportRecordFilters, { defaultRecordFilters, filterReportRecords } from './ReportRecordFilters';
import ErrorBlock from '../ErrorBlock';
import { LoadingBlock } from '../Loading';
import { errorMessage } from '../../api/client';
import useLiveRevision from '../useLiveRevision';

export default function ReportRecordSelection({ project, user, reportId, onSaved, onDirtyChange, refreshKey }) {
  const [rows, setRows] = useState(null), [linked, setLinked] = useState(new Set()), [selected, setSelected] = useState(new Set());
  const [filters, setFilters] = useState(defaultRecordFilters), [outside, setOutside] = useState(false);
  const [initialSelection, setInitialSelection] = useState(new Set()), [readOnly, setReadOnly] = useState(false);
  const selectionChanged = selected.size !== initialSelection.size || [...selected].some(id => !initialSelection.has(id));
  const [title, setTitle] = useState(''), [revision, setRevision] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const dirty = busy || selectionChanged || !reportId && Boolean(title.trim());
  const liveRevision = useLiveRevision(['reports', 'projects', 'tasks'], { dirty, scope: `${project.projectId}:${reportId || 'new'}` });
  const previousRefresh = useRef(refreshKey), deferredRefresh = useRef(false);
  useEffect(() => {
    if (previousRefresh.current !== refreshKey) { previousRefresh.current = refreshKey; deferredRefresh.current = true; }
    if (!dirty && deferredRefresh.current) { deferredRefresh.current = false; setRetry(n => n + 1); }
  }, [refreshKey, dirty]);
  useEffect(() => {
    let active = true; setRows(null); setError('');
    Promise.all([fetchGroupReports(project.groupId, user.userId), fetchProjectTasks(project.projectId, user.userId), reportId ? fetchCompiledReport(reportId, user.userId) : null]).then(([all, tasks, report]) => {
      if (!active) return;
      const ids = new Set(tasks.map(t => Number(t.taskId))), completed = all.filter(r => normalizeStatus({ status: r.progressStatus || r.taskStatus }) === STATUS.COMPLETE);
      setRows(completed); setLinked(ids); setRevision(report?.report?.updatedAt); setTitle(''); setReadOnly(report?.report?.status === 'FINAL' || project.status === 'ARCHIVED');
      const filter = defaultRecordFilters(); setFilters(filter);
      const initial = new Set(report ? report.sections.flatMap(s => s.items).map(i => i.progressId) : []);
      setSelected(initial); setInitialSelection(initial);
    }).catch(e => active && setError(errorMessage(e)));
    return () => { active = false; };
  }, [project.projectId, project.groupId, user.userId, reportId, retry, liveRevision]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const pool = useMemo(() => (rows || []).filter(r => outside ? !linked.has(Number(r.taskId)) : linked.has(Number(r.taskId))), [rows, linked, outside]);
  const visible = useMemo(() => filterReportRecords(pool, filters), [pool, filters]);
  const changeFilters = next => { setFilters(next); };
  const save = async e => {
    e.preventDefault(); if (readOnly || busy || !selected.size || !reportId && !title.trim()) return;
    setBusy(true); setError('');
    try {
      const result = reportId ? await replaceReportItems(reportId, user.userId, [...selected], revision) : await createProjectReport(project.projectId, user.userId, { title: title.trim(), groupBy: 'adminDong', progressIds: [...selected] });
      setInitialSelection(new Set(selected));
      await onSaved(result);
      if (reportId) setRetry(n => n + 1);
    } catch (e) { setError(errorMessage(e, '선택한 기록을 저장하지 못했습니다.')); }
    finally { setBusy(false); }
  };
  return <section className="panel project-report-selection" aria-label="건별 보고서 선택"><header className="panel-header"><h2 className="panel-title">건별 보고서</h2></header>
    {error && <ErrorBlock message={error} onRetry={!rows ? () => setRetry(n => n + 1) : undefined}/>}
    {!rows ? !error && <LoadingBlock/> : <form onSubmit={save} className="project-selection-body">
      <ReportRecordFilters rows={pool} value={filters} onChange={changeFilters} userId={user.userId} disabled={busy}/>
      <div className="action-row"><button className="btn-secondary" type="button" disabled={busy} onClick={() => setOutside(v => !v)}>{outside ? '프로젝트 내 업무 추가' : '프로젝트 외 업무 추가'}</button></div>
      <div className="project-selection-scroll"><table className="table"><thead><tr><th><input type="checkbox" aria-label="검색 결과 전체 선택" disabled={readOnly || busy || !visible.length} checked={Boolean(visible.length) && visible.every(r => selected.has(r.progressId))} onChange={e => { const next = new Set(selected); visible.forEach(r => e.target.checked ? next.add(r.progressId) : next.delete(r.progressId)); setSelected(next); }}/></th><th>방문지</th><th>작업자</th><th>작성일</th></tr></thead><tbody>{visible.map(r => <tr key={r.progressId}><td><input type="checkbox" aria-label={`${r.detailAddress || r.roadAddress} 선택`} disabled={readOnly || busy} checked={selected.has(r.progressId)} onChange={e => { const next = new Set(selected); e.target.checked ? next.add(r.progressId) : next.delete(r.progressId); setSelected(next); }}/></td><td><strong>{r.detailAddress || r.roadAddress}</strong><small>{r.roadAddress}</small>{!linked.has(Number(r.taskId)) && <span className="pill pill-navy">프로젝트 외 업무</span>}</td><td>{r.performedByDeparted ? '탈퇴한 사용자' : r.performedByName || '-'}</td><td>{String(r.createdAt || '').slice(0, 10)}</td></tr>)}</tbody></table>{!visible.length && <p className="table-empty">조건에 맞는 완료 기록이 없습니다.</p>}</div>
      {!readOnly && <footer className="project-selection-footer">
        {!reportId && <label className="project-new-report-name">보고서 이름<input className="input" aria-label="보고서 이름" value={title} disabled={busy} maxLength={200} placeholder="보고서 이름을 입력해 주세요." onChange={e => setTitle(e.target.value)}/></label>}
        <button className="btn-primary btn-inline" disabled={busy || !selected.size || (reportId ? !selectionChanged : !title.trim())}>{busy ? '저장 중…' : reportId ? `${selected.size}건 선택 적용` : `${selected.size}건으로 보고서 만들기`}</button>
      </footer>}

    </form>}
  </section>;
}
