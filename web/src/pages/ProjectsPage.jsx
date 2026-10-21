import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { createProject, fetchProjects } from '../api/projects.js';
import { errorMessage } from '../api/client.js';
import { formatDate } from '../utils/format.js';
import { IconPlus } from '../components/Icons.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { LoadingBlock } from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import '../styles/projects.css';

export function ProjectsFormModal({ title, initial, submitLabel, onClose, onSubmit }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError('프로젝트 이름을 입력해 주세요.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError('종료일은 시작일 이후여야 합니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), startDate: startDate || null, endDate: endDate || null });
    } catch (err) {
      setError(errorMessage(err, '저장하지 못했습니다.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary btn-inline" disabled={saving} onClick={submit}>
            {saving ? '저장 중…' : submitLabel}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="project-name">이름</label>
          <input
            id="project-name"
            className="input"
            value={name}
            maxLength={100}
            autoFocus
            placeholder="예: 2026 불법광고물 정비"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>기간 (선택)</label>
          <div className="filter-period">
            <input type="date" className="input" aria-label="시작일" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="filter-tilde">~</span>
            <input type="date" className="input" aria-label="종료일" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

export function projectPeriod(project) {
  if (!project?.startDate && !project?.endDate) return '기간 미정';
  return `${project.startDate ? formatDate(project.startDate) : ''} ~ ${project.endDate ? formatDate(project.endDate) : ''}`;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { groupId, currentGroup } = useGroup();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const personal = Boolean(currentGroup?.personal);
  const isLeader = currentGroup?.role === 'LEADER';

  const load = useCallback(() => {
    if (personal) {
      setLoading(false);
      return () => {};
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProjects(groupId, user.userId)
      .then((list) => !cancelled && setProjects(list ?? []))
      .catch((e) => {
        if (cancelled) return;
        setProjects([]);
        setError(errorMessage(e, '프로젝트 목록을 불러오지 못했습니다.'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId, user.userId, personal]);

  useEffect(() => load(), [load]);

  let content;
  if (personal)
    content = (
      <div className="panel table-empty">
        개인 업무공간에서는 프로젝트를 만들 수 없습니다. 팀 그룹을 선택해 주세요.
      </div>
    );
  else if (error) content = <div className="panel"><ErrorBlock message={error} onRetry={load} /></div>;
  else if (loading) content = <div className="panel"><LoadingBlock /></div>;
  else if (projects.length === 0)
    content = (
      <div className="panel table-empty">
        {isLeader ? '아직 프로젝트가 없습니다. "새 프로젝트"로 시작해 보세요.' : '아직 프로젝트가 없습니다. 그룹 리더가 프로젝트를 만들면 여기에 표시됩니다.'}
      </div>
    );
  else
    content = (
      <div className="pj-grid">
        {projects.map((p) => (
          <Link key={p.projectId} to={`/projects/${p.projectId}`} className="pj-card">
            <div className="pj-card-top">
              <span className="pj-card-name">{p.name}</span>
              <span className={`pill pill-${p.status === 'ARCHIVED' ? 'gray' : 'green'}`}>
                {p.status === 'ARCHIVED' ? '보관' : '진행'}
              </span>
            </div>
            <div className="pj-card-meta">{projectPeriod(p)}</div>
            <div className="pj-card-stats">
              <span>
                완료 기록 <b>{p.completedCount ?? 0}</b>건
              </span>
              <span>
                작성 중 보고서 <b>{p.draftReportCount ?? 0}</b>건
              </span>
            </div>
            <div className="pj-card-draft">
              {p.latestDraft ? `최근 초안: ${p.latestDraft.title}` : '작성 중인 보고서 없음'}
            </div>
          </Link>
        ))}
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">프로젝트</h1>
          <p className="page-desc">업무를 프로젝트로 묶고, 완료 기록을 모아 통합 보고서를 만듭니다.</p>
        </div>
        {isLeader && !personal && (
          <button type="button" className="btn-primary btn-inline" onClick={() => setCreating(true)}>
            <IconPlus size={16} />새 프로젝트
          </button>
        )}
      </div>
      {content}
      {creating && (
        <ProjectsFormModal
          title="새 프로젝트"
          submitLabel="만들기"
          onClose={() => setCreating(false)}
          onSubmit={async (form) => {
            const created = await createProject(groupId, user.userId, form);
            setCreating(false);
            navigate(`/projects/${created.projectId}`);
          }}
        />
      )}
    </>
  );
}
