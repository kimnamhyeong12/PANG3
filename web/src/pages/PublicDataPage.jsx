import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGroup } from '../context/GroupContext.jsx';
import {
  fetchAedsByDong,
  fetchAllAeds,
  fetchAllBusStops,
  fetchBoundaries,
  fetchBusStopsByDong,
  fetchByDongs,
  updateAedAdministrativeAreas,
  updateBusStopAdministrativeAreas,
} from '../api/publicData.js';
import Modal from '../components/Modal.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { SkeletonTable, Spinner } from '../components/Loading.jsx';
import { errorMessage } from '../api/client.js';

const DEFAULT_ADM_CODE = '21100';
const PAGE_SIZE = 50;
const UNASSIGNED = '__unassigned__';

const DATASETS = {
  aed: {
    label: 'AED',
    idKey: 'aedId',
    fetchAll: fetchAllAeds,
    fetchByDong: fetchAedsByDong,
    update: updateAedAdministrativeAreas,
    searchFields: ['address', 'modelName', 'productName', 'businessTel', 'adminDong'],
  },
  bus: {
    label: '버스정류장',
    idKey: 'busStopId',
    fetchAll: fetchAllBusStops,
    fetchByDong: fetchBusStopsByDong,
    update: updateBusStopAdministrativeAreas,
    searchFields: ['name', 'arsNo', 'externalId', 'stopType', 'adminDong'],
  },
};

const SCOPES = [
  { key: 'region', label: '우리 지역' },
  { key: 'all', label: '부산 전체' },
];

function Coord({ item }) {
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return '-';
  return (
    <>
      <div>{item.lat.toFixed(6)}</div>
      <div>{item.lng.toFixed(6)}</div>
    </>
  );
}

function AreaCell({ item }) {
  if (!item.adminDong) return <span className="pill pill-gray">미지정</span>;
  return (
    <>
      <div className="cell-strong">{item.adminDong}</div>
      {item.sigungu && <div className="cell-sub">{item.sigungu}</div>}
    </>
  );
}

function AedTable({ rows }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>설치 장소</th>
          <th>모델 / 제조사</th>
          <th>연락처</th>
          <th>행정동</th>
          <th>좌표</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((aed) => (
          <tr key={aed.aedId}>
            <td className="cell-wrap cell-strong">{aed.address || '-'}</td>
            <td>
              <div>{aed.modelName || '-'}</div>
              {aed.productName && <div className="cell-sub">{aed.productName}</div>}
            </td>
            <td>{aed.businessTel || '-'}</td>
            <td>
              <AreaCell item={aed} />
            </td>
            <td className="cell-mono">
              <Coord item={aed} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BusStopTable({ rows }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>정류장명</th>
          <th>ARS 번호</th>
          <th>유형</th>
          <th>행정동</th>
          <th>좌표</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((stop) => (
          <tr key={stop.busStopId}>
            <td className="cell-wrap cell-strong">{stop.name || '-'}</td>
            <td>{stop.arsNo || '-'}</td>
            <td>{stop.stopType || '-'}</td>
            <td>
              <AreaCell item={stop} />
            </td>
            <td className="cell-mono">
              <Coord item={stop} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PublicDataPage() {
  const { currentGroup } = useGroup();
  const admCode = currentGroup?.regionAdmCode || DEFAULT_ADM_CODE;

  const [tab, setTab] = useState('aed');
  const [scope, setScope] = useState('region');
  const [keyword, setKeyword] = useState('');
  const [dong, setDong] = useState('');
  const [page, setPage] = useState(1);

  const [dongCodes, setDongCodes] = useState(null);
  const [boundaryError, setBoundaryError] = useState(null);
  const [boundaryReloadKey, setBoundaryReloadKey] = useState(0);
  // 지역(그룹)이 바뀐 뒤 이전 요청 응답이 캐시에 들어가지 않도록 세대 번호로 구분
  const generationRef = useRef(0);
  // `${tab}-${scope}` → { items, loading, error }
  const [cache, setCache] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);

  const dataset = DATASETS[tab];
  const cacheKey = `${tab}-${scope}`;
  const current = cache[cacheKey];

  // 우리 지역 = 그룹 지역 경계의 행정동 코드 목록
  useEffect(() => {
    let cancelled = false;
    setDongCodes(null);
    setBoundaryError(null);
    setCache({}); // 그룹 지역이 바뀌면 '우리 지역' 데이터를 다시 불러온다
    generationRef.current += 1;
    fetchBoundaries(admCode)
      .then((data) => {
        if (!cancelled) setDongCodes((data?.features ?? []).map((f) => f.properties?.adm_cd).filter(Boolean));
      })
      .catch((e) => !cancelled && setBoundaryError(errorMessage(e, '행정동 목록을 불러오지 못했습니다.')));
    return () => {
      cancelled = true;
    };
  }, [admCode, boundaryReloadKey]);

  const load = useCallback(
    async (targetTab, targetScope) => {
      const key = `${targetTab}-${targetScope}`;
      const ds = DATASETS[targetTab];
      const generation = generationRef.current;
      const commit = (value) => {
        if (generation === generationRef.current) setCache((c) => ({ ...c, [key]: value }));
      };
      setCache((c) => ({ ...c, [key]: { items: c[key]?.items ?? [], loading: true, error: null } }));
      try {
        let items;
        let error = null;
        if (targetScope === 'all') {
          items = (await ds.fetchAll()) ?? [];
        } else {
          const result = await fetchByDongs(dongCodes, ds.fetchByDong, ds.idKey);
          items = result.items;
          if (result.failedCount > 0) error = `${result.failedCount}개 행정동을 불러오지 못했습니다.`;
        }
        commit({ items, loading: false, error });
      } catch (e) {
        commit({ items: [], loading: false, error: errorMessage(e, `${ds.label} 데이터를 불러오지 못했습니다.`) });
      }
    },
    [dongCodes]
  );

  useEffect(() => {
    if (current) return;
    if (scope === 'region' && !dongCodes) return;
    load(tab, scope);
  }, [tab, scope, current, dongCodes, load]);

  // 필터는 탭·범위가 바뀌면 초기화
  useEffect(() => {
    setDong('');
    setPage(1);
  }, [tab, scope]);

  useEffect(() => {
    setPage(1);
  }, [keyword, dong]);

  const items = current?.items ?? [];

  const dongOptions = useMemo(() => {
    const names = [...new Set(items.map((i) => i.adminDong).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    const unassigned = items.filter((i) => !i.adminDong).length;
    return { names, unassigned };
  }, [items]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (dong === UNASSIGNED && item.adminDong) return false;
      if (dong && dong !== UNASSIGNED && item.adminDong !== dong) return false;
      if (!q) return true;
      return dataset.searchFields.some((f) => item[f] != null && String(item[f]).toLowerCase().includes(q));
    });
  }, [items, keyword, dong, dataset]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const runUpdate = async () => {
    setUpdating(true);
    setUpdateError(null);
    try {
      const result = await dataset.update();
      setUpdateResult({ label: dataset.label, updatedCount: result?.updatedCount ?? 0 });
      setConfirmOpen(false);
      // 해당 데이터셋 캐시를 비워 다시 불러온다
      setCache((c) => {
        const next = { ...c };
        SCOPES.forEach((s) => delete next[`${tab}-${s.key}`]);
        return next;
      });
    } catch (e) {
      setUpdateError(errorMessage(e, `${dataset.label} 행정동 정보를 갱신하지 못했습니다.`));
    } finally {
      setUpdating(false);
    }
  };

  const loading = current?.loading || (scope === 'region' && !dongCodes && !boundaryError);
  const listError = scope === 'region' && boundaryError ? boundaryError : current?.error;

  let content;
  const retryList = () => {
    if (scope === 'region' && boundaryError) setBoundaryReloadKey((k) => k + 1);
    else
      setCache((c) => {
        const next = { ...c };
        delete next[cacheKey];
        return next;
      });
  };

  if (loading && items.length === 0) content = <SkeletonTable rows={8} columns={5} />;
  else if (listError && items.length === 0) content = <ErrorBlock message={listError} onRetry={retryList} />;
  else if (filtered.length === 0)
    content = <div className="table-empty">{items.length === 0 ? '데이터가 없습니다.' : '조건에 맞는 데이터가 없습니다.'}</div>;
  else
    content = (
      <div className="table-scroll table-scroll-tall">
        {tab === 'aed' ? <AedTable rows={rows} /> : <BusStopTable rows={rows} />}
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">공공데이터 관리</h1>
          <p className="page-desc">AED와 버스정류장 데이터를 조회하고 행정동 정보를 갱신합니다.</p>
        </div>
        <button
          type="button"
          className="btn-primary btn-inline"
          onClick={() => {
            setUpdateError(null);
            setConfirmOpen(true);
          }}
        >
          데이터 갱신
        </button>
      </div>

      {updateResult && (
        <p className="form-success">
          {updateResult.label} 행정동 정보를 갱신했습니다. (갱신 {updateResult.updatedCount.toLocaleString()}건)
        </p>
      )}

      <section className="panel">
        <div className="tabs">
          {Object.entries(DATASETS).map(([key, ds]) => (
            <button key={key} type="button" className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {ds.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <div className="segmented">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={scope === s.key ? 'active' : ''}
                onClick={() => setScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            className="input filter-search"
            placeholder={tab === 'aed' ? '설치 장소, 모델, 연락처 검색' : '정류장명, ARS 번호 검색'}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className="input filter-select" value={dong} onChange={(e) => setDong(e.target.value)}>
            <option value="">전체 행정동</option>
            {dongOptions.names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {dongOptions.unassigned > 0 && (
              <option value={UNASSIGNED}>행정동 미지정 ({dongOptions.unassigned.toLocaleString()})</option>
            )}
          </select>
          <span className="filter-count">
            {loading ? <Spinner size={14} /> : `${filtered.length.toLocaleString()} / ${items.length.toLocaleString()}건`}
          </span>
        </div>

        {listError && items.length > 0 && <ErrorBlock message={listError} onRetry={retryList} />}
        {content}

        {pageCount > 1 && (
          <div className="pagination">
            <button type="button" className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={page === pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>
        )}
      </section>

      {confirmOpen && (
        <Modal
          title={`${dataset.label} 데이터 갱신`}
          onClose={() => !updating && setConfirmOpen(false)}
          footer={
            <>
              <button type="button" className="btn-secondary" disabled={updating} onClick={() => setConfirmOpen(false)}>
                취소
              </button>
              <button type="button" className="btn-primary btn-inline" disabled={updating} onClick={runUpdate}>
                {updating ? '갱신 중…' : '갱신'}
              </button>
            </>
          }
        >
          {updateError && <p className="form-error">{updateError}</p>}
          <p className="modal-text">
            저장된 <strong>{dataset.label} 전체</strong>의 시·도/시·군·구/행정동 정보를 부산광역시 행정동 경계 기준으로 다시
            계산해 덮어씁니다.
          </p>
          <p className="modal-text modal-text-soft">
            관리자 전용 작업이며, 데이터 양에 따라 시간이 걸릴 수 있습니다. 진행하시겠습니까?
          </p>
        </Modal>
      )}
    </>
  );
}
