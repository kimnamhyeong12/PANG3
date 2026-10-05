import { useEffect, useRef, useState } from 'react';
import { loadKakaoMaps } from '../../lib/kakaoLoader.js';
import { STATUS, STATUS_LABEL } from '../../utils/taskStatus.js';
import {
  COLORS,
  STATUS_COLOR,
  aedMarkerImage,
  busStopMarkerImage,
  searchMarkerImage,
  taskMarkerImage,
} from './markerImages.js';

// 부산 사하구청 부근
const DEFAULT_CENTER = { lat: 35.1046, lng: 128.9749 };
const DEFAULT_LEVEL = 6;

/*
 * 행정동 경계가 지도 조작을 막지 않도록 하는 원칙 (모바일 앱 버그 재발 방지)
 * 1. Polygon은 clickable: false → 드래그/휠/클릭이 지도로 그대로 전달된다.
 * 2. 동 이름 라벨(CustomOverlay)도 clickable: false + CSS pointer-events: none.
 * 3. 화면 맞춤(setBounds)은 최초 1회만. 경계 데이터 갱신·레이어 토글 때 다시 맞추지 않는다.
 *    (앱은 경계를 다시 그릴 때마다 setBounds를 호출해 지도가 계속 원위치로 돌아가 '고정'된 것처럼 보였다.)
 * 4. 경계 객체는 데이터가 바뀔 때만 새로 만들고, 레이어 토글은 setMap(map/null)로 표시만 바꾼다.
 * 5. setDraggable / setZoomable 은 호출하지 않는다.
 */

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates ?? []];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates ?? [];
  return [];
}

const hasCoords = (item) => Number.isFinite(item?.lat) && Number.isFinite(item?.lng);

function boundsToPlain(bounds) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return { south: sw.getLat(), west: sw.getLng(), north: ne.getLat(), east: ne.getLng() };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default function MapCanvas({
  tasks,
  busStops,
  aeds,
  boundaries,
  layers,
  selectedTaskId,
  onSelectTask,
  onBoundsChange,
  searchResult,
}) {
  const containerRef = useRef(null);
  const kakaoRef = useRef(null);
  const mapRef = useRef(null);
  const fittedRef = useRef(false);
  const taskMarkersRef = useRef(new Map());
  const infoOverlayRef = useRef(null);
  const boundaryObjectsRef = useRef([]);
  const busMarkersRef = useRef([]);
  const aedMarkersRef = useRef([]);
  const searchMarkerRef = useRef(null);
  const handlersRef = useRef({ onSelectTask, onBoundsChange });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  handlersRef.current = { onSelectTask, onBoundsChange };

  // 지도 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        kakaoRef.current = kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: DEFAULT_LEVEL,
        });
        mapRef.current = map;
        kakao.maps.event.addListener(map, 'idle', () => {
          handlersRef.current.onBoundsChange?.(boundsToPlain(map.getBounds()));
        });
        kakao.maps.event.addListener(map, 'click', () => handlersRef.current.onSelectTask?.(null));
        setReady(true);
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // 컨테이너 크기 변화 시 relayout
  useEffect(() => {
    if (!ready) return undefined;
    const observer = new ResizeObserver(() => mapRef.current?.relayout());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  // 행정동 경계: 데이터가 바뀔 때만 생성
  useEffect(() => {
    if (!ready) return undefined;
    const kakao = kakaoRef.current;
    const objects = [];
    (boundaries?.features ?? []).forEach((feature) => {
      const featureBounds = new kakao.maps.LatLngBounds();
      geometryRings(feature.geometry).forEach((polygonCoords) => {
        const path = polygonCoords.map((ring) =>
          ring.map(([lng, lat]) => {
            const latLng = new kakao.maps.LatLng(lat, lng);
            featureBounds.extend(latLng);
            return latLng;
          })
        );
        objects.push(
          new kakao.maps.Polygon({
            path,
            clickable: false,
            strokeWeight: 1.5,
            strokeColor: COLORS.navy,
            strokeOpacity: 0.7,
            fillColor: COLORS.navy,
            fillOpacity: 0.06,
            zIndex: 1,
          })
        );
      });
      const name = String(feature.properties?.adm_nm ?? '').split(/\s+/).pop();
      if (name && !featureBounds.isEmpty()) {
        const label = document.createElement('div');
        label.className = 'map-dong-label';
        label.textContent = name;
        const sw = featureBounds.getSouthWest();
        const ne = featureBounds.getNorthEast();
        objects.push(
          new kakao.maps.CustomOverlay({
            position: new kakao.maps.LatLng((sw.getLat() + ne.getLat()) / 2, (sw.getLng() + ne.getLng()) / 2),
            content: label,
            clickable: false,
            zIndex: 1,
          })
        );
      }
    });
    boundaryObjectsRef.current = objects;
    return () => {
      objects.forEach((o) => o.setMap(null));
      boundaryObjectsRef.current = [];
    };
  }, [ready, boundaries]);

  // 행정동 경계 표시 토글
  useEffect(() => {
    if (!ready) return;
    const target = layers.boundary ? mapRef.current : null;
    boundaryObjectsRef.current.forEach((o) => o.setMap(target));
  }, [ready, layers.boundary, boundaries]);

  // 업무 마커
  useEffect(() => {
    if (!ready) return undefined;
    const kakao = kakaoRef.current;
    const markers = new Map();
    tasks.filter(hasCoords).forEach((task) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(task.lat, task.lng),
        image: taskMarkerImage(kakao, task._status),
        title: task.detailAddress ?? task.roadAddress ?? '',
        clickable: true,
        zIndex: 3,
      });
      kakao.maps.event.addListener(marker, 'click', () => handlersRef.current.onSelectTask?.(task.taskId));
      markers.set(task.taskId, { marker, task });
    });
    taskMarkersRef.current = markers;
    return () => {
      markers.forEach(({ marker }) => marker.setMap(null));
      taskMarkersRef.current = new Map();
    };
  }, [ready, tasks]);

  useEffect(() => {
    if (!ready) return;
    const target = layers.tasks ? mapRef.current : null;
    taskMarkersRef.current.forEach(({ marker }) => marker.setMap(target));
  }, [ready, layers.tasks, tasks]);

  // 최초 1회 화면 맞춤: 업무가 있으면 업무 기준, 없으면 경계 기준
  useEffect(() => {
    if (!ready || fittedRef.current) return;
    const kakao = kakaoRef.current;
    const located = tasks.filter(hasCoords);
    const bounds = new kakao.maps.LatLngBounds();
    if (located.length > 0) {
      located.forEach((t) => bounds.extend(new kakao.maps.LatLng(t.lat, t.lng)));
    } else if (boundaries?.features?.length) {
      boundaries.features.forEach((f) =>
        geometryRings(f.geometry).forEach((poly) =>
          poly.forEach((ring) => ring.forEach(([lng, lat]) => bounds.extend(new kakao.maps.LatLng(lat, lng))))
        )
      );
    } else {
      return;
    }
    fittedRef.current = true;
    if (located.length === 1) {
      mapRef.current.setCenter(new kakao.maps.LatLng(located[0].lat, located[0].lng));
      mapRef.current.setLevel(4);
    } else {
      mapRef.current.setBounds(bounds, 40, 40, 40, 40);
    }
  }, [ready, tasks, boundaries]);

  // 선택된 업무: 마커 강조 + 정보 오버레이
  useEffect(() => {
    if (!ready) return undefined;
    const kakao = kakaoRef.current;
    const entry = selectedTaskId != null ? taskMarkersRef.current.get(selectedTaskId) : null;
    if (!entry || !layers.tasks) return undefined;

    const { marker, task } = entry;
    marker.setImage(taskMarkerImage(kakao, task._status, true));
    marker.setZIndex(10);

    const content = document.createElement('div');
    content.className = 'map-info';
    content.innerHTML =
      `<div class="map-info-title">${escapeHtml(task.detailAddress || task.taskCategory || '업무')}</div>` +
      `<div class="map-info-sub">${escapeHtml(task.roadAddress || '주소 정보 없음')}</div>` +
      `<div class="map-info-meta"><span class="map-info-dot" style="background:${STATUS_COLOR[task._status]}"></span>` +
      `${STATUS_LABEL[task._status]} · ${escapeHtml(task.assigneeName || '담당자 없음')}</div>`;
    const overlay = new kakao.maps.CustomOverlay({
      position: marker.getPosition(),
      content,
      yAnchor: 1.55,
      zIndex: 20,
      clickable: true,
    });
    overlay.setMap(mapRef.current);
    infoOverlayRef.current = overlay;
    mapRef.current.panTo(marker.getPosition());

    return () => {
      overlay.setMap(null);
      infoOverlayRef.current = null;
      marker.setImage(taskMarkerImage(kakao, task._status, false));
      marker.setZIndex(3);
    };
  }, [ready, selectedTaskId, tasks, layers.tasks]);

  // 버스정류장
  useEffect(() => {
    if (!ready || !layers.bus) return undefined;
    const kakao = kakaoRef.current;
    const markers = busStops.filter(hasCoords).map(
      (stop) =>
        new kakao.maps.Marker({
          map: mapRef.current,
          position: new kakao.maps.LatLng(stop.lat, stop.lng),
          image: busStopMarkerImage(kakao),
          title: `${stop.name ?? '버스정류장'}${stop.arsNo ? ` (${stop.arsNo})` : ''}`,
          zIndex: 2,
        })
    );
    busMarkersRef.current = markers;
    return () => markers.forEach((m) => m.setMap(null));
  }, [ready, layers.bus, busStops]);

  // AED
  useEffect(() => {
    if (!ready || !layers.aed) return undefined;
    const kakao = kakaoRef.current;
    const markers = aeds.filter(hasCoords).map(
      (aed) =>
        new kakao.maps.Marker({
          map: mapRef.current,
          position: new kakao.maps.LatLng(aed.lat, aed.lng),
          image: aedMarkerImage(kakao),
          title: `AED · ${aed.address ?? ''}`,
          zIndex: 2,
        })
    );
    aedMarkersRef.current = markers;
    return () => markers.forEach((m) => m.setMap(null));
  }, [ready, layers.aed, aeds]);

  // 주소 검색 결과로 이동
  useEffect(() => {
    if (!ready || !searchResult) return undefined;
    const kakao = kakaoRef.current;
    const position = new kakao.maps.LatLng(searchResult.lat, searchResult.lng);
    const marker = new kakao.maps.Marker({
      map: mapRef.current,
      position,
      image: searchMarkerImage(kakao),
      title: searchResult.label,
      zIndex: 5,
    });
    searchMarkerRef.current = marker;
    mapRef.current.setLevel(3);
    mapRef.current.setCenter(position);
    return () => marker.setMap(null);
  }, [ready, searchResult]);

  const zoom = (delta) => {
    const map = mapRef.current;
    if (!map) return;
    map.setLevel(Math.min(14, Math.max(1, map.getLevel() + delta)), { animate: true });
  };

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-container" />
      {loadError && <div className="map-error">{loadError}</div>}
      {!ready && !loadError && <div className="map-error">지도를 불러오는 중…</div>}

      {ready && (
        <>
          <div className="map-zoom">
            <button type="button" aria-label="확대" onClick={() => zoom(-1)}>
              +
            </button>
            <button type="button" aria-label="축소" onClick={() => zoom(1)}>
              −
            </button>
          </div>

          <div className="map-legend">
            <div className="map-legend-title">범례</div>
            {[STATUS.PENDING, STATUS.WORKING, STATUS.COMPLETE].map((s) => (
              <div key={s} className="map-legend-row">
                <span className="map-legend-pin" style={{ background: STATUS_COLOR[s] }} />
                {STATUS_LABEL[s]}
              </div>
            ))}
            <div className="map-legend-row">
              <span className="map-legend-bus" />
              버스정류장
            </div>
            <div className="map-legend-row">
              <span className="map-legend-aed">+</span>
              AED
            </div>
            <div className="map-legend-row">
              <span className="map-legend-boundary" />
              행정동 경계
            </div>
          </div>
        </>
      )}
    </div>
  );
}
