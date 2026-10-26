import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { groupApi } from '../utils/groupApi';
import { transferHistoryPage, mergeTransferHistory, compareTransferHistory } from '../utils/transferHistory';
import ProjectBrowser from '../components/ProjectBrowser';
import { colors } from '../constants/design';

const dongName = (value) => String(value || '').trim().split(/\s+/).pop() || '';
const taskIdOf = (task) => Number(task?.id ?? task?.taskId ?? task?.task_id);
const isComplete = (task) => ['complete', 'completed', 'done'].includes(
  String(task?.status ?? task?.taskStatus ?? task?.task_status ?? '').toLowerCase()
);

export const formatTransferTime = (value) => {
  if (!value) return '';
  // Older server responses had no offset, but transfer times were stored in UTC.
  const timestamp = String(value);
  const instant = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`);
  if (Number.isNaN(instant.getTime())) return timestamp;
  const seoul = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  const pad = (part) => String(part).padStart(2, '0');
  return `${seoul.getUTCFullYear()}-${pad(seoul.getUTCMonth() + 1)}-${pad(seoul.getUTCDate())} ${pad(seoul.getUTCHours())}:${pad(seoul.getUTCMinutes())}`;
};

export default function TransferScreen({
  user,
  group,
  onBack,
  onChanged,
  requestsOnly = false,
  initialRecipientId = null,
  initialRecipientName = '',
}) {
  const [tasks, setTasks] = useState([]);
  const [projectPicker, setProjectPicker] = useState(false);
  const [projectFilter, setProjectFilter] = useState(null);
  useEffect(() => { setProjectFilter(null); setSelectedTaskIds([]); }, [group?.groupId]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [pendingRequestTaskIds, setPendingRequestTaskIds] = useState([]);
  const [recipientId, setRecipientId] = useState(initialRecipientId ? Number(initialRecipientId) : null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const visibleRequests = useMemo(() => requestsOnly
    ? requests.filter((request) => Number(request.recipientUserId) === Number(user?.userId))
        .sort(compareTransferHistory(user?.userId))
    : requests.filter((request) => Number(request.senderUserId) === Number(user?.userId)
        && (!recipientId || Number(request.recipientUserId) === Number(recipientId))),
  [requestsOnly, requests, user?.userId, recipientId]);

  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;
    try {
      const base = `/api/groups/${group.groupId}`;
      const [groupTasks, groupMembers, transferRequests] = await Promise.allSettled([
        groupApi(`/api/locations/group/${group.groupId}?userId=${user.userId}`),
        groupApi(`${base}/members?userId=${user.userId}`),
        transferHistoryPage(group.groupId, user.userId, 0, requestsOnly ? 'incoming' : 'outgoing', requestsOnly ? null : recipientId),
      ]);
      if (groupTasks.status === 'fulfilled') setTasks(Array.isArray(groupTasks.value) ? groupTasks.value : []);
      if (groupMembers.status === 'fulfilled') setMembers(Array.isArray(groupMembers.value) ? groupMembers.value : []);
      if (transferRequests.status === 'fulfilled') {
        setRequests(transferRequests.value.items || []);
        setHistoryHasMore(Boolean(transferRequests.value.hasMore));
        setPendingRequestTaskIds(transferRequests.value.pendingTaskIds || []);
        setHistoryError(null);
      } else {
        setHistoryHasMore(false);
        setHistoryError('이관 내역을 불러오지 못했습니다. 다시 시도해주세요.');
      }
      if (groupTasks.status === 'rejected' || groupMembers.status === 'rejected') {
        showAlert('이관 정보 조회 실패', '팀원 또는 방문지 정보를 불러오지 못했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [group?.groupId, user?.userId, requestsOnly, recipientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setRecipientId(initialRecipientId ? Number(initialRecipientId) : null);
    setSelectedTaskIds([]);
  }, [initialRecipientId]);

  const pendingTaskIds = useMemo(() => new Set(pendingRequestTaskIds.map(Number)), [pendingRequestTaskIds]);
  const mine = useMemo(() => tasks.filter((task) =>
    Number(task.assigneeUserId) === Number(user?.userId)
      && !isComplete(task)
      && !pendingTaskIds.has(taskIdOf(task))
  ), [tasks, user?.userId, pendingTaskIds]);

  const groupedMine = useMemo(() => {
    const filtered = mine.filter(task => !projectFilter || (task.projectIds || []).some(id => String(id) === String(projectFilter.projectId)));
    if (projectFilter) return filtered.length ? [{ dong: projectFilter.name, rows: filtered, project: true }] : [];
    const grouped = new Map();
    filtered.forEach((task) => {
      const dong = dongName(task.adminDong || task.admin_dong) || '행정동 미확인';
      if (!grouped.has(dong)) grouped.set(dong, []);
      grouped.get(dong).push(task);
    });
    return Array.from(grouped.entries())
      .map(([dong, rows]) => ({ dong, rows }))
      .sort((a, b) => a.dong.localeCompare(b.dong, 'ko'));
  }, [mine, projectFilter]);

  const recipient = members.find((member) => Number(member.userId) === Number(recipientId));
  const recipientName = recipient?.name || recipient?.loginId || initialRecipientName || '';

  const toggleTask = (task) => {
    const id = taskIdOf(task);
    if (!Number.isFinite(id)) return;
    setSelectedTaskIds((previous) => previous.includes(id)
      ? previous.filter((value) => value !== id)
      : [...previous, id]);
  };

  const toggleDong = (rows) => {
    const ids = rows.map(taskIdOf).filter(Number.isFinite);
    const allSelected = ids.length > 0 && ids.every((id) => selectedTaskIds.includes(id));
    setSelectedTaskIds((previous) => {
      if (allSelected) return previous.filter((id) => !ids.includes(id));
      return Array.from(new Set([...previous, ...ids]));
    });
  };

  const loadMoreHistory = async () => {
    if (!historyHasMore || historyLoading) return;
    setHistoryLoading(true);
    try {
      const page = await transferHistoryPage(group.groupId, user.userId, 1,
        requestsOnly ? 'incoming' : 'outgoing', requestsOnly ? null : recipientId);
      setRequests(previous => mergeTransferHistory(previous, page.items || []));
      setHistoryHasMore(false);
    } catch (error) { showAlert('이관 내역 조회 실패', error.message); }
    finally { setHistoryLoading(false); }
  };

  const submit = async () => {
    if (!recipientId || !selectedTaskIds.length || busy) return;
    try {
      setBusy(true);
      await groupApi(`/api/groups/${group.groupId}/transfers`, {
        method: 'POST',
        body: JSON.stringify({
          senderUserId: user.userId,
          recipientUserId: recipientId,
          taskIds: selectedTaskIds,
        }),
      });
      setSelectedTaskIds([]);
      await load();
      showAlert('이관 요청 완료', `${recipientName || '선택한 팀원'}에게 ${selectedTaskIds.length}건의 방문지 이관을 요청했습니다.`);
    } catch (error) {
      showAlert('이관 요청 실패', error.message);
    } finally {
      setBusy(false);
    }
  };

  const respond = async (request, accept) => {
    if (busy) return;
    try {
      setBusy(true);
      const result = await groupApi(`/api/groups/${group.groupId}/transfers/${request.id}/${accept ? 'accept' : 'reject'}`, {
        method: 'POST', body: JSON.stringify({ userId: user.userId }),
      });
      await load();
      if (accept && result?.status !== 'ACCEPTED') {
        showAlert('이관 불가', '방문지가 완료됐거나 담당자가 바뀌어 요청을 종료했습니다.');
        return;
      }
      if (accept) {
        try {
          await onChanged?.();
        } catch (refreshError) {
          console.log('이관받은 업무 목록 갱신 실패:', refreshError);
        }
        showAlert('이관 수락', '담당자가 변경되었습니다. 지도와 보고서에서 확인할 수 있습니다.');
      } else {
        onChanged?.();
        showAlert('이관 거절', '기존 담당자가 유지됩니다.');
      }
    } catch (error) {
      showAlert('요청 처리 실패', error.message);
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.root}>
    <ProjectBrowser visible={projectPicker} userId={user.userId} groupId={group.groupId} selectOnly includeAll selectedId={projectFilter?.projectId} onClose={()=>setProjectPicker(false)} onSelect={p=>{setProjectFilter(p);setSelectedTaskIds([]);setProjectPicker(false);}}/>
    <ScreenHeader title={requestsOnly ? '받은 요청' : recipientName ? `${recipientName}에게 업무 이관` : '업무 이관'} onBack={onBack} />
    {loading ? <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} /> :
      <ScrollView contentContainerStyle={styles.body}>
        {!requestsOnly && !initialRecipientId && <>
          <Text style={styles.title}>받는 팀원</Text>
          <Text style={styles.hint}>업무를 넘길 팀원을 먼저 선택하세요.</Text>
          {members.filter((member) => Number(member.userId) !== Number(user.userId)).map((member) =>
            <TouchableOpacity key={member.userId} style={[styles.memberRow, recipientId === member.userId && styles.chosen]} onPress={() => { setRecipientId(member.userId); setSelectedTaskIds([]); }}>
              <Ionicons name={recipientId === member.userId ? 'radio-button-on' : 'radio-button-off'} size={21} color={colors.primary} />
              <Text style={styles.rowTitle}>{member.name || member.loginId}</Text>
            </TouchableOpacity>
          )}
        </>}

        {!requestsOnly && recipientId ? <>
          <View style={styles.recipientCard}>
            <View style={styles.recipientIcon}><Ionicons name="person-outline" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recipientLabel}>받는 팀원</Text>
              <Text style={styles.recipientName}>{recipientName}</Text>
            </View>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={styles.title}>이관할 방문지</Text>
          <TouchableOpacity style={{padding:12}} onPress={()=>setProjectPicker(true)}><Text style={{color:colors.primary}}>{projectFilter?.name || '프로젝트 전체'} ▾</Text></TouchableOpacity></View>

          {groupedMine.length === 0 ? <Text style={styles.empty}>이관할 수 있는 본인 담당 방문지가 없습니다.</Text> : groupedMine.map((groupRow) => {
            const groupIds = groupRow.rows.map(taskIdOf).filter(Number.isFinite);
            const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedTaskIds.includes(id));
            return <View key={groupRow.dong} style={styles.dongCard}>
              <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={groupRow.project ? '프로젝트 방문지 전체 선택' : `${groupRow.dong} 전체 선택`} accessibilityState={{checked:allSelected}} style={styles.dongHeader} onPress={() => toggleDong(groupRow.rows)}>
                <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                <Text style={styles.dongTitle}>{groupRow.project ? (allSelected ? '전체 해제' : '전체 선택') : groupRow.dong}</Text>
                <Text style={styles.dongCount}>{groupRow.rows.length}건</Text>
              </TouchableOpacity>
              {groupRow.rows.map((task) => {
                const id = taskIdOf(task);
                const checked = selectedTaskIds.includes(id);
                return <TouchableOpacity key={id} accessibilityRole="checkbox" accessibilityLabel={task.detailAddress || task.roadAddress || `방문지 #${id}`} accessibilityState={{checked}} style={styles.taskRow} onPress={() => toggleTask(task)}>
                  <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? colors.primary : colors.textFaint} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>{task.detailAddress || task.roadAddress || `방문지 #${id}`}</Text>
                    {task.roadAddress && task.detailAddress ? <Text style={styles.taskMeta}>{task.roadAddress}</Text> : null}
                  </View>
                </TouchableOpacity>;
              })}
            </View>;
          })}

          <TouchableOpacity style={[styles.submit, (!selectedTaskIds.length || busy) && styles.disabled]} disabled={!selectedTaskIds.length || busy} onPress={submit}>
            <Text style={styles.submitText}>{busy ? '처리 중...' : `${selectedTaskIds.length}건 이관 요청`}</Text>
          </TouchableOpacity>
        </> : null}

        <Text style={styles.title}>{requestsOnly ? '받은 이관 요청' : '보낸 요청과 이력'}</Text>
        {historyError && <Text style={styles.empty}>{historyError}</Text>}
        {visibleRequests.length === 0 ? (!historyError && <Text style={styles.empty}>요청 내역이 없습니다.</Text>) : visibleRequests.map((request) => {
          const incoming = Number(request.recipientUserId) === Number(user.userId);
          return <View key={request.id} style={styles.request}>
            <Text style={styles.rowTitle}>{request.senderName} → {request.recipientName} · {request.taskIds?.length || 0}건</Text>
            <Text style={styles.hint}>{request.status === 'PENDING' ? '응답 대기' : request.status === 'ACCEPTED' ? '수락' : '거절'} · {formatTransferTime(request.requestedAt)}</Text>
            <Text style={styles.hint}>{(request.taskIds || []).map((id) => {
              const task = tasks.find((item) => Number(item.id ?? item.taskId) === Number(id));
              return task ? `${dongName(task.adminDong) || '지역 미확인'} ${task.detailAddress || task.roadAddress || `#${id}`}` : `방문지 #${id}`;
            }).join(', ')}</Text>
            {incoming && request.status === 'PENDING' && <View style={styles.actions}>
              <TouchableOpacity style={[styles.action, styles.rejectAction]} disabled={busy} onPress={() => respond(request, false)}><Text style={[styles.actionText, styles.rejectActionText]}>거절</Text></TouchableOpacity>
              <TouchableOpacity style={styles.action} disabled={busy} onPress={() => respond(request, true)}><Text style={styles.actionText}>수락</Text></TouchableOpacity>
            </View>}
          </View>;
        })}
        {historyHasMore && <TouchableOpacity style={styles.historyMore} disabled={historyLoading} onPress={loadMoreHistory}>
          <Text style={styles.historyMoreText}>{historyLoading ? '불러오는 중…' : '더보기'}</Text>
        </TouchableOpacity>}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  historyMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  historyMoreText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  root: { flex: 1, backgroundColor: colors.background },
  body: { padding: 18, paddingBottom: 50, paddingHorizontal: 20, },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 9 },
  hint: { color: colors.textSoft,   marginTop: 3, fontSize: 12, lineHeight: 19, },
  empty: { color: colors.textSoft, paddingVertical: 16 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',  borderColor: colors.line,  padding: 13, marginTop: 8, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.line, borderRadius: 0, paddingHorizontal: 0, },
  chosen: { borderColor: colors.primary, backgroundColor: '#F2F8FF' },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  recipientCard: { flexDirection: 'row', alignItems: 'center', gap: 11,   borderColor: colors.line,  padding: 14, marginTop: 4, borderWidth: 0, backgroundColor: colors.primarySoft, borderRadius: 16, },
  recipientIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  recipientLabel: { color: colors.textSoft, fontSize: 10 },
  recipientName: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 3 },
  dongCard: {   borderColor: colors.line,  marginTop: 10, overflow: 'hidden', borderWidth: 0, borderRadius: 16, backgroundColor: colors.surfaceMuted, },
  dongHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, backgroundColor: colors.surfaceMuted },
  dongTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '900' },
  dongCount: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  taskRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: colors.line },
  taskTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  taskMeta: { color: colors.textSoft,  marginTop: 3, fontSize: 11, },
  submit: { marginTop: 18, padding: 15,  backgroundColor: colors.primary, alignItems: 'center', minHeight: 48, borderRadius: 14, },
  disabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontWeight: '800' },
  request: {   borderColor: colors.line, padding: 14,  marginTop: 8, borderWidth: 0, borderRadius: 16, backgroundColor: colors.surfaceMuted, },
  actions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  action: { paddingVertical: 8, paddingHorizontal: 17,  backgroundColor: colors.primarySoft, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, },
  actionText: { color: colors.primary, fontWeight: '800' },
  rejectAction: { backgroundColor: '#FDE9EB' },
  rejectActionText: { color: '#B94D59' },
});
