import { useEffect, useState } from 'react';
import { fetchProjects } from '../../api/projects.js';
import AppIcon from '../AppIcon.jsx';
import Modal from '../Modal.jsx';
export default function ProjectPicker({ userId, groupId, personal, selectedId, onPick, onClose }) {
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (personal || !groupId) return;
    let active = true; setBusy(true);
    fetchProjects(groupId, userId).then(data => { if (active) setRows(data || []); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [groupId, userId, personal]);
  return <Modal className="app-map-modal" title="프로젝트 선택" onClose={onClose}>{busy && <p role="status">불러오는 중…</p>}{rows.map(p => <button className="app-picker-row" key={p.projectId} aria-pressed={String(p.projectId) === String(selectedId)} onClick={() => onPick(p)}><span>{p.name}</span>{String(p.projectId) === String(selectedId) && <AppIcon name="checkmark" />}</button>)}{!busy && !rows.length && <p className="field-hint">{error || '등록된 프로젝트 없음'}</p>}</Modal>;
}
