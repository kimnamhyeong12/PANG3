import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import {
  GROUP_BY_OPTIONS,
  createProjectReport,
  fetchProject,
  fetchProjectItems,
  fetchProjectReports,
  fetchProjectTasks,
  linkProjectTasks,
  unlinkProjectTask,
  updateProject,
} from '../api/projects.js';
import { fetchGroupTasks } from '../api/tasks.js';
import { errorMessage } from '../api/client.js';
import { formatDate, formatDateTime } from '../utils/format.js';
import { STATUS, STATUS_LABEL, normalizeStatus } from '../utils/taskStatus.js';
import { IconPlus } from '../components/Icons.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { LoadingBlock } from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { ProjectsFormModal, projectPeriod } from './ProjectsPage.jsx';
import '../styles/projects.css';

export function ReportStatusBadge({ report }) {
  const final = report?.status === 'FINAL';
  return (
    <span className={`pill pill-${final ? 'green' : 'amber'}`}>
      {final ? '확정' : '초안'} v{report?.version ?? 1}
    </span>
  );
}

// LocalDateTime/LocalDate (문자열 또는 배열) → 연도
function yearOf(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  const y = Number(String(value).slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

const sortKo = (list) => [...list].sort((a, b) => String(a).localeCompare(String(b), 'ko'));

function NewReportModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [groupBy, setGroupBy] = useState('adminDong');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    if (!title.trim()) {
      setError('보고서 제목을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), groupBy });
    } catch (err) {
      setError(errorMessage(err, '보고서를 만들지 못했습니다.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="새 보고서"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary btn-inline" disabled={saving} onClick={submit}>
            {saving ? '만드는 중…' : '만들기'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="report-title">제목</label>
          <input
            id="report-title"
            className="input"
            value={title}
            maxLength={200}
            autoFocus
            placeholder="예: 상반기 결과보고"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>분류 기준</label>
          <div className="pj-chips">
            {GROUP_BY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`pj-chip${groupBy === o.value ? ' active' : ''}`}
                onClick={() => setGroupBy(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

function ReportsPanel({ projectId, userId, isLeader, reloadKey }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProjectReports(projectId, userId)
      .then((list) => !cancelled && setReports(list ?? []))
      .catch((e) => !cancelled && setError(errorMessage(e, '보고서 목록을 불러오지 못했습니다.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, userId, reloadKey, retry]);

  return (
    <section className="panel pj-section">
      <div className="panel-header">
        <h2 className="panel-title">통합 보고서</h2>
        {isLeader && (
          <button type="button" className="btn-primary btn-inline" onClick={() => setCreating(true)}>
            <IconPlus size={16} />새 보고서
          </button>
        )}
      </div>
      {error ? (
        <ErrorBlock message={error} onRetry={() => setRetry((k) => k + 1)} />
      ) : loading ? (
        <LoadingBlock />
      ) : reports.length === 0 ? (
        <div className="table-empty">아직 보고서가 없습니다.</div>
      ) : (
        <ul className="pj-list">
          {reports.map((r) => (
            <li key={r.reportId}>
              <Link to={`/projects/${projectId}/reports/${r.reportId}`} className="pj-list-row">
                <ReportStatusBadge report={r} />
                <span className="pj-list-title">{r.title}</span>
                <span className="pj-list-meta">
                  {r.itemCount ?? 0}건 · {GROUP_BY_OPTIONS.find((o) => o.value === r.groupBy)?.label ?? '행정동'}별 ·{' '}
                  {formatDateTime(r.finalizedAt || r.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewReportModal
          onClose={() => setCreating(false)}
          onSubmit={async (form) => {
            const created = await createProjectReport(projectId, userId, form);
            setCreating(false);
            navigate(`/projects/${projectId}/reports/${created.reportId}`);
          }}
        />
      )}
    </section>
  );
}

export function MineBadge() {
  return <span className="pj-mine-badge">내 기록</span>;
}

function ItemsPanel({ projectId, userId, isLeader, reloadKey }) {
  const [filters, setFilters] = useState({ year: '', adminDong: '', authorId: '', category: '' });
  const [mine, setMine] = useState(!isLeader); // D20: 멤버 기본 ON, 리더 기본 OFF
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProjectItems(projectId, userId, mine ? { ...filters, authorId: userId } : filters)
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setError(errorMessage(e, '완료 기록을 불러오지 못했습니다.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, userId, filters, mine, reloadKey, retry]);

  const options = data?.filters ?? {};
  const items = data?.items ?? [];
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilter = Object.values(filters).some(Boolean);

  return (
    <section className="panel pj-section">
      <div className="panel-header">
        <h2 className="panel-title">완료 기록</h2>
        {data && (
          <span className="panel-count">
            {items.length} / {data.totalCount}건
          </span>
        )}
      </div>
      <div className="pj-filter-row">
        <ItemFilters options={options} filters={filters} setFilter={setFilter} mine={mine} onToggleMine={() => setMine((v) => !v)} />
        {hasFilter && (
          <button type="button" className="btn-secondary" onClick={() => setFilters({ year: '', adminDong: '', authorId: '', category: '' })}>
            초기화
          </button>
        )}
      </div>
      {error ? (
        <ErrorBlock message={error} onRetry={() => setRetry((k) => k + 1)} />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <div className="table-empty">
          {data?.totalCount ? '조건에 맞는 기록이 없습니다.' : '연결된 업무의 완료 기록이 없습니다.'}
        </div>
      ) : (
        <div className="table-scroll pj-table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>주소</th>
                <th>행정동</th>
                <th>업무유형</th>
                <th>작성자</th>
                <th>완료일</th>
                <th>사진</th>
                <th>보고서</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.progressId}>
                  <td className="cell-address">{it.address || '-'}</td>
                  <td>{it.adminDong || '-'}</td>
                  <td>{it.category || '-'}</td>
                  <td>
                    {it.authorName || '-'} {it.authorId === userId && <MineBadge />}
                  </td>
                  <td className="cell-date">{formatDate(it.completedAt)}</td>
                  <td>{it.photoCount ?? 0}</td>
                  <td>{it.inReportIds?.length ? <span className="pill pill-navy">담김 {it.inReportIds.length}</span> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// 완료 기록 필터 드롭다운 (상세/편집 화면 공용)
// D20: "내 작업만" 칩 (authorId = 본인). 켜져 있으면 작성자 드롭다운은 쓰지 않는다.
export function ItemFilters({ options, filters, setFilter, mine, onToggleMine }) {
  return (
    <>
      <button type="button" className={`pj-chip${mine ? ' active' : ''}`} aria-pressed={mine} onClick={onToggleMine}>
        내 작업만
      </button>
      <select className="input filter-select" value={filters.year} onChange={(e) => setFilter('year', e.target.value)}>
        <option value="">전체 연도</option>
        {(options.years ?? []).map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </select>
      <select className="input filter-select" value={filters.adminDong} onChange={(e) => setFilter('adminDong', e.target.value)}>
        <option value="">전체 행정동</option>
        {(options.adminDongs ?? []).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        className="input filter-select"
        value={mine ? '' : filters.authorId}
        disabled={mine}
        onChange={(e) => setFilter('authorId', e.target.value)}
      >
        <option value="">전체 작성자</option>
        {(options.authors ?? []).map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.name}
          </option>
        ))}
      </select>
      <select className="input filter-select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
        <option value="">전체 업무유형</option>
        {(options.categories ?? []).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </>
  );
}

function TaskLinkPanel({ projectId, groupId, userId, onChanged }) {
  const [groupTasks, setGroupTasks] = useState([]);
  const [linked, setLinked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState({ year: '', adminDong: '', category: '', status: '', hideLinked: true });
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchGroupTasks(groupId, userId), fetchProjectTasks(projectId, userId)])
      .then(([all, mine]) => {
        if (cancelled) return;
        setGroupTasks(all ?? []);
        setLinked(mine ?? []);
      })
      .catch((e) => !cancelled && setError(errorMessage(e, '업무 목록을 불러오지 못했습니다.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, groupId, userId, retry]);

  const linkedIds = useMemo(() => new Set(linked.map((t) => t.taskId)), [linked]);

  const options = useMemo(() => {
    const years = new Set();
    const dongs = new Set();
    const cats = new Set();
    groupTasks.forEach((t) => {
      const y = yearOf(t.completedAt || t.workDate || t.createdAt);
      if (y) years.add(y);
      if (t.adminDong) dongs.add(t.adminDong);
      if (t.taskCategory) cats.add(t.taskCategory);
    });
    return { years: [...years].sort((a, b) => b - a), dongs: sortKo(dongs), cats: sortKo(cats) };
  }, [groupTasks]);

  const filtered = useMemo(
    () =>
      groupTasks.filter((t) => {
        if (filters.hideLinked && linkedIds.has(t.taskId)) return false;
        if (filters.year && String(yearOf(t.completedAt || t.workDate || t.createdAt)) !== filters.year) return false;
        if (filters.adminDong && t.adminDong !== filters.adminDong) return false;
        if (filters.category && t.taskCategory !== filters.category) return false;
        if (filters.status && normalizeStatus(t) !== filters.status) return false;
        return true;
      }),
    [groupTasks, filters, linkedIds]
  );

  const linkable = filtered.filter((t) => !linkedIds.has(t.taskId));
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const toggle = (taskId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const refreshLinked = async () => {
    setLinked((await fetchProjectTasks(projectId, userId)) ?? []);
    onChanged();
  };

  const link = async (taskIds) => {
    if (taskIds.length === 0) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await linkProjectTasks(projectId, userId, taskIds);
      setSelected(new Set());
      setNotice(`${taskIds.length}건을 연결했습니다.`);
      await refreshLinked();
    } catch (e) {
      setActionError(errorMessage(e, '업무를 연결하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const linkAll = () => {
    const ids = linkable.map((t) => t.taskId);
    if (ids.length === 0) return;
    if (!window.confirm(`필터 결과 ${ids.length}건을 모두 이 프로젝트에 연결할까요?\n다른 프로젝트에 연결된 업무는 이 프로젝트로 옮겨집니다.`)) return;
    link(ids);
  };

  const unlink = async (task) => {
    if (!window.confirm('이 업무의 연결을 해제할까요?\n작성 중인 보고서에 담긴 해당 기록도 함께 빠집니다.')) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await unlinkProjectTask(projectId, task.taskId, userId);
      await refreshLinked();
    } catch (e) {
      setActionError(errorMessage(e, '연결을 해제하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const selectedIds = [...selected].filter((id) => !linkedIds.has(id));
  const address = (t) => t.roadAddress || t.detailAddress || '주소 정보 없음';

  return (
    <section className="panel pj-section">
      <div className="panel-header">
        <h2 className="panel-title">업무 연결</h2>
        <span className="panel-count">연결된 업무 {linked.length}건</span>
      </div>
      {error ? (
        <ErrorBlock message={error} onRetry={() => setRetry((k) => k + 1)} />
      ) : loading ? (
        <LoadingBlock />
      ) : (
        <div className="pj-link-grid">
          <div>
            <div className="pj-filter-row">
              <select className="input filter-select" value={filters.year} onChange={(e) => setFilter('year', e.target.value)}>
                <option value="">전체 연도</option>
                {options.years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}년
                  </option>
                ))}
              </select>
              <select className="input filter-select" value={filters.adminDong} onChange={(e) => setFilter('adminDong', e.target.value)}>
                <option value="">전체 행정동</option>
                {options.dongs.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select className="input filter-select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="">전체 업무유형</option>
                {options.cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select className="input filter-select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">전체 상태</option>
                {[STATUS.PENDING, STATUS.WORKING, STATUS.COMPLETE].map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <label className="pj-check-label">
                <input type="checkbox" checked={filters.hideLinked} onChange={(e) => setFilter('hideLinked', e.target.checked)} />
                연결된 업무 숨기기
              </label>
            </div>
            <div className="pj-link-actions">
              <span className="pj-muted">
                필터 결과 {filtered.length}건 · 선택 {selectedIds.length}건
              </span>
              <button type="button" className="btn-secondary" disabled={busy || selectedIds.length === 0} onClick={() => link(selectedIds)}>
                선택 연결
              </button>
              <button type="button" className="btn-primary btn-inline" disabled={busy || linkable.length === 0} onClick={linkAll}>
                필터 결과 전체 연결 ({linkable.length})
              </button>
            </div>
            {actionError && <p className="form-error">{actionError}</p>}
            {notice && <p className="form-success">{notice}</p>}
            {filtered.length === 0 ? (
              <div className="table-empty">조건에 맞는 업무가 없습니다.</div>
            ) : (
              <ul className="pj-task-list">
                {filtered.map((t) => {
                  const isLinked = linkedIds.has(t.taskId);
                  return (
                    <li key={t.taskId}>
                      <label className={`pj-task-row${isLinked ? ' is-linked' : ''}`}>
                        <input
                          type="checkbox"
                          disabled={isLinked || busy}
                          checked={isLinked || selected.has(t.taskId)}
                          onChange={() => toggle(t.taskId)}
                        />
                        <span className="pj-task-main">
                          <span className="pj-task-title">{address(t)}</span>
                          <span className="pj-muted">
                            {[t.adminDong, t.taskCategory, t.assigneeName].filter(Boolean).join(' · ') || '-'}
                          </span>
                        </span>
                        {isLinked ? <span className="pill pill-navy">연결됨</span> : <StatusPill status={normalizeStatus(t)} />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <h3 className="pj-subtitle">연결된 업무</h3>
            {linked.length === 0 ? (
              <div className="table-empty">연결된 업무가 없습니다.</div>
            ) : (
              <ul className="pj-task-list">
                {linked.map((t) => (
                  <li key={t.taskId} className="pj-task-row">
                    <span className="pj-task-main">
                      <span className="pj-task-title">{address(t)}</span>
                      <span className="pj-muted">{[t.adminDong, t.taskCategory].filter(Boolean).join(' · ') || '-'}</span>
                    </span>
                    <StatusPill status={normalizeStatus(t)} />
                    <button type="button" className="btn-secondary pj-btn-sm" disabled={busy} onClick={() => unlink(t)}>
                      해제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProjectsDetailPage() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const { groupId } = useGroup();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchProject(projectId, user.userId)
      .then(setProject)
      .catch((e) => setError(errorMessage(e, '프로젝트를 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [projectId, user.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onTasksChanged = () => {
    setReloadKey((k) => k + 1);
    fetchProject(projectId, user.userId).then(setProject).catch(() => {});
  };

  if (error)
    return (
      <>
        <Link to="/projects" className="pj-back">← 프로젝트 목록</Link>
        <div className="panel">
          <ErrorBlock message={error} onRetry={load} />
        </div>
      </>
    );
  if (loading && !project) return <div className="panel"><LoadingBlock /></div>;

  const isLeader = Boolean(project.isLeader);
  // 다른 그룹으로 바꾼 뒤 남은 화면이면 업무 연결은 숨긴다 (그룹 업무 조회 기준이 다름)
  const sameGroup = project.groupId === groupId;

  return (
    <>
      <Link to="/projects" className="pj-back">← 프로젝트 목록</Link>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {project.name}{' '}
            <span className={`pill pill-${project.status === 'ARCHIVED' ? 'gray' : 'green'}`}>
              {project.status === 'ARCHIVED' ? '보관' : '진행'}
            </span>
          </h1>
          <p className="page-desc">
            {projectPeriod(project)} · 연결 업무 {project.taskCount ?? 0}건 · 완료 기록 {project.completedCount ?? 0}건
          </p>
        </div>
        {isLeader && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            프로젝트 수정
          </button>
        )}
      </div>

      <ReportsPanel projectId={projectId} userId={user.userId} isLeader={isLeader} reloadKey={reloadKey} />
      <ItemsPanel projectId={projectId} userId={user.userId} isLeader={isLeader} reloadKey={reloadKey} />
      {isLeader && sameGroup && (
        <TaskLinkPanel projectId={projectId} groupId={groupId} userId={user.userId} onChanged={onTasksChanged} />
      )}

      {editing && (
        <ProjectsFormModal
          title="프로젝트 수정"
          submitLabel="저장"
          initial={{
            name: project.name,
            startDate: typeof project.startDate === 'string' ? project.startDate : '',
            endDate: typeof project.endDate === 'string' ? project.endDate : '',
          }}
          onClose={() => setEditing(false)}
          onSubmit={async (form) => {
            const saved = await updateProject(projectId, user.userId, form);
            setProject((p) => ({ ...p, ...saved }));
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
