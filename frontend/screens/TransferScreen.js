import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

const dongName = (value) => String(value || '').trim().split(/\s+/).pop() || '';
const taskIdOf = (task) => Number(task?.id ?? task?.taskId ?? task?.task_id);

export default function TransferScreen({
  user,
  group,
  onBack,
  onChanged,
  initialRecipientId = null,
  initialRecipientName = '',
}) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [recipientId, setRecipientId] = useState(initialRecipientId ? Number(initialRecipientId) : null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;
    try {
      const base = `/api/groups/${group.groupId}`;
      const [groupTasks, groupMembers, transferRequests] = await Promise.all([
        groupApi(`/api/locations/group/${group.groupId}?userId=${user.userId}`),
        groupApi(`${base}/members?userId=${user.userId}`),
        groupApi(`${base}/transfers?userId=${user.userId}`),
      ]);
      setTasks(Array.isArray(groupTasks) ? groupTasks : []);
      setMembers(Array.isArray(groupMembers) ? groupMembers : []);
      setRequests(Array.isArray(transferRequests) ? transferRequests : []);
    } catch (error) {
      showAlert('이관 정보 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [group?.groupId, user?.userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setRecipientId(initialRecipientId ? Number(initialRecipientId) : null);
    setSelectedTaskIds([]);
  }, [initialRecipientId]);

  const mine = useMemo(() => tasks.filter((task) =>
    Number(task.assigneeUserId) === Number(user?.userId)
  ), [tasks, user?.userId]);

  const groupedMine = useMemo(() => {
    const grouped = new Map();
    mine.forEach((task) => {
      const dong = dongName(task.adminDong || task.admin_dong) || '행정동 미확인';
      if (!grouped.has(dong)) grouped.set(dong, []);
      grouped.get(dong).push(task);
    });
    return Array.from(grouped.entries())
      .map(([dong, rows]) => ({ dong, rows }))
      .sort((a, b) => a.dong.localeCompare(b.dong, 'ko'));
  }, [mine]);

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
      await groupApi(`/api/groups/${group.groupId}/transfers/${request.id}/${accept ? 'accept' : 'reject'}`, {
        method: 'POST', body: JSON.stringify({ userId: user.userId }),
      });
      await load();
      onChanged?.();
      showAlert(accept ? '이관 수락' : '이관 거절', accept ? '방문지 담당자가 변경되었습니다.' : '기존 담당자가 유지됩니다.');
    } catch (error) {
      showAlert('요청 처리 실패', error.message);
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.root}>
    <ScreenHeader title={recipientName ? `${recipientName}에게 업무 이관` : '업무 이관'} onBack={onBack} />
    {loading ? <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} /> :
      <ScrollView contentContainerStyle={styles.body}>
        {!initialRecipientId && <>
          <Text style={styles.title}>받는 팀원</Text>
          <Text style={styles.hint}>업무를 넘길 팀원을 먼저 선택하세요.</Text>
          {members.filter((member) => Number(member.userId) !== Number(user.userId)).map((member) =>
            <TouchableOpacity key={member.userId} style={[styles.memberRow, recipientId === member.userId && styles.chosen]} onPress={() => { setRecipientId(member.userId); setSelectedTaskIds([]); }}>
              <Ionicons name={recipientId === member.userId ? 'radio-button-on' : 'radio-button-off'} size={21} color={colors.primary} />
              <Text style={styles.rowTitle}>{member.name || member.loginId}</Text>
            </TouchableOpacity>
          )}
        </>}

        {recipientId ? <>
          <View style={styles.recipientCard}>
            <View style={styles.recipientIcon}><Ionicons name="person-outline" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recipientLabel}>받는 팀원</Text>
              <Text style={styles.recipientName}>{recipientName}</Text>
            </View>
          </View>

          <Text style={styles.title}>넘길 방문지</Text>
          <Text style={styles.hint}>행정동 단위로 한꺼번에 선택하거나 방문지를 하나씩 선택할 수 있습니다.</Text>

          {groupedMine.length === 0 ? <Text style={styles.empty}>이관할 수 있는 본인 담당 방문지가 없습니다.</Text> : groupedMine.map((groupRow) => {
            const groupIds = groupRow.rows.map(taskIdOf).filter(Number.isFinite);
            const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedTaskIds.includes(id));
            return <View key={groupRow.dong} style={styles.dongCard}>
              <TouchableOpacity style={styles.dongHeader} onPress={() => toggleDong(groupRow.rows)}>
                <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                <Text style={styles.dongTitle}>{groupRow.dong}</Text>
                <Text style={styles.dongCount}>{groupRow.rows.length}건</Text>
              </TouchableOpacity>
              {groupRow.rows.map((task) => {
                const id = taskIdOf(task);
                const checked = selectedTaskIds.includes(id);
                return <TouchableOpacity key={id} style={styles.taskRow} onPress={() => toggleTask(task)}>
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

        <Text style={styles.title}>이관 요청과 이력</Text>
        {requests.length === 0 ? <Text style={styles.empty}>요청 내역이 없습니다.</Text> : requests.map((request) => {
          const incoming = Number(request.recipientUserId) === Number(user.userId);
          return <View key={request.id} style={styles.request}>
            <Text style={styles.rowTitle}>{request.senderName} → {request.recipientName} · {request.taskIds?.length || 0}건</Text>
            <Text style={styles.hint}>{request.status === 'PENDING' ? '응답 대기' : request.status === 'ACCEPTED' ? '수락' : '거절'} · {String(request.requestedAt || '').slice(0, 16).replace('T', ' ')}</Text>
            <Text style={styles.hint}>{(request.taskIds || []).map((id) => {
              const task = tasks.find((item) => Number(item.id ?? item.taskId) === Number(id));
              return task ? `${dongName(task.adminDong) || '지역 미확인'} ${task.detailAddress || task.roadAddress || `#${id}`}` : `방문지 #${id}`;
            }).join(', ')}</Text>
            {incoming && request.status === 'PENDING' && <View style={styles.actions}>
              <TouchableOpacity style={styles.action} disabled={busy} onPress={() => respond(request, true)}><Text style={styles.actionText}>수락</Text></TouchableOpacity>
              <TouchableOpacity style={styles.action} disabled={busy} onPress={() => respond(request, false)}><Text style={styles.actionText}>거절</Text></TouchableOpacity>
            </View>}
          </View>;
        })}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { padding: 18, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 9 },
  hint: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 3 },
  empty: { color: colors.textSoft, paddingVertical: 16 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginTop: 8 },
  chosen: { borderColor: colors.primary, backgroundColor: '#F2F8FF' },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  recipientCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginTop: 4 },
  recipientIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  recipientLabel: { color: colors.textSoft, fontSize: 10 },
  recipientName: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 3 },
  dongCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, marginTop: 10, overflow: 'hidden' },
  dongHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, backgroundColor: colors.surfaceMuted },
  dongTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '900' },
  dongCount: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  taskRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: colors.line },
  taskTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  taskMeta: { color: colors.textSoft, fontSize: 9.5, marginTop: 3 },
  submit: { marginTop: 18, padding: 15, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontWeight: '800' },
  request: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, padding: 14, borderRadius: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  action: { paddingVertical: 8, paddingHorizontal: 17, borderRadius: 8, backgroundColor: colors.primarySoft },
  actionText: { color: colors.primary, fontWeight: '800' },
});
