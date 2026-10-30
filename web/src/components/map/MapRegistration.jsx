import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { fetchProjects } from '../../api/projects.js';
import { loadKakaoMaps } from '../../lib/kakaoLoader.js';
import Modal from '../Modal.jsx';
import MapCanvas from './MapCanvas.jsx';
import SelectionEmpty from '../SelectionEmpty.jsx';
import PhotoRegistration from './PhotoRegistration.jsx';
import ExcelRegistration from './ExcelRegistration.jsx';
import ProjectRegistration from './ProjectRegistration.jsx';
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
    [chosen, setChosen] = useState([]),
    [categories, setCategories] = useState([]),
    [category, setCategory] = useState(''),
    [dong, setDong] = useState(''),
    [items, setItems] = useState([]);
  const [name, setName] = useState(point?.label || ''),
    [address, setAddress] = useState(point?.address || ''),
    [coords, setCoords] = useState(point),
    [task, setTask] = useState(''),
    [picker, setPicker] = useState(false),
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
    setItems([]);
    setChosen([]);
    setBusy(false);
    if (method === 'public' && dong && category) {
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
  if (facility) return <FacilityApplications onClose={() => setFacility(false)} />;
  return <><Modal wide={method === "excel" || method === "public"} title={titles[method]} onClose={() => !busy && onClose()}>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {method === 'photo' ? <PhotoRegistration onBusyChange={setBusy} user={user} groupId={groupId} onSaved={onSaved} /> : method === 'public' ? <><div className="public-facility-filters"><label>시설물 종류<select className="input" aria-label="시설물 종류" value={category} onChange={e => setCategory(e.target.value)}><option value="">카테고리 선택</option>{categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label><label>조회 지역<select className="input" aria-label="행정동" value={dong} onChange={e => setDong(e.target.value)}><option value="">행정동 선택</option>{boundaries?.features?.map(f => <option value={f.properties.adm_cd} key={f.properties.adm_cd}>{f.properties.adm_nm}</option>)}</select></label></div>{!boundaries?.features?.length && <p>설정 또는 그룹 관리에서 활동 지역을 지정해 주세요.</p>}<div className="public-facility-results">{items.length > 0 && <MapCanvas tasks={items.map(item => ({...item, taskId:item.id, _status:"pending"}))} busStops={[]} aeds={[]} layers={{tasks:true}} dataReady showTaskInfo={false} selectedTaskId={chosen.at(-1)} onSelectTask={id => {if(id!=null)check(id);}} />}<div className="registration-list">{!items.length && <SelectionEmpty icon="business-outline">{busy ? "시설물을 불러오는 중…" : (!dong || !category) ? "조회 지역과 시설물 종류를 선택해 주세요" : "등록된 시설물이 없습니다"}</SelectionEmpty>}{items.map(p => <label className="check-row" key={p.id}><input type="checkbox" disabled={busy} checked={chosen.includes(p.id)} onChange={() => check(p.id)} /><span>{p.detailAddress}<small>{p.roadAddress}</small></span></label>)}</div></div><div className="action-row"><button className="btn-secondary" disabled={busy} onClick={() => setChosen(chosen.length === items.length ? [] : items.map(p => p.id))}>전체 선택·해제</button><button className="btn-primary btn-inline" disabled={busy || !chosen.length} onClick={() => run(async () => {
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
          })}>선택 등록 ({chosen.length})</button><button className="btn-secondary" onClick={() => setFacility(true)}>시설물 등록 신청·내 신청</button></div></> : method === 'project' ? <ProjectRegistration onBusyChange={setBusy} projects={projects} setProjects={setProjects} user={user} groupId={groupId} onSaved={onSaved} /> : method === 'excel' ? <ExcelRegistration onBusyChange={setBusy} user={user} groupId={groupId} onSaved={onSaved} /> : <form className="settings-form" onSubmit={e => {
        e.preventDefault();
        run(async () => {
          if (method === 'workplace') {
            await api.patch(`/api/users/${user.userId}/workplace`, {
              workplaceAddress: address,
              workplaceLat: coords.lat,
              workplaceLng: coords.lng
            });
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
      }}>{method !== 'workplace' && <label>방문지 이름<input className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>}<label>주소<input className="input" value={address} onChange={e => setAddress(e.target.value)} /></label><button type="button" className="btn-secondary" onClick={() => setPicker(true)}>주소 검색·위치 확인</button>{coords && <span className="field-hint">선택 위치: {Number(coords.lat).toFixed(6)}, {Number(coords.lng).toFixed(6)}</span>}{method !== 'workplace' && <><label>업무 유형<select className="input" value={task} onChange={e => setTask(e.target.value)}><option value="">선택 안 함</option>{['점검','공사','안전','환경','민원'].map(value => <option key={value}>{value}</option>)}</select></label>{method === 'manual' && <select className="input" aria-label="프로젝트" value={project} onChange={e => setProject(e.target.value)}><option value="">프로젝트 선택 안 함</option>{projects.map(p => <option value={p.projectId} key={p.projectId}>{p.name}</option>)}</select>}</>}<button className="btn-primary btn-inline" disabled={busy || !coords}>{busy ? '등록 중…' : method === 'workplace' ? '이 위치를 근무지로 등록' : '방문지 추가'}</button></form>}
  </Modal>{picker && <PlacePicker onClose={() => setPicker(false)} onPick={p => {
      setCoords(p);
      setAddress(p.address || p.label);
      if (!name) setName(p.label);
      setPicker(false);
    }} />}</>;
}
