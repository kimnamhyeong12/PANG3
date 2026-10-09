import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { downloadReport, fetchGroupReports } from '../api/reports.js';
import { formatDate } from '../utils/format.js';
import { IconDownload, IconReport } from '../components/Icons.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { SkeletonLine } from '../components/Loading.jsx';
import { errorMessage } from '../api/client.js';

// taskCategory는 자유 문자열 → 이름 기준으로 항상 같은 색 (빨강은 '미처리' 의미라 제외)
const CATEGORY_TONES = ['navy', 'green', 'amber', 'gray'];

function categoryTone(category) {
  let hash = 0;
  for (const ch of String(category ?? '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}

// createdAt(LocalDateTime) → "YYYY-MM-DD" (기간 필터 비교용)
function dateKey(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function safeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

function reportFileName(report) {
  const parts = [report.taskCategory, report.detailAddress || report.roadAddress, dateKey(report.createdAt)]
    .filter(Boolean)
    .map(safeFileName);
  return `${parts.length ? parts.join('_') : `report_${report.progressId}`}.hwpx`;
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportCard({ report, downloading, onDownload }) {
  const address = report.roadAddress || report.detailAddress || '주소 정보 없음';
  return (
    <article className="report-card">
      <div className="report-card-top">
        <span className="report-icon">
          <IconReport size={20} />
        </span>
        <span className={`pill pill-${categoryTone(report.taskCategory)}`}>{report.taskCategory || '업무'}</span>
      </div>
      <div className="report-address" title={address}>
        {address}
      </div>
      {report.detailAddress && report.roadAddress && report.detailAddress !== report.roadAddress && (
        <div className="report-detail" title={report.detailAddress}>
          {report.detailAddress}
        </div>
      )}
      <div className="report-meta">
        {report.assigneeName} · {report.performedByName} · {formatDate(report.createdAt)}
      </div>
      <button type="button" className="btn-secondary report-download" disabled={downloading} onClick={onDownload}>
        <IconDownload size={16} />
        {downloading ? '다운로드 중…' : '다운로드'}
      </button>
    </article>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { groupId } = useGroup();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [keyword, setKeyword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [assignee, setAssignee] = useState('');

  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGroupReports(groupId, user.userId)
      .then((list) => !cancelled && setReports(list ?? []))
      .catch((e) => {
        if (cancelled) return;
        setReports([]);
        setError(errorMessage(e, '보고서 목록을 불러오지 못했습니다.'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId, user.userId, reloadKey]);

  // 그룹이 바뀌면 이전 그룹 기준 필터(담당자 등)를 비운다
  useEffect(() => {
    setAssignee('');
    setDownloadError(null);
  }, [groupId]);

  // 담당자 드롭다운: 응답의 assigneeName 기준 (담당자 미확인은 "담당자 확인 불가"로 내려옴)
  const assigneeOptions = useMemo(
    () => [...new Set(reports.map((r) => r.assigneeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [reports]
  );

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return reports.filter((r) => {
      if (assignee && r.assigneeName !== assignee) return false;
      const day = dateKey(r.createdAt);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      if (!q) return true;
      return [r.roadAddress, r.detailAddress, r.adminDong, r.assigneeName, r.performedByName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [reports, keyword, fromDate, toDate, assignee]);

  const hasFilter = keyword || fromDate || toDate || assignee;

  const onDownload = async (report) => {
    setDownloadingId(report.progressId);
    setDownloadError(null);
    try {
      saveBlob(await downloadReport(report.progressId), reportFileName(report));
    } catch (e) {
      setDownloadError(errorMessage(e, '보고서를 내려받지 못했습니다.'));
    } finally {
      setDownloadingId(null);
    }
  };

  let content;
  if (error)
    content = (
      <div className="panel">
        <ErrorBlock message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  else if (loading)
    content = (
      <div className="report-grid" role="status" aria-label="불러오는 중">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="report-card">
            <div className="report-card-top">
              <SkeletonLine width={38} height={38} />
              <SkeletonLine width={64} height={22} />
            </div>
            <SkeletonLine width="80%" height={16} />
            <div style={{ height: 10 }} />
            <SkeletonLine width="60%" />
            <div style={{ height: 16 }} />
            <SkeletonLine height={38} />
          </div>
        ))}
      </div>
    );
  else if (reports.length === 0) content = <div className="panel table-empty">제출된 보고서가 없습니다.</div>;
  else if (filtered.length === 0) content = <div className="panel table-empty">조건에 맞는 보고서가 없습니다.</div>;
  else
    content = (
      <div className="report-grid">
        {filtered.map((r) => (
          <ReportCard
            key={r.progressId}
            report={r}
            downloading={downloadingId === r.progressId}
            onDownload={() => onDownload(r)}
          />
        ))}
      </div>
    );

  return (
    <>
      <h1 className="page-title">보고서 보관함</h1>
      <p className="page-desc">팀원이 현장에서 제출한 업무 보고서를 확인하고 내려받습니다.</p>

      <div className="filter-bar">
        <input
          className="input filter-search"
          placeholder="주소 또는 담당자 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="filter-period">
          <input
            type="date"
            className="input"
            aria-label="시작일"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="filter-tilde">~</span>
          <input
            type="date"
            className="input"
            aria-label="종료일"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <select className="input filter-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">전체 담당자</option>
          {assigneeOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {hasFilter && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setKeyword('');
              setFromDate('');
              setToDate('');
              setAssignee('');
            }}
          >
            초기화
          </button>
        )}
        {!loading && !error && (
          <span className="filter-count">
            {filtered.length} / {reports.length}건
          </span>
        )}
      </div>

      {downloadError && <p className="form-error">{downloadError}</p>}
      {content}
    </>
  );
}
