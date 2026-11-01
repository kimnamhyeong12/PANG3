import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { fetchRegionBoundaries } from '../api/publicData.js';
import { api } from '../api/client.js';
import MapCanvas from '../components/map/MapCanvas.jsx';
import MapCenterPin from '../components/map/MapCenterPin.jsx';
import MapRegistration from '../components/map/MapRegistration.jsx';
import FacilityApplications from '../components/map/FacilityApplications.jsx';
import PublicFacilities from '../components/map/PublicFacilities.jsx';
import PlaceSearch from '../components/map/PlaceSearch.jsx';
import AppIcon from '../components/AppIcon.jsx';
import Modal from '../components/Modal.jsx';
import { normalizeStatus, STATUS } from '../utils/taskStatus.js';
import { personalGroup } from './GroupsPage.jsx';
import { addressAt, koreaDay, validCoordinates } from '../lib/mapRegistration.js';
import { applyVisitRecommendation, recommendationPayload } from '../lib/visitRecommendations.js';
import { coordinateInput } from '../../../frontend/utils/coordinateInput.js';
import { assignmentKey, splitWorkPlan } from '../../../frontend/utils/workPlan.js';
const METHODS = [['pick', '지도 선택', 'map-outline'], ['public', '공공시설물', 'business-outline'], ['project', '프로젝트', 'folder-outline'], ['excel', '엑셀 등록', 'grid-outline'], ['photo', '사진 등록', 'image-outline'], ['workplace', '근무지', 'home-outline']];
export default function MapPage() {
  const { groupId } = useGroup(); const { user } = useAuth();
  return <MapWorkspace key={`${user.userId}:${groupId}`} />;
}
function MapWorkspace() {
  const { user, updateUser } = useAuth(), { groupId, currentGroup } = useGroup();
  const [params, setParams] = useSearchParams(), personal = personalGroup(currentGroup);
  const [tasks, setTasks] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0), [boundaries, setBoundaries] = useState(null);
  const [registration, setRegistration] = useState(params.get('add') === 'public' ? 'public' : null), [application, setApplication] = useState(Boolean(params.get('application'))), [searchOpen, setSearchOpen] = useState(false), [results, setResults] = useState([]), [resultQuery, setResultQuery] = useState('');
  const [point, setPoint] = useState(null), [pickCenter, setPickCenter] = useState(null), [pickAddress, setPickAddress] = useState(''), [coordinateText, setCoordinateText] = useState({ lat: '', lng: '' }), [coordinateFocus, setCoordinateFocus] = useState(false), [coordinateTarget, setCoordinateTarget] = useState(null), [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(null), [selected, setSelected] = useState(null), [searchResult, setSearchResult] = useState(null), [focusRequest, setFocusRequest] = useState(null), [projectPlaces, setProjectPlaces] = useState([]);
  const [publicMap, setPublicMap] = useState({ items: [], chosen: [] }), [publicPick, setPublicPick] = useState(null);
  const [pendingOpen, setPendingOpen] = useState(false), [pendingSelected, setPendingSelected] = useState([]);
  const planKey = `pinwork:map-plan:${user.userId}:${groupId}`;
  const [choices, setChoices] = useState(() => { try { return JSON.parse(localStorage.getItem(planKey) || '{}'); } catch { return {}; } });
  const [day, setDay] = useState(koreaDay());
  const [mode, setMode] = useState('car'), [position, setPosition] = useState(null), [locating, setLocating] = useState(false), [locateToken, setLocateToken] = useState(0);
  const [optimized, setOptimized] = useState([]), [optimizing, setOptimizing] = useState(false);
  const [preview, setPreview] = useState(null), [previewRetry, setPreviewRetry] = useState(0);
  const [sending, setSending] = useState(false), [handoff, setHandoff] = useState(null), [remove, setRemove] = useState(null), [notice, setNotice] = useState(null);
  const [routeCardHeight, setRouteCardHeight] = useState(0);
  const routeCardRef = useRef(null);
  const live = useRef(true), geoWatch = useRef(null), routeSeq = useRef(0), pickSeq = useRef(0), actionLock = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; routeSeq.current++; pickSeq.current++; if (geoWatch.current != null) navigator.geolocation.clearWatch(geoWatch.current); }; }, []);
  useEffect(() => { const timer = setInterval(() => setDay(koreaDay()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { let active = true; setLoading(true); fetchGroupTasks(groupId, user.userId).then(rows => { if (active) setTasks((rows || []).map(t => ({ ...t, id: t.taskId ?? t.id, taskId: t.taskId ?? t.id, _status: normalizeStatus(t), status: normalizeStatus(t) }))); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [groupId, user.userId, reload]);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState !== 'hidden') setReload(v => v + 1); }, 15000); const refresh = () => setReload(v => v + 1); window.addEventListener('focus', refresh); return () => { clearInterval(timer); window.removeEventListener('focus', refresh); }; }, []);
  useEffect(() => { let active = true; fetchRegionBoundaries(personal ? user.workSido : currentGroup?.regionSido, personal ? user.workSigungu : currentGroup?.regionSigungu, currentGroup?.regionAdmCode).then(data => { if (active) setBoundaries(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [personal, user.workSido, user.workSigungu, currentGroup?.regionSido, currentGroup?.regionSigungu, currentGroup?.regionAdmCode]);
  function locate(recenter = true) {
    if (!navigator.geolocation) { setError('이 브라우저는 현재 위치를 지원하지 않습니다.'); return; }
    setLocating(true);
    if (geoWatch.current != null) navigator.geolocation.clearWatch(geoWatch.current);
    geoWatch.current = navigator.geolocation.watchPosition(p => { if (!live.current) return; setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setLocating(false); if (recenter) { setLocateToken(v => v + 1); recenter = false; } }, () => { if (live.current) { setLocating(false); setError('현재 위치를 확인하지 못했습니다. 위치 권한과 GPS를 확인해 주세요.'); } }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  }
  useEffect(() => { let active = true; if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(p => { if (active && p.state !== 'denied') locate(false); }).catch(() => {}); else locate(false); return () => { active = false; }; }, []);
  const mine = useMemo(() => tasks.filter(t => Number(t.assigneeUserId) === Number(user.userId)), [tasks, user.userId]);
  const plan = useMemo(() => splitWorkPlan(mine, choices, day, [], { autoAddToday: true }), [mine, choices, day]);
  const membership = JSON.stringify(plan.map.map(t => [t.taskId, t.status, t.lat, t.lng]));
  const visits = useMemo(() => applyVisitRecommendation(plan.map, optimized).map((t, index) => ({ ...t, markerNumber: t.status === 'complete' ? null : t.markerNumber || index + 1 })), [plan.map, optimized]);
  const workplace = validCoordinates({ lat: user.workplaceLat, lng: user.workplaceLng }) ? { taskId: 'workplace', lat: Number(user.workplaceLat), lng: Number(user.workplaceLng), detailAddress: '근무지 복귀', roadAddress: user.workplaceAddress, isReturnLocation: true } : null;
  const target = selected === 'workplace' ? workplace : visits.find(t => t.taskId === selected);
  const previewOrigin = useRef(position);
  previewOrigin.current = position;
  const previewEnabled = Boolean(target && !registration && !results.length && !searchOpen);
  const originReady = validCoordinates(position);
  const previewKey = JSON.stringify([previewEnabled, target?.taskId, target?.lat, target?.lng, mode, originReady, locateToken, previewRetry]);
  const visiblePreview = preview?.key === previewKey ? preview : null;
  useEffect(() => {
    if (!previewEnabled || !validCoordinates(target)) return;
    if (!originReady) {
      setPreview({ key: previewKey, status: 'location-required', message: '현재 위치를 확인하면 경로·거리·시간을 볼 수 있습니다.' });
      return;
    }
    let active = true;
    setPreview({ key: previewKey, status: 'loading' });
    api.post('/api/routes/segment', { start: previewOrigin.current, end: target, transportMode: mode }).then(data => {
      const segment = data?.segments?.[0];
      const path = (data?.path || segment?.path || []).filter(validCoordinates).map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
      const distance = data?.totalDistance ?? segment?.totalDistance ?? segment?.distance;
      const duration = data?.totalDuration ?? segment?.totalDuration ?? segment?.duration;
      if (path.length < 2 || distance == null || duration == null || distance === '' || duration === '' || !Number.isFinite(Number(distance)) || !Number.isFinite(Number(duration)) || Number(distance) < 0 || Number(duration) < 0) throw Error('경로의 거리·시간 정보를 확인하지 못했습니다.');
      if (active) setPreview({ key: previewKey, status: 'ready', path, distance: Number(distance), duration: Number(duration) });
    }).catch(e => { if (active) setPreview({ key: previewKey, status: 'error', message: e.message }); });
    return () => { active = false; };
  }, [previewKey]);
  useEffect(() => {
    const node = routeCardRef.current;
    if (!node) { setRouteCardHeight(0); return; }
    const measure = () => setRouteCardHeight(node.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    return () => observer.disconnect();
  }, [Boolean(target), registration, results.length]);
  useEffect(() => {
    const back = e => {
      if (e.key !== 'Escape' || document.querySelector('.modal-backdrop')) return;
      if (pendingOpen) setPendingOpen(false);
      else if (results.length) { setResults([]); setSelected(null); } else if (registration) { setRegistration(null); setParams({}); } else setSelected(null);
    };
    document.addEventListener('keydown', back); return () => document.removeEventListener('keydown', back);
  }, [pendingOpen, results.length, registration]);
  const reset = () => { setPendingOpen(false); setSearchOpen(false); setResults([]); setProjectPlaces([]); setSelected(null); setSearchResult(null); setPoint(null); };
  function openRegistration(key) {
    reset();
    if (key === 'workplace' && workplace) { setRegistration(null); setSelected('workplace'); return; }
    setRegistration(key);
    if (key === 'pick') { setCoordinateText({ lat: '', lng: '' }); setPickAddress(''); setCoordinateTarget(null); }
  }
  const focus = rows => { const points = rows.filter(validCoordinates); if (points.length) setFocusRequest({ points, token: Date.now() + Math.random() }); };
  const handlePublicItems = useCallback((items, chosen) => { setPublicMap({ items, chosen }); }, []);
  useEffect(() => { if (publicMap.items.length) focus(publicMap.items); }, [publicMap.items]);
  useEffect(() => {
    if (registration !== 'pick' || !pickCenter) return;
    if (!coordinateFocus) setCoordinateText({ lat: pickCenter.lat.toFixed(6), lng: pickCenter.lng.toFixed(6) });
    const id = ++pickSeq.current; setPickAddress('주소 확인 중…'); const timer = setTimeout(() => addressAt(pickCenter).then(a => { if (id === pickSeq.current) setPickAddress(a || '주소 확인 불가'); }).catch(e => { if (id === pickSeq.current) { setPickAddress('주소 확인 불가'); setError(e.message); } }), 250);
    return () => { clearTimeout(timer); pickSeq.current++; };
  }, [registration, pickCenter?.lat, pickCenter?.lng]);
  function editCoordinate(key, value) { const text = { ...coordinateText, [key]: value }; setCoordinateText(text); const p = coordinateInput(text.lat, text.lng); if (p) { setPickCenter(p); setCoordinateTarget({ ...p, token: Date.now() }); } }
  useEffect(() => {
    const seq = ++routeSeq.current; setOptimized([]); setOptimizing(false);
    if (!position || plan.map.filter(t => t.status !== 'complete').length < 2) return;
    const timer = setTimeout(async () => { setOptimizing(true); try { const payload = recommendationPayload(plan.map, user.userId, position, mode, groupId); const data = await api.post('/api/routes/order', payload); if (live.current && seq === routeSeq.current) { setOptimized(data.optimizedLocations || []); if (data.notice) setError(data.notice); } } catch (e) { if (live.current && seq === routeSeq.current) setError(e.message); } finally { if (live.current && seq === routeSeq.current) setOptimizing(false); } }, 300);
    return () => { clearTimeout(timer); routeSeq.current++; };
  }, [membership, mode, Boolean(position)]);
  async function sendGuidance() {
    if (!target || actionLock.current) return;
    actionLock.current = true; setSending(true); setError('');
    try {
      const body = target.isReturnLocation ? { groupId, destination: 'workplace', mode } : { groupId, taskId: target.taskId, mode };
      const value = await api.post('/api/navigation-handoffs', body);
      if (!value?.pending || !value.requestId) throw Error('휴대폰 앱 연동 요청을 확인하지 못했습니다. 다시 시도해 주세요.');
      if (live.current) setHandoff(value);
    } catch (e) { if (live.current) setError(e.message); }
    finally { actionLock.current = false; if (live.current) setSending(false); }
  }
  async function moveVisit(task, point) {
    if (actionLock.current || !validCoordinates(point)) return;
    actionLock.current = true;
    const previous = { lat: task.lat, lng: task.lng };
    const apply = p => setTasks(old => old.map(t => t.taskId === task.taskId ? { ...t, ...p } : t));
    apply(point);
    try {
      const report = await api.get(`/api/task-progress/task/${task.taskId}`);
      let address = report?.locationAddress || task.roadAddress || task.detailAddress || '';
      try { address = await addressAt(point) || address; } catch {}
      const saved = await api.patch(`/api/task-progress/task/${task.taskId}/location`, { latitude: point.lat, longitude: point.lng, locationAddress: address, ...(report?.progressId ? { progressId: report.progressId, expectedRevision: report.revision } : {}) });
      if (live.current) apply({ lat: Number(saved.taskLatitude ?? point.lat), lng: Number(saved.taskLongitude ?? point.lng), roadAddress: address });
    } catch (e) { if (live.current) { apply(previous); setError(`위치 변경 실패 · ${e.message} · 원래 위치로 되돌렸습니다.`); } }
    finally { actionLock.current = false; }
  }
  function onSaved(rows = [], keepOpen = false) { if (!live.current) return; setReload(v => v + 1); if (rows.length) { const next = { ...choices }; rows.forEach(r => { if (Number(r.assigneeUserId) === Number(user.userId)) next[assignmentKey({ ...r, id: r.taskId ?? r.id })] = day; }); localStorage.setItem(planKey, JSON.stringify(next)); setChoices(next); focus(rows); } if (!keepOpen) { if (registration === 'manual' && rows.length) setNotice({ title: '방문지 등록 완료', message: `${rows[0].detailAddress || '방문지'}을(를) 오늘 업무에 추가했습니다.` }); if (registration === 'public' && rows.length) setNotice({ title: '방문지 등록 완료', message: `${rows.length}건을 방문지로 등록했습니다.` }); setRegistration(null); setPoint(null); setParams({}); } }
  const resultPins = results.map((p, i) => ({ ...p, taskId: `search:${p.id || i}`, detailAddress: p.label, _status: 'pending', markerNumber: i + 1 }));
  const mapTasks = registration === 'public' ? publicMap.items.map(i => ({ ...i, taskId: i.id, _status: 'pending' })) : results.length ? resultPins : projectPlaces.length ? projectPlaces : visits;
  const formatDistance = n => n == null ? '—' : n < 1000 ? `${Math.round(n)}m` : `${(n / 1000).toFixed(1)}km`;
  const formatDuration = seconds => { const minutes = Math.round(seconds / 60); return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`; };
  return <div className={`app-map-workspace${registration === 'public' ? ' is-public' : ''}`}>
    {error && <div className="map-feedback" role="status">{error}<button type="button" aria-label="알림 닫기" onClick={() => setError('')}>×</button></div>}
    <div className="app-map-layout">
      <aside className="app-map-sidebar" aria-label="방문지 등록 및 내 방문지">
        <section className="panel app-map-registration-panel">
          <button className="app-map-search input" aria-label="주소 또는 장소 검색" onClick={() => { reset(); setRegistration(null); setSearchOpen(true); }}><span>{resultQuery && results.length ? resultQuery : '주소 또는 장소 검색'}</span><AppIcon name="search" /></button>
          <div className="registration-methods">{METHODS.map(([key, label, icon]) => <button className="btn-secondary" key={key} onClick={() => openRegistration(key)}><span className="registration-icon"><AppIcon name={icon} /></span><span>{label}</span></button>)}</div>
          {draft && <button className="text-button" onClick={() => { reset(); setPoint(draft.point); setRegistration('manual'); }}><AppIcon name="create-outline" />작성 이어하기</button>}
        </section>
        <section className="panel app-map-visit-panel"><div className="panel-header"><h2 className="panel-title">내 방문지 목록</h2><span className="panel-count">{visits.length}곳</span></div><div className="app-map-visit-list" tabIndex={0} aria-label="내 방문지 목록">{visits.map(t => <div className="app-map-visit" key={t.taskId}><button onClick={() => { reset(); setRegistration(null); setSelected(t.taskId); }}><span className={`app-visit-number ${t.status}`}>{t.markerNumber || '✓'}</span><span><strong>{t.detailAddress || t.roadAddress || '이름 없음'}</strong><small>{t.workDate ? `업무일 ${String(t.workDate).slice(5, 10).replace('-', '.')}` : ''}{(t.taskCategory || t.task) ? ` · ${t.taskCategory || t.task}` : ''}</small></span></button>{t.status === STATUS.PENDING && <button className="text-button" aria-label={`${t.detailAddress || '방문지'} 삭제`} onClick={() => setRemove(t)}>삭제</button>}</div>)}{loading && <p role="status" className="table-empty">불러오는 중…</p>}{!loading && !visits.length && <p className="table-empty">등록된 방문지가 없습니다.</p>}</div></section>
      </aside>
    <MapCanvas tasks={mapTasks} busStops={[]} aeds={[]} boundaries={registration === 'public' ? boundaries : null} layers={{ tasks: true, boundary: registration === 'public' }} selectedTaskId={registration === 'public' ? publicMap.chosen.at(-1) : selected} onSelectTask={id => { if (registration === 'public') { if (id != null) setPublicPick({ id, token: Date.now() + Math.random() }); } else if (results.length) { const p = resultPins.find(p => p.taskId === id); if (p) { setSelected(id); focus([p]); } } else setSelected(id); }} searchResult={registration === 'pick' ? null : point || searchResult} dataReady={!loading} showTaskInfo={false} currentPosition={position} locateToken={locateToken} focusRequest={focusRequest} centerRequest={coordinateTarget} previewPath={visiblePreview?.path} onMarkerDrag={!registration && !results.length && !projectPlaces.length ? moveVisit : undefined} onCenterChange={registration === 'pick' ? setPickCenter : undefined}>
      <div className="app-map-travel segmented" aria-label="이동 수단">{['car', 'walk'].map(m => <button key={m} className={mode === m ? 'active' : ''} aria-label={m === 'car' ? '차량 이동' : '도보 이동'} aria-pressed={mode === m} onClick={() => setMode(m)}><AppIcon name={m === 'car' ? 'car-outline' : 'walk-outline'} /></button>)}</div>
      {registration === 'public' && <PublicFacilities user={user} group={currentGroup} personal={personal} boundaries={boundaries} onClose={() => { setRegistration(null); setParams({}); }} onApplication={() => setApplication(true)} onMapItems={handlePublicItems} onSaved={onSaved} selectedId={publicPick} />}
      {registration === 'pick' && <><div className="app-selection-hint">지도를 움직여 위치를 선택하세요</div><MapCenterPin /><section className="app-map-sheet app-selection-sheet"><strong>{pickAddress || '주소 확인 중…'}</strong><div className="visit-registration-options">{[['lat', '위도'], ['lng', '경도']].map(([key, label]) => <label key={key}>{label}<input className="input" aria-label={`${label} 직접 입력`} inputMode="decimal" value={coordinateText[key]} onFocus={() => setCoordinateFocus(true)} onBlur={() => setCoordinateFocus(false)} onChange={e => editCoordinate(key, e.target.value)} /></label>)}</div><div className="action-row"><button className="btn-secondary" disabled={picking} onClick={() => setRegistration(null)}>취소</button><button className="btn-primary" disabled={!pickCenter || picking || !coordinateInput(coordinateText.lat, coordinateText.lng)} onClick={async () => { setPicking(true); try { const address = await addressAt(pickCenter); if (live.current) { setPoint({ ...pickCenter, address, label: address || '지도 선택 위치' }); setDraft(null); setRegistration('manual'); } } catch (e) { setError(e.message); } finally { if (live.current) setPicking(false); } }}>{picking ? '확인 중…' : '이 위치 선택'}</button></div></section></>}
      {!registration && !results.length && !searchOpen && !pendingOpen && <button className="app-pending-button btn-secondary" style={{ bottom: routeCardHeight + 23 }} onClick={() => setPendingOpen(true)}>미처리 업무 {plan.pending.length}건</button>}
      {pendingOpen && <section className="app-map-sheet"><div className="app-sheet-heading"><strong>미처리 업무 {plan.pending.length}건</strong><button className="icon-button" aria-label="미처리 업무 닫기" onClick={() => setPendingOpen(false)}><AppIcon name="close" /></button></div><button className="text-button" onClick={() => setPendingSelected(pendingSelected.length === plan.pending.length ? [] : plan.pending.map(t => t.taskId))}>{pendingSelected.length}건 선택 · {pendingSelected.length === plan.pending.length && plan.pending.length ? '전체 해제' : '전체 선택'}</button><div className="app-sheet-scroll">{plan.pending.map(t => <label className="check-row" key={t.taskId}><input type="checkbox" checked={pendingSelected.includes(t.taskId)} onChange={() => setPendingSelected(old => old.includes(t.taskId) ? old.filter(id => id !== t.taskId) : [...old, t.taskId])} /><span>{t.detailAddress || t.roadAddress}<small>{t.adminDong}</small></span></label>)}{!plan.pending.length && <p className="field-hint">미처리 업무가 없습니다.</p>}</div><button className="btn-primary" disabled={!pendingSelected.length} onClick={() => { const next = { ...choices }; const rows = plan.pending.filter(t => pendingSelected.includes(t.taskId)); rows.forEach(t => { next[assignmentKey(t)] = day; }); localStorage.setItem(planKey, JSON.stringify(next)); setChoices(next); setPendingSelected([]); setPendingOpen(false); focus(rows); }}>{pendingSelected.length}건 지도에 표시</button></section>}
      {!!results.length && <section className="app-map-sheet"><div className="app-sheet-heading"><strong>검색 결과 {results.length}건</strong><button className="icon-button" aria-label="검색 결과 닫기" onClick={() => { setResults([]); setResultQuery(''); setSelected(null); }}><AppIcon name="close" /></button></div><div className="app-sheet-scroll">{results.map((p, i) => <div className="app-search-result" key={p.id || i}><button onClick={() => { setSelected(resultPins[i].taskId); focus([p]); }}><strong>{p.label}</strong><small>{p.address}</small>{p.distanceValue != null && <small>{formatDistance(p.distanceValue)}</small>}</button><button className="btn-secondary" onClick={() => { const found = p; reset(); setDraft(null); setPoint(found); setRegistration('manual'); }}>{mine.some(t => t.status !== 'complete' && Math.abs(t.lat - p.lat) + Math.abs(t.lng - p.lng) < .00002) ? '새 업무' : '추가'}</button></div>)}</div></section>}
      {target && !registration && !results.length && <section ref={routeCardRef} className="app-map-sheet app-destination-card"><div className="app-sheet-heading"><strong>{target.detailAddress || target.roadAddress}</strong><button className="icon-button" aria-label="방문지 선택 닫기" onClick={() => setSelected(null)}><AppIcon name="close" /></button></div>{target.roadAddress && <p className="field-hint">{target.roadAddress}</p>}
        <div className="app-preview-summary" role="region" aria-label="경로 미리보기">
          {visiblePreview?.status === 'ready' ? <><output aria-label="예상 거리">{formatDistance(visiblePreview.distance)}</output><output aria-label="예상 시간">{formatDuration(visiblePreview.duration)}</output></> : <p className="field-hint" role={visiblePreview?.status === 'error' ? 'alert' : 'status'}>{visiblePreview?.message || '경로 확인 중…'}</p>}
        </div>
        {visiblePreview?.status === 'error' && <button className="text-button" onClick={() => setPreviewRetry(v => v + 1)}>경로 다시 불러오기</button>}
        <button className="btn-primary" disabled={sending || target.status === 'complete' || !validCoordinates(target)} onClick={sendGuidance}>{sending ? '휴대폰 연결 중…' : '길안내 시작'}</button></section>}
      <button className="map-current-location" style={{ bottom: routeCardHeight + 96 }} aria-label="현재 위치" disabled={locating} onClick={() => locate(true)}><AppIcon name="locate-outline" />{locating && <span>확인 중</span>}</button>{optimizing && <span className="app-order-status" role="status">방문 순서 추천 중…</span>}
    </MapCanvas>
    </div>
    {searchOpen && <PlaceSearch userId={user.userId} center={position} locations={mine} onClose={() => setSearchOpen(false)} onResults={(rows, query) => { setResults(rows); setResultQuery(query); setSearchOpen(false); focus(rows); }} onAdd={p => { reset(); setDraft(null); setPoint(p); setRegistration('manual'); }} />}
    {registration && !['public', 'pick'].includes(registration) && <MapRegistration key={registration} method={registration} point={point} groupId={groupId} user={user} personal={personal} draft={registration === 'manual' && draft?.point === point ? draft : null} onDraft={setDraft} onClose={() => { setRegistration(null); setPoint(null); }} onSaved={onSaved} onShowPlaces={rows => { setRegistration(null); setProjectPlaces(rows.map(p => ({ ...p, taskId: `project:${p.placeId}`, detailAddress: p.name, _status: 'pending' }))); focus(rows); }} onUpdatedUser={updateUser} />}
    {application && <FacilityApplications initialId={params.get('application')} onClose={() => { setApplication(false); setParams({}); }} />}
    {remove && <Modal className="app-map-modal" title="방문지 삭제" onClose={() => !actionLock.current && setRemove(null)}><p>{remove.detailAddress || remove.roadAddress}을(를) 삭제할까요?</p><div className="action-row"><button className="btn-secondary" disabled={sending} onClick={() => setRemove(null)}>취소</button><button className="btn-primary" disabled={sending} onClick={async () => { if (actionLock.current) return; actionLock.current = true; setSending(true); try { await api.delete(`/api/locations/${remove.taskId}`); if (live.current) { setRemove(null); setSelected(null); setReload(v => v + 1); } } catch (e) { if (live.current) setError(e.message); } finally { actionLock.current = false; if (live.current) setSending(false); } }}>삭제</button></div></Modal>}
    {notice && <Modal className="app-map-modal" title={notice.title} onClose={() => setNotice(null)}><p>{notice.message}</p><button className="btn-primary" onClick={() => setNotice(null)}>확인</button></Modal>}
    {handoff && <Modal className="app-map-modal" title="휴대폰 앱 연동" onClose={() => setHandoff(null)}><p>휴대폰 앱을 켠 다음 안내받으세요.</p><p className="field-hint">같은 계정으로 로그인한 휴대폰 앱을 열면 길안내 화면이 바로 표시됩니다.</p><button className="btn-primary" onClick={() => setHandoff(null)}>확인</button></Modal>}

  </div>;
}
