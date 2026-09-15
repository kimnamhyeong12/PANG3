import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton, PrimaryButton } from '../components/ui';
import { groupApi } from '../utils/groupApi';

export default function GroupDetailScreen({
  user,
  group,
  onBack,
  onAssign,
  onTeamLocations,
  onUpdatedGroup,
}) {
  const [detail, setDetail] = useState(group || null);
  const [inviteeLoginId, setInviteeLoginId] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;
    try {
      const data = await groupApi(`/api/groups/${group.groupId}?userId=${user.userId}`);
      setDetail(data);
      onUpdatedGroup?.(data);
    } catch (error) {
      Alert.alert('그룹 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [group?.groupId, user?.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async () => {
    if (!inviteeLoginId.trim() || inviting) return;
    try {
      setInviting(true);
      await groupApi(`/api/groups/${group.groupId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          inviterUserId: user.userId,
          inviteeLoginId: inviteeLoginId.trim(),
        }),
      });
      Alert.alert('초대 완료', `${inviteeLoginId.trim()} 사용자에게 초대를 보냈습니다.`);
      setInviteeLoginId('');
    } catch (error) {
      Alert.alert('초대 실패', error.message);
    } finally {
      setInviting(false);
    }
  };

  const members = detail?.members || [];
  const assignments = detail?.assignments || [];
  const isLeader = detail?.role === 'LEADER';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GROUP DETAIL</Text>
          <Text style={styles.title}>{detail?.groupName || group?.groupName || '그룹'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#12395B" /></View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryLabel}>TEAM LEADER</Text>
                <Text style={styles.summaryValue}>{detail?.leaderName || detail?.leaderLoginId}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View>
                <Text style={styles.summaryLabel}>MEMBERS</Text>
                <Text style={styles.summaryValue}>{members.length}명</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View>
                <Text style={styles.summaryLabel}>ASSIGNED</Text>
                <Text style={styles.summaryValue}>{assignments.length}곳</Text>
              </View>
            </View>

            {isLeader && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>INVITE MEMBER</Text>
                <Text style={styles.sectionTitle}>조원 초대</Text>
                <Text style={styles.sectionDesc}>앱 로그인 아이디를 입력해 그룹에 초대합니다.</Text>
                <TextInput
                  style={styles.input}
                  value={inviteeLoginId}
                  onChangeText={setInviteeLoginId}
                  placeholder="조원 로그인 아이디"
                  autoCapitalize="none"
                />
                <PrimaryButton
                  title={inviting ? '초대 중...' : '초대 보내기'}
                  onPress={invite}
                  disabled={!inviteeLoginId.trim() || inviting}
                />
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionLabel}>TEAM LOCATIONS</Text>
                  <Text style={styles.sectionTitle}>팀 방문지 관리</Text>
                  <Text style={styles.sectionDesc}>
                    그룹 방문지를 지도에서 추가하고 경로를 확인합니다.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.teamLocationButton}
                  onPress={() => onTeamLocations?.(detail)}
                >
                  <Ionicons name="map-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.teamLocationButtonText}>들어가기</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <View>
                  <Text style={styles.sectionLabel}>MEMBERS</Text>
                  <Text style={styles.sectionTitle}>그룹원</Text>
                </View>
                <Text style={styles.countText}>{members.length}명</Text>
              </View>

              {members.map((member) => (
                <View key={member.userId} style={styles.memberRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(member.name || member.loginId || '?').slice(0, 1)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{member.name || member.loginId}</Text>
                    <Text style={styles.memberLogin}>@{member.loginId}</Text>
                  </View>
                  <View style={[styles.roleBadge, member.role === 'LEADER' && styles.leaderBadge]}>
                    <Text style={[styles.roleText, member.role === 'LEADER' && styles.leaderText]}>
                      {member.role === 'LEADER' ? '팀장' : '팀원'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <View>
                  <Text style={styles.sectionLabel}>VISIT ASSIGNMENT</Text>
                  <Text style={styles.sectionTitle}>방문지 담당 현황</Text>
                </View>
                {isLeader && (
                  <TouchableOpacity style={styles.smallButton} onPress={() => onAssign?.(detail)}>
                    <Ionicons name="git-branch-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.smallButtonText}>담당 지정</Text>
                  </TouchableOpacity>
                )}
              </View>

              {assignments.length === 0 ? (
                <Text style={styles.emptyText}>아직 담당자가 지정된 방문지가 없습니다.</Text>
              ) : (
                assignments.slice(0, 6).map((item) => (
                  <View key={item.assignmentId} style={styles.assignmentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assignmentPlace} numberOfLines={1}>
                        {item.detailAddress || item.roadAddress || `방문지 ${item.taskId}`}
                      </Text>
                      <Text style={styles.assignmentAddr} numberOfLines={1}>
                        {item.roadAddress || item.taskCategory || ''}
                      </Text>
                    </View>
                    <Text style={styles.assigneeText}>
                      {item.assigneeName || item.assigneeLoginId}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: {
    flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  paddingTop: 30,
  paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA',
  },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 17, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  body: { padding: 16, gap: 14, paddingBottom: 36 },
  loadingBox: { padding: 40, alignItems: 'center' },
  summaryCard: {
    backgroundColor: '#12395B', borderRadius: 18, padding: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  summaryLabel: { fontSize: 9, color: '#BFD0DE', fontWeight: '800', letterSpacing: 1 },
  summaryValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 5 },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#315779' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  sectionLabel: { fontSize: 9, fontWeight: '900', color: '#607086', letterSpacing: 1.4 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D', marginTop: 3 },
  sectionDesc: { fontSize: 10, color: '#718096', marginTop: 5, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  countText: { fontSize: 11, fontWeight: '900', color: '#607086' },
  input: { height: 48, borderWidth: 1, borderColor: '#D9E1EA', borderRadius: 13, paddingHorizontal: 13, marginBottom: 10, fontSize: 13 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EDF2F7' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF1F7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#12395B', fontWeight: '900', fontSize: 14 },
  memberName: { fontSize: 13, fontWeight: '900', color: '#1F2D3D' },
  memberLogin: { fontSize: 10, color: '#718096', marginTop: 2 },
  roleBadge: { backgroundColor: '#EDF2F7', borderRadius: 11, paddingHorizontal: 8, paddingVertical: 5 },
  leaderBadge: { backgroundColor: '#EAF1F7' },
  roleText: { fontSize: 9, fontWeight: '900', color: '#607086' },
  leaderText: { color: '#12395B' },
  smallButton: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#12395B', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11 },
  smallButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  teamLocationButton: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#12395B', paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, marginLeft: 10 },
  teamLocationButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  assignmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EDF2F7' },
  assignmentPlace: { fontSize: 12, fontWeight: '900', color: '#1F2D3D' },
  assignmentAddr: { fontSize: 9, color: '#718096', marginTop: 3 },
  assigneeText: { fontSize: 10, fontWeight: '900', color: '#12395B', maxWidth: 100 },
  emptyText: { fontSize: 10, color: '#718096', paddingVertical: 12 },
});
