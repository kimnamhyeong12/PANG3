import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

export default function TransferScreen({ user, group, onBack, onChanged }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState([]);
  const [recipientId, setRecipientId] = useState(null);
  const [area, setArea] = useState('');
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

  const mine = useMemo(() => tasks.filter((task) =>
    Number(task.assigneeUserId) === Number(user?.userId) &&
    (!area.trim() || String(task.adminDong || task.roadAddress || '').includes(area.trim()))
  ), [tasks, user?.userId, area]);

  const submit = async () => {
    if (!selected.length || !recipientId || busy) return;
    try {
      setBusy(true);
      await groupApi(`/api/groups/${group.groupId}/transfers`, {
        method: 'POST',
        body: JSON.stringify({ senderUserId: user.userId, recipientUserId: recipientId, taskIds: selected }),
      });
      setSelected([]);
      setRecipientId(null);
      await load();
      showAlert('이관 요청 완료', '받는 팀원이 수락하면 선택한 방문지의 담당자가 변경됩니다.');
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

  const toggle = (id) => setSelected((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);

  return <View style={styles.root}>
    <ScreenHeader title="방문지 이관" onBack={onBack} />
    {loading ? <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} /> :
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>내 방문지 선택</Text>
        <Text style={styles.hint}>선택한 방문지와 기존 작업 기록이 함께 이관됩니다.</Text>
        <TextInput style={styles.search} value={area} onChangeText={setArea} placeholder="행정동 또는 주소로 찾기" />
        {mine.length === 0 ? <Text style={styles.empty}>이관할 방문지가 없습니다.</Text> : mine.map((task) => {
          const id = Number(task.id ?? task.taskId);
          const checked = selected.includes(id);
          return <TouchableOpacity key={id} style={[styles.row, checked && styles.chosen]} onPress={() => toggle(id)}>
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{task.detailAddress || task.roadAddress || `방문지 ${id}`}</Text>
              <Text style={styles.hint}>{task.adminDong || '행정동 미확인'} · {task.status === 'complete' ? '완료' : task.status === 'working' ? '작업 중' : '작업 전'}</Text></View>
          </TouchableOpacity>;
        })}
        <Text style={styles.title}>받는 팀원</Text>
        {members.filter((member) => Number(member.userId) !== Number(user.userId)).map((member) =>
          <TouchableOpacity key={member.userId} style={[styles.row, recipientId === member.userId && styles.chosen]} onPress={() => setRecipientId(member.userId)}>
            <Ionicons name={recipientId === member.userId ? 'radio-button-on' : 'radio-button-off'} size={21} color={colors.primary} />
            <Text style={styles.rowTitle}>{member.name || member.loginId}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.submit, (!selected.length || !recipientId || busy) && styles.disabled]} disabled={!selected.length || !recipientId || busy} onPress={submit}>
          <Text style={styles.submitText}>{busy ? '처리 중...' : `${selected.length}건 이관 요청`}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>이관 요청과 이력</Text>
        {requests.length === 0 ? <Text style={styles.empty}>요청 내역이 없습니다.</Text> : requests.map((request) => {
          const incoming = Number(request.recipientUserId) === Number(user.userId);
          return <View key={request.id} style={styles.request}>
            <Text style={styles.rowTitle}>{request.senderName} → {request.recipientName} · {request.taskIds?.length || 0}건</Text>
            <Text style={styles.hint}>{request.status === 'PENDING' ? '응답 대기' : request.status === 'ACCEPTED' ? '수락' : '거절'} · {String(request.requestedAt || '').slice(0, 16).replace('T', ' ')}</Text>
            <Text style={styles.hint}>{(request.taskIds || []).map((id) => {
              const task = tasks.find((item) => Number(item.id ?? item.taskId) === Number(id));
              return task ? `${task.adminDong || '지역 미확인'} ${task.detailAddress || task.roadAddress || `#${id}`}` : `방문지 #${id}`;
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
  root: { flex: 1, backgroundColor: colors.background }, body: { padding: 18, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 9 },
  hint: { color: colors.textSoft, fontSize: 11, marginTop: 3 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginTop: 12, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginTop: 8 },
  chosen: { borderColor: colors.primary, backgroundColor: '#F2F8FF' }, rowTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  empty: { color: colors.textSoft, paddingVertical: 16 }, submit: { marginTop: 18, padding: 15, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' },
  disabled: { opacity: 0.45 }, submitText: { color: '#fff', fontWeight: '800' }, request: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 10 }, action: { paddingVertical: 8, paddingHorizontal: 17, borderRadius: 8, backgroundColor: colors.primarySoft }, actionText: { color: colors.primary, fontWeight: '800' },
});
