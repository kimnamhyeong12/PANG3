import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  GROUP_BY_OPTIONS,
  SKIP_REASON_LABEL,
  addReportItems,
  downloadCompiledHwpx,
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
import ReportMap, { ProtectedPhoto, authorColorMap } from './ProjectsReportMap.jsx';
import '../styles/projects.css';

const EMPTY_FILTERS = { year: '', adminDong: '', authorId: '', category: '' };
const SLOT_CLASS = { '작업 전': 'before', '작업 중': 'during', '작업 후': 'after' };

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

// 사진 + 사진 밑 설명 (보고서에서만 수정)
function PhotoCell({ photo, canEdit, onSave }) {
  const [text, setText] = useState(photo.comment ?? '');
  useEffect(() => setText(photo.comment ?? ''), [photo.comment]);
  const commit = () => {
    if (text === (photo.comment ?? '')) return;
    onSave({ overridePhotoComments: { [photo.index]: text.trim() === (photo.originalComment ?? '').trim() ? null : text } });
  };
  return (
    <figure className="re-photo-cell">
      <div className="re-photo-frame">
        <ProtectedPhoto url={photo.url} alt={photo.slot || '현장 사진'} />
        {photo.slot && <span className={`re-slot re-slot-${SLOT_CLASS[photo.slot] ?? 'etc'}`}>{photo.slot}</span>}
      </div>
      {canEdit ? (
        <textarea
          className={`input re-caption${photo.commentOverridden ? ' is-modified' : ''}`}
          value={text}
          maxLength={500}
          placeholder="사진 설명"
          aria-label={`${photo.slot || '사진'} 설명`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
      ) : (
        photo.comment && <figcaption className="re-caption-text">{photo.comment}</figcaption>
      )}
      {canEdit && photo.commentOverridden && <div className="re-original-hint">원본: {photo.originalComment || '(없음)'}</div>}
    </figure>
  );
}

function ItemCard({ item, n, color, active, canEdit, busy, isFirst, isLast, userId, onSave, onMove, onRemove, cardRef }) {
  const [title, setTitle] = useState(item.titleOverridden ? item.title : '');
  const [body, setBody] = useState(item.comment ?? '');
  useEffect(() => setTitle(item.titleOverridden ? item.title : ''), [item.title, item.titleOverridden]);
  useEffect(() => setBody(item.comment ?? ''), [item.comment]);
  const photos = item.photos ?? [];
  const modified = item.titleOverridden || item.commentOverridden || photos.some((p) => p.commentOverridden);

  const commitTitle = () => {
    const next = title.trim();
    if (next === (item.titleOverridden ? item.title : '')) return;
    onSave({ overrideTitle: next && next !== item.originalTitle ? next : null });
  };
  const commitBody = () => {
    if (body === (item.comment ?? '')) return;
    onSave({ overrideComment: body.trim() === (item.originalComment ?? '').trim() ? null : body });
  };
  const revertAll = () => {
    if (!window.confirm('이 항목에서 고친 제목·사진 설명·본문을 모두 원본으로 되돌릴까요?')) return;
    const photoReset = Object.fromEntries(photos.filter((p) => p.commentOverridden).map((p) => [p.index, null]));
    onSave({ overrideTitle: null, overrideComment: null, overridePhotoComments: photoReset });
  };

  return (
    <article ref={cardRef} className={`re-card${active ? ' is-active' : ''}`}>
      <div className="re-card-head">
        <span className="re-no" style={{ borderColor: color }}>{n}</span>
        <div className="re-card-main">
          {canEdit ? (
            <input
              className={`input re-card-title${item.titleOverridden ? ' is-modified' : ''}`}
              value={title}
              maxLength={200}
              placeholder={item.originalTitle}
              aria-label="카드 제목"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <h3 className="re-card-title-text">{item.title}</h3>
          )}
          <div className="pj-muted re-card-meta">
            {[item.address, formatDate(item.completedAt), item.author?.name, item.category].filter(Boolean).join(' · ')}
            {item.author?.userId === userId && <MineBadge />}
            {modified && <span className="re-badge">✎ 보고서에서 수정</span>}
          </div>
        </div>
        {canEdit && (
          <div className="re-card-actions">
            {modified && (
              <button type="button" className="btn-secondary pj-btn-sm" disabled={busy} onClick={revertAll}>
                원본으로
              </button>
            )}
            <button type="button" className="icon-button" aria-label="위로" disabled={busy || isFirst} onClick={() => onMove(-1)}>
              ▲
            </button>
            <button type="button" className="icon-button" aria-label="아래로" disabled={busy || isLast} onClick={() => onMove(1)}>
              ▼
            </button>
            <button type="button" className="icon-button" aria-label="보고서에서 빼기" disabled={busy} onClick={onRemove}>
              ✕
            </button>
          </div>
        )}
      </div>
      {photos.length > 0 ? (
        <div className="re-photo-grid">
          {photos.map((p) => (
            <PhotoCell key={`${p.index}-${p.url}`} photo={p} canEdit={canEdit} onSave={onSave} />
          ))}
        </div>
      ) : (
        <div className="pj-muted">사진 없음</div>
      )}
      <div className="re-body-label">본문</div>
      {canEdit ? (
        <>
          <textarea
            className={`input re-body${item.commentOverridden ? ' is-modified' : ''}`}
            value={body}
            maxLength={5000}
            aria-label="본문"
            onChange={(e) => setBody(e.target.value)}
            onBlur={commitBody}
          />
          {item.commentOverridden && <div className="re-original-hint">원본: {item.originalComment || '(없음)'}</div>}
        </>
      ) : (
        <p className="re-body-text">{item.comment || '-'}</p>
      )}
    </article>
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
  const [activeN, setActiveN] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }
  const [titleDraft, setTitleDraft] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const cardRefs = useRef(new Map());

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
    setActiveN(null);
    setMessage(null);
    setFilters(EMPTY_FILTERS);
    loadReport().catch((e) => setLoadError(errorMessage(e, '보고서를 불러오지 못했습니다.')));
  }, [loadReport]);

  useEffect(() => {
    if (!projectId) return;
    fetchProject(projectId, userId)
      .then((p) => {
        setIsLeader(Boolean(p?.canManage ?? p?.isLeader));
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

  const sections = report?.sections ?? [];
  const allItems = useMemo(() => sections.flatMap((s) => s.items ?? []), [sections]);
  const inReport = useMemo(() => new Set(allItems.map((it) => it.progressId)), [allItems]);
  const colors = useMemo(() => authorColorMap(allItems), [allItems]);
  // 카드 번호 = 섹션 순서대로 1..n (보고서 HTML·위치 표와 같음)
  const numbered = useMemo(() => {
    let n = 0;
    return sections.map((s) => ({ ...s, rows: (s.items ?? []).map((it) => ({ it, n: ++n })) }));
  }, [sections]);
  const markers = useMemo(
    () =>
      numbered.flatMap((s) =>
        s.rows.map(({ it, n }) => ({ n, lat: it.lat, lng: it.lng, color: colors.get(it.author?.name ?? '-'), title: it.title }))
      ),
    [numbered, colors]
  );
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

  const pickCard = (n) => {
    setActiveN(n);
    cardRefs.current.get(n)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      setActiveN(null);
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

  const saveItem = (item, patch) =>
    run(async () => {
      await updateReportItem(reportId, item.progressId, userId, patch);
      await loadReport();
    }, '수정한 내용을 저장하지 못했습니다.');

  const changeGroupBy = (groupBy) => {
    if (!canEdit || groupBy === report.report.groupBy) return;
    run(async () => {
      await updateCompiledReport(reportId, userId, { groupBy });
      await loadReport();
    }, '목차 구분을 바꾸지 못했습니다.');
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

  // D15: 내려받는 HTML에는 카카오 키를 넣지 않는다 (지도 대신 위치 표가 보임)
  const downloadHtml = () =>
    run(async () => {
      const html = await fetchCompiledReportHtml(reportId, userId);
      saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFileName(report.report.title)}.html`);
    }, 'HTML 파일을 만들지 못했습니다.');

  const downloadHwpx = () =>
    run(async () => {
      const { blob, fileName } = await downloadCompiledHwpx(reportId, userId);
      saveBlob(blob, fileName);
    }, '이 기기에서 HWPX 파일을 만들지 못했습니다. 다시 시도해 주세요.');

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
  const summary = report.summary ?? {};
  const locationTable = (
    <table className="table re-location-table">
      <thead>
        <tr>
          <th>번호</th>
          <th>위치</th>
          <th>{GROUP_BY_OPTIONS.find((o) => o.value === meta.groupBy)?.label ?? '분류'}</th>
          <th>완료일</th>
        </tr>
      </thead>
      <tbody>
        {numbered.flatMap((s) =>
          s.rows.map(({ it, n }) => (
            <tr key={it.progressId} className="re-location-row" onClick={() => pickCard(n)}>
              <td>{n}</td>
              <td>{it.address || '-'}</td>
              <td>{s.label}</td>
              <td>{formatDate(it.completedAt)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

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
          <button type="button" className="btn-secondary" disabled={busy} onClick={downloadHtml}>
            HTML 내려받기
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
        <p className="panel-notice re-notice">항목 담기만 할 수 있습니다. 제목·사진 설명·본문 수정과 확정은 그룹 리더가 합니다.</p>
      )}
      {canEdit && <p className="panel-notice re-notice">여기서 고친 글은 이 보고서에만 저장돼요. 현장 원본 기록은 바뀌지 않습니다. (입력칸을 벗어나면 저장)</p>}
      {message && <p className={message.type === 'error' ? 'form-error' : 'form-success'}>{message.text}</p>}

      <div className="re-layout">
        {/* 왼쪽: 담을 항목 */}
        <section className="panel re-col re-pool-col">
          <div className="panel-header">
            <h2 className="panel-title">담을 항목</h2>
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

        {/* 오른쪽: 보고서 (지도 + 카드) */}
        <div className="re-main">
          <section className="panel re-summary">
            <div className="pj-muted">
              기간 {summary.period?.from ?? '-'} ~ {summary.period?.to ?? '-'} · 총 {summary.totalCount ?? allItems.length}건 · 작성자{' '}
              {(summary.authors ?? []).join(', ') || '-'}
            </div>
            <div className="re-groupby">
              <span className="pj-muted" title="보고서 안에서 카드를 나누는 제목이에요. 담을 업무는 왼쪽 필터로 골라요.">목차 구분</span>
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
          </section>

          {allItems.length > 0 && (
            <section className="panel re-mapcard">
              <ReportMap markers={markers} activeN={activeN} onPick={pickCard} fallback={locationTable} />
              <div className="re-legend">
                {[...colors].map(([name, color]) => (
                  <span key={name}>
                    <i style={{ borderColor: color }} />
                    {name}
                  </span>
                ))}
                <span className="pj-muted">· 핀을 누르면 해당 카드로 이동해요</span>
              </div>
            </section>
          )}

          {numbered.length === 0 ? (
            <section className="panel">
              <div className="table-empty">왼쪽 &lsquo;담을 항목&rsquo;에서 완료 기록을 담아 주세요.</div>
            </section>
          ) : (
            numbered.map((section, si) => (
              <section key={section.key} className={`re-group re-tone-${si % 6}`}>
                <h2 className="re-group-head">
                  {section.label} <span className="pj-muted">{section.count}건</span>
                </h2>
                {section.rows.map(({ it, n }, i) => (
                  <ItemCard
                    key={it.progressId}
                    item={it}
                    n={n}
                    color={colors.get(it.author?.name ?? '-')}
                    active={activeN === n}
                    canEdit={canEdit}
                    busy={busy}
                    isFirst={i === 0}
                    isLast={i === section.rows.length - 1}
                    userId={userId}
                    onSave={(patch) => saveItem(it, patch)}
                    onMove={(delta) => move(section, i, delta)}
                    onRemove={() => removeItem(it)}
                    cardRef={(el) => (el ? cardRefs.current.set(n, el) : cardRefs.current.delete(n))}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>

      {showVersions && <VersionsModal reportId={reportId} projectId={projectId} userId={userId} onClose={() => setShowVersions(false)} />}
    </div>
  );
}
