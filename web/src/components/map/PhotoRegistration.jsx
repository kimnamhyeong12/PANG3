import { useEffect, useRef, useState } from 'react';
import { gps } from 'exifr';
import { loadKakaoMaps } from '../../lib/kakaoLoader.js';
import { upload } from '../../api/uploads.js';
import FilePicker from '../FilePicker.jsx';
import SelectionEmpty from '../SelectionEmpty.jsx';
import MapCanvas from './MapCanvas.jsx';

export default function PhotoRegistration({ user, groupId, onSaved, onBusyChange }) {
  const [items, setItems] = useState([]), [editing, setEditing] = useState(null), [center, setCenter] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const previews = useRef([]);
  useEffect(() => () => previews.current.forEach(URL.revokeObjectURL), []);
  async function choose(event) {
    setBusy(true); setError('');
    try {
      const files = [...event.target.files];
      if (items.length + files.length > 20) throw Error('사진은 최대 20장까지 선택할 수 있습니다.');
      const added = await Promise.all(files.map(async file => {
        let point; try { point = await gps(file); } catch {}
        const url = URL.createObjectURL(file); previews.current.push(url);
        let address = '';
        if (point) try { const k = await loadKakaoMaps(); address = await new Promise(resolve => new k.maps.services.Geocoder().coord2Address(point.longitude, point.latitude, rows => resolve(rows?.[0]?.road_address?.address_name || rows?.[0]?.address?.address_name || ''))); } catch {}
        return { id: crypto.randomUUID(), file, url, name: address, address, task: '', lat: point?.latitude, lng: point?.longitude };
      }));
      setItems(old => [...old, ...added]);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const located = item => Number.isFinite(item.lat) && Number.isFinite(item.lng);
  const valid = items.filter(located);
  const change = (id, patch) => setItems(old => old.map(item => item.id === id ? { ...item, ...patch } : item));
  async function save() {
    setBusy(true); setError('');
    const saved = [];
    try {
      for (const item of valid) {
        const body = new FormData();
        Object.entries({ createdByUserId: user.userId, groupId, name: item.name.trim(), lat: item.lat, lng: item.lng, task: item.task, roadAddress: item.address }).forEach(([key, value]) => { if (value != null) body.append(key, value); });
        body.append('photo', item.file);
        await upload('/api/locations/photos', body); saved.push(item.id);
      }
      onSaved();
    } catch (failure) { setItems(old => old.filter(item => !saved.includes(item.id))); setUncertain(!failure.status || failure.status >= 500); setError(`${saved.length}곳 등록 · ${failure.message}${(!failure.status || failure.status >= 500) ? " · 저장 여부를 지도에서 확인해 주세요." : ""}`); }
    finally { setBusy(false); }
  }
  return <div className="registration-flow">
    <FilePicker title={items.length ? '사진 추가' : '사진 선택'} hint="원본 사진 · 최대 20장" accept="image/jpeg,image/png" multiple disabled={busy} onChange={choose} />
    {!items.length && <SelectionEmpty icon="image-outline">등록할 사진을 선택해 주세요</SelectionEmpty>}
    {items.map(item => <article className="photo-registration-row" key={item.id}><img src={item.url} alt={item.file.name} /><div className="photo-registration-fields"><div className="action-row"><strong>{located(item) ? '방문지 이름' : '위치정보 없음 · 등록 불가'}</strong><button className="icon-button" aria-label={`${item.file.name} 제외`} disabled={busy} onClick={() => setItems(old => old.filter(p => p.id !== item.id))}>×</button></div>{located(item) && <><input className="input" aria-label={`${item.file.name} 방문지 이름`} placeholder="방문지 이름" maxLength={255} value={item.name} disabled={busy} onChange={e => change(item.id, { name: e.target.value })} /><button className="text-button" disabled={busy} onClick={() => { setEditing(item.id); setCenter(item); }}>촬영 위치 확인·변경</button><div className="segmented">{['점검', '공사', '안전', '환경', '민원'].map(task => <button key={task} disabled={busy} className={item.task === task ? 'active' : ''} onClick={() => change(item.id, { task: item.task === task ? '' : task })}>{task}</button>)}</div></>}</div></article>)}
    {editing && <div className="photo-location-editor"><MapCanvas tasks={[]} busStops={[]} aeds={[]} layers={{}} dataReady searchResult={items.find(item => item.id === editing)} onCenterChange={setCenter} showTaskInfo={false}><div className="map-center-pin" aria-hidden="true">📍</div></MapCanvas><div className="action-row"><button className="btn-secondary" onClick={() => setEditing(null)}>취소</button><button className="btn-primary btn-inline" disabled={!center} onClick={() => { change(editing, { lat: center.lat, lng: center.lng }); setEditing(null); }}>이 위치로 지정</button></div></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="btn-primary btn-inline" disabled={busy || uncertain || !valid.length || valid.some(item => !item.name.trim())} onClick={save}>{busy ? '처리 중…' : `방문지 ${valid.length}곳 등록`}</button>
  </div>;
}
