import useLiveRevision from '../useLiveRevision.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { fetchProjects } from '../../api/projects.js';
import { koreaDay, regionAt, taskTypes } from '../../lib/mapRegistration.js';
import Modal from '../Modal.jsx';
import AppIcon from '../AppIcon.jsx';
import PhotoRegistration from './PhotoRegistration.jsx';
import ExcelRegistration from './ExcelRegistration.jsx';
import ProjectRegistration from './ProjectRegistration.jsx';
import ProjectPicker from './ProjectPicker.jsx';
import PlacePicker from '../PlacePicker.jsx';
const titles = { manual: '방문지 추가', project: '프로젝트', excel: '엑셀 등록', photo: '사진으로 등록', workplace: '근무지 등록' };
function InlineRegistration({ title, onClose, children }) {
  return <section className="app-map-sheet app-manual-registration" aria-label={title}><div className="app-sheet-heading"><strong>{title}</strong><button className="icon-button" type="button" aria-label="방문지 추가 닫기" onClick={onClose}><AppIcon name="close"/></button></div>{children}</section>;
}
export default function MapRegistration({ inline = false, method, point, groupId, user, personal, onClose, onSaved, onShowPlaces, onUpdatedUser }) {
  const liveRevision=useLiveRevision(['projects']);
  const [projects, setProjects] = useState([]), [project, setProject] = useState(null);
  const [name, setName] = useState(point?.label ?? point?.address ?? ''), [task, setTask] = useState('');
  const [coords, setCoords] = useState(point || null), [picker, setPicker] = useState(false), [projectPicker, setProjectPicker] = useState(false), [taskPicker, setTaskPicker] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { if (!(method === 'project' || inline && method === 'manual') || personal) return; let active = true; fetchProjects(groupId, user.userId).then(p => { if (active) setProjects(p); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [method, inline, personal, groupId, user.userId,liveRevision]);
  const close = () => { if (!lock.current && !busy) onClose(); };
  useEffect(() => {
    if (!inline) return;
    const escape = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [inline, busy, onClose]);
  async function submit(e) {
    e.preventDefault(); if (lock.current || !coords) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (method === 'workplace') {
        const updated = await api.patch(`/api/users/${user.userId}/workplace`, { workplaceAddress: coords.address || coords.label, workplaceLat: coords.lat, workplaceLng: coords.lng });
        onUpdatedUser?.(updated); onSaved();
      } else {
        const region = await regionAt(coords);
        const row = await api.post('/api/locations', { createdByUserId: user.userId, groupId, detailAddress: name.trim(), roadAddress: coords.address || '', lat: coords.lat, lng: coords.lng, status: 'pending', task, projectId: project?.projectId ?? null, workDate: koreaDay(), scheduledDate: koreaDay(), ...region });
        onSaved([row]);
      }
    } catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); }
  }
  const Layout = inline ? InlineRegistration : Modal;
  return <><Layout className={`app-map-modal${['photo', 'excel'].includes(method) ? ' registration-screen-dialog' : method === 'manual' ? ' visit-registration-dialog' : ''}`} wide={method === 'excel'} title={titles[method]} onClose={close}>
    {error && <p className="form-error" role="alert">{error}</p>}
    {method === 'photo' ? <PhotoRegistration user={user} groupId={groupId} onBusyChange={setBusy} onSaved={onSaved} /> : method === 'excel' ? <ExcelRegistration user={user} groupId={groupId} onBusyChange={setBusy} onSaved={onSaved} /> : method === 'project' ? <ProjectRegistration projects={projects} setProjects={setProjects} user={user} groupId={groupId} personal={personal} onBusyChange={setBusy} onSaved={rows => onSaved(rows, true)} onShowPlaces={onShowPlaces} /> : <form className="visit-registration-form app-form" onSubmit={submit}>
      {method === 'workplace' ? <><button type="button" className="workplace-field" disabled={busy} onClick={() => setPicker(true)}><AppIcon name="home-outline" /><span>{coords?.address || '주소를 검색해 근무지를 등록하세요'}<small>복귀 안내에 사용할 위치입니다.</small></span><AppIcon name="chevron-forward" /></button><button className="btn-primary" disabled={busy || !coords}>{busy ? '저장 중...' : '근무지 저장'}</button><button type="button" className="text-button" disabled={busy} onClick={close}>닫기</button></> : <>
      <label className="app-input-icon"><AppIcon name="location-outline" /><input className="input" aria-label="방문지 이름" placeholder="방문지 이름" required disabled={busy} value={name} onChange={e => setName(e.target.value)} /></label>
      {inline ? <div className="visit-registration-options">
        <select className="input" aria-label="프로젝트 선택" value={project?.projectId || ''} disabled={busy || personal} onChange={e => setProject(projects.find(p => String(p.projectId) === e.target.value) || null)}><option value="">프로젝트 선택</option>{projects.filter(p => p.status !== 'ARCHIVED').map(p => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select>
        <select className="input" aria-label="업무유형 선택" value={task} disabled={busy} onChange={e => setTask(e.target.value)}><option value="">업무유형 선택</option>{taskTypes.map(t => <option key={t}>{t}</option>)}</select>
      </div> : <div className="visit-registration-options"><button className="input app-select" type="button" aria-label="프로젝트 선택" disabled={busy} onClick={() => setProjectPicker(true)}><AppIcon name="folder-outline" /><span>{project?.name || '프로젝트 선택'}</span><AppIcon name="chevron-down" /></button><button className="input app-select" type="button" aria-label="업무유형 선택" disabled={busy} onClick={() => setTaskPicker(true)}><AppIcon name="pricetag-outline" /><span>{task || '업무유형'}</span><AppIcon name="chevron-down" /></button></div>}
      <button className="btn-primary" disabled={busy || !coords || !name.trim()}>{busy ? '등록 중...' : '방문지 추가'}</button></>}
    </form>}
  </Layout>
  {picker && <PlacePicker title="근무지 주소 검색" onClose={() => setPicker(false)} onPick={p => { setCoords(p); setPicker(false); }} />}
  {projectPicker && <ProjectPicker userId={user.userId} groupId={groupId} personal={personal} selectedId={project?.projectId} onClose={() => setProjectPicker(false)} onPick={p => { setProject(p); setProjectPicker(false); }} />}
  {taskPicker && <Modal className="app-map-modal" title="업무유형" onClose={() => setTaskPicker(false)}>{['', ...taskTypes].map(t => <button className="app-picker-row" key={t} onClick={() => { setTask(t); setTaskPicker(false); }}>{t || '선택 안 함'}</button>)}</Modal>}
  </>;
}
