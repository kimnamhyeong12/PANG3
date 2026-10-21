import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { downloadProgressHwpx, fetchProgressReport, fetchProgressReportHtml, safeFileName, saveBlob, updateProgressReport } from '../api/projects.js';
import { errorMessage } from '../api/client.js';
import { formatDate } from '../utils/format.js';
import { IconDownload } from '../components/Icons.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { LoadingBlock } from '../components/Loading.jsx';
import ReportMap, { AUTHOR_COLORS, ProtectedPhoto } from './ProjectsReportMap.jsx';
import '../styles/projects.css';

const SLOT_CLASS = { '작업 전': 'before', '작업 중': 'during', '작업 후': 'after' };

// 보고서 보관함 건별 보고서 (D23·D27): HWPX 양식 순서(제목 → 위치도 → 사진·설명 → 본문)로 원본 기록을 고친다.
export default function ProjectsProgressEditPage() {
  const { progressId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [captions, setCaptions] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const apply = (json) => {
    setData(json);
    setTitle(json.reportName ?? '');
    setBody(json.mainComment ?? '');
    setCaptions(Object.fromEntries((json.photos ?? []).map((p) => [p.index, p.comment ?? ''])));
  };

  const load = useCallback(() => {
    setLoadError(null);
    return fetchProgressReport(progressId)
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e, '보고서를 불러오지 못했습니다.')));
  }, [progressId]);

  useEffect(() => {
    setData(null);
    setMessage(null);
    load();
  }, [load]);

  const changedCaptions = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries((data.photos ?? []).filter((p) => (captions[p.index] ?? '') !== (p.comment ?? '')).map((p) => [p.index, captions[p.index]]));
  }, [data, captions]);
  const dirty =
    data != null &&
    (title.trim() !== (data.reportName ?? '') || body !== (data.mainComment ?? '') || Object.keys(changedCaptions).length > 0);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await updateProgressReport(progressId, {
        expectedRevision: data.revision,
        reportName: title.trim(),
        mainComment: body,
        photoComments: changedCaptions,
      });
      apply(next);
      setMessage({ type: 'success', text: '저장했습니다. 앱 기록과 건별 HWPX에도 반영됩니다.' });
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, '저장하지 못했습니다.') });
    } finally {
      setBusy(false);
    }
  };

  // 통합 보고서처럼 HTML로 저장 (한 건). 저장한 내용 기준
  const downloadHtml = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const name = data.reportName || data.autoTitle || `report_${progressId}`;
      saveBlob(new Blob([await fetchProgressReportHtml(progressId)], { type: 'text/html;charset=utf-8' }), `${safeFileName(name)}.html`);
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, 'HTML 파일을 만들지 못했습니다.') });
    } finally {
      setBusy(false);
    }
  };

  const downloadHwpx = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const name = data.reportName || data.autoTitle || `report_${progressId}`;
      saveBlob(await downloadProgressHwpx(progressId, user.userId), `${safeFileName(name)}.hwpx`);
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, 'HWPX 파일을 만들지 못했습니다. 서버의 보고서 생성 환경(파이썬)을 확인해 주세요.') });
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <div className="panel">
        <ErrorBlock message={loadError} onRetry={load} />
      </div>
    );
  if (!data) return <div className="panel"><LoadingBlock label="보고서를 불러오는 중…" /></div>;

  const canEdit = Boolean(data.canEdit);
  const leaderEditingOther = canEdit && data.isLeader && data.assigneeUserId != null && data.assigneeUserId !== user?.userId;
  const marker = { n: null, lat: data.lat, lng: data.lng, color: AUTHOR_COLORS[0], title: data.address };
  const info = [
    ['주소', data.address || '-'],
    ['완료일', formatDate(data.completedAt) || '-'],
    ['작성자', data.authorName || '-'],
    ['업무 유형', data.category || '-'],
    ['행정동', data.adminDong || '-'],
    ['현재 담당자', data.assigneeName || '-'],
  ];

  return (
    <div className="re-page pe-page">
      <Link to="/reports" className="pj-back">
        ← 보고서 보관함
      </Link>
      {canEdit ? (
        <p className="panel-notice re-notice pe-warn">
          {leaderEditingOther ? `리더 권한으로 수정 중 (담당자 ${data.assigneeName}) · ` : ''}
          저장하면 원본 작업 기록이 바뀌어요. 앱 기록과 건별 HWPX에 반영되고, 통합 보고서에서 따로 고친 글은 그대로 남아요.
        </p>
      ) : (
        <p className="panel-notice re-notice">보기 전용입니다. 현재 담당자와 그룹 리더만 고칠 수 있어요.</p>
      )}
      {message && <p className={message.type === 'error' ? 'form-error' : 'form-success'}>{message.text}</p>}

      <section className="panel pe-panel">
        <label className="pe-label" htmlFor="pe-title">
          보고서 제목
        </label>
        {canEdit ? (
          <input
            id="pe-title"
            className="input pe-title"
            value={title}
            maxLength={120}
            placeholder={`${data.autoTitle}  (비우면 이 자동 제목을 써요)`}
            onChange={(e) => setTitle(e.target.value)}
          />
        ) : (
          <h1 className="re-title">{data.reportName || data.autoTitle}</h1>
        )}

        <table className="pe-info">
          <tbody>
            {info.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="pe-section">위치도</h2>
        <ReportMap markers={[marker]} height={300} fallback={<div className="table-empty">지도를 표시할 수 없습니다 (좌표 없음 또는 지도 키 미설정).</div>} />

        <h2 className="pe-section">현장 사진</h2>
        {(data.photos ?? []).length === 0 ? (
          <div className="pj-muted">사진 없음</div>
        ) : (
          <div className="re-photo-grid">
            {data.photos.map((p) => (
              <figure key={`${p.index}-${p.url}`} className="re-photo-cell">
                <div className="re-photo-frame">
                  <ProtectedPhoto url={p.url} alt={p.slot || '현장 사진'} />
                  {p.slot && <span className={`re-slot re-slot-${SLOT_CLASS[p.slot] ?? 'etc'}`}>{p.slot}</span>}
                </div>
                {canEdit ? (
                  <textarea
                    className={`input re-caption${p.index in changedCaptions ? ' is-modified' : ''}`}
                    value={captions[p.index] ?? ''}
                    maxLength={500}
                    placeholder="사진 설명"
                    aria-label={`${p.slot || '사진'} 설명`}
                    onChange={(e) => setCaptions((c) => ({ ...c, [p.index]: e.target.value }))}
                  />
                ) : (
                  p.comment && <figcaption className="re-caption-text">{p.comment}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        <h2 className="pe-section">본문 (주 내용)</h2>
        {canEdit ? (
          <textarea className="input re-body" value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} aria-label="본문" />
        ) : (
          <p className="re-body-text">{data.mainComment || '-'}</p>
        )}

        <div className="pe-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={downloadHwpx}>
            <IconDownload size={16} /> HWPX 내려받기
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={downloadHtml}>
            <IconDownload size={16} /> HTML 저장
          </button>
          {canEdit && (
            <button type="button" className="btn-primary btn-inline" disabled={busy || !dirty} onClick={save}>
              {busy ? '저장 중…' : '저장'}
            </button>
          )}
        </div>
        {canEdit && dirty && <p className="pj-muted pe-dirty">저장하지 않은 변경이 있어요. HWPX·HTML은 저장한 내용으로 만들어져요.</p>}
      </section>
    </div>
  );
}
