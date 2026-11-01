import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../../lib/placeSearch.js';
import { isRegisteredPlace } from '../../../../frontend/utils/placeSearch.js';
import Modal from '../Modal.jsx';
import AppIcon from '../AppIcon.jsx';
function Highlight({ text = '', query }) {
  const q = query.trim(), parts = []; let cursor = 0, index;
  if (!q) return text;
  while ((index = text.toLowerCase().indexOf(q.toLowerCase(), cursor)) !== -1) { parts.push(text.slice(cursor, index), <mark key={index}>{text.slice(index, index + q.length)}</mark>); cursor = index + q.length; }
  parts.push(text.slice(cursor)); return parts;
}
export default function PlaceSearch({ userId, center, locations = [], onClose, onResults, onAdd, onPick, history = true, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery), [results, setResults] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [completed, setCompleted] = useState(null);
  const key = `pang3:place-search:${userId}`;
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '[]').slice(0, 20); } catch { return []; } });
  const seq = useRef(0), controller = useRef(null), timer = useRef(null), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; seq.current++; controller.current?.abort(); clearTimeout(timer.current); }; }, []);
  function saveRecent(next) { setRecent(next); if (history) localStorage.setItem(key, JSON.stringify(next)); }
  function remember(text, place) { if (!history) return; const id = place ? `place:${place.id || `${place.lng}:${place.lat}:${place.label}`}` : `query:${text}`; saveRecent([{ id, query: text, place, date: new Date().toISOString() }, ...recent.filter(r => r.id !== id)].slice(0, 20)); }
  async function run(text, submit = false) {
    if (submit) clearTimeout(timer.current);
    const q = text.trim(), id = ++seq.current; controller.current?.abort();
    if (!q || (!submit && q.length < 2)) { setResults([]); setError(''); setBusy(false); return; }
    controller.current = new AbortController(); setBusy(true); setError(''); setResults([]);
    try {
      const rows = await searchPlaces(q, { center, limit: submit ? 30 : 7, signal: controller.current.signal });
      if (!live.current || id !== seq.current) return; setResults(rows); setCompleted(q);
      if (submit && onResults && rows.length) { remember(q); onResults(rows, q); }
    } catch (e) { if (live.current && id === seq.current && e.name !== 'AbortError') setError(e.message); }
    finally { if (live.current && id === seq.current) setBusy(false); }
  }
  useEffect(() => { timer.current = setTimeout(() => run(query), 300); return () => clearTimeout(timer.current); }, [query, center?.lat, center?.lng]);
  function change(text) { seq.current++; controller.current?.abort(); setResults([]); setError(''); setCompleted(null); setBusy(false); setQuery(text); }
  function pick(place, add) { remember(query.trim() || place.label, place); if (!add && !onPick) { change(place.label); return; } (add ? onAdd : onPick)?.(place); }
  return <Modal className="app-map-modal app-place-search" title="주소 또는 방문지 검색" onClose={onClose}><form className="app-search-form" onSubmit={e => { e.preventDefault(); run(query, true); }}><input autoFocus className="input" aria-label="주소 또는 방문지 검색" placeholder="주소 또는 방문지 검색" value={query} onChange={e => change(e.target.value)} />{query && <button type="button" className="icon-button" aria-label="검색어 지우기" onClick={() => change('')}><AppIcon name="close-circle" /></button>}<button className="icon-button" aria-label="지도에서 검색 결과 보기"><AppIcon name="search" /></button></form>
    {!query.trim() && history && <><div className="app-sheet-heading"><strong>최근 검색</strong><button className="text-button" aria-label="최근 검색 전체 삭제" onClick={() => saveRecent([])}>전체 삭제</button></div>{!recent.length && <p className="field-hint">최근 검색 기록이 없습니다.</p>}{recent.map(r => <div className="app-search-result" key={r.id}><button onClick={() => { if (r.place && onPick) { remember(r.query, r.place); onPick(r.place); } else change(r.place?.label || r.query); }}><strong>{r.place?.label || r.query}</strong>{r.place && <small>{r.place.address}</small>}</button><button className="icon-button" aria-label={`${r.query} 기록 삭제`} onClick={() => saveRecent(recent.filter(item => item.id !== r.id))}><AppIcon name="close" /></button></div>)}</>}
    {busy && <p role="status">검색 중…</p>}{error && <p className="form-error" role="alert">{error}</p>}{!busy && !error && completed === query.trim() && !results.length && <p className="field-hint">검색 결과가 없습니다.</p>}{query.trim().length === 1 && completed !== query.trim() && <p className="field-hint">두 글자 이상 입력해 주세요. 검색 버튼으로 바로 검색할 수도 있습니다.</p>}
    {results.map((p, index) => <div className="app-search-result" key={p.id || index}><button onClick={() => pick(p, false)}><strong><Highlight text={p.label} query={query} /></strong><small>{p.address}</small>{p.distanceValue != null && <small>{p.distanceValue < 1000 ? `${Math.round(p.distanceValue)}m` : `${(p.distanceValue / 1000).toFixed(1)}km`}</small>}</button>{onAdd && <button className="btn-secondary" aria-label={isRegisteredPlace(p, locations) ? '진행 중인 장소에 새 업무 추가' : `${p.label} 방문지 추가`} onClick={() => pick(p, true)}><AppIcon name={isRegisteredPlace(p, locations) ? 'checkmark' : 'add-circle-outline'} />{isRegisteredPlace(p, locations) ? '새 업무' : '추가'}</button>}</div>)}
  </Modal>;
}
