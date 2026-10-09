import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { STATUS, normalizeStatus } from '../utils/taskStatus.js';
import { formatDate, formatToday } from '../utils/format.js';
import StatusPill from '../components/StatusPill.jsx';
import ErrorBlock from '../components/ErrorBlock.jsx';
import { SkeletonLine, SkeletonTable } from '../components/Loading.jsx';
import { errorMessage } from '../api/client.js';
import { IconBell, IconMap, IconPlus, IconReport } from '../components/Icons.jsx';

function StatCard({ label, value, tone, loading }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value stat-${tone}`}>
        {loading ? <SkeletonLine width={56} height={28} /> : value == null ? '-' : value.toLocaleString()}
      </div>
    </div>
  );
}

function TaskTable({ tasks, loading, error, onRetry }) {
  let body;
  if (error) body = <ErrorBlock message={error} onRetry={onRetry} />;
  else if (loading) body = <SkeletonTable />;
  else if (tasks.length === 0) body = <div className="table-empty">등록된 업무가 없습니다.</div>;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">업무 목록</h2>
        {!loading && !error && <span className="panel-count">{tasks.length}건</span>}
      </div>
      {body ?? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>담당자</th>
                <th>업무유형</th>
                <th>주소</th>
                <th>상태</th>
                <th>배정일</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.taskId}>
                  <td className="cell-strong">{task.assigneeName ?? '-'}</td>
                  <td>{task.taskCategory ?? '-'}</td>
                  <td className="cell-address" title={task.roadAddress ?? ''}>
                    {task.roadAddress ?? '-'}
                  </td>
                  <td>
                    <StatusPill status={task._status} />
                  </td>
                  <td className="cell-date">{formatDate(task.workDate ?? task.scheduledDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    // 업무 등록 UI는 지도 화면에서 구현 예정
    { label: '새 업무 등록', Icon: IconPlus, to: '/map' },
    { label: '지도에서 보기', Icon: IconMap, to: '/map' },
    { label: '보고서 보관함', Icon: IconReport, to: '/reports' },
  ];
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">빠른 작업</h2>
      </div>
      <div className="quick-actions">
        {actions.map(({ label, Icon, to }) => (
          <button key={label} type="button" className="quick-action" onClick={() => navigate(to)}>
            <span className="quick-action-icon">
              <Icon size={18} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentNotifications() {
  // 알림 목록 조회 API가 아직 없어 자리만 둔다
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">최근 알림</h2>
      </div>
      <div className="panel-empty">
        <IconBell size={22} />
        <span>준비 중입니다.</span>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { groupId, currentGroup } = useGroup();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGroupTasks(groupId, user.userId)
      .then((list) => {
        if (!cancelled) setTasks((list ?? []).map((t) => ({ ...t, _status: normalizeStatus(t) })));
      })
      .catch((e) => {
        if (!cancelled) {
          setTasks([]);
          setError(errorMessage(e, '업무 목록을 불러오지 못했습니다.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, user.userId, reloadKey]);

  const stats = useMemo(() => {
    const count = (s) => tasks.filter((t) => t._status === s).length;
    return {
      total: tasks.length,
      working: count(STATUS.WORKING),
      complete: count(STATUS.COMPLETE),
      pending: count(STATUS.PENDING),
    };
  }, [tasks]);

  return (
    <>
      <h1 className="page-title">대시보드</h1>
      <p className="page-desc">
        {formatToday()} · {currentGroup?.groupName} 팀의 업무 현황입니다.
      </p>

      <div className="stat-grid">
        <StatCard label="전체 업무" value={error ? null : stats.total} tone="text" loading={loading} />
        <StatCard label="진행중" value={error ? null : stats.working} tone="amber" loading={loading} />
        <StatCard label="완료" value={error ? null : stats.complete} tone="green" loading={loading} />
        <StatCard label="미처리" value={error ? null : stats.pending} tone="red" loading={loading} />
      </div>

      <div className="dashboard-columns">
        <TaskTable tasks={tasks} loading={loading} error={error} onRetry={() => setReloadKey((k) => k + 1)} />
        <div className="dashboard-side">
          <QuickActions />
          <RecentNotifications />
        </div>
      </div>
    </>
  );
}
