import useLiveRevision from '../useLiveRevision.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { upload } from '../../api/uploads.js';
import { addressAt, applicationStatus, koreaDay, readOriginalPhoto } from '../../lib/mapRegistration.js';
import Modal from '../Modal.jsx';
import AppIcon from '../AppIcon.jsx';
import MapCanvas from './MapCanvas.jsx';

function EvidenceImage({ id, kind }) {
  const [source, setSource] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let active = true, url; setSource(''); setError('');
    api.download(`/api/facility-applications/${id}/evidence/${kind}`).then(blob => { url = URL.createObjectURL(blob); if (active) setSource(url); else URL.revokeObjectURL(url); }).catch(() => { if (active) setError('사진을 불러오지 못했습니다. 다시 열어 주세요.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, kind]);
  return source ? <img className="facility-evidence" src={source} alt={kind === 'photo' ? '시설물 원본 증빙 사진' : '시설물 위치 증빙'} /> : <p className="field-hint">{error || '사진을 불러오는 중…'}</p>;
}
export default function FacilityApplications({ onClose, initialId }) {
  const liveRevision = useLiveRevision(['applications']);
  const [tab, setTab] = useState(initialId ? 'history' : 'form');
  const [name, setName] = useState(''), [kindChoice, setKindChoice] = useState(''), [customKind, setCustomKind] = useState(''), [kindOpen, setKindOpen] = useState(false);
  const [categories, setCategories] = useState([]), [categoryLoading, setCategoryLoading] = useState(true), [categoryError, setCategoryError] = useState(''), [categoryRevision, setCategoryRevision] = useState(0);
  const [photo, setPhoto] = useState(null), [photoError, setPhotoError] = useState(''), [address, setAddress] = useState('');
  const [location, setLocation] = useState(''), [date, setDate] = useState(koreaDay()), [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false), [noticeExpanded, setNoticeExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [rows, setRows] = useState([]), [page, setPage] = useState(0), [more, setMore] = useState(false), [selected, setSelected] = useState(initialId), [detail, setDetail] = useState(null), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const lock = useRef(false), request = useRef(null), fileInput = useRef(null);
  const kind = kindChoice === 'custom' ? customKind : kindChoice;
  useEffect(() => {
    let active = true; setCategoryLoading(true); setCategoryError('');
    api.get('/api/public-data/categories').then(data => { if (!Array.isArray(data) || !data.length) throw Error('등록된 시설 종류를 불러오지 못했습니다.'); if (active) setCategories([...new Set(data.map(c => c.label).filter(Boolean))]); }).catch(e => { if (active) setCategoryError(e.message); }).finally(() => { if (active) setCategoryLoading(false); });
    return () => { active = false; };
  }, [categoryRevision]);
  useEffect(() => {
    if (tab !== 'history') return;
    let active = true; setLoading(true); setError('');
    api.get(selected ? `/api/facility-applications/${selected}` : '/api/facility-applications', selected ? undefined : { page }).then(data => {
      if (!active) return;
      if (selected) setDetail(data); else { setRows(old => page ? [...old, ...data.items.filter(item => !old.some(r => r.id === item.id))] : data.items); setMore(data.hasMore); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, selected, page, revision, liveRevision]);
  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo?.url]);
  async function choosePhoto(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file || lock.current) return;
    lock.current = true; setBusy(true); setPhotoError('');
    try { const item = await readOriginalPhoto(file); setPhoto({ ...item, url: URL.createObjectURL(file), identity: crypto.randomUUID() }); setAddress(''); try { setAddress(await addressAt(item)); } catch {} }
    catch (failure) { setPhotoError(failure.message); } finally { lock.current = false; setBusy(false); }
  }
  async function submit(e) {
    e.preventDefault(); if (lock.current) return;
    if (!name.trim() || !kind.trim() || !photo || !consent) { setError('필수 항목, 원본 사진과 위치정보 수집 동의를 확인해 주세요.'); return; }
    if (!date || date > koreaDay()) { setError('오늘 이후 날짜는 선택할 수 없습니다.'); return; }
    lock.current = true; setBusy(true); setError(''); setPhotoError('');
    try {
      const values = { name: name.trim(), kind: kind.trim(), address, detailLocation: location.trim(), confirmedDate: date, description: description.trim(), consent: true };
      const signature = JSON.stringify([values, photo.identity]);
      if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
      const body = new FormData(); body.append('application', JSON.stringify({ ...values, requestKey: request.current.key })); body.append('photo', photo.file);
      await upload('/api/facility-applications', body);
      setName(''); setKindChoice(''); setCustomKind(''); setKindOpen(false); setLocation(''); setDescription(''); setPhoto(null); setAddress(''); setConsent(false); request.current = null;
      setTab('history'); setPage(0); setSelected(null); setDetail(null); setRevision(v => v + 1);
    } catch (failure) { if (failure.status === 413) setPhotoError(failure.message); else setError(failure.message); } finally { lock.current = false; setBusy(false); }
  }
  function changeTab(next) { setTab(next); setSelected(null); setDetail(null); setPage(0); setError(''); setRevision(v => v + 1); }
  return <Modal className="app-map-modal registration-screen-dialog facility-application-modal" title="공공시설물 등록 신청" onClose={() => !lock.current && onClose()}><div className="facility-application">
    <div className="facility-tabs" role="tablist">{[['form', '등록 신청'], ['history', '내 신청 내역']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} disabled={busy} onClick={() => changeTab(key)}>{label}</button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <form hidden={tab !== 'form'} className="facility-form" onSubmit={submit}>
      <p className="field-hint">여러 시설물을 한 번에 등록하려면 고객센터의 문의하기에서 ‘대량 데이터 등록 요청’을 선택해 주세요.</p>
      <label>시설물 이름 <span className="required">*</span><input className="input" aria-label="시설물 이름" placeholder="시설물 이름" value={name} maxLength={100} disabled={busy} required onChange={e => setName(e.target.value)} /></label>
      <div className="facility-kind"><span className="field-label">시설 종류 <span className="required">*</span></span><button type="button" className="input app-select" aria-label="시설 종류 선택" aria-expanded={kindOpen} disabled={busy} onClick={() => setKindOpen(v => !v)}><span>{kindChoice === 'custom' ? '직접 입력 (새 카테고리 요청)' : kindChoice || '시설 종류를 선택해 주세요.'}</span><AppIcon name={kindOpen ? 'chevron-up' : 'chevron-down'} /></button>
        {kindOpen && <div className="app-inline-options" role="radiogroup" aria-label="시설 종류 목록">{categoryLoading && <p role="status">시설 종류를 불러오는 중…</p>}{categoryError && <><p className="form-error" role="alert">{categoryError}</p><button type="button" className="btn-secondary" disabled={categoryLoading} onClick={() => setCategoryRevision(v => v + 1)}>시설 종류 다시 불러오기</button></>}{[...categories.map(label => ({ value: label, label })), { value: 'custom', label: '직접 입력 (새 카테고리 요청)' }].map(option => <button type="button" role="radio" disabled={busy} aria-checked={kindChoice === option.value} key={option.value} onClick={() => { setKindChoice(option.value); setKindOpen(false); }}><span>{option.label}</span>{kindChoice === option.value && <AppIcon name="checkmark" />}</button>)}</div>}
        {kindChoice === 'custom' && <><input className="input" aria-label="새 시설 카테고리 이름" placeholder="새 카테고리 이름을 입력해 주세요." value={customKind} maxLength={40} disabled={busy} onChange={e => setCustomKind(e.target.value)} /><p className="field-hint">등록된 종류에 없으면 새 카테고리 이름을 입력해 주세요. 시설물 등록 신청과 함께 검토를 요청하며, 관리자 승인 후 카테고리에 추가됩니다.</p></>}
      </div>
      <div className="facility-photo-field"><span className="field-label">시설물 원본 사진 <span className="required">*</span></span><input hidden type="file" ref={fileInput} accept="image/jpeg,image/png" onChange={choosePhoto} disabled={busy} aria-label="시설물 원본 사진" /><button type="button" className="btn-secondary" disabled={busy} onClick={() => fileInput.current.click()}><AppIcon name="camera-outline" />{photo ? '시설물 사진 변경' : '시설물 원본 사진 선택'}</button><p className="field-hint">촬영 위치정보가 포함된 15MB 이하의 JPG·PNG 원본 사진을 선택해 주세요.</p>{photoError && <p className="form-error" role="alert">{photoError}</p>}</div>
      {photo && <><img className="facility-evidence" src={photo.url} alt="시설물 원본 사진 미리보기" /><div className="facility-location"><strong>촬영 위치 확인됨</strong><p>{address || '주소를 확인할 수 없습니다. 좌표로 검토합니다.'}</p><p>위도 {photo.lat.toFixed(6)} · 경도 {photo.lng.toFixed(6)}</p></div><div className="facility-map"><MapCanvas tasks={[]} busStops={[]} aeds={[]} layers={{}} dataReady searchResult={photo} showTaskInfo={false} /></div></>}
      <label>상세 위치<input className="input" aria-label="상세 위치" placeholder="예: 건물 뒤편, 1층 안내데스크 옆" value={location} maxLength={300} disabled={busy} onChange={e => setLocation(e.target.value)} /></label>
      <label>확인 날짜 <span className="required">*</span><input type="date" className="input" aria-label="시설물 확인 날짜" value={date} max={koreaDay()} required disabled={busy} onChange={e => { if (e.target.value > koreaDay()) setError('오늘 이후 날짜는 선택할 수 없습니다.'); else { setDate(e.target.value); setError(''); } }} /></label>
      <label>추가 설명<textarea className="input" aria-label="추가 설명" placeholder="검토에 필요한 내용을 적어 주세요." maxLength={3000} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} /></label>
      <div className="facility-privacy"><div className="facility-consent"><label><input type="checkbox" aria-label="사진·촬영 위치정보 수집·이용 동의" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />(필수) 정보 수집·이용 동의</label><button type="button" className="text-button" aria-label="정보 수집·이용 안내 전문보기" aria-expanded={noticeExpanded} onClick={() => setNoticeExpanded(v => !v)}>{noticeExpanded ? '접기' : '전문보기'}</button></div>{noticeExpanded && <div className="facility-location"><strong>사진·촬영 위치정보 수집·이용 안내</strong><p>사진·촬영 위치정보를 시설물 검토 목적으로 수집·이용합니다.</p><p>승인된 시설물 이름·종류·위치만 공공데이터에 공개되며 신청자 정보와 증빙 사진은 공개되지 않습니다.</p></div>}</div>
      <button className="btn-primary" disabled={busy || !photo || !name.trim() || !kind.trim() || !consent}>{busy ? '확인·접수 중…' : '등록 신청'}</button>
    </form>
    {tab === 'history' && <div className="facility-history"><button className="btn-secondary" disabled={loading} onClick={() => { setPage(0); setRevision(v => v + 1); }}>새로고침</button>{loading && <p role="status">불러오는 중…</p>}{selected && detail ? <><button className="btn-secondary" onClick={() => { setSelected(null); setDetail(null); }}>목록으로</button><strong>{detail.name} · {applicationStatus[detail.status]}</strong><p>{detail.kind} · {detail.confirmedDate}</p><p>{detail.address} {detail.detailLocation}</p><p>위도 {detail.photoLat} · 경도 {detail.photoLng}</p><EvidenceImage id={detail.id} kind="photo" />{detail.hasScreenshot && <EvidenceImage id={detail.id} kind="screenshot" />}<p>{detail.description}</p>{detail.reviewNote && <div className="facility-location"><strong>관리자 검토 내용</strong><p>{detail.reviewNote}</p></div>}</> : !selected && <>{rows.map(r => <button className="place-result" key={r.id} onClick={() => { setDetail(null); setSelected(r.id); }}><strong>{r.name}</strong><span>{r.kind} · {applicationStatus[r.status]}</span></button>)}{!loading && !error && !rows.length && <p className="field-hint">등록 신청 내역이 없습니다.</p>}{more && <button className="btn-secondary" disabled={loading} onClick={() => setPage(p => p + 1)}>이전 신청 더 보기</button>}</>}</div>}
  </div></Modal>;
}
