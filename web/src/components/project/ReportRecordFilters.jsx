import { selectRangeDate } from '../../../../frontend/utils/calendar';
import '../../styles/reportFilters.css';

export const defaultRecordFilters = () => ({ search: '', assignee: '', dong: '', start: '', end: '' });
export function reportRecordDay(value) {
  if (Array.isArray(value)) return `${value[0]}-${String(value[1]).padStart(2, '0')}-${String(value[2]).padStart(2, '0')}`;
  return String(value || '').slice(0, 10);
}
const assigneeKey = row => row.assigneeUserId != null ? String(row.assigneeUserId) : `name:${row.assigneeName || ''}`;
export function filterReportRecords(rows, filters) {
  const query = filters.search.trim().toLocaleLowerCase();
  return rows.filter(row => {
    const day = reportRecordDay(row.createdAt);
    return (!filters.assignee || assigneeKey(row) === filters.assignee)
      && (!filters.dong || row.adminDong === filters.dong)
      && (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end)
      && (!query || [row.detailAddress, row.roadAddress, row.adminDong, row.assigneeName, row.performedByName]
        .filter(Boolean).some(value => String(value).toLocaleLowerCase().includes(query)));
  });
}

export default function ReportRecordFilters({ rows, value, onChange, disabled = false, count }) {
  const assignees = [...new Map(rows.map(row => [assigneeKey(row), row.assigneeName || '담당자 확인 불가'])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  const dongs = [...new Set(rows.map(row => row.adminDong).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const hasFilter = Object.values(value).some(Boolean);
  return <div className="report-record-filters" aria-label="보고서 필터">
    <input className="input report-filter-search" aria-label="주소 또는 담당자 검색" placeholder="주소 또는 담당자 검색" disabled={disabled} value={value.search} onChange={e => onChange({ ...value, search: e.target.value })}/>
    <div className="report-filter-period">
      <input className="input" aria-label="시작일" type="date" disabled={disabled} value={value.start} onChange={e => onChange({ ...value, ...selectRangeDate(value.start, value.end, 'start', e.target.value) })}/>
      <span aria-hidden="true">~</span>
      <input className="input" aria-label="종료일" type="date" disabled={disabled} value={value.end} onChange={e => onChange({ ...value, ...selectRangeDate(value.start, value.end, 'end', e.target.value) })}/>
    </div>
    <div className="report-filter-selects">
      <select className="input" aria-label="담당자" disabled={disabled} value={value.assignee} onChange={e => onChange({ ...value, assignee: e.target.value })}><option value="">전체 담당자</option>{assignees.map(([id, name]) => <option key={id} value={id}>{name}{assignees.some(([otherId, otherName]) => otherId !== id && otherName === name) && !id.startsWith('name:') ? ` (${id})` : ''}</option>)}</select>
      <select className="input" aria-label="행정동" disabled={disabled} value={value.dong} onChange={e => onChange({ ...value, dong: e.target.value })}><option value="">전체 행정동</option>{dongs.map(dong => <option key={dong}>{dong}</option>)}</select>
    </div>
    {hasFilter && <button className="btn-secondary" type="button" disabled={disabled} onClick={() => onChange(defaultRecordFilters())}>초기화</button>}
    {count != null && <span className="report-filter-count">{count} / {rows.length}건</span>}
  </div>;
}
