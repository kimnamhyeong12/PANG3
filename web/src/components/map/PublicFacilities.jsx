import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { facilityRegion } from '../../lib/mapRegistration.js';
import AppIcon from '../AppIcon.jsx';
export default function PublicFacilities({ user, group, personal, boundaries, onClose, onApplication, onMapItems, onSaved, selectedId }) {
  const [categories, setCategories] = useState([]), [category, setCategory] = useState(''), [categoryOpen, setCategoryOpen] = useState(false), [dongOpen, setDongOpen] = useState(false);
  const [dong, setDong] = useState(null), [items, setItems] = useState([]), [chosen, setChosen] = useState([]), [expanded, setExpanded] = useState(true), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const key = `pang3:favorite-dongs:${user.userId}:${group.groupId}`;
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } });
  const lastPick = useRef(null), lock = useRef(false);
  const name = feature => String(feature?.properties?.adm_nm || feature?.properties?.name || '').split(/\s+/).at(-1) || '';
  const regions = useMemo(() => [...(boundaries?.features || [])].sort((a, b) => Number(favorites.includes(name(b))) - Number(favorites.includes(name(a))) || name(a).localeCompare(name(b), 'ko')), [boundaries, favorites]);
  useEffect(() => { let active = true; api.get('/api/public-data/categories').then(c => { if (active) setCategories(c); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; onMapItems([], []); }; }, []);
  useEffect(() => {
    let active = true; setItems([]); setChosen([]); setError('');
    if (!category || !dong) return;
    setBusy(true);
    api.get('/api/public-data', { category, ...facilityRegion(dong, group, user, personal) }).then(data => { if (active) setItems(data.items || []); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [category, dong]);
  useEffect(() => { onMapItems(items, chosen); }, [items, chosen, onMapItems]);
  useEffect(() => { if (selectedId?.token && lastPick.current !== selectedId.token) { lastPick.current = selectedId.token; toggle(selectedId.id); } }, [selectedId]);
  function toggle(id) { if (!lock.current) setChosen(old => old.includes(id) ? old.filter(v => v !== id) : [...old, id]); }
  async function register() {
    if (lock.current || !chosen.length) return; lock.current = true; setSaving(true); setError('');
    const saved = [];
    try {
      for (const item of items.filter(p => chosen.includes(p.id))) {
        const row = await api.post('/api/locations', { createdByUserId: user.userId, groupId: group.groupId, detailAddress: item.detailAddress, roadAddress: item.roadAddress, lat: item.lat, lng: item.lng, taskCategory: item.task, status: 'pending', sido: item.sido, sigungu: item.sigungu, adminDong: item.adminDong, deferAssignment: !personal });
        saved.push(row); setChosen(old => old.filter(id => id !== item.id));
      }
      onSaved(saved);
    } catch (e) { if (saved.length) onSaved(saved, true); setError(e.message); }
    finally { lock.current = false; setSaving(false); }
  }
  return <>
    <div className="app-public-controls">
      <button className="input" aria-label="공공시설물 조회 지역 선택" disabled={saving} onClick={() => { setDongOpen(v => !v); setCategoryOpen(false); }}><AppIcon name="map-outline" />{name(dong) || '행정동'}</button>
      <button className="input app-select" aria-label="공공시설물 카테고리 선택" disabled={saving} aria-expanded={categoryOpen} onClick={() => { setCategoryOpen(v => !v); setDongOpen(false); }}><span>{categories.find(c => c.key === category)?.label || '카테고리 선택'}</span><AppIcon name={categoryOpen ? 'chevron-up' : 'chevron-down'} /></button>
      <button className="input" aria-label="공공시설물 조회 닫기" disabled={saving} onClick={onClose}><AppIcon name="close" /></button>
    </div>
    {categoryOpen && <div className="app-map-dropdown app-public-category">{categories.map(c => <button key={c.key} disabled={saving} aria-pressed={category === c.key} onClick={() => { setCategory(c.key); setCategoryOpen(false); setExpanded(true); }}><AppIcon name={c.icon || 'location-outline'} /><span>{c.label}</span>{category === c.key && <AppIcon name="checkmark-circle" />}</button>)}<button onClick={() => { setCategoryOpen(false); onApplication(); }}><AppIcon name="add-circle-outline" /><span>공공시설물 등록 신청</span></button></div>}
    {dongOpen ? <section className="app-map-sheet"><div className="app-sheet-heading"><strong>공공시설물 조회 지역</strong><button className="icon-button" aria-label="조회 지역 선택 닫기" onClick={() => setDongOpen(false)}><AppIcon name="close" /></button></div><div className="app-sheet-scroll">{regions.map((f, index) => <div className="app-region-row" key={f.properties.adm_cd || index}><button aria-pressed={name(dong) === name(f)} onClick={() => { setDong(f); setDongOpen(false); setExpanded(true); }}>{name(f)}{name(dong) === name(f) && <AppIcon name="checkmark-circle" />}</button><button aria-label={`${name(f)} 즐겨찾기`} aria-pressed={favorites.includes(name(f))} onClick={() => setFavorites(old => { const next = old.includes(name(f)) ? old.filter(v => v !== name(f)) : [...old, name(f)]; localStorage.setItem(key, JSON.stringify(next)); return next; })}><AppIcon name={favorites.includes(name(f)) ? 'star' : 'star-outline'} /></button></div>)}{!regions.length && <p className="field-hint">표시할 행정동이 없습니다.</p>}</div></section> : expanded ? <section className="app-map-sheet">
      <div className="app-sheet-heading"><button className="text-button" aria-label="공공시설물 목록 접기" onClick={() => setExpanded(false)}><strong>{!category ? '공공시설물' : busy ? '공공시설물을 불러오는 중...' : `${categories.find(c => c.key === category)?.label || '공공시설물'} ${items.length}곳`}</strong></button><button className="text-button" disabled={busy || saving || !items.length} onClick={() => setChosen(chosen.length === items.length ? [] : items.map(i => i.id))}>{items.length && chosen.length === items.length ? '전체 해제' : '전체 선택'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="app-sheet-scroll">{!dong ? <button className="text-button" onClick={() => setDongOpen(true)}>시설물을 조회하려면 행정동을 선택해 주세요.</button> : !category ? <p className="field-hint">카테고리를 선택해 주세요.</p> : busy ? <p role="status">시설물을 불러오는 중...</p> : items.length ? items.map(item => <label className="check-row" key={item.id}><input type="checkbox" disabled={saving} checked={chosen.includes(item.id)} onChange={() => toggle(item.id)} /><span><strong>{item.detailAddress || item.roadAddress || '공공시설물'}</strong><small>{item.roadAddress || item.adminDong || ''}</small></span></label>) : !error && <p className="field-hint">선택한 행정동에 시설물이 없습니다.</p>}</div>
      <button className="btn-primary" disabled={!chosen.length || saving} onClick={register}>{saving ? '등록 중' : `${chosen.length}건 등록`}</button>
    </section> : <button className="app-public-collapsed btn-secondary" aria-label="공공시설물 목록 펼치기" onClick={() => setExpanded(true)}>{dong ? `공공시설물 ${items.length}곳 보기` : '조회할 행정동 선택'}</button>}
  </>;
}
