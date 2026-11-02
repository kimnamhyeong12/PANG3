import { currentMonthRange, selectRangeDate } from '../../../../frontend/utils/calendar';
import { visibleLoginId } from '../../../../frontend/utils/accountIdentity';

export const defaultRecordFilters = () => ({ search: '', worker: '', dong: '', ...currentMonthRange() });
export function filterReportRecords(rows, filters) {
  return rows.filter(row => {
    const day = String(row.createdAt || '').slice(0, 10);
    return (!filters.worker || (filters.worker === '__departed__' ? row.performedByDeparted : !row.performedByDeparted && String(row.performedByUserId) === filters.worker))
      && (!filters.dong || row.adminDong === filters.dong)
      && (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end)
      && (!filters.search.trim() || `${row.detailAddress || ''} ${row.roadAddress || ''}`.includes(filters.search.trim()));
  });
}

export default function ReportRecordFilters({ rows, value, onChange, userId, disabled = false }) {
  const ids = [...new Set(rows.filter(r => !r.performedByDeparted && r.performedByUserId != null).map(r => String(r.performedByUserId)))];
  const workers = [...ids.filter(id => id === String(userId)), ...ids.filter(id => id !== String(userId))];
  const dongs = [...new Set(rows.map(r => r.adminDong).filter(Boolean))];
  const label = id => {
    const row = rows.find(r => String(r.performedByUserId) === id && !r.performedByDeparted);
    const name = row?.performedByName || '작업자';
    const same = new Set(rows.filter(r => r.performedByName === name && !r.performedByDeparted).map(r => r.performedByUserId));
    return `${id === String(userId) ? '나 · ' : ''}${name}${same.size > 1 ? ` (${visibleLoginId(row?.performedByLoginId) || id})` : ''}`;
  };
  return <div className="project-record-filters">
    <input className="input" aria-label="방문지 검색" placeholder="방문지 검색" disabled={disabled} value={value.search} onChange={e => onChange({ ...value, search: e.target.value })}/>
    <div className="project-filter-pair"><label>작업자<select className="input" aria-label="작업자" disabled={disabled} value={value.worker} onChange={e => onChange({ ...value, worker: e.target.value })}><option value="">전체</option>{workers.map(id => <option key={id} value={id}>{label(id)}</option>)}{rows.some(r => r.performedByDeparted) && <option value="__departed__">탈퇴한 사용자</option>}</select></label>
      <label>행정동<select className="input" aria-label="행정동" disabled={disabled} value={value.dong} onChange={e => onChange({ ...value, dong: e.target.value })}><option value="">전체</option>{dongs.map(dong => <option key={dong}>{dong}</option>)}</select></label></div>
    <div className="project-filter-dates"><label>시작일<input className="input" aria-label="시작일" type="date" disabled={disabled} value={value.start} onChange={e => onChange({ ...value, ...selectRangeDate(value.start, value.end, 'start', e.target.value) })}/></label><span>~</span><label>종료일<input className="input" aria-label="종료일" type="date" disabled={disabled} value={value.end} onChange={e => onChange({ ...value, ...selectRangeDate(value.start, value.end, 'end', e.target.value) })}/></label></div>
  </div>;
}
