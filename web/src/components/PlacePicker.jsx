import { useRef, useState } from 'react';
import { loadKakaoMaps } from '../lib/kakaoLoader.js';
import Modal from './Modal.jsx';
import MapCanvas from './map/MapCanvas.jsx';
export default function PlacePicker({
  onPick,
  onClose,
  title = '주소 또는 장소 검색'
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState([]),
    [candidate, setCandidate] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const seq = useRef(0);
  async function search(e) {
    e.preventDefault();
    const id = ++seq.current;
    setBusy(true);
    setError('');
    try {
      const k = await loadKakaoMaps();
      const rows = await new Promise(resolve => new k.maps.services.Places().keywordSearch(query, (r, status) => {
        if (status === k.maps.services.Status.OK) resolve(r);else new k.maps.services.Geocoder().addressSearch(query, addresses => resolve(addresses || []));
      }));
      if (id === seq.current) setResults(rows.map(r => ({
        label: r.place_name || r.address_name,
        address: r.road_address_name || r.road_address?.address_name || r.address_name,
        lat: Number(r.y),
        lng: Number(r.x)
      })));
    } catch (e) {
      if (id === seq.current) setError(e.message);
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }
  return <Modal title={candidate ? '위치 확인' : title} onClose={onClose}>{error && <p className="form-error">{error}</p>}{candidate ? <><div className="place-picker-map"><MapCanvas tasks={[]} busStops={[]} aeds={[]} layers={{
          tasks: false
        }} searchResult={candidate} dataReady /></div><p>{candidate.label}</p><p>{candidate.address}</p><div className="action-row"><button className="btn-secondary" onClick={() => setCandidate(null)}>다시 검색</button><button className="btn-primary btn-inline" onClick={() => onPick(candidate)}>이 위치로 선택</button></div></> : <><form className="action-row" onSubmit={search}><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="주소 또는 장소" required /><button className="btn-primary btn-inline" disabled={busy}>{busy ? '검색 중…' : '검색'}</button></form>{results.map((r, i) => <button className="place-result" key={i} onClick={() => setCandidate(r)}><strong>{r.label}</strong><span>{r.address}</span></button>)}</>}</Modal>;
}
