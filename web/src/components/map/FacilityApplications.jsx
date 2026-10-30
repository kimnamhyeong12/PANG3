import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { upload } from '../../api/uploads.js';
import Modal from '../Modal.jsx';
export default function FacilityApplications({
  onClose,
  initialId
}) {
  const [tab, setTab] = useState('form'),
    [rows, setRows] = useState([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [detail, setDetail] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [requestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    if (tab === 'mine') api.get('/api/facility-applications', {
      page
    }).then(r => {
      if (active) {
        setRows(r.items);
        setMore(r.hasMore);
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [tab, page]);
  useEffect(() => {
    let active = true;
    if (initialId) {
      setTab('mine');
      api.get(`/api/facility-applications/${initialId}`).then(d => {
        if (active) setDetail(d);
      }).catch(e => {
        if (active) setError(e.message);
      });
    }
    return () => {
      active = false;
    };
  }, [initialId]);
  return <Modal title="공공시설물 등록 신청" onClose={() => !busy && onClose()}><div className="tabs"><button className={`tab${tab === 'form' ? ' active' : ''}`} onClick={() => setTab('form')}>신청 작성</button><button className={`tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>내 신청</button></div>{error && <p className="form-error">{error}</p>}{tab === 'form' ? <form className="settings-form" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setError('');
      const data = new FormData(e.currentTarget),
        body = new FormData();
      body.append('application', JSON.stringify({
        name: data.get('name'),
        kind: data.get('kind'),
        address: data.get('address'),
        detailLocation: data.get('detailLocation'),
        confirmedDate: data.get('date'),
        description: data.get('description'),
        consent: true,
        requestKey
      }));
      body.append('photo', data.get('photo'));
      try {
        await upload('/api/facility-applications', body);
        setTab('mine');
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }}>{[['name', '시설물 이름'], ['kind', '시설물 종류'], ['address', '주소'], ['detailLocation', '상세 위치']].map(([name, label]) => <label key={name}>{label}<input className="input" name={name} required maxLength={200} /></label>)}<label>확인 날짜<input className="input" type="date" name="date" required /></label><label>설명<textarea className="input" name="description" maxLength={3000} /></label><label>촬영 위치가 포함된 원본 사진<input className="input" name="photo" type="file" required accept="image/jpeg" /></label><label><input type="checkbox" required /> 사진과 촬영 위치를 검토에 사용하는 데 동의합니다.</label><button className="btn-primary btn-inline" disabled={busy}>신청하기</button></form> : detail ? <><button className="btn-secondary" onClick={() => setDetail(null)}>신청 목록</button><h3>{detail.name}</h3><p>{detail.status}</p><p>{detail.reviewNote || '검토 중입니다.'}</p></> : <>{rows.map(r => <button className="place-result" key={r.id} onClick={async () => {
        try {
          setDetail(await api.get(`/api/facility-applications/${r.id}`));
        } catch (e) {
          setError(e.message);
        }
      }}><strong>{r.name}</strong><span>{{
            PENDING: '접수',
            REVIEWING: '검토 중',
            APPROVED: '승인',
            REJECTED: '반려',
            NEEDS_INFO: '보완 요청'
          }[r.status] || r.status}</span></button>)}{!rows.length && <p>신청 내역이 없습니다.</p>}<div className="action-row"><button className="btn-secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button><button className="btn-secondary" disabled={!more} onClick={() => setPage(p => p + 1)}>다음</button></div></>}</Modal>;
}
