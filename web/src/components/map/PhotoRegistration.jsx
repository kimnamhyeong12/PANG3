import { useEffect, useRef, useState } from 'react';
import { gps } from 'exifr';
import { upload } from '../../api/uploads.js';
import { addressAt, taskTypes } from '../../lib/mapRegistration.js';
import { readPhotoDraft, writePhotoDraft } from '../../lib/photoDraft.js';
import { usablePhotoCoordinates, suggestedPhotoName } from '../../lib/photoValidation.js';
import SelectionEmpty from '../SelectionEmpty.jsx';
import AppIcon from '../AppIcon.jsx';
import Modal from '../Modal.jsx';
import LocationPicker from './LocationPicker.jsx';
export default function PhotoRegistration({ user, groupId, onSaved, onBusyChange }) {
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [phase, setPhase] = useState('idle'), [error, setError] = useState(''), [result, setResult] = useState(null), [editingId, setEditingId] = useState(null), [ready, setReady] = useState(false);
  const input = useRef(null), lock = useRef(false), live = useRef(true), urls = useRef([]), writes = useRef(Promise.resolve()), fileMode = useRef(false), uploaded = useRef([]);
  const key = `${user.userId}:${groupId}`;
  const located = item => usablePhotoCoordinates(item.lat, item.lng), valid = items.filter(located), editing = items.find(i => i.id === editingId);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { live.current = true; readPhotoDraft(key).then(draft => {
    if (!live.current) return;
    const rows = (draft?.items || []).map(i => { const url = URL.createObjectURL(i.file); urls.current.push(url); return { ...i, url }; }); setItems(rows);
    if (draft?.phase === 'uploading') { const outcome = draft.result || { savedCount: 0, failures: [], unknownCount: 0, pendingCount: rows.length }; const active = draft.activeId; const remaining = rows.filter(i => located(i) && !draft.sentIds?.includes(i.id) && i.id !== active); setResult({ ...outcome, unknownCount: active ? 1 : 0, pendingCount: remaining.length, failures: [...(outcome.failures || []), ...(active ? [{ fileName: rows.find(i => i.id === active)?.file.name || '등록 중이던 사진', reason: '등록 결과는 지도에서 확인해 주세요.', unknown: true }] : [])] }); }
    else setResult(draft?.result || null); setReady(true);
  }).catch(() => { if (live.current) { setError('임시 저장 내용을 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.'); } }); return () => { live.current = false; urls.current.forEach(URL.revokeObjectURL); }; }, [key]);
  function persist(value) { writes.current = writes.current.catch(() => {}).then(() => writePhotoDraft(key, value)); return writes.current; }
  const snapshot = extra => ({ items: items.map(({ url, ...i }) => i), phase, result, ...extra });
  useEffect(() => { if (ready && !lock.current) persist(snapshot()).catch(() => { if (live.current) setError('작성 내용을 임시 저장하지 못했습니다.'); }); }, [items, result, ready]);
  async function choose(e) {
    const files = [...e.target.files]; e.target.value = ''; if (lock.current || !files.length) return;
    lock.current = true; setBusy(true); setPhase('reading'); setError('');
    try {
      const previous = fileMode.current ? [] : items; if (previous.length + files.length > 20) throw Error('사진은 최대 20장까지 선택할 수 있습니다.');
      const next = [...previous], seen = new Set(previous.map(i => i.sourceId));
      for (const file of files) {
        const sourceId = `${file.name}:${file.size}:${file.lastModified}`; if (seen.has(sourceId)) continue; seen.add(sourceId);
        let p; try { p = await gps(file); } catch {}
        const lat = p?.latitude, lng = p?.longitude; let address = '';
        if (usablePhotoCoordinates(lat, lng)) try { address = await addressAt({ lat, lng }); } catch {}
        if (!live.current) return; const url = URL.createObjectURL(file); urls.current.push(url);
        next.push({ id: crypto.randomUUID(), sourceId, file, url, lat, lng, address, name: suggestedPhotoName(address, next), task: '', coordinateSource: 'photo' });
      }
      if (live.current) { setItems(next); setResult(null); setPhase('idle'); }
    } catch (e) { if (live.current) setError(e.message); } finally { lock.current = false; if (live.current) setBusy(false); }
  }
  function change(id, patch) { setItems(old => old.map(i => i.id === id ? { ...i, ...patch } : i)); }
  async function save() {
    if (lock.current || result || !valid.length || valid.some(i => !i.name.trim())) return;
    lock.current = true; setBusy(true); setPhase('uploading'); setError('');
    const outcome = { savedCount: 0, failures: [], unknownCount: 0, pendingCount: valid.length }, sentIds = []; uploaded.current = [];
    try {
      for (let index = 0; index < valid.length; index++) {
        if (!live.current) break;
        const item = valid[index];
        // Persist intent before POST so an interrupted upload is never silently resent.
        await persist(snapshot({ phase: 'uploading', activeId: item.id, sentIds, result: { ...outcome, failures: [...outcome.failures] } }));
        try {
          const body = new FormData(); Object.entries({ createdByUserId: user.userId, groupId, name: item.name.trim(), lat: item.lat, lng: item.lng, task: item.task, roadAddress: item.address }).forEach(([k, v]) => { if (v != null) body.append(k, v); }); body.append('photo', item.file);
          const row = await upload('/api/locations/photos', body); if (!Number.isSafeInteger(row.taskId) || row.taskId <= 0 || !Number.isSafeInteger(row.progressId) || row.progressId <= 0) throw Error('서버의 사진 등록 결과를 확인할 수 없습니다.'); uploaded.current.push({ ...row, lat: item.lat, lng: item.lng }); outcome.savedCount++; sentIds.push(item.id); outcome.pendingCount--;
        } catch (failure) {
          const unknown = ![400, 401, 403, 413, 415, 422, 429].includes(failure.status);
          outcome.failures.push({ fileName: item.file.name, reason: failure.message, unknown }); outcome.pendingCount--; if (unknown) outcome.unknownCount++; else sentIds.push(item.id); if (unknown || [401, 403, 429].includes(failure.status)) break;
        }
        await persist(snapshot({ phase: 'uploading', activeId: null, sentIds, result: { ...outcome, failures: [...outcome.failures] } }));
        if (live.current) setResult({ ...outcome, failures: [...outcome.failures] });
      }
      await persist(snapshot({ phase: 'result', activeId: null, sentIds, result: outcome }));
      if (live.current) { setResult(outcome); setPhase('result'); }
    } catch (e) { if (live.current) setError(e.message || '작성 내용을 저장하지 못했습니다.'); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  async function finish(fresh) { if (lock.current) return; try { await persist(null); if (fresh) { setItems([]); setResult(null); setPhase('idle'); await writePhotoDraft(key, null); } else onSaved(uploaded.current); } catch { setError('작성 내용 정리 실패. 잠시 후 다시 시도해 주세요.'); } }
  return <div className="registration-flow app-photo-registration"><input type="file" hidden ref={input} accept="image/jpeg,image/png" multiple aria-label="등록할 사진" disabled={busy || !ready} onChange={choose} />
    {error && <p className="form-error" role="alert">{error}</p>}{busy && <p role="status">{phase === 'reading' ? '사진의 촬영 위치와 주소를 확인하고 있어요.' : `방문지 등록 중 · ${result?.savedCount || 0}/${valid.length}곳`}</p>}
    {!!items.length && <div className="app-sheet-heading"><strong>방문지 {valid.length}곳</strong><button className="text-button" disabled={busy || !!result || !ready} onClick={() => { fileMode.current = false; input.current.click(); }}>사진 추가</button></div>}
    {!items.length && <SelectionEmpty icon="images-outline">등록할 사진을 선택해 주세요<small>최대 20장까지 선택할 수 있어요.</small></SelectionEmpty>}
    {items.map(item => <article className="app-photo-row" key={item.id}><div className="app-photo-main"><img src={item.url} alt={item.file.name} /><div className="app-photo-details"><div className="app-sheet-heading"><strong>{located(item) ? '방문지 이름' : '위치정보 없음 · 등록 불가'}</strong><button className="icon-button" disabled={busy || !!result} aria-label={`${item.file.name} 제외`} onClick={() => setItems(old => old.filter(i => i.id !== item.id))}><AppIcon name="close" /></button></div>{located(item) && <><input className="input" aria-label={`${item.file.name} 방문지 이름`} placeholder="방문지명을 입력해 주세요" maxLength={255} value={item.name} disabled={busy || !!result} onChange={e => change(item.id, { name: e.target.value })} /><button className="text-button" disabled={busy || !!result} onClick={() => setEditingId(item.id)}>{item.coordinateSource === 'manual' ? '직접 지정한 위치 · 확인·변경' : '촬영 위치 확인됨 · 확인·변경'}</button></>}</div></div>{located(item) && <div className="app-task-chips">{taskTypes.map(task => <button key={task} aria-pressed={item.task === task} disabled={busy || !!result} onClick={() => change(item.id, { task: item.task === task ? '' : task })}>{task}</button>)}</div>}</article>)}
    {items.length ? <button className="btn-primary" disabled={busy || !ready || !!result || !valid.length || valid.some(i => !i.name.trim())} onClick={save}>{busy ? '등록 중…' : `방문지 ${valid.length}곳 등록`}</button> : <button className="btn-primary" disabled={busy || !ready} onClick={() => { fileMode.current = false; input.current.click(); }}>사진 선택</button>}
    {editing && <LocationPicker initialPoint={editing} onClose={() => setEditingId(null)} onPick={p => { change(editing.id, { ...p, coordinateSource: 'manual' }); setEditingId(null); }} />}
    {result && !busy && <Modal className="app-map-modal" title={result.failures.length || result.unknownCount || result.pendingCount ? `${result.savedCount}곳 등록 · 확인이 필요해요` : `방문지 ${result.savedCount}곳을 추가했어요`} onClose={() => finish(false)}>{!!(result.failures.length || result.unknownCount || result.pendingCount) && <p>실패 {result.failures.filter(f => !f.unknown).length}곳 · 저장 여부 미확인 {result.unknownCount}곳 · 미전송 {result.pendingCount}곳</p>}{result.failures.map((f, i) => <p key={i}>{f.fileName}: {f.reason}</p>)}{result.unknownCount > 0 && <p>중복 등록을 피하려면 지도에서 저장 여부를 먼저 확인해 주세요.</p>}<div className="action-row"><button className="btn-primary" onClick={() => finish(false)}>지도 보기</button><button className="btn-secondary" onClick={() => finish(true)}>새 사진 등록</button></div></Modal>}
  </div>;
}
