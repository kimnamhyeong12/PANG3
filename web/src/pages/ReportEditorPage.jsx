import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  GROUP_BY_OPTIONS,
  SKIP_REASON_LABEL,
  addReportItems,
  downloadCompiledHwpx,
  downloadProtectedFile,
  fetchCompiledReport,
  fetchCompiledReportHtml,
  fetchProject,
  fetchProjectItems,
  fetchReportVersions,
  finalizeCompiledReport,
  removeReportItem,
  reviseCompiledReport,
  safeFileName,
  saveBlob,
  updateCompiledReport,
  updateReportItem,
} from '../api/projects.js';
import { errorMessage } from '../api/client.js';
import { formatDate, formatDateTime } from '../utils/format.js';
import { IconDownload } from '../components/Icons.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { LoadingBlock } from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import { ItemFilters, MineBadge, ReportStatusBadge } from './ProjectsDetailPage.jsx';
import '../styles/projects.css';

const EMPTY_FILTERS = { year: '', adminDong: '', authorId: '', category: '' };

// D15: 미리보기 iframe에만 카카오 키 주입 (내려받는 HTML에는 넣지 않음 → 위치 표만 보임)
function withKakaoKey(html) {
  const key = import.meta.env.VITE_KAKAO_MAP_KEY || '';
  if (!key) return html;
  const tag = `<script>window.REPORT_KAKAO_KEY=${JSON.stringify(key).replace(/</g, '\\u003c')}</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
}

// /api/files/... 는 인증이 필요해 Blob으로 받아 표시
function ProtectedPhoto({ url, alt }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return undefined;
    if (!url.startsWith('/')) {
      setSrc(url);
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    downloadProtectedFile(url)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) return <div className="re-photo re-photo-empty">사진을 불러오지 못했습니다</div>;
  if (!src) return <div className="re-photo re-photo-empty">불러오는 중…</div>;
  return <img className="re-photo" src={src} alt={alt} />;
}

function PreviewModal({ html, title, onClose }) {
  const saveHtml = () => {
    saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFileName(title)}.html`);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal re-preview" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">미리보기 · {title}</h2>
          <div className="re-preview-actions">
            <button type="button" className="btn-secondary" onClick={saveHtml}>
              HTML 저장
            </button>
            <button type="button" className="icon-button" aria-label="닫기" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        {/* sandbox: allow-scripts만 (allow-same-origin 없음 → 앱 세션/DOM 접근 불가). 불투명 origin에서 카카오 지도가 실패하면
            보고서의 위치 목록 표가 대신 보인다 (D15 fallback). */}
        <iframe className="re-preview-frame" title="보고서 미리보기" sandbox="allow-scripts" srcDoc={withKakaoKey(html)} />
      </div>
    </div>
  );
}

function VersionsModal({ reportId, projectId, userId, onClose }) {
  const navigate = useNavigate();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReportVersions(reportId, userId)
      .then((list) => setVersions(list ?? []))
      .catch((e) => setError(errorMessage(e, '버전 목록을 불러오지 못했습니다.')));
  }, [reportId, userId]);

  return (
    <Modal title="이전 버전" onClose={onClose}>
      {error ? (
        <ErrorBlock message={error} />
      ) : !versions ? (
        <LoadingBlock />
      ) : versions.length === 0 ? (
        <div className="table-empty">다른 버전이 없습니다.</div>
      ) : (
        <ul className="pj-list">
          {versions.map((v) => (
            <li key={v.reportId}>
              <button
                type="button"
                className={`pj-list-row${String(v.reportId) === String(reportId) ? ' is-current' : ''}`}
                onClick={() => {
                  onClose();
                  navigate(`/projects/${projectId}/reports/${v.reportId}`);
                }}
              >
                <ReportStatusBadge report={v} />
                <span className="pj-list-title">{v.title}</span>
                <span className="pj-list-meta">
                  {v.status === 'FINAL'
                    ? `확정 ${formatDateTime(v.finalizedAt)}${v.finalizedBy ? ` · ${v.finalizedBy}` : ''}`
                    : `수정 ${formatDateTime(v.updatedAt)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ItemDetail({ item, canEdit, busy, onSaveComment }) {
  const [text, setText] = useState(item.comment ?? '');
  useEffect(() => setText(item.comment ?? ''), [item.progressId, item.comment]);
  const dirty = text !== (item.comment ?? '');

  return (
    <div className="re-detail">
      <div className="re-detail-head">
        <div className="pj-task-title">{item.address || '주소 정보 없음'}</div>
        <div className="pj-muted">
          {[item.adminDong, item.category, item.author?.name, formatDate(item.completedAt)].filter(Boolean).join(' · ')}
        </div>
      </div>
      {item.photos?.length > 0 ? (
        <div className="re-photos">
          {item.photos.map((p, i) => (
            <figure key={`${p.url}-${i}`} className="re-photo-box">
              <ProtectedPhoto url={p.url} alt={p.slot || `사진 ${i + 1}`} />
              {(p.slot || p.comment) && <figcaption>{[p.slot, p.comment].filter(Boolean).join(' · ')}</figcaption>}
            </figure>
          ))}
        </div>
      ) : (
        <div className="pj-muted">사진 없음</div>
      )}
      <div className="field">
        <label>원본 문구 (현장 기록)</label>
        <div className="re-original">{item.originalComment || '(내용 없음)'}</div>
      </div>
      <div className="field">
        <label htmlFor="re-comment">보고서에 쓸 문구</label>
        <textarea
          id="re-comment"
          className="input re-textarea"
          value={text}
          maxLength={5000}
          readOnly={!canEdit}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {canEdit && (
        <div className="button-row re-detail-actions">
          {item.commentOverridden && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onSaveComment(null)}>
              원본 문구로 되돌리기
            </button>
          )}
          <button
            type="button"
            className="btn-primary btn-inline"
            disabled={busy || !dirty}
            onClick={() => onSaveComment(text === (item.originalComment ?? '') ? null : text)}
          >
            문구 저장
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReportEditorPage() {
  const { reportId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user.userId;

  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLeader, setIsLeader] = useState(false);
  const [pool, setPool] = useState(null);
  const [poolError, setPoolError] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [mine, setMine] = useState(null); // D20: "내 작업만" (멤버 기본 ON, 리더 기본 OFF). null = 리더 여부 확인 전
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }
  const [titleDraft, setTitleDraft] = useState('');
  const [preview, setPreview] = useState(null);
  const [showVersions, setShowVersions] = useState(false);

  const projectId = report?.project?.projectId;
  const status = report?.report?.status;
  const isDraft = status === 'DRAFT';
  const canEdit = isLeader && isDraft;
  const canAdd = isDraft;

  const loadReport = useCallback(async () => {
    const json = await fetchCompiledReport(reportId, userId);
    setReport(json);
    setTitleDraft(json?.report?.title ?? '');
    return json;
  }, [reportId, userId]);

  useEffect(() => {
    setReport(null);
    setLoadError(null);
    setSelectedId(null);
    setMessage(null);
    setFilters(EMPTY_FILTERS);
    loadReport().catch((e) => setLoadError(errorMessage(e, '보고서를 불러오지 못했습니다.')));
  }, [loadReport]);

  useEffect(() => {
    if (!projectId) return;
    fetchProject(projectId, userId)
      .then((p) => {
        setIsLeader(Boolean(p?.isLeader));
        setMine((m) => m ?? !p?.isLeader);
      })
      .catch(() => {
        setIsLeader(false);
        setMine((m) => m ?? true);
      });
  }, [projectId, userId]);

  const loadPool = useCallback(() => {
    if (!projectId || mine == null) return Promise.resolve();
    setPoolError(null);
    return fetchProjectItems(projectId, userId, mine ? { ...filters, authorId: userId } : filters)
      .then(setPool)
      .catch((e) => setPoolError(errorMessage(e, '완료 기록을 불러오지 못했습니다.')));
  }, [projectId, userId, filters, mine]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  const allItems = useMemo(() => (report?.sections ?? []).flatMap((s) => s.items ?? []), [report]);
  const inReport = useMemo(() => new Set(allItems.map((it) => it.progressId)), [allItems]);
  const selected = allItems.find((it) => it.progressId === selectedId) ?? null;
  const poolItems = pool?.items ?? [];
  const addable = poolItems.filter((it) => !inReport.has(it.progressId));

  const run = async (fn, errorText) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, errorText) });
    } finally {
      setBusy(false);
    }
  };

  const addItems = (ids) =>
    run(async () => {
      if (ids.length === 0) return;
      const res = await addReportItems(reportId, userId, ids);
      await Promise.all([loadReport(), loadPool()]);
      const skipped = res?.skipped ?? [];
      const reasons = [...new Set(skipped.map((s) => SKIP_REASON_LABEL[s.reason] ?? s.reason))].join(', ');
      setMessage({
        type: skipped.length ? 'error' : 'success',
        text: `${res?.added?.length ?? 0}건을 담았습니다.${skipped.length ? ` ${skipped.length}건 제외 (${reasons})` : ''}`,
      });
    }, '항목을 담지 못했습니다.');

  const addAll = () => {
    const ids = addable.map((it) => it.progressId);
    if (ids.length === 0) return;
    if (!window.confirm(`필터 결과 ${ids.length}건을 모두 보고서에 담을까요?`)) return;
    addItems(ids);
  };

  const removeItem = (item) => {
    if (!window.confirm('이 항목을 보고서에서 뺄까요? (현장 기록 원본은 지워지지 않습니다)')) return;
    run(async () => {
      await removeReportItem(reportId, item.progressId, userId);
      if (selectedId === item.progressId) setSelectedId(null);
      await Promise.all([loadReport(), loadPool()]);
    }, '항목을 빼지 못했습니다.');
  };

  // 섹션 안에서 위/아래 이동: 섹션 항목 순서를 0..n으로 다시 매기고 바뀐 것만 저장
  const move = (section, index, delta) => {
    const items = [...(section.items ?? [])];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    run(async () => {
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].sortOrder !== i) await updateReportItem(reportId, items[i].progressId, userId, { sortOrder: i });
      }
      await loadReport();
    }, '순서를 바꾸지 못했습니다.');
  };

  const changeGroupBy = (groupBy) => {
    if (!canEdit || groupBy === report.report.groupBy) return;
    run(async () => {
      await updateCompiledReport(reportId, userId, { groupBy });
      await loadReport();
    }, '분류 기준을 바꾸지 못했습니다.');
  };

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!canEdit || next === report.report.title) return;
    if (!next) {
      setTitleDraft(report.report.title);
      return;
    }
    run(async () => {
      await updateCompiledReport(reportId, userId, { title: next });
      await loadReport();
    }, '제목을 저장하지 못했습니다.');
  };

  const saveComment = (value) =>
    run(async () => {
      await updateReportItem(reportId, selected.progressId, userId, { overrideComment: value });
      await loadReport();
      setMessage({ type: 'success', text: value == null ? '원본 문구로 되돌렸습니다.' : '문구를 저장했습니다.' });
    }, '문구를 저장하지 못했습니다.');

  const openPreview = () =>
    run(async () => {
      setPreview(await fetchCompiledReportHtml(reportId, userId));
    }, '미리보기를 만들지 못했습니다.');

  const downloadHwpx = () =>
    run(async () => {
      const { blob, fileName } = await downloadCompiledHwpx(reportId, userId);
      saveBlob(blob, fileName);
    }, 'HWPX 파일을 만들지 못했습니다.');

  const finalize = () => {
    if (!window.confirm('보고서를 확정할까요?\n확정하면 내용이 고정되어 더 이상 수정할 수 없습니다. 고치려면 "수정하기"로 새 버전을 만들어야 합니다.')) return;
    run(async () => {
      await finalizeCompiledReport(reportId, userId);
      await loadReport();
      setMessage({ type: 'success', text: '보고서를 확정했습니다.' });
    }, '보고서를 확정하지 못했습니다.');
  };

  const revise = () => {
    if (!window.confirm('이 확정본을 바탕으로 새 버전 초안을 만들까요?')) return;
    run(async () => {
      const draft = await reviseCompiledReport(reportId, userId);
      navigate(`/projects/${projectId}/reports/${draft.reportId}`);
    }, '새 버전을 만들지 못했습니다.');
  };

  if (loadError)
    return (
      <div className="panel">
        <ErrorBlock message={loadError} onRetry={() => loadReport().then(() => setLoadError(null)).catch(() => {})} />
      </div>
    );
  if (!report) return <div className="panel"><LoadingBlock label="보고서를 불러오는 중…" /></div>;

  const meta = report.report;
  const sections = report.sections ?? [];

  return (
    <div className="re-page">
      <Link to={`/projects/${projectId}`} className="pj-back">
        ← {report.project?.name ?? '프로젝트'}
      </Link>
      <div className="re-toolbar">
        <div className="re-title-wrap">
          {canEdit ? (
            <input
              className="input re-title-input"
              value={titleDraft}
              maxLength={200}
              aria-label="보고서 제목"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <h1 className="re-title">{meta.title}</h1>
          )}
          <ReportStatusBadge report={meta} />
        </div>
        <div className="re-toolbar-actions">
          <button type="button" className="btn-secondary" onClick={() => setShowVersions(true)}>
            이전 버전
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={openPreview}>
            미리보기
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={downloadHwpx}>
            <IconDownload size={16} /> HWPX 내려받기
          </button>
          {isLeader && isDraft && (
            <button type="button" className="btn-primary btn-inline" disabled={busy || allItems.length === 0} onClick={finalize}>
              확정하기
            </button>
          )}
          {isLeader && !isDraft && (
            <button type="button" className="btn-primary btn-inline" disabled={busy} onClick={revise}>
              수정하기 → 새 버전
            </button>
          )}
        </div>
      </div>
      {!isDraft && <p className="panel-notice re-notice">확정된 보고서입니다. 내용은 읽기 전용입니다.</p>}
      {isDraft && !isLeader && (
        <p className="panel-notice re-notice">항목 담기만 할 수 있습니다. 문구·순서 수정과 확정은 그룹 리더가 합니다.</p>
      )}
      {message && <p className={message.type === 'error' ? 'form-error' : 'form-success'}>{message.text}</p>}

      <div className="re-grid">
        {/* 왼쪽: 완료 기록 풀 */}
        <section className="panel re-col">
          <div className="panel-header">
            <h2 className="panel-title">완료 기록</h2>
            {pool && <span className="panel-count">{poolItems.length}건</span>}
          </div>
          <div className="re-col-filters">
            <ItemFilters
              options={pool?.filters ?? {}}
              filters={filters}
              setFilter={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
              mine={Boolean(mine)}
              onToggleMine={() => setMine((m) => !m)}
            />
          </div>
          {canAdd && (
            <button type="button" className="btn-secondary re-add-all" disabled={busy || addable.length === 0} onClick={addAll}>
              필터 결과 모두 담기 ({addable.length})
            </button>
          )}
          <div className="re-col-body">
            {poolError ? (
              <ErrorBlock message={poolError} onRetry={loadPool} />
            ) : !pool ? (
              <LoadingBlock />
            ) : poolItems.length === 0 ? (
              <div className="table-empty">담을 수 있는 완료 기록이 없습니다.</div>
            ) : (
              <ul className="re-pool">
                {poolItems.map((it) => {
                  const added = inReport.has(it.progressId);
                  return (
                    <li key={it.progressId} className="re-pool-item">
                      <div className="pj-task-main">
                        <span className="pj-task-title">{it.address || '주소 정보 없음'}</span>
                        <span className="pj-muted">
                          {[it.adminDong, it.category, it.authorName, formatDate(it.completedAt)].filter(Boolean).join(' · ')}
                          {it.authorId === userId && <MineBadge />}
                        </span>
                      </div>
                      {added ? (
                        <span className="re-added">담김 ✓</span>
                      ) : canAdd ? (
                        <button type="button" className="btn-secondary pj-btn-sm" disabled={busy} onClick={() => addItems([it.progressId])}>
                          + 담기
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* 가운데: 보고서 구성 */}
        <section className="panel re-col">
          <div className="panel-header">
            <h2 className="panel-title">보고서 구성</h2>
            <span className="panel-count">{allItems.length}건</span>
          </div>
          <div className="re-groupby">
            <span className="pj-muted">분류 기준</span>
            <div className="pj-chips">
              {GROUP_BY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`pj-chip${meta.groupBy === o.value ? ' active' : ''}`}
                  disabled={!canEdit || busy}
                  onClick={() => changeGroupBy(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="re-col-body">
            {sections.length === 0 ? (
              <div className="table-empty">왼쪽 완료 기록에서 항목을 담아 주세요.</div>
            ) : (
              sections.map((section, si) => (
                <div key={section.key} className={`re-section re-tone-${si % 6}`}>
                  <div className="re-section-head">
                    <span className="re-section-label">{section.label}</span>
                    <span className="pj-muted">{section.count}건</span>
                  </div>
                  <ul className="re-items">
                    {(section.items ?? []).map((it, i) => (
                      <li
                        key={it.progressId}
                        className={`re-item${selectedId === it.progressId ? ' active' : ''}`}
                        onClick={() => setSelectedId(it.progressId)}
                      >
                        {canEdit && (
                          <span className="re-move" onClick={(e) => e.stopPropagation()}>
                            <button type="button" aria-label="위로" disabled={busy || i === 0} onClick={() => move(section, i, -1)}>
                              ▲
                            </button>
                            <button
                              type="button"
                              aria-label="아래로"
                              disabled={busy || i === section.items.length - 1}
                              onClick={() => move(section, i, 1)}
                            >
                              ▼
                            </button>
                          </span>
                        )}
                        <div className="pj-task-main">
                          <span className="pj-task-title">{it.address || '주소 정보 없음'}</span>
                          <span className="re-item-comment">{it.comment || '(문구 없음)'}</span>
                          <span className="pj-muted">
                            {[it.author?.name, formatDate(it.completedAt), it.photos?.length ? `사진 ${it.photos.length}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                            {it.author?.userId === userId && <MineBadge />}
                            {it.commentOverridden &&<span className="re-badge">✎ 문구 수정됨</span>}
                          </span>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            className="icon-button re-remove"
                            aria-label="보고서에서 빼기"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(it);
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 오른쪽: 선택 항목 */}
        <section className="panel re-col">
          <div className="panel-header">
            <h2 className="panel-title">선택한 항목</h2>
          </div>
          <div className="re-col-body">
            {selected ? (
              <ItemDetail item={selected} canEdit={canEdit} busy={busy} onSaveComment={saveComment} />
            ) : (
              <div className="table-empty">가운데 목록에서 항목을 선택하면 사진과 문구를 볼 수 있습니다.</div>
            )}
          </div>
        </section>
      </div>

      {preview != null && <PreviewModal html={preview} title={meta.title} onClose={() => setPreview(null)} />}
      {showVersions && <VersionsModal reportId={reportId} projectId={projectId} userId={userId} onClose={() => setShowVersions(false)} />}
    </div>
  );
}
