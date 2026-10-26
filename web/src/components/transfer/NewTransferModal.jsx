import { fetchProjects } from '../../api/projects.js';
import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import { fetchGroupMembers } from '../../api/groups.js';
import { fetchGroupTasks } from '../../api/tasks.js';
import { createTransfer } from '../../api/transfers.js';
import { STATUS, normalizeStatus } from '../../utils/taskStatus.js';
import { errorMessage } from '../../api/client.js';
import { LoadingBlock } from '../Loading.jsx';

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
  const [projects,setProjects]=useState([]),[projectChoice,setProjectChoice]=useState('');
  useEffect(()=>{let active=true;fetchProjects(groupId,user.userId).then(rows=>{if(active)setProjects(rows);}).catch(()=>{});return()=>{active=false;};},[groupId,user.userId]);
  const [directDong, setDirectDong] = useState('');
  const [chosenTaskIds,setChosenTaskIds]=useState(null);
  useEffect(()=>setChosenTaskIds(null),[areaChoice,directDong,projectChoice]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGroupMembers(groupId, user.userId), fetchGroupTasks(groupId, user.userId)])
      .then(([memberList, taskList]) => {
        if (cancelled) return;
        setMembers((memberList ?? []).filter((m) => m.userId !== user.userId));
        // 백엔드는 보내는 사람이 현재 담당자인 업무만 이관 허용
        setMyTasks((taskList ?? []).filter((t) => t.assigneeUserId === user.userId && normalizeStatus(t) !== STATUS.COMPLETE));
      })
      .catch((e) => !cancelled && setLoadError(errorMessage(e, '팀원·업무 정보를 불러오지 못했습니다.')))
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

  const candidateTasks = useMemo(() => {
    if(projectChoice) return myTasks.filter(t=>(t.projectIds||[]).some(id=>String(id)===projectChoice));
    if (areaChoice === DIRECT_INPUT) {
      const target = normalizeDong(directDong);
      if (!target) return [];
      return myTasks.filter((t) => normalizeDong(t.adminDong) === target);
    }
    if (!areaChoice) return [];
    return myTasks.filter((t) => t.adminDong && areaKey(t) === areaChoice);
  }, [areaChoice, directDong, myTasks, projectChoice]);

  const selectedTasks = chosenTaskIds === null ? candidateTasks : candidateTasks.filter(task=>chosenTaskIds.includes(task.taskId));

  const preview = useMemo(() => {
    const count = (s) => selectedTasks.filter((t) => normalizeStatus(t) === s).length;
    return { working: count(STATUS.WORKING), complete: count(STATUS.COMPLETE), pending: count(STATUS.PENDING) };
  }, [selectedTasks]);

  const hasArea = Boolean(projectChoice) || (areaChoice === DIRECT_INPUT ? normalizeDong(directDong) !== '' : areaChoice !== '');
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
      setSubmitError(errorMessage(e, '이관 요청을 보내지 못했습니다.'));
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
  if (loading) body = <LoadingBlock />;
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
          <label htmlFor="project-transfer">프로젝트</label><select id="project-transfer" className="input" value={projectChoice} onChange={e=>{setProjectChoice(e.target.value);setAreaChoice('');}}><option value="">행정동으로 선택</option>{projects.map(p=><option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select>
          <label htmlFor="area">행정동</label>
          <select id="area" className="input" value={areaChoice} onChange={(e) => {setAreaChoice(e.target.value);setProjectChoice('');}}>
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

        {hasArea && candidateTasks.length > 0 && <div className="field"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><label>이관할 업무 선택</label><button type="button" className="btn-secondary" onClick={()=>setChosenTaskIds(selectedTasks.length===candidateTasks.length?[]:candidateTasks.map(t=>t.taskId))}>{selectedTasks.length===candidateTasks.length?'전체 해제':'전체 선택'}</button></div>{candidateTasks.map(task=><label key={task.taskId} style={{display:'flex',gap:8,padding:'8px 0'}}><input type="checkbox" checked={selectedTasks.some(t=>t.taskId===task.taskId)} onChange={()=>setChosenTaskIds(old=>{const ids=old===null?candidateTasks.map(t=>t.taskId):old;return ids.includes(task.taskId)?ids.filter(id=>id!==task.taskId):[...ids,task.taskId];})}/>{task.detailAddress || task.roadAddress} · {task.workDate || ''}</label>)}</div>}
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
