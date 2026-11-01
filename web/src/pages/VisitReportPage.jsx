import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { api } from '../api/client.js';
import { normalizeStatus } from '../utils/taskStatus.js';
import { LoadingBlock } from '../components/Loading.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';

// Existing records use the existing report editor, preserving their photos and revision.
export default function VisitReportPage() {
  const { taskId } = useParams(), { user } = useAuth(), { groupId } = useGroup();
  const navigate = useNavigate();
  const [task, setTask] = useState(null), [title, setTitle] = useState(''), [body, setBody] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setTask(null);
    Promise.all([fetchGroupTasks(groupId, user.userId), api.get(`/api/task-progress/task/${taskId}`)]).then(([tasks, record]) => {
      if (!active) return;
      const visit = tasks.find(t => String(t.taskId) === taskId && Number(t.assigneeUserId) === Number(user.userId));
      if (!visit) throw Error('담당 방문지를 찾을 수 없습니다.');
      if (record?.progressId) { navigate(`/reports/${record.progressId}/edit`, { replace: true }); return; }
      setTask(visit); setTitle(visit.detailAddress || visit.roadAddress || '현장 보고서'); setBody('');
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId, groupId, user.userId, retry, navigate]);
  async function save(e) {
    e.preventDefault(); if (lock.current || !task) return;
    lock.current = true; setBusy(true); setError('');
    try {
      // Opening a marker or editor never creates a record; save only on explicit submission.
      const latest = await api.get(`/api/task-progress/task/${taskId}`);
      if (latest?.progressId) throw Error('다른 곳에서 보고서가 등록되었습니다. 지도로 돌아가 다시 열어 주세요.');
      const saved = await api.post('/api/task-progress', {
        taskId: task.taskId, userId: user.userId, reportName: title.trim(), mainComment: body,
        latitude: task.lat, longitude: task.lng, locationAddress: task.roadAddress || '',
        progressStatus: normalizeStatus(task), fieldMemo: '', fieldPhotos: [],
      });
      if (!saved?.progressId) throw Error('저장 결과를 확인하지 못했습니다. 지도로 돌아가 보고서를 다시 확인해 주세요.');
      navigate(`/reports/${saved.progressId}/edit`, { replace: true });
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="panel padded">
    <Link to="/map">← 지도로 돌아가기</Link>
    {loading ? <LoadingBlock /> : !task ? <ErrorBlock message={error} onRetry={() => setRetry(v => v + 1)} /> : <>
      <h2 className="panel-title">{task.detailAddress || task.roadAddress}</h2><p className="field-hint">{task.roadAddress}</p>
      <form className="settings-form" onSubmit={save}>
        <label>보고서 이름<input className="input" required maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
        <label>본문<textarea className="input" rows={10} maxLength={10000} value={body} disabled={busy} onChange={e => setBody(e.target.value)} /></label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="btn-primary btn-inline" disabled={busy || !title.trim()}>{busy ? '저장 중…' : '저장'}</button>
      </form>
    </>}
  </section>;
}
