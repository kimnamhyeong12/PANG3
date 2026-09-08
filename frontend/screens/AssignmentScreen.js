import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../components/ui';
import { API_BASE_URL } from '../utils/api';
import { groupApi } from '../utils/groupApi';

export default function AssignmentScreen({ user, group, onBack, onChanged }) {
  const [members, setMembers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;

    try {
      const [memberData, assignmentData, locationResponse] = await Promise.all([
        groupApi(`/api/groups/${group.groupId}/members?userId=${user.userId}`),
        groupApi(`/api/groups/${group.groupId}/assignments?userId=${user.userId}`),
        fetch(`${API_BASE_URL}/api/locations`),
      ]);

      if (!locationResponse.ok) {
        throw new Error('방문지 목록을 불러오지 못했습니다.');
      }

      const locationData = await locationResponse.json();
      setMembers(Array.isArray(memberData) ? memberData : []);
      setAssignments(Array.isArray(assignmentData) ? assignmentData : []);
      setLocations(Array.isArray(locationData) ? locationData : []);
    } catch (error) {
      Alert.alert('담당자 배정 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [group?.groupId, user?.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const assignmentMap = useMemo(() => {
    const map = new Map();
    assignments.forEach((item) => map.set(Number(item.taskId), item));
    return map;
  }, [assignments]);

  const assign = async (member) => {
    if (!selectedTask || saving) return;

    try {
      setSaving(true);
      const data = await groupApi(
        `/api/groups/${group.groupId}/assignments/${selectedTask.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            leaderUserId: user.userId,
            assigneeUserId: member.userId,
          }),
        }
      );

      setAssignments((prev) => {
        const filtered = prev.filter((item) => Number(item.taskId) !== Number(selectedTask.id));
        return [data, ...filtered];
      });
      setSelectedTask(null);
      onChanged?.();
    } catch (error) {
      Alert.alert('담당자 지정 실패', error.message);
    } finally {
      setSaving(false);
    }
  };

  const unassign = async (task) => {
    try {
      await groupApi(
        `/api/groups/${group.groupId}/assignments/${task.id}?leaderUserId=${user.userId}`,
        { method: 'DELETE' }
      );
      setAssignments((prev) => prev.filter((item) => Number(item.taskId) !== Number(task.id)));
      onChanged?.();
    } catch (error) {
      Alert.alert('배정 해제 실패', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>VISIT ASSIGNMENT</Text>
          <Text style={styles.title}>방문지 담당자 지정</Text>
          <Text style={styles.desc}>{group?.groupName} · 팀장 전용</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color="#12395B" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {locations.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="location-outline" size={34} color="#8A98A8" />
              <Text style={styles.emptyTitle}>등록된 방문지가 없습니다</Text>
            </View>
          ) : (
            locations.map((loc, index) => {
              const id = Number(loc.id ?? loc.taskId ?? loc.task_id);
              const normalized = { ...loc, id };
              const assignment = assignmentMap.get(id);

              return (
                <View key={id || index} style={styles.card}>
                  <View style={styles.numberBox}><Text style={styles.numberText}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {loc.detailAddress || loc.detail_address || loc.name || '이름 없음'}
                    </Text>
                    <Text style={styles.address} numberOfLines={1}>
                      {loc.roadAddress || loc.road_address || loc.address || '주소 없음'}
                    </Text>
                    <View style={styles.assigneeRow}>
                      <Ionicons name="person-outline" size={13} color="#12395B" />
                      <Text style={[styles.assignee, !assignment && styles.unassigned]}>
                        {assignment
                          ? `담당자: ${assignment.assigneeName || assignment.assigneeLoginId}`
                          : '담당자 미지정'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionColumn}>
                    <TouchableOpacity
                      style={styles.assignButton}
                      onPress={() => setSelectedTask(normalized)}
                    >
                      <Text style={styles.assignButtonText}>{assignment ? '변경' : '지정'}</Text>
                    </TouchableOpacity>
                    {assignment && (
                      <TouchableOpacity style={styles.clearButton} onPress={() => unassign(normalized)}>
                        <Text style={styles.clearText}>해제</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal
        visible={!!selectedTask}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTask(null)}
      >
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setSelectedTask(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>담당자 선택</Text>
            <Text style={styles.sheetPlace} numberOfLines={2}>
              {selectedTask?.detailAddress || selectedTask?.name || selectedTask?.roadAddress}
            </Text>

            {members.map((member) => (
              <TouchableOpacity
                key={member.userId}
                style={styles.memberChoice}
                onPress={() => assign(member)}
                disabled={saving}
              >
                <View style={styles.choiceAvatar}>
                  <Text style={styles.choiceAvatarText}>
                    {(member.name || member.loginId || '?').slice(0, 1)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceName}>{member.name || member.loginId}</Text>
                  <Text style={styles.choiceLogin}>@{member.loginId}</Text>
                </View>
                <Text style={styles.choiceRole}>{member.role === 'LEADER' ? '팀장' : '팀원'}</Text>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 17, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 10, paddingBottom: 30 },
  emptyBox: { padding: 30, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#D9E1EA' },
  emptyTitle: { marginTop: 10, fontSize: 14, fontWeight: '900', color: '#1F2D3D' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 13, borderWidth: 1, borderColor: '#D9E1EA', flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#12395B', alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  placeName: { fontSize: 13, fontWeight: '900', color: '#1F2D3D' },
  address: { fontSize: 9, color: '#718096', marginTop: 3 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  assignee: { fontSize: 10, fontWeight: '900', color: '#12395B' },
  unassigned: { color: '#E67E22' },
  actionColumn: { gap: 5 },
  assignButton: { backgroundColor: '#12395B', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10 },
  assignButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  clearButton: { backgroundColor: '#EDF2F7', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, alignItems: 'center' },
  clearText: { color: '#607086', fontSize: 9, fontWeight: '900' },
  modalBg: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, maxHeight: '72%' },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#1F2D3D' },
  sheetPlace: { fontSize: 11, color: '#718096', marginTop: 4, marginBottom: 12 },
  memberChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#EDF2F7' },
  choiceAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF1F7', alignItems: 'center', justifyContent: 'center' },
  choiceAvatarText: { color: '#12395B', fontWeight: '900' },
  choiceName: { fontSize: 12, fontWeight: '900', color: '#1F2D3D' },
  choiceLogin: { fontSize: 9, color: '#718096', marginTop: 2 },
  choiceRole: { fontSize: 9, fontWeight: '900', color: '#607086' },
});
