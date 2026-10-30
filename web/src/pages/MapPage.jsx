import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { fetchRegionBoundaries } from '../api/publicData.js';
import { api } from '../api/client.js';
import MapCanvas from '../components/map/MapCanvas.jsx';
import MapRegistration from '../components/map/MapRegistration.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import Modal from '../components/Modal.jsx';
import { normalizeStatus, STATUS } from '../utils/taskStatus.js';
import { personalGroup } from './GroupsPage.jsx';
import FacilityApplications from '../components/map/FacilityApplications.jsx';
export default function MapPage() {
  const {
      user
    } = useAuth(),
    {
      groupId,
      currentGroup
    } = useGroup();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({
      groupId: null,
      tasks: []
    }),
    [boundaries, setBoundaries] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  const [scope, setScope] = useState('mine'),
    [selected, setSelected] = useState(null),
    [registration, setRegistration] = useState(params.get('add') === 'public' ? 'public' : null),
    [point, setPoint] = useState(null),
    [search, setSearch] = useState(false),
    [searchResult, setSearchResult] = useState(null),
    [mode, setMode] = useState('car'),
    [sending, setSending] = useState(false),
    [handoff, setHandoff] = useState(null),
    [layerOpen, setLayerOpen] = useState(false),
    [showBoundary, setShowBoundary] = useState(true);
  const personal = personalGroup(currentGroup);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSelected(null);
    setHandoff(null);
    setPoint(null);
    setSearchResult(null);
    setBoundaries(null);
    fetchGroupTasks(groupId, user.userId).then(tasks => {
      if (active) setData({
        groupId,
        tasks: (tasks || []).map(t => ({
          ...t,
          _status: normalizeStatus(t)
        }))
      });
    }).catch(e => {
      if (active) setError(e.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    fetchRegionBoundaries(personal ? user.workSido : currentGroup?.regionSido, personal ? user.workSigungu : currentGroup?.regionSigungu, currentGroup?.regionAdmCode).then(b => {
      if (active) setBoundaries(b);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [groupId, user.userId, user.workSido, user.workSigungu, currentGroup?.regionSido, currentGroup?.regionSigungu, currentGroup?.regionAdmCode, personal, reload]);
  useEffect(() => {
    setRegistration(params.get('add')==='public'?'public':null);
  }, [groupId]);
  useEffect(() => {
    let active=true,fetching=false;
    const refresh=async()=>{
      if(fetching||document.visibilityState==='hidden')return;
      fetching=true;
      try{const rows=await fetchGroupTasks(groupId,user.userId);if(active)setData({groupId,tasks:(rows||[]).map(t=>({...t,_status:normalizeStatus(t)}))});}catch{}finally{fetching=false;}
    };
    const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[groupId,user.userId]);
  const tasks = data.groupId === groupId ? data.tasks : [];
  const visible = scope === 'mine' ? tasks.filter(t => Number(t.assigneeUserId) === Number(user.userId)) : tasks;
  const target = visible.find(t => t.taskId === selected);
  useEffect(() => {
    setSelected(null);
  }, [scope]);
  async function startGuidance() {
    setSending(true);
    setError('');
    try {
      const request = await api.post('/api/navigation-handoffs', {
        groupId,
        taskId: target.taskId,
        mode
      });
      setHandoff(request);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  return <div className="map-page map-workspace"><h1 className="page-title">지도</h1>{error && <p role="alert" className="form-error">{error}</p>}<div className="map-workspace-layout"><aside className="map-workspace-side"><section className="panel padded"><h2>방문지 등록</h2><button className="btn-secondary full-width" onClick={() => setSearch(true)}>주소 또는 장소 검색</button><div className="registration-methods">{[['pick', '지도 선택'], ['public', '공공시설물'], ['project', '프로젝트'], ['excel', '엑셀 등록'], ['photo', '사진 등록'], ['workplace', '근무지']].map(([key, label]) => <button className="btn-secondary" key={key} onClick={() => {
              setPoint(null);
              setRegistration(key);
            }}>{label}</button>)}</div>{registration === 'pick' && <p role="status">지도에서 등록할 위치를 선택하세요.</p>}</section><section className="panel map-task-panel"><div className="panel-header"><h2 className="panel-title">방문지 목록</h2><span className="panel-count">{visible.length}곳</span></div>{loading ? <p className="table-empty">불러오는 중…</p> : !visible.length ? <p className="table-empty">등록된 방문지가 없습니다.</p> : <ul className="map-task-list">{visible.map(t => <li key={t.taskId}><button className={`map-task-item${selected === t.taskId ? ' active' : ''}`} onClick={() => setSelected(t.taskId)}><span className="map-task-text"><strong>{t.detailAddress || t.roadAddress || '방문지'}</strong><span className="map-task-sub">{t.roadAddress} · {t.assigneeName}</span></span></button></li>)}</ul>}</section></aside>
    <MapCanvas key={groupId} tasks={visible} busStops={[]} aeds={[]} boundaries={boundaries} layers={{
        tasks: true,
        boundary: showBoundary
      }} selectedTaskId={selected} onSelectTask={setSelected} searchResult={point || searchResult} dataReady={!loading} onPickLocation={registration === 'pick' ? p => {
        setPoint(p);
        setRegistration('manual');
      } : undefined}>
      <div className="map-scope-control segmented" aria-label="방문지 담당 선택"><button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>내 담당</button>{!personal && <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>팀 전체</button>}</div><div className="map-display-control"><button className="btn-secondary" aria-expanded={layerOpen} onClick={() => setLayerOpen(v => !v)}>지도 표시</button>{layerOpen && <label className="panel padded"><input type="checkbox" checked={showBoundary} onChange={e => setShowBoundary(e.target.checked)} /> 행정동 경계</label>}</div>
      {target && Number(target.assigneeUserId) === Number(user.userId) && target._status !== STATUS.COMPLETE && <div className="map-guidance-control"><select className="input" aria-label="안내 방식" value={mode} onChange={e => setMode(e.target.value)}><option value="car">차량 안내</option><option value="walk">도보 안내</option></select><button className="btn-primary btn-inline" disabled={sending} onClick={startGuidance}>{sending ? '연동 중…' : '안내 시작'}</button></div>}
    </MapCanvas></div>{params.get('application') && <FacilityApplications initialId={params.get('application')} onClose={() => setParams({})} />} {search && <PlacePicker onClose={() => setSearch(false)} onPick={p => {
      setSearch(false);
      setPoint(p);
      setSearchResult(p);
      setRegistration('manual');
    }} />}{registration && registration !== 'pick' && <MapRegistration key={`${groupId}:${registration}`} method={registration} point={point} groupId={groupId} user={user} boundaries={boundaries} onClose={() => {
      setRegistration(null);
      setPoint(null);
      setParams({});
    }} onSaved={() => {
      setRegistration(null);
      setPoint(null);
      setReload(v => v + 1);
    }} />}{handoff && <Modal title="앱 안내 연동" onClose={() => setHandoff(null)}><p>앱에 연동되었습니다. 같은 계정의 핀워크 앱을 열어주세요.</p><p>{mode === 'car' ? '차량' : '도보'} 안내 요청은 10분 동안 유효합니다.</p><a className="btn-primary btn-inline" href="pang3://navigation">이 기기에서 앱 열기</a></Modal>}</div>;
}
