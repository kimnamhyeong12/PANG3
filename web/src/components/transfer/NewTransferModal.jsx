import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import { fetchGroupMembers } from '../../api/groups.js';
import { fetchGroupTasks } from '../../api/tasks.js';
import { createTransfer } from '../../api/transfers.js';
import { STATUS, normalizeStatus } from '../../utils/taskStatus.js';

const DIRECT_INPUT = '__direct__';

// TaskTransferService.normalizeDong과 동일: 공백 기준 마지막 토큰 비교 ("사하구 괴정1동" == "괴정1동")
function normalizeDong(value) {
  const full = String(value ?? '').trim();
  if (!full) return '';
  const parts = full.split(/\s+/);
  return parts[parts.length - 1];
}

const areaKey = (t) => `${t.sido ?? ''}|${t.sigungu ?? ''}|${t.adminDong}`;

export default function NewTransferModal({ groupId, user, onClose, onCreated }) {
  const [members, setMembers] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [recipientUserId, setRecipientUserId] = useState('');
  const [areaChoice, setAreaChoice] = useState('');
  const [directDong, setDirectDong] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGroupMembers(groupId, user.userId), fetchGroupTasks(groupId, user.userId)])
      .then(([memberList, taskList]) => {
        if (cancelled) return;
        setMembers((memberList ?? []).filter((m) => m.userId !== user.userId));
        // 백엔드는 보내는 사람이 현재 담당자인 업무만 이관 허용
        setMyTasks((taskList ?? []).filter((t) => t.assigneeUserId === user.userId));
      })
      .catch((e) => !cancelled && setLoadError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId, user.userId]);

  // 내 담당 업무의 행정동 목록 (시도/시군구까지 같은 것끼리 묶음)
  const areaOptions = useMemo(() => {
    const map = new Map();
    myTasks
      .filter((t) => t.adminDong)
      .forEach((t) => {
        const key = areaKey(t);
        const entry = map.get(key) ?? { key, sido: t.sido, sigungu: t.sigungu, adminDong: t.adminDong, count: 0 };
        entry.count += 1;
        map.set(key, entry);
      });
    return [...map.values()].sort((a, b) => a.adminDong.localeCompare(b.adminDong, 'ko'));
  }, [myTasks]);

  const selectedTasks = useMemo(() => {
    if (areaChoice === DIRECT_INPUT) {
      const target = normalizeDong(directDong);
      if (!target) return [];
      return myTasks.filter((t) => normalizeDong(t.adminDong) === target);
    }
    if (!areaChoice) return [];
    return myTasks.filter((t) => t.adminDong && areaKey(t) === areaChoice);
  }, [areaChoice, directDong, myTasks]);

  const preview = useMemo(() => {
    const count = (s) => selectedTasks.filter((t) => normalizeStatus(t) === s).length;
    return { working: count(STATUS.WORKING), complete: count(STATUS.COMPLETE), pending: count(STATUS.PENDING) };
  }, [selectedTasks]);

  const hasArea = areaChoice === DIRECT_INPUT ? normalizeDong(directDong) !== '' : areaChoice !== '';
  const canSubmit = recipientUserId && selectedTasks.length > 0 && !submitting;

  const onSubmit = async () => {
    const first = selectedTasks[0];
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createTransfer(groupId, {
        senderUserId: user.userId,
        recipientUserId: Number(recipientUserId),
        taskIds: selectedTasks.map((t) => t.taskId),
        sido: first.sido ?? '',
        sigungu: first.sigungu ?? '',
        adminDong: first.adminDong ?? '',
      });
      onCreated();
    } catch (e) {
      setSubmitError(e.message);
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="btn-secondary" onClick={onClose}>
        취소
      </button>
      <button type="button" className="btn-primary btn-inline" disabled={!canSubmit} onClick={onSubmit}>
        {submitting ? '요청 중…' : `이관 요청 (${selectedTasks.length}건)`}
      </button>
    </>
  );

  let body;
  if (loading) body = <div className="modal-state">불러오는 중…</div>;
  else if (loadError) body = <div className="form-error">{loadError}</div>;
  else
    body = (
      <>
        {submitError && <p className="form-error">{submitError}</p>}

        <div className="field">
          <label htmlFor="recipient">받을 팀원</label>
          <select
            id="recipient"
            className="input"
            value={recipientUserId}
            onChange={(e) => setRecipientUserId(e.target.value)}
          >
            <option value="">팀원을 선택하세요</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} ({m.loginId})
              </option>
            ))}
          </select>
          {members.length === 0 && <span className="field-hint">이관할 수 있는 다른 팀원이 없습니다.</span>}
        </div>

        <div className="field">
          <label htmlFor="area">행정동</label>
          <select id="area" className="input" value={areaChoice} onChange={(e) => setAreaChoice(e.target.value)}>
            <option value="">행정동을 선택하세요</option>
            {areaOptions.map((a) => (
              <option key={a.key} value={a.key}>
                {[a.sigungu, a.adminDong].filter(Boolean).join(' ')} · 내 업무 {a.count}건
              </option>
            ))}
            <option value={DIRECT_INPUT}>직접 입력</option>
          </select>
          {areaChoice === DIRECT_INPUT && (
            <input
              className="input"
              placeholder="예: 괴정1동"
              value={directDong}
              onChange={(e) => setDirectDong(e.target.value)}
              autoFocus
            />
          )}
          <span className="field-hint">내가 현재 담당 중인 업무만 이관할 수 있습니다.</span>
        </div>

        {hasArea && (
          <div className="transfer-preview">
            {selectedTasks.length === 0 ? (
              <p className="transfer-preview-empty">해당 행정동에 내 담당 업무가 없습니다.</p>
            ) : (
              <>
                <div className="transfer-preview-title">이관될 업무 {selectedTasks.length}건</div>
                <div className="transfer-preview-stats">
                  <span className="pill pill-amber">진행중 {preview.working}</span>
                  <span className="pill pill-green">완료 {preview.complete}</span>
                  <span className="pill pill-red">미처리 {preview.pending}</span>
                </div>
                <p className="transfer-preview-note">사진·보고서·메모는 그대로 유지됩니다.</p>
              </>
            )}
          </div>
        )}
      </>
    );

  return (
    <Modal title="새 이관 요청" onClose={onClose} footer={footer}>
      {body}
    </Modal>
  );
}
