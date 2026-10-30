import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { fetchRegionBoundaries } from '../api/publicData.js';
import { api } from '../api/client.js';
import MapCanvas from '../components/map/MapCanvas.jsx';
import MapRegistration from '../components/map/MapRegistration.jsx';
import FacilityApplications from '../components/map/FacilityApplications.jsx';
import AppIcon from '../components/AppIcon.jsx';
import Modal from '../components/Modal.jsx';
import { normalizeStatus, STATUS, STATUS_LABEL } from '../utils/taskStatus.js';
import { personalGroup } from './GroupsPage.jsx';
import { loadKakaoMaps } from '../lib/kakaoLoader.js';
import { searchPlaces } from '../lib/placeSearch.js';
import { applyVisitRecommendation, recommendationPayload } from '../lib/visitRecommendations.js';
const REGISTRATION_METHODS = [['pick', '지도 선택', 'map-outline'], ['public', '공공시설물', 'business-outline'], ['project', '프로젝트', 'folder-outline'], ['excel', '엑셀 등록', 'grid-outline'], ['photo', '사진 등록', 'image-outline'], ['workplace', '근무지', 'home-outline']];
export default function MapPage() {
  const {
    user
  } = useAuth();
  const {
    groupId,
    currentGroup
  } = useGroup();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({
    groupId: null,
    tasks: []
  });
  const [boundaries, setBoundaries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [point, setPoint] = useState(null);
  const [pickCenter, setPickCenter] = useState(null);
  const [pickingAddress, setPickingAddress] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState('car');
  const [sending, setSending] = useState(false);
  const [handoff, setHandoff] = useState(null);
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateToken, setLocateToken] = useState(0);
  const [locationError, setLocationError] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimized, setOptimized] = useState([]);
  const [recommendationNotice, setRecommendationNotice] = useState('');
  const scopeRef = useRef(groupId);
  scopeRef.current = groupId;
  const searchSeq = useRef(0),
    routeSeq = useRef(0),
    watchRef = useRef(null),
    mounted = useRef(true);
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
    setResults([]);
    setSearched(false);
    setQuery('');
    setSearching(false);
    ++searchSeq.current;
    ++routeSeq.current;
    fetchGroupTasks(groupId, user.userId).then(tasks => {
      if (active) setData({
        groupId,
        tasks: (tasks || []).map(task => ({
          ...task,
          _status: normalizeStatus(task)
        }))
      });
    }).catch(failure => {
      if (active) setError(failure.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    // Region data is used only by the public-facility registration picker.
    fetchRegionBoundaries(personal ? user.workSido : currentGroup?.regionSido, personal ? user.workSigungu : currentGroup?.regionSigungu, currentGroup?.regionAdmCode).then(value => {
      if (active) setBoundaries(value);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [groupId, user.userId, user.workSido, user.workSigungu, currentGroup?.regionSido, currentGroup?.regionSigungu, currentGroup?.regionAdmCode, personal, reload]);
  useEffect(() => {
    setRegistration(params.get('add') === 'public' ? 'public' : null);
  }, [groupId]);
  useEffect(() => {
    let active = true,
      fetching = false;
    const refresh = async () => {
      if (fetching || document.visibilityState === 'hidden') return;
      fetching = true;
      try {
        const tasks = await fetchGroupTasks(groupId, user.userId);
        if (active) setData({
          groupId,
          tasks: (tasks || []).map(task => ({
            ...task,
            _status: normalizeStatus(task)
          }))
        });
      } catch {} finally {
        fetching = false;
      }
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [groupId, user.userId]);
  function locate(recenter = true) {
    if (!navigator.geolocation) {
      setLocationError('이 브라우저는 현재 위치를 지원하지 않습니다.');
      return;
    }
    if (watchRef.current != null) {
      if (recenter) setLocateToken(value => value + 1);
      return;
    }
    setLocating(true);
    setLocationError('');
    let first = true;
    watchRef.current = navigator.geolocation.watchPosition(result => {
      if (!mounted.current) return;
      setPosition({
        lat: result.coords.latitude,
        lng: result.coords.longitude,
        accuracy: result.coords.accuracy
      });
      setLocating(false);
      setLocationError('');
      if (first && recenter) setLocateToken(value => value + 1);
      first = false;
    }, failure => {
      if (!mounted.current) return;
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      setLocating(false);
      setPosition(null);
      setLocationError(failure.code === 1 ? '브라우저에서 위치 권한을 허용해 주세요.' : failure.code === 3 ? '현재 위치 확인 시간이 초과됐습니다. 다시 시도해 주세요.' : '현재 위치를 확인하지 못했습니다.');
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000
    });
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (navigator.permissions) navigator.permissions.query({
      name: 'geolocation'
    }).then(permission => {
      if (active && permission.state !== 'denied') locate(false);
    }).catch(() => {});else locate(false);
    return () => {
      active = false;
      mounted.current = false;
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, []);
  const mine = useMemo(() => (data.groupId === groupId ? data.tasks : []).filter(task => Number(task.assigneeUserId) === Number(user.userId)), [data, groupId, user.userId]);
  const membership = JSON.stringify(mine.map(task => [task.taskId, task._status, task.lat, task.lng]));
  useEffect(() => {
    setOptimized([]);
    setRecommendationNotice('');
    ++routeSeq.current;
    setOptimizing(false);
  }, [groupId, mode, membership]);
  const visits = useMemo(() => applyVisitRecommendation(mine, optimized), [mine, optimized]);
  const target = visits.find(task => task.taskId === selected);
  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setError('');
    setResults([]);
    setSearched(false);
    try {
      const rows = await searchPlaces(query.trim());
      if (seq === searchSeq.current) {
        setResults(rows);
        setSearched(true);
      }
    } catch (failure) {
      if (seq === searchSeq.current) setError(failure.message);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }
  async function recommend() {
    setError('');
    setRecommendationNotice('');
    let payload;
    try {
      payload = recommendationPayload(mine, user.userId, position, mode, groupId);
    } catch (failure) {
      setError(failure.message);
      return;
    }
    const seq = ++routeSeq.current;
    setOptimizing(true);
    try {
      const result = await api.post('/api/routes/order', payload);
      if (seq === routeSeq.current) {
        setOptimized(result.optimizedLocations || []);
        setRecommendationNotice(result.notice || '');
        setSelected((result.optimizedLocations?.[0]?.id ?? result.optimizedLocations?.[0]?.taskId) || null);
      }
    } catch (failure) {
      if (seq === routeSeq.current) setError(failure.message);
    } finally {
      if (seq === routeSeq.current) setOptimizing(false);
    }
  }
  async function startGuidance() {
    setSending(true);
    setError('');
    const scope = groupId;
    try {
      const request = await api.post('/api/navigation-handoffs', {
        groupId,
        taskId: target.taskId,
        mode
      });
      if (scope === scopeRef.current) setHandoff(request);
    } catch (failure) {
      if (scope === scopeRef.current) setError(failure.message);
    } finally {
      setSending(false);
    }
  }
  return <div className="map-page map-workspace personal-map">
    {(error || locationError || recommendationNotice) && <div className="map-feedback" role="status">{error || locationError || recommendationNotice}<button type="button" aria-label="알림 닫기" onClick={() => {
        setError('');
        setLocationError('');
        setRecommendationNotice('');
      }}>×</button></div>}
    <div className="map-workspace-layout">
      <aside className="map-workspace-side">
        <section className="panel map-registration-panel">
          <h2>방문지 등록</h2>
          <form className="inline-place-search" onSubmit={search}><input className="input" aria-label="주소 또는 장소 검색" placeholder="주소 또는 장소 검색" value={query} onChange={event => setQuery(event.target.value)} required /><button type="submit" aria-label="검색" disabled={searching}><AppIcon name="search-outline" /></button></form>
          {(results.length > 0 || searched) && <div className="inline-search-results">{!results.length ? <p>검색 결과가 없습니다.</p> : results.map((place, index) => <button className="place-result" key={index} onClick={() => {
              setPoint(place);
              setSearchResult(place);
              setRegistration('manual');
              setResults([]);
              setSearched(false);
            }}><strong>{place.label}</strong><span>{place.address}</span></button>)}</div>}
          <div className="registration-methods">{REGISTRATION_METHODS.map(([key, label, icon]) => <button className="btn-secondary" key={key} onClick={() => {
              setPoint(null);
              setRegistration(key);
            }}><span className="registration-icon"><AppIcon name={icon} /></span><span>{label}</span></button>)}</div>
          {registration === 'pick' && <button className="map-pick-cancel" onClick={() => setRegistration(null)}>지도에서 위치 선택 중 · 취소</button>}
        </section>
        <section className="panel map-task-panel"><div className="panel-header"><h2 className="panel-title">방문지 목록</h2><span className="panel-count">{visits.length}곳</span></div><div className="map-visit-scroll" tabIndex={0} aria-label="내 방문지 목록">{loading ? <p className="table-empty">불러오는 중…</p> : !visits.length ? <p className="table-empty">등록된 방문지가 없습니다.</p> : <ul className="map-task-list">{visits.map(task => <li key={task.taskId}><button className={`map-task-item${selected === task.taskId ? ' active' : ''}`} onClick={() => setSelected(task.taskId)}>{task.markerNumber && <span className="visit-number">{task.markerNumber}</span>}<span className="map-task-text"><strong>{task.detailAddress || task.roadAddress || '방문지'}</strong></span><span className={`visit-state visit-state-${task._status}`}>{STATUS_LABEL[task._status]}</span></button></li>)}</ul>}</div></section>
      </aside>
      <MapCanvas key={groupId} tasks={visits} busStops={[]} aeds={[]} layers={{
        tasks: true,
        boundary: false
      }} selectedTaskId={selected} onSelectTask={setSelected} searchResult={point || searchResult} dataReady={!loading} showTaskInfo={false} currentPosition={position} locateToken={locateToken} onCenterChange={registration === 'pick' ? setPickCenter : undefined}>
        {registration === 'pick' && <><div className="map-center-pin" aria-hidden="true">📍</div><div className="map-center-confirm"><strong>지도를 움직여 위치를 선택하세요</strong><div className="action-row"><button className="btn-secondary" disabled={pickingAddress} onClick={() => setRegistration(null)}>취소</button><button className="btn-primary btn-inline" disabled={!pickCenter || pickingAddress} onClick={async () => { setPickingAddress(true); try { const k = await loadKakaoMaps(); const address = await new Promise(resolve => new k.maps.services.Geocoder().coord2Address(pickCenter.lng, pickCenter.lat, rows => resolve(rows?.[0]?.road_address?.address_name || rows?.[0]?.address?.address_name || ''))); setPoint({ ...pickCenter, address }); setRegistration('manual'); } catch (e) { setError(e.message); } finally { setPickingAddress(false); } }}>{pickingAddress ? '확인 중…' : '이 위치 선택'}</button></div></div></>}
        <button className={`map-current-location${position ? ' located' : ''}`} aria-label="현재 위치" title="현재 위치" onClick={() => locate(true)} disabled={locating}><AppIcon name="locate-outline" />{locating && <span>확인 중</span>}</button>
        <div className="map-guidance-control"><div className="segmented travel-mode"><button className={mode === 'car' ? 'active' : ''} aria-label="차량 이동" onClick={() => setMode('car')}><AppIcon name="car-outline" /></button><button className={mode === 'walk' ? 'active' : ''} aria-label="도보 이동" onClick={() => setMode('walk')}><AppIcon name="walk-outline" /></button></div><button className="btn-secondary" disabled={!position || optimizing || loading} onClick={recommend}>{optimizing ? '추천 중…' : '방문 순서 추천'}</button>{target && target._status !== STATUS.COMPLETE && <button className="btn-primary btn-inline" disabled={sending} onClick={startGuidance}>{sending ? '연동 중…' : '안내 시작'}</button>}</div>
      </MapCanvas>
    </div>
    {params.get('application') && <FacilityApplications initialId={params.get('application')} onClose={() => setParams({})} />}
    {registration && registration !== 'pick' && <MapRegistration key={`${groupId}:${registration}`} method={registration} point={point} groupId={groupId} user={user} boundaries={boundaries} onClose={() => {
      setRegistration(null);
      setPoint(null);
      setParams({});
    }} onSaved={() => {
      setRegistration(null);
      setPoint(null);
      setReload(value => value + 1);
    }} />}
    {handoff && <Modal title="앱 안내 연동" onClose={() => setHandoff(null)}><p>앱에 연동되었습니다. 같은 계정의 핀워크 앱을 열어주세요.</p><a className="btn-primary btn-inline" href="pang3://navigation">이 기기에서 앱 열기</a></Modal>}
  </div>;
}
