import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { fetchAedsByDong, fetchBoundaries, fetchBusStopsByDong, fetchByDongs } from '../api/publicData.js';
import { loadKakaoMaps } from '../lib/kakaoLoader.js';
import { normalizeStatus } from '../utils/taskStatus.js';
import MapCanvas from '../components/map/MapCanvas.jsx';
import { STATUS_COLOR } from '../components/map/markerImages.js';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { SkeletonTable, Spinner } from '../components/Loading.jsx';
import { errorMessage } from '../api/client.js';

const LOADING = Symbol('loading');

// 그룹 지역 코드가 없을 때 기본값 (앱과 동일: 21100 = 부산 사하구)
const DEFAULT_ADM_CODE = '21100';

const LAYERS = [
  { key: 'tasks', label: '현장 업무' },
  { key: 'bus', label: '버스정류장' },
  { key: 'aed', label: 'AED' },
  { key: 'boundary', label: '행정동 경계' },
];

const hasCoords = (item) => Number.isFinite(item?.lat) && Number.isFinite(item?.lng);

const inBounds = (item, b) =>
  item.lat >= b.south && item.lat <= b.north && item.lng >= b.west && item.lng <= b.east;

function geocode(query) {
  return loadKakaoMaps().then(
    (kakao) =>
      new Promise((resolve) => {
        const { Status } = kakao.maps.services;
        new kakao.maps.services.Geocoder().addressSearch(query, (result, status) => {
          if (status === Status.OK && result.length > 0) {
            resolve({ lat: Number(result[0].y), lng: Number(result[0].x), label: result[0].address_name });
            return;
          }
          // 주소로 못 찾으면 장소명 검색
          new kakao.maps.services.Places().keywordSearch(query, (places, placeStatus) => {
            if (placeStatus === Status.OK && places.length > 0) {
              resolve({ lat: Number(places[0].y), lng: Number(places[0].x), label: places[0].place_name });
            } else {
              resolve(null);
            }
          });
        });
      })
  );
}

function useLayerData(enabled, admCodes, fetcher, idKey) {
  const [state, setState] = useState({ items: [], loading: false, error: null, loadedFor: null });
  const key = admCodes.join(',');

  useEffect(() => {
    if (!enabled || !key || state.loadedFor === key) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchByDongs(admCodes, fetcher, idKey).then(({ items, failedCount }) => {
      if (cancelled) return;
      setState({
        items,
        loading: false,
        error: failedCount > 0 ? `${failedCount}개 행정동을 불러오지 못했습니다.` : null,
        loadedFor: key,
      });
    });
    return () => {
      cancelled = true;
    };
    // admCodes는 key로 대표됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, fetcher, idKey, state.loadedFor]);

  // 실패한 행정동이 있으면 다시 불러오기
  const retry = useCallback(() => setState((s) => ({ ...s, loadedFor: null })), []);
  return { ...state, retry };
}

export default function MapPage() {
  const { user } = useAuth();
  const { groupId, currentGroup } = useGroup();
  const [layers, setLayers] = useState({ tasks: true, bus: false, aed: false, boundary: true });

  // 응답이 어느 그룹/지역 것인지 함께 저장한다. 그룹 전환 직후 렌더에서 이전 그룹 데이터가
  // 새 지도에 쓰이지 않도록(새 지도가 이전 그룹 업무 기준으로 화면을 맞추던 문제) 현재 값과 다르면 '로딩 중'으로 본다.
  const [taskData, setTaskData] = useState({ groupId: null, list: [] });
  const [tasksFetching, setTasksFetching] = useState(true);
  const [tasksError, setTasksError] = useState(null);

  const [boundaryData, setBoundaryData] = useState({ admCode: null, data: null });
  const [boundaryError, setBoundaryError] = useState(null);
  const [tasksReloadKey, setTasksReloadKey] = useState(0);
  const [boundaryReloadKey, setBoundaryReloadKey] = useState(0);

  const [viewBounds, setViewBounds] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResult, setSearchResult] = useState(null);

  const admCode = currentGroup?.regionAdmCode || DEFAULT_ADM_CODE;

  useEffect(() => {
    let cancelled = false;
    setTasksFetching(true);
    setTasksError(null);
    setSelectedTaskId(null);
    fetchGroupTasks(groupId, user.userId)
      .then(
        (list) =>
          !cancelled && setTaskData({ groupId, list: (list ?? []).map((t) => ({ ...t, _status: normalizeStatus(t) })) })
      )
      .catch((e) => {
        if (cancelled) return;
        setTaskData({ groupId, list: [] });
        setTasksError(errorMessage(e, '업무 목록을 불러오지 못했습니다.'));
      })
      .finally(() => !cancelled && setTasksFetching(false));
    return () => {
      cancelled = true;
    };
  }, [groupId, user.userId, tasksReloadKey]);

  useEffect(() => {
    let cancelled = false;
    setBoundaryError(null);
    fetchBoundaries(admCode)
      .then((data) => !cancelled && setBoundaryData({ admCode, data }))
      .catch((e) => !cancelled && setBoundaryError(errorMessage(e, '행정동 경계를 불러오지 못했습니다.')));
    return () => {
      cancelled = true;
    };
  }, [admCode, boundaryReloadKey]);

  const tasks = taskData.groupId === groupId ? taskData.list : [];
  const tasksLoading = tasksFetching || taskData.groupId !== groupId;
  const boundaries = boundaryData.admCode === admCode ? boundaryData.data : null;

  const dongCodes = useMemo(
    () => (boundaries?.features ?? []).map((f) => f.properties?.adm_cd).filter(Boolean),
    [boundaries]
  );

  const bus = useLayerData(layers.bus, dongCodes, fetchBusStopsByDong, 'busStopId');
  const aed = useLayerData(layers.aed, dongCodes, fetchAedsByDong, 'aedId');

  const locatedTasks = useMemo(() => tasks.filter(hasCoords), [tasks]);
  const visibleTasks = useMemo(
    () => (viewBounds ? locatedTasks.filter((t) => inBounds(t, viewBounds)) : locatedTasks),
    [locatedTasks, viewBounds]
  );
  const missingCoords = tasks.length - locatedTasks.length;

  const onBoundsChange = useCallback((b) => setViewBounds(b), []);

  const onSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await geocode(q);
      if (result) setSearchResult(result);
      else setSearchError('검색 결과가 없습니다.');
    } catch (err) {
      setSearchError(errorMessage(err, '주소 검색에 실패했습니다.'));
    } finally {
      setSearching(false);
    }
  };

  const layerStatus = {
    tasks: tasksLoading ? LOADING : tasksError ? '오류' : `${locatedTasks.length}`,
    bus: bus.loading ? LOADING : layers.bus && bus.loadedFor ? `${bus.items.length}` : '',
    aed: aed.loading ? LOADING : layers.aed && aed.loadedFor ? `${aed.items.length}` : '',
    boundary: boundaryError ? '오류' : boundaries ? `${dongCodes.length}` : LOADING,
  };
  const layerErrors = [
    tasksError && { key: 'tasks', message: tasksError, retry: () => setTasksReloadKey((k) => k + 1) },
    boundaryError && { key: 'boundary', message: boundaryError, retry: () => setBoundaryReloadKey((k) => k + 1) },
    bus.error && { key: 'bus', message: `버스정류장: ${bus.error}`, retry: bus.retry },
    aed.error && { key: 'aed', message: `AED: ${aed.error}`, retry: aed.retry },
  ].filter(Boolean);

  return (
    <div className="map-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">지도 조회</h1>
          <p className="page-desc">{currentGroup?.groupName} 팀의 현장 업무와 공공데이터를 지도에서 확인합니다.</p>
        </div>
        <form className="map-search" onSubmit={onSearch}>
          <input
            className="input"
            placeholder="주소 또는 장소 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary btn-inline" disabled={searching}>
            {searching ? '검색 중…' : '검색'}
          </button>
        </form>
      </div>
      {searchError && <p className="form-error">{searchError}</p>}
      {layerErrors.map((err) => (
        <ErrorBlock key={err.key} message={err.message} onRetry={err.retry} />
      ))}

      <div className="map-layout">
        <aside className="map-side">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">레이어</h2>
            </div>
            <div className="layer-list">
              {LAYERS.map(({ key, label }) => (
                <label key={key} className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) => setLayers((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span className="layer-label">{label}</span>
                  {layerStatus[key] === LOADING ? (
                    <Spinner size={12} />
                  ) : (
                    layerStatus[key] && <span className="layer-count">{layerStatus[key]}</span>
                  )}
                </label>
              ))}
            </div>
          </section>

          <section className="panel map-task-panel">
            <div className="panel-header">
              <h2 className="panel-title">표시 중인 업무</h2>
              <span className="panel-count">{layers.tasks ? `${visibleTasks.length}건` : '숨김'}</span>
            </div>
            {!layers.tasks ? (
              <div className="table-empty">현장 업무 레이어가 꺼져 있습니다.</div>
            ) : tasksLoading ? (
              <SkeletonTable rows={5} columns={1} />
            ) : visibleTasks.length === 0 ? (
              <div className="table-empty">현재 지도 영역에 업무가 없습니다.</div>
            ) : (
              <ul className="map-task-list">
                {visibleTasks.map((task) => (
                  <li key={task.taskId}>
                    <button
                      type="button"
                      className={`map-task-item${task.taskId === selectedTaskId ? ' active' : ''}`}
                      onClick={() => setSelectedTaskId(task.taskId)}
                    >
                      <span className="status-dot" style={{ background: STATUS_COLOR[task._status] }} />
                      <span className="map-task-text">
                        <span className="map-task-title">{task.detailAddress || task.taskCategory || '업무'}</span>
                        <span className="map-task-sub">
                          {task.roadAddress || '주소 정보 없음'} · {task.assigneeName || '담당자 없음'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {layers.tasks && missingCoords > 0 && (
              <div className="map-task-note">좌표가 없는 업무 {missingCoords}건은 지도에 표시되지 않습니다.</div>
            )}
          </section>
        </aside>

        {/* 그룹이 바뀌면 지도를 새로 만들어 새 그룹 업무 기준으로 다시 화면을 맞춘다 */}
        <MapCanvas
          key={groupId}
          tasks={tasks}
          busStops={bus.items}
          aeds={aed.items}
          boundaries={boundaries}
          layers={layers}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onBoundsChange={onBoundsChange}
          searchResult={searchResult}
          dataReady={!tasksLoading && (boundaries != null || boundaryError != null)}
        />
      </div>
    </div>
  );
}
