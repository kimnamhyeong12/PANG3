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
    [viewMode, setViewMode] = useState('dong'),
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
  const filtered = tasks.filter(t => (!project || (t.projectIds || []).some(id => String(id) === project)) && (!query || `${t.detailAddress} ${t.roadAddress}`.includes(query)));
  const grouped = useMemo(() => {
    if (viewMode === 'project') return [...projects.map(p => ({ key: `project:${p.projectId}`, title: p.name, rows: filtered.filter(t => (t.projectIds || []).some(id => String(id) === String(p.projectId))) })), { key: 'none', title: '프로젝트 미지정', rows: filtered.filter(t => !t.projectIds?.length) }].filter(group => group.rows.length);
    return Object.entries(filtered.reduce((groups, task) => { (groups[task.adminDong || '행정동 미지정'] ??= []).push(task); return groups; }, {})).map(([title, rows]) => ({ key: title, title, rows }));
  }, [tasks, project, query, viewMode, projects]);
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
  return <Modal title="새 이관 요청" onClose={() => !busy && onClose()} footer={<><button className="btn-secondary" disabled={busy} onClick={onClose}>취소</button><button className="btn-primary btn-inline" disabled={loading || busy || !recipient || !selected.length} onClick={send}>이관 요청 ({selected.length}건)</button></>}>{error && <p className="form-error" role="alert">{error}</p>}{loading ? <p>불러오는 중…</p> : <><label className="field">받을 팀원<select className="input" value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">팀원을 선택하세요</option>{members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label><div className="filter-row"><input className="input" placeholder="방문지 검색" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="segmented transfer-group-mode"><button className={viewMode === 'dong' ? 'active' : ''} onClick={() => { setViewMode('dong'); setProject(''); }}>행정동별</button><button className={viewMode === 'project' ? 'active' : ''} onClick={() => { setViewMode('project'); setProject(''); }}>프로젝트별</button></div>{!filtered.length && <p className="table-empty">이관할 수 있는 방문지가 없습니다.</p>}{grouped.map(({key, title: area, rows}) => <section key={key}><label className="check-row"><input type="checkbox" checked={rows.every(t => selected.includes(t.taskId))} onChange={() => toggle(rows.map(t => t.taskId))} /><strong>{area} · {rows.length}건</strong></label>{rows.map(t => <label className="check-row" key={t.taskId}><input type="checkbox" checked={selected.includes(t.taskId)} onChange={() => toggle([t.taskId])} /><span>{t.detailAddress || t.roadAddress}<small>{t.roadAddress}</small></span></label>)}</section>)}</>}</Modal>;
}
