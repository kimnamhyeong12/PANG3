import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { TRANSFER_STATUS, acceptTransfer, fetchTransfers, rejectTransfer } from '../api/transfers.js';
import { formatDateTime } from '../utils/format.js';
import NewTransferModal from '../components/transfer/NewTransferModal.jsx';
import { IconPlus } from '../components/Icons.jsx';

const STATUS_VIEW = {
  [TRANSFER_STATUS.PENDING]: { label: '대기', tone: 'amber' },
  [TRANSFER_STATUS.ACCEPTED]: { label: '수락', tone: 'green' },
  [TRANSFER_STATUS.REJECTED]: { label: '거절', tone: 'red' },
};

function TransferStatusPill({ status }) {
  const view = STATUS_VIEW[status] ?? { label: status ?? '-', tone: 'gray' };
  return <span className={`pill pill-${view.tone}`}>{view.label}</span>;
}

function TransferItem({ item, canRespond, busy, onRespond }) {
  const area = [item.sigungu, item.adminDong].filter(Boolean).join(' ') || '-';
  return (
    <li className="transfer-item">
      <div className="transfer-main">
        <div className="transfer-people">
          <span>{item.senderName}</span>
          <span className="transfer-arrow">→</span>
          <span>{item.recipientName}</span>
          <TransferStatusPill status={item.status} />
        </div>
        <div className="transfer-meta">
          <span>{area}</span>
          <span>업무 {item.taskIds?.length ?? 0}건</span>
          <span>요청 {formatDateTime(item.requestedAt)}</span>
          {item.respondedAt && <span>처리 {formatDateTime(item.respondedAt)}</span>}
        </div>
      </div>
      {canRespond && (
        <div className="transfer-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => onRespond(item, false)}>
            거절
          </button>
          <button type="button" className="btn-primary btn-inline" disabled={busy} onClick={() => onRespond(item, true)}>
            수락
          </button>
        </div>
      )}
    </li>
  );
}

export default function TransferPage() {
  const { user } = useAuth();
  const { groupId } = useGroup();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('received');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTransfers((await fetchTransfers(groupId, user.userId)) ?? []);
    } catch (e) {
      setTransfers([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [groupId, user.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const received = useMemo(() => transfers.filter((t) => t.recipientUserId === user.userId), [transfers, user.userId]);
  const sent = useMemo(() => transfers.filter((t) => t.senderUserId === user.userId), [transfers, user.userId]);
  const pendingReceived = received.filter((t) => t.status === TRANSFER_STATUS.PENDING).length;
  const list = tab === 'received' ? received : sent;

  const onRespond = async (item, accept) => {
    const message = accept
      ? `${item.senderName}님의 업무 ${item.taskIds?.length ?? 0}건을 수락할까요?`
      : `${item.senderName}님의 이관 요청을 거절할까요?`;
    if (!window.confirm(message)) return;
    setBusyId(item.id);
    setActionError(null);
    try {
      await (accept ? acceptTransfer : rejectTransfer)(groupId, item.id, user.userId);
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  let content;
  if (error) content = <div className="table-empty">{error}</div>;
  else if (loading) content = <div className="table-empty">이관 요청을 불러오는 중…</div>;
  else if (list.length === 0)
    content = (
      <div className="table-empty">{tab === 'received' ? '받은 이관 요청이 없습니다.' : '보낸 이관 요청이 없습니다.'}</div>
    );
  else
    content = (
      <ul className="transfer-list">
        {list.map((item) => (
          <TransferItem
            key={item.id}
            item={item}
            canRespond={item.status === TRANSFER_STATUS.PENDING && item.recipientUserId === user.userId}
            busy={busyId === item.id}
            onRespond={onRespond}
          />
        ))}
      </ul>
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">업무 이관</h1>
          <p className="page-desc">행정동 단위로 내 담당 업무를 다른 팀원에게 이관 요청하고, 받은 요청을 처리합니다.</p>
        </div>
        <button type="button" className="btn-primary btn-inline" onClick={() => setModalOpen(true)}>
          <IconPlus size={16} />새 이관 요청
        </button>
      </div>

      <section className="panel">
        <div className="tabs">
          <button
            type="button"
            className={`tab${tab === 'received' ? ' active' : ''}`}
            onClick={() => setTab('received')}
          >
            받은 요청 {pendingReceived > 0 && <span className="tab-badge">{pendingReceived}</span>}
          </button>
          <button type="button" className={`tab${tab === 'sent' ? ' active' : ''}`} onClick={() => setTab('sent')}>
            보낸 요청
          </button>
        </div>
        {actionError && <p className="form-error panel-error">{actionError}</p>}
        {content}
      </section>

      {modalOpen && (
        <NewTransferModal
          groupId={groupId}
          user={user}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            setTab('sent');
            load();
          }}
        />
      )}
    </>
  );
}
