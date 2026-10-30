import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import { fetchGroupMembers } from '../../api/groups.js';
import { fetchGroupTasks } from '../../api/tasks.js';
import { fetchProjects } from '../../api/projects.js';
import { createTransfer } from '../../api/transfers.js';
import { normalizeStatus, STATUS } from '../../utils/taskStatus.js';
export default function NewTransferModal({
  groupId,
  user,
  onClose,
  onCreated
}) {
  const [members, setMembers] = useState([]),
    [tasks, setTasks] = useState([]),
    [projects, setProjects] = useState([]),
    [recipient, setRecipient] = useState(''),
    [dong, setDong] = useState(''),
    [project, setProject] = useState(''),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([fetchGroupMembers(groupId, user.userId), fetchGroupTasks(groupId, user.userId), fetchProjects(groupId, user.userId)]).then(([m, t, p]) => {
      if (!active) return;
      setMembers(m.filter(v => Number(v.userId) !== Number(user.userId)));
      setTasks(t.filter(v => Number(v.assigneeUserId) === Number(user.userId) && normalizeStatus(v) !== STATUS.COMPLETE));
      setProjects(p);
    }).catch(e => {
      if (active) setError(e.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [groupId, user.userId]);
  const filtered = tasks.filter(t => (!dong || t.adminDong === dong) && (!project || (t.projectIds || []).some(id => String(id) === project)) && (!query || `${t.detailAddress} ${t.roadAddress}`.includes(query)));
  const grouped = useMemo(() => Object.groupBy ? Object.groupBy(filtered, t => t.adminDong || '행정동 미지정') : filtered.reduce((a, t) => {
    (a[t.adminDong || '행정동 미지정'] ??= []).push(t);
    return a;
  }, {}), [tasks, dong, project, query]);
  function toggle(ids) {
    setSelected(old => ids.every(id => old.includes(id)) ? old.filter(id => !ids.includes(id)) : [...new Set([...old, ...ids])]);
  }
  async function send() {
    setBusy(true);
    setError('');
    try {
      const first = tasks.find(t => selected.includes(t.taskId));
      await createTransfer(groupId, {
        senderUserId: user.userId,
        recipientUserId: Number(recipient),
        taskIds: selected,
        sido: first.sido || '',
        sigungu: first.sigungu || '',
        adminDong: first.adminDong || ''
      });
      onCreated();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return <Modal title="새 이관 요청" onClose={() => !busy && onClose()} footer={<><button className="btn-secondary" disabled={busy} onClick={onClose}>취소</button><button className="btn-primary btn-inline" disabled={loading || busy || !recipient || !selected.length} onClick={send}>이관 요청 ({selected.length}건)</button></>}>{error && <p className="form-error" role="alert">{error}</p>}{loading ? <p>불러오는 중…</p> : <><label className="field">받을 팀원<select className="input" value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">팀원을 선택하세요</option>{members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label><div className="filter-row"><input className="input" placeholder="방문지 검색" value={query} onChange={e => setQuery(e.target.value)} /><select className="input" aria-label="행정동" value={dong} onChange={e => setDong(e.target.value)}><option value="">전체 행정동</option>{[...new Set(tasks.map(t => t.adminDong).filter(Boolean))].map(d => <option key={d}>{d}</option>)}</select><select className="input" aria-label="프로젝트" value={project} onChange={e => setProject(e.target.value)}><option value="">전체 프로젝트</option>{projects.map(p => <option value={p.projectId} key={p.projectId}>{p.name}</option>)}</select></div>{!filtered.length && <p className="table-empty">이관할 수 있는 방문지가 없습니다.</p>}{Object.entries(grouped).map(([area, rows]) => <section key={area}><label className="check-row"><input type="checkbox" checked={rows.every(t => selected.includes(t.taskId))} onChange={() => toggle(rows.map(t => t.taskId))} /><strong>{area} · {rows.length}건</strong></label>{rows.map(t => <label className="check-row" key={t.taskId}><input type="checkbox" checked={selected.includes(t.taskId)} onChange={() => toggle([t.taskId])} /><span>{t.detailAddress || t.roadAddress}<small>{t.roadAddress}</small></span></label>)}</section>)}</>}</Modal>;
}
