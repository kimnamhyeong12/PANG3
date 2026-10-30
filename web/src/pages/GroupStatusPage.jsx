import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useGroup } from '../context/GroupContext.jsx';
import { fetchGroupTasks } from '../api/tasks.js';
import { fetchGroupMembers } from '../api/groups.js';
import { fetchRegionBoundaries } from '../api/publicData.js';
import { normalizeStatus, STATUS_LABEL } from '../utils/taskStatus.js';
import { personalGroup } from './GroupsPage.jsx';
import { groupDisplayName } from '../utils/groupDisplay.js';
import { buildMemberColors } from '../../../frontend/utils/memberColors.js';
import { isCurrentWork } from '../../../frontend/utils/completionDay.js';
import MapCanvas from '../components/map/MapCanvas.jsx';
export default function GroupStatusPage() {
  const {
    user
  } = useAuth();
  const {
    groupId,
    currentGroup
  } = useGroup();
  const [data, setData] = useState({
      groupId: null,
      tasks: [],
      members: [],
      boundaries: null
    }),
    [member, setMember] = useState(''),
    [selected, setSelected] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setMember('');
    setSelected(null);
    const personal = personalGroup(currentGroup);
    Promise.all([fetchGroupTasks(groupId, user.userId), fetchGroupMembers(groupId, user.userId), fetchRegionBoundaries(personal ? user.workSido : currentGroup?.regionSido, personal ? user.workSigungu : currentGroup?.regionSigungu, currentGroup?.regionAdmCode).catch(() => null)]).then(([tasks, members, boundaries]) => {
      if (active) setData({
        groupId,
        tasks: (tasks || []).filter(task => isCurrentWork(task)).map(task => ({
          ...task,
          _status: normalizeStatus(task)
        })),
        members,
        boundaries
      });
    }).catch(failure => {
      if (active) setError(failure.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [groupId, user.userId, user.workSido, user.workSigungu, currentGroup?.regionSido, currentGroup?.regionSigungu, currentGroup?.regionAdmCode, reload]);
  const tasks = data.groupId === groupId ? data.tasks : [];
  const members = data.groupId === groupId ? data.members : [];
  const colors = useMemo(() => buildMemberColors(members, tasks), [members, tasks]);
  const visible = member ? tasks.filter(task => String(task.assigneeUserId) === member) : tasks;
  const counts = visible.reduce((result, task) => ({
    ...result,
    [task._status]: result[task._status] + 1
  }), {
    pending: 0,
    working: 0,
    complete: 0
  });
  return <section className="group-status-workspace"><div className="group-status-heading"><div><Link to="/groups">그룹 목록</Link><h1>{currentGroup ? groupDisplayName(currentGroup) : '그룹'} 업무현황</h1></div><button className="btn-secondary" disabled={loading} onClick={() => setReload(value => value + 1)}>새로고침</button></div>{error && <p className="form-error" role="alert">{error}</p>}
    <div className="group-status-summary">{[['전체', visible.length], ['작업 전', counts.pending], ['작업 중', counts.working], ['작업 후', counts.complete]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    <div className="group-status-layout"><aside className="panel group-status-list"><div className="panel-header"><h2 className="panel-title">{member ? members.find(row => String(row.userId) === member)?.name || '팀원' : '전체'} 방문지</h2><span>{visible.length}곳</span></div><div className="map-visit-scroll" tabIndex={0} aria-label="그룹 방문지 목록">{loading ? <p className="table-empty">불러오는 중…</p> : visible.length ? <ul className="map-task-list">{visible.map(task => <li key={task.taskId}><button className={`map-task-item${selected === task.taskId ? ' active' : ''}`} onClick={() => setSelected(task.taskId)}><span className="owner-dot" style={{
                  background: colors[task.assigneeUserId] || '#94A3B8'
                }} /><strong>{task.detailAddress || task.roadAddress}</strong><span className={`visit-state visit-state-${task._status}`}>{STATUS_LABEL[task._status]}</span></button></li>)}</ul> : <p className="table-empty">등록된 방문지가 없습니다.</p>}</div></aside>
      <MapCanvas key={groupId} tasks={visible} ownerColors={colors} busStops={[]} aeds={[]} boundaries={data.groupId === groupId ? data.boundaries : null} layers={{
        tasks: true,
        boundary: true
      }} selectedTaskId={selected} onSelectTask={setSelected} dataReady={!loading} showTaskInfo={false}>
        <div className="group-member-control"><label>팀원 현황<select className="input" aria-label="팀원 현황" value={member} onChange={event => {
              setMember(event.target.value);
              setSelected(null);
            }}><option value="">전체</option>{members.map(row => <option key={row.userId} value={row.userId}>{row.name}{Number(row.userId) === Number(user.userId) ? ' · 나' : ''}</option>)}</select></label></div>
      </MapCanvas>
    </div></section>;
}
