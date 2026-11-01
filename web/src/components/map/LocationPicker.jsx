import { useEffect, useState } from 'react';
import { addressAt, validCoordinates } from '../../lib/mapRegistration.js';
import Modal from '../Modal.jsx';
import AppIcon from '../AppIcon.jsx';
import MapCanvas from './MapCanvas.jsx';
import MapCenterPin from './MapCenterPin.jsx';
export default function LocationPicker({ initialPoint, onClose, onPick }) {
  const [initial] = useState(validCoordinates(initialPoint) ? initialPoint : { lat: 36.3, lng: 127.8 });
  const [initialFocus] = useState(() => ({ points: [initial] }));
  const [point, setPoint] = useState(initial), [address, setAddress] = useState(initial.address || ''), [resolving, setResolving] = useState(false), [error, setError] = useState(''), [currentPosition, setCurrentPosition] = useState(null), [locateToken, setLocateToken] = useState(0), [ready, setReady] = useState(false);
  useEffect(() => { let active = true; setResolving(true); const timer = setTimeout(() => addressAt(point).then(a => { if (active) setAddress(a || '주소 확인 불가'); }).catch(() => { if (active) setAddress('주소 확인 불가'); }).finally(() => { if (active) setResolving(false); }), 350); return () => { active = false; clearTimeout(timer); }; }, [point.lat, point.lng]);
  return <Modal className="app-map-modal registration-screen-dialog" title="위치 지정" onClose={onClose}><div className="app-location-picker"><MapCanvas tasks={[]} busStops={[]} aeds={[]} layers={{}} dataReady focusRequest={initialFocus} onReady={() => setReady(true)} currentPosition={currentPosition} locateToken={locateToken} onCenterChange={setPoint}><MapCenterPin /><div className="app-location-hint">지도를 움직여 가운데 핀에 위치를 맞춰 주세요</div><button className="map-current-location" aria-label="현재 위치" onClick={() => { if (!navigator.geolocation) { setError('내 위치를 사용하려면 위치 권한을 허용해 주세요.'); return; } navigator.geolocation.getCurrentPosition(p => { setCurrentPosition({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocateToken(v => v + 1); }, () => setError('현재 위치를 확인하지 못했습니다.')); }}><AppIcon name="locate-outline" /></button></MapCanvas><p>{resolving ? '주소 확인 중…' : address || '주소 확인 불가'}</p><p className="field-hint">위도 {Number(point.lat).toFixed(6)} · 경도 {Number(point.lng).toFixed(6)}</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="btn-primary" disabled={!ready || resolving || !validCoordinates(point)} onClick={() => onPick({ ...point, address: address === '주소 확인 불가' ? '' : address })}>이 위치로 지정</button></div></Modal>;
}
