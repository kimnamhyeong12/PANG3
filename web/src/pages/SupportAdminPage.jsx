import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, errorMessage } from '../api/client.js';
import '../styles/support.css';

const formatDate = value => value ? new Date(value).toLocaleString('ko-KR') : '';
export default function SupportAdminPage() {
  const { user, logout } = useAuth();
  const agent = ['ADMIN', 'SUPPORT_AGENT'].includes(user?.role);
  const [status, setStatus] = useState('WAITING'), [page, setPage] = useState(0), [revision, setRevision] = useState(0);
  const [inbox, setInbox] = useState(null), [listError, setListError] = useState(''), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null), [record, setRecord] = useState(null), [detailLoading, setDetailLoading] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);
  const [answer, setAnswer] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [sending, setSending] = useState(false);
  const submitting = useRef(false), detailRequest = useRef(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!agent) return undefined;
    let active = true; setLoading(true); setListError('');
    api.get('/api/admin/support/inquiries', { page, status: status || undefined }).then(result => {
      if (!active) return;
      if (page > 0 && !result.items.length) { setPage(0); return; }
      setInbox(result);
    }).catch(failure => { if (active) setListError(errorMessage(failure, '문의함을 불러오지 못했습니다.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [agent, user?.userId, status, page, revision]);
  useEffect(() => {
    if (!agent || !selected) return undefined;
    let active = true; const requestId = ++detailRequest.current;
    setDetailLoading(true); setRecord(null); setError(''); setNotice(''); setAnswer('');
    api.get(`/api/admin/support/inquiries/${selected}`).then(result => { if (active && requestId === detailRequest.current) setRecord(result); })
      .catch(failure => { if (active) setError(errorMessage(failure, '문의를 불러오지 못했습니다.')); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [agent, user?.userId, selected, detailRevision]);
  const submit = async event => {
    event.preventDefault();
    if (submitting.current || !record || !answer.trim()) return;
    submitting.current = true; setSending(true); setError(''); setNotice('');
    try {
      const result = await api.post(`/api/admin/support/inquiries/${record.inquiry.id}/answer`, { answer: answer.trim(), version: record.inquiry.version });
      setRecord(result); setAnswer(''); setNotice('답변이 등록되었습니다. 사용자가 앱 문의 내역에서 확인할 수 있습니다.'); refresh();
    } catch (failure) {
      setError(errorMessage(failure, '답변을 등록하지 못했습니다. 작성 내용은 유지됩니다.'));
      if (failure.status === 409) {
        try { setRecord(await api.get(`/api/admin/support/inquiries/${record.inquiry.id}`)); refresh(); } catch { /* Keep the draft and error visible. */ }
      }
    } finally { submitting.current = false; setSending(false); }
  };
  const downloadAttachment = async file => {
    if (downloadingId !== null || !record) return;
    setDownloadingId(file.id); setError('');
    try {
      const blob = await api.download(`/api/admin/support/inquiries/${record.inquiry.id}/attachments/${file.id}`);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(errorMessage(failure, '첨부파일을 다운로드하지 못했습니다.')); }
    finally { setDownloadingId(null); }
  };
  if (!agent) return <main className="support-denied"><h1>고객센터 운영자 권한이 필요합니다.</h1><p>서버에서 권한을 부여받은 계정으로 로그인해 주세요.</p><Link to="/dashboard">서비스로 돌아가기</Link><button className="btn-secondary" onClick={logout}>로그아웃</button></main>;
  return <div className="support-admin">
    <header className="support-header"><div><span className="support-brand">핀워크</span><span className="support-admin-label">고객센터 운영</span></div><div><span>{user.name || user.loginId}</span><Link to="/dashboard">서비스로 이동</Link><button className="btn-secondary" onClick={logout}>로그아웃</button></div></header>
    <main className="support-main">
      <div className="support-page-heading"><div><p className="support-eyebrow">CUSTOMER SUPPORT</p><h1>공통 문의함</h1><p>운영자들이 함께 확인하고 답변합니다. 답변은 사용자 앱에 표시됩니다.</p></div><button className="btn-secondary" onClick={refresh} disabled={loading}>새로고침</button></div>
      <div className="support-workspace">
        <section className="support-list" aria-label="문의 목록">
          <div className="support-filters" role="tablist" aria-label="문의 상태">{[['WAITING', '답변 대기'], ['ANSWERED', '답변 완료'], ['', '전체']].map(([value, label]) => <button key={value} role="tab" aria-selected={status === value} disabled={sending} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setPage(0); setInbox(null); }}>{label}</button>)}</div>
          {listError && <div role="alert" className="support-error">{listError}<button onClick={refresh}>다시 시도</button></div>}
          {loading && <p role="status" className="support-muted">문의함을 불러오는 중…</p>}
          {!loading && !listError && !inbox?.items.length && <div className="support-list-empty">{status === 'WAITING' ? '답변을 기다리는 문의가 없습니다.' : '문의가 없습니다.'}</div>}
          {inbox?.items.map(item => <button key={item.id} disabled={sending} aria-pressed={selected === item.id} className={`support-list-item${selected === item.id ? ' selected' : ''}`} onClick={() => setSelected(item.id)}><span className="support-item-meta"><span>#{item.id} · {item.category}</span><span className={`support-badge ${item.status === 'ANSWERED' ? 'answered' : ''}`}>{item.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}</span></span><strong>{item.subject}</strong><time>{formatDate(item.createdAt)}</time></button>)}
          <div className="support-pagination"><button disabled={!page || loading || sending} onClick={() => setPage(value => value - 1)}>이전</button><span>{page + 1} 페이지</span><button disabled={!inbox?.hasMore || loading || sending} onClick={() => setPage(value => value + 1)}>다음</button></div>
        </section>
        <section className="support-detail" aria-label="문의 상세와 답변" aria-busy={detailLoading || sending}>
          {!selected && <div className="support-detail-empty"><span aria-hidden="true">↗</span><h2>문의를 선택해 주세요</h2><p>내용을 확인하고 사용자에게 답변을 남길 수 있습니다.</p></div>}
          {detailLoading && <p role="status">문의 내용을 불러오는 중…</p>}
          {error && <div role="alert" className="support-error">{error}{selected && !record && !detailLoading && <button onClick={() => setDetailRevision(value => value + 1)}>다시 불러오기</button>}</div>}
          {notice && <p role="status" className="support-success">{notice}</p>}
          {record && <>
            <div className="support-detail-heading"><span className="support-muted">문의 #{record.inquiry.id} · {record.inquiry.category}</span><h2>{record.inquiry.subject}</h2><time>{formatDate(record.inquiry.createdAt)}</time></div>
            <dl className="support-metadata"><div><dt>문의 계정</dt><dd>{record.loginId} (회원번호 {record.userId})</dd></div><div><dt>답변 이메일</dt><dd>{record.inquiry.replyEmail}</dd></div><div><dt>앱 정보</dt><dd>{record.appVersion} / {record.platform}</dd></div></dl>
            <div className="support-message">{record.inquiry.message}</div>
            {!!record.inquiry.attachments?.length && <section className="support-attachments" aria-label="첨부파일"><h3>첨부파일</h3>{record.inquiry.attachments.map(file => <button key={file.id} type="button" disabled={downloadingId !== null} onClick={() => downloadAttachment(file)}><span>{file.name}</span><span>{downloadingId === file.id ? '다운로드 중…' : `${(file.size / 1024 / 1024).toFixed(1)}MB · 다운로드`}</span></button>)}</section>}
            {record.inquiry.status === 'ANSWERED' ? <div className="support-saved-answer"><h3>등록된 답변</h3><p className="support-muted">{record.answeredByName || '운영자'} · {formatDate(record.inquiry.answeredAt)}</p><div className="support-message">{record.inquiry.answer}</div></div> : <form onSubmit={submit} className="support-answer-form"><label htmlFor="support-answer">답변 작성</label><p>등록한 답변은 사용자의 앱 문의 내역에 표시됩니다.</p><textarea id="support-answer" required maxLength={5000} value={answer} onChange={event => setAnswer(event.target.value)} disabled={sending} placeholder="사용자에게 안내할 내용을 입력해 주세요." /><div className="support-answer-footer"><span>{answer.length}/5000</span><button className="btn-primary" disabled={sending || !answer.trim()}>{sending ? '등록 중…' : '답변 등록'}</button></div></form>}
          </>}
        </section>
      </div>
    </main>
  </div>;
}
