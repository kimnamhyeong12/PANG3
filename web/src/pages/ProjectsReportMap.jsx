import { useEffect, useRef, useState } from 'react';
import { downloadProtectedFile } from '../api/projects.js';
import { loadKakaoMaps } from '../lib/kakaoLoader.js';

// 보고서 HTML(ReportHtmlRenderer)과 같은 규칙: 핀 채움 = 완료 상태색, 테두리 = 작성자색
export const AUTHOR_COLORS = ['#2477F3', '#12A9A5', '#BE9446', '#7A5BD6', '#E34D59', '#1551A6', '#C87973', '#078A88'];

// 작성자 이름 → 색 (처음 나온 순서대로)
export function authorColorMap(items) {
  const colors = new Map();
  items.forEach((it) => {
    const name = it.author?.name ?? it.authorName ?? '-';
    if (!colors.has(name)) colors.set(name, AUTHOR_COLORS[colors.size % AUTHOR_COLORS.length]);
  });
  return colors;
}

// /api/files/... 는 인증이 필요해 Blob으로 받아 표시
export function ProtectedPhoto({ url, alt }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return undefined;
    if (!url.startsWith('/')) {
      setSrc(url);
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    downloadProtectedFile(url)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) return <div className="re-photo re-photo-empty">사진을 불러오지 못했습니다</div>;
  if (!src) return <div className="re-photo re-photo-empty">불러오는 중…</div>;
  return <img className="re-photo" src={src} alt={alt} />;
}

function pinElement(marker, active, onPick) {
  const pin = document.createElement('div');
  pin.className = `rm-pin${active ? ' is-active' : ''}`;
  pin.title = marker.title ? `${marker.n ?? ''} ${marker.title}`.trim() : '';
  const body = document.createElement('div');
  body.className = 'rm-pin-body';
  body.style.borderColor = marker.color;
  pin.appendChild(body);
  if (marker.n != null) {
    const num = document.createElement('span');
    num.className = 'rm-pin-n';
    num.textContent = String(marker.n);
    pin.appendChild(num);
  }
  if (onPick) pin.addEventListener('click', () => onPick(marker.n));
  return pin;
}

/**
 * 줌·이동되는 카카오 지도 + 앱 지도와 같은 뾰족 핀.
 * markers: [{ n, lat, lng, color, title }], 지도를 못 쓰면 fallback(위치 표 등)을 대신 보여준다.
 */
export default function ReportMap({ markers, activeN = null, onPick, height = 420, fallback = null }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [failed, setFailed] = useState(false);
  const usable = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
  const markerKey = usable.map((m) => `${m.n}:${m.lat}:${m.lng}:${m.color}:${m.title ?? ''}`).join('|');

  useEffect(() => {
    if (usable.length === 0) {
      // 지도 div가 사라지므로 다음에 핀이 생기면 새로 만든다
      mapRef.current = null;
      overlaysRef.current = [];
      return undefined;
    }
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !boxRef.current) return;
        const first = new kakao.maps.LatLng(usable[0].lat, usable[0].lng);
        if (!mapRef.current) {
          mapRef.current = new kakao.maps.Map(boxRef.current, { center: first, level: 5 });
          mapRef.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        }
        const map = mapRef.current;
        overlaysRef.current.forEach((o) => o.setMap(null));
        const bounds = new kakao.maps.LatLngBounds();
        overlaysRef.current = usable.map((m) => {
          const position = new kakao.maps.LatLng(m.lat, m.lng);
          bounds.extend(position);
          return new kakao.maps.CustomOverlay({ position, content: pinElement(m, m.n === activeN, onPick), yAnchor: 1, zIndex: m.n === activeN ? 10 : 5, map });
        });
        if (usable.length > 1) map.setBounds(bounds);
        else map.setCenter(first);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // 핀 구성이 바뀔 때만 다시 그린다 (onPick은 매 렌더 새 함수라 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey]);

  // 선택 핀만 강조 (지도 범위는 그대로)
  useEffect(() => {
    overlaysRef.current.forEach((overlay, i) => {
      const m = usable[i];
      if (!m) return;
      const el = overlay.getContent();
      if (el?.classList) el.classList.toggle('is-active', m.n === activeN);
      overlay.setZIndex(m.n === activeN ? 10 : 5);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeN, markerKey]);

  if (usable.length === 0 || failed) return fallback;
  return <div ref={boxRef} className="rm-map" style={{ height }} />;
}
