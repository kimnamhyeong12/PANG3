export function ReportStatusBadge({ report }) {
  return <span className={`pill pill-${report?.status === 'FINAL' ? 'green' : 'amber'}`}>{report?.status === 'FINAL' ? '확정' : '작성 중'} v{report?.version ?? 1}</span>;
}
export function MineBadge() { return <span className="pj-mine-badge">내 기록</span>; }
