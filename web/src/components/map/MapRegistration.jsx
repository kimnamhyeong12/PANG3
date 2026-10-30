import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { upload } from '../../api/uploads.js';
import { fetchProjects, fetchProjectPlaces, registerProjectPlaces } from '../../api/projects.js';
import { loadKakaoMaps } from '../../lib/kakaoLoader.js';
import { detectBulkImportSettings } from '../../lib/bulkImportSettings.js';
import Modal from '../Modal.jsx';
import PlacePicker from '../PlacePicker.jsx';
import FacilityApplications from './FacilityApplications.jsx';
const titles = {
  manual: '방문지 등록',
  public: '공공시설물',
  project: '프로젝트 방문지',
  excel: '엑셀 등록',
  photo: '사진 등록',
  workplace: '근무지'
};
export default function MapRegistration({
  method,
  point,
  groupId,
  user,
  boundaries,
  onClose,
  onSaved
}) {
  const [projects, setProjects] = useState([]),
    [project, setProject] = useState(''),
    [places, setPlaces] = useState([]),
    [chosen, setChosen] = useState([]),
    [categories, setCategories] = useState([]),
    [category, setCategory] = useState('aed'),
    [dong, setDong] = useState(''),
    [items, setItems] = useState([]);
  const [name, setName] = useState(point?.label || ''),
    [address, setAddress] = useState(point?.address || ''),
    [coords, setCoords] = useState(point),
    [task, setTask] = useState(''),
    [picker, setPicker] = useState(false),
    [file, setFile] = useState(null),
    [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [facility, setFacility] = useState(false);
  useEffect(() => {
    let active = true;
    fetchProjects(groupId, user.userId).then(p => {
      if (active) setProjects(p);
    }).catch(e => {
      if (method === 'project' && active) setError(e.message);
    });
    if (method === 'public') api.get('/api/public-data/categories').then(c => {
      if (active) setCategories(c);
    }).catch(e => {
      if (active) setError(e.message);
    });
    if (method === 'workplace') {
      setAddress(user.workplaceAddress || '');
      setCoords(user.workplaceLat != null ? {
        lat: user.workplaceLat,
        lng: user.workplaceLng
      } : null);
    }
    return () => {
      active = false;
    };
  }, [groupId, user.userId, method]);
  useEffect(() => {
    let active = true;
    setPlaces([]);
    setChosen([]);
    if (method === 'project' && project) fetchProjectPlaces(project).then(p => {
      if (active) setPlaces(p);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [method, project]);
  useEffect(() => {
    let active = true;
    setItems([]);
    setChosen([]);
    if (method === 'public' && dong) {
      setBusy(true);
      api.get('/api/public-data', {
        category,
        admCode: dong
      }).then(r => {
        if (active) setItems(r.items || []);
      }).catch(e => {
        if (active) setError(e.message);
      }).finally(() => {
        if (active) setBusy(false);
      });
    }
    return () => {
      active = false;
    };
  }, [method, category, dong]);
  const run = async fn => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const create = async p => {
    let area = {};
    try {
      const k = await loadKakaoMaps();
      area = await new Promise(resolve => new k.maps.services.Geocoder().coord2RegionCode(p.lng, p.lat, rows => {
        const r = rows?.find(v => v.region_type === 'H') || rows?.[0];
        resolve(r ? {
          sido: r.region_1depth_name,
          sigungu: r.region_2depth_name,
          adminDong: r.region_3depth_name
        } : {});
      }));
    } catch {}
    return api.post('/api/locations', {
      createdByUserId: user.userId,
      groupId,
      detailAddress: p.label || name,
      roadAddress: p.address || address,
      lat: p.lat,
      lng: p.lng,
      status: 'pending',
      task,
      projectId: project ? Number(project) : null,
      ...area
    });
  };
  const check = id => setChosen(old => old.includes(id) ? old.filter(v => v !== id) : [...old, id]);
  async function readFile(file) {
    setError('');
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), {
        type: 'array'
      });
      const values = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
        header: 1,
        defval: '',
        raw: false
      });
      const settings = detectBulkImportSettings(values);
      if (settings.nameColumn < 0 && settings.addressColumns.length === 0) throw Error('첫 행에 방문지명, 주소, 위도, 경도 열 이름을 넣어주세요.');
      setRows(values.slice(settings.hasHeader ? 1 : 0).map((r, i) => ({
        rowNumber: i + 2,
        name: String(r[settings.nameColumn] || ''),
        roadAddress: String(r[settings.addressColumns[0]] || ''),
        lat: String(r[settings.latColumn] || ''),
        lng: String(r[settings.lngColumn] || '')
      })).filter(r => r.name || r.roadAddress));
    } catch (e) {
      setError(e.message);
    }
  }
  if (facility) return <FacilityApplications onClose={() => setFacility(false)} />;
  return <><Modal title={titles[method]} onClose={() => !busy && onClose()}>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {method === 'public' ? <><div className="action-row"><select className="input" aria-label="시설물 종류" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select><select className="input" aria-label="행정동" value={dong} onChange={e => setDong(e.target.value)}><option value="">행정동 선택</option>{boundaries?.features?.map(f => <option value={f.properties.adm_cd} key={f.properties.adm_cd}>{f.properties.adm_nm}</option>)}</select></div>{!boundaries?.features?.length && <p>설정 또는 그룹 관리에서 활동 지역을 지정해 주세요.</p>}<div className="registration-list">{items.map(p => <label className="check-row" key={p.id}><input type="checkbox" checked={chosen.includes(p.id)} onChange={() => check(p.id)} /><span>{p.detailAddress}<small>{p.roadAddress}</small></span></label>)}</div><div className="action-row"><button className="btn-secondary" disabled={busy} onClick={() => setChosen(chosen.length === items.length ? [] : items.map(p => p.id))}>전체 선택·해제</button><button className="btn-primary btn-inline" disabled={busy || !chosen.length} onClick={() => run(async () => {
            const failures = [];
            for (const p of items.filter(p => chosen.includes(p.id))) {
              try {
                await create({
                  ...p,
                  label: p.detailAddress,
                  address: p.roadAddress
                });
              } catch (e) {
                failures.push(p.id);
              }
            }
            if (failures.length) {
              setChosen(failures);
              throw Error(`${failures.length}곳을 등록하지 못했습니다. 실패한 곳만 다시 선택되어 있습니다.`);
            }
            onSaved();
          })}>선택 등록 ({chosen.length})</button><button className="btn-secondary" onClick={() => setFacility(true)}>시설물 등록 신청·내 신청</button></div></> : method === 'project' ? <><select className="input" aria-label="프로젝트" value={project} onChange={e => setProject(e.target.value)}><option value="">프로젝트 선택</option>{projects.map(p => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select><div className="registration-list">{places.map(p => <label className="check-row" key={p.placeId}><input type="checkbox" disabled={p.activeTaskCount > 0} checked={chosen.includes(p.placeId)} onChange={() => check(p.placeId)} /><span>{p.name}<small>{p.roadAddress}{p.activeTaskCount > 0 ? ' · 진행 중인 업무 있음' : ''}</small></span></label>)}</div><div className="action-row"><button className="btn-primary btn-inline" disabled={busy || !chosen.length} onClick={() => run(async () => {
            await registerProjectPlaces(project, user.userId, chosen);
            onSaved();
          })}>선택 등록</button><button className="btn-secondary" disabled={busy || !places.some(p => !p.activeTaskCount)} onClick={() => run(async () => {
            await registerProjectPlaces(project, user.userId, places.filter(p => !p.activeTaskCount).map(p => p.placeId));
            onSaved();
          })}>전체 등록</button></div></> : method === 'excel' ? <><input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files[0] && readFile(e.target.files[0])} /><p>방문지명·주소·위도·경도 열을 자동 인식합니다. 등록 전에 내용을 수정할 수 있습니다.</p><div className="table-scroll"><table className="table"><thead><tr><th>이름</th><th>주소</th><th>위도</th><th>경도</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{['name', 'roadAddress', 'lat', 'lng'].map(key => <td key={key}><input aria-label={`${i + 1}행 ${key}`} className="input" value={r[key]} onChange={e => setRows(old => old.map((row, n) => n === i ? {
                    ...row,
                    [key]: e.target.value
                  } : row))} /></td>)}</tr>)}</tbody></table></div><button className="btn-primary btn-inline" disabled={busy || !rows.length} onClick={() => run(async () => {
          const result = await api.post('/api/locations/bulk', {
            createdByUserId: user.userId,
            groupId,
            locations: rows
          });
          if (result.failedCount) {
            const failed = new Set(result.failures.map(f => f.rowNumber));
            setRows(old => old.filter(r => failed.has(r.rowNumber)));
            setMessage(`${result.savedCount}건 등록. 실패한 행을 수정해 다시 등록하세요.`);
          } else onSaved();
        })}>등록 ({rows.length}건)</button></> : <form className="settings-form" onSubmit={e => {
        e.preventDefault();
        run(async () => {
          if (method === 'workplace') {
            await api.patch(`/api/users/${user.userId}/workplace`, {
              workplaceAddress: address,
              workplaceLat: coords.lat,
              workplaceLng: coords.lng
            });
            onSaved();
          } else if (method === 'photo') {
            const body = new FormData();
            body.append('photo', file);
            body.append('createdByUserId', user.userId);
            body.append('groupId', groupId);
            body.append('name', name);
            body.append('lat', coords.lat);
            body.append('lng', coords.lng);
            body.append('roadAddress', address);
            body.append('task', task);
            await upload('/api/locations/photos', body);
            onSaved();
          } else {
            await create({
              ...coords,
              label: name,
              address
            });
            onSaved();
          }
        });
      }}>{method !== 'workplace' && <label>방문지 이름<input className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>}<label>주소<input className="input" value={address} onChange={e => setAddress(e.target.value)} /></label><button type="button" className="btn-secondary" onClick={() => setPicker(true)}>주소 검색·위치 확인</button>{coords && <span className="field-hint">선택 위치: {Number(coords.lat).toFixed(6)}, {Number(coords.lng).toFixed(6)}</span>}{method === 'photo' && <label>원본 사진<input type="file" className="input" required accept="image/jpeg,image/png" onChange={e => setFile(e.target.files[0])} /></label>}{method !== 'workplace' && <><label>업무 유형<select className="input" value={task} onChange={e => setTask(e.target.value)}><option value="">선택 안 함</option>{['점검','공사','안전','환경','민원'].map(value => <option key={value}>{value}</option>)}</select></label>{method === 'manual' && <select className="input" aria-label="프로젝트" value={project} onChange={e => setProject(e.target.value)}><option value="">프로젝트 선택 안 함</option>{projects.map(p => <option value={p.projectId} key={p.projectId}>{p.name}</option>)}</select>}</>}<button className="btn-primary btn-inline" disabled={busy || !coords || method === 'photo' && !file}>{busy ? '등록 중…' : method === 'workplace' ? '이 위치를 근무지로 등록' : '방문지 추가'}</button></form>}
  </Modal>{picker && <PlacePicker onClose={() => setPicker(false)} onPick={p => {
      setCoords(p);
      setAddress(p.address || p.label);
      if (!name) setName(p.label);
      setPicker(false);
    }} />}</>;
}
