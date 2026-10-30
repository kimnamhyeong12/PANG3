import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchTransfers } from '../api/transfers.js';
export default function RecentNotifications() {
  const {
      user
    } = useAuth(),
    {
      groupId
    } = useGroup(),
    navigate = useNavigate();
  const [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [failures, setFailures] = useState(0),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const jobs = [fetchTransfers(groupId, user.userId).then(rows => rows.filter(t => t.status === 'PENDING' || t.respondedAt).map(t => ({
      key: `t${t.id}`,
      label: t.status === 'PENDING' ? `${t.senderName}님의 업무 이관 요청` : `업무 이관 ${t.status === 'ACCEPTED' ? '수락' : t.status === 'REJECTED' ? '거절' : '종료'}`,
      date: t.respondedAt || t.requestedAt,
      to: `/transfers?request=${t.id}`
    }))), api.get('/api/support/inquiries').then(r => (r.items || []).filter(i => i.status === 'ANSWERED').map(i => ({
      key: `s${i.id}`,
      label: `문의 답변 · ${i.subject}`,
      date: i.answeredAt,
      to: `/settings?tab=support&inquiry=${i.id}`
    }))), api.get('/api/facility-applications').then(r => (r.items || []).filter(i => i.status !== 'PENDING').map(i => ({
      key: `f${i.id}`,
      label: `시설물 신청 처리 · ${i.name}`,
      date: i.updatedAt || i.createdAt,
      to: `/map?application=${i.id}`
    })))];
    if (['ADMIN', 'SUPPORT_AGENT'].includes(user.role)) jobs.push(api.get('/api/admin/support/inquiries', {
      status: 'WAITING'
    }).then(r => (r.items || []).map(i => ({
      key: `as${i.id}`,
      label: `새 문의 · ${i.subject}`,
      date: i.createdAt,
      to: `/admin/support?inquiry=${i.id}`
    }))));
    if (['ADMIN', 'FACILITY_REVIEWER'].includes(user.role)) jobs.push(api.get('/api/admin/facility-applications').then(r => (r.items || []).filter(i => ['PENDING', 'REVIEWING'].includes(i.status)).map(i => ({
      key: `af${i.id}`,
      label: `시설물 검토 요청 · ${i.name}`,
      date: i.createdAt,
      to: `/admin/facilities?application=${i.id}`
    }))));
    Promise.allSettled(jobs).then(results => {
      if (active) {
        setItems(results.flatMap(r => r.status === 'fulfilled' ? r.value : []).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 12));
        setFailures(results.filter(r => r.status === 'rejected').length);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user.userId, user.role, groupId, retry]);
  return <section className="panel" id="notifications"><div className="panel-header"><h2 className="panel-title">최근 알림</h2><button className="btn-secondary" onClick={() => setRetry(v => v + 1)}>새로고침</button></div><div className="notification-scroll" tabIndex={0} aria-label="최근 알림 목록">{loading ? <p className="table-empty">불러오는 중…</p> : <>{failures > 0 && <p className="form-error panel-error">일부 알림을 불러오지 못했습니다.</p>}{!items.length && <p className="table-empty">최근 알림이 없습니다.</p>}{items.map(i => <div key={i.key} className="notification-row"><div>{i.label}<small>{i.date ? String(i.date).slice(0, 16).replace('T', ' ') : ''}</small></div><button className="btn-secondary" onClick={() => navigate(i.to)}>확인</button></div>)}</>}</div></section>;
}
