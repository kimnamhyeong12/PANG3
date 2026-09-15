import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../components/ui';
import { groupApi } from '../utils/groupApi';

const isPersonalGroup = (group) =>
  Boolean(
    group?.personalWorkspace ||
    group?.personal ||
    group?.workspaceType === 'PERSONAL'
  );

export default function GroupScreen({
  user,
  activeGroup,
  onBack,
  onCreate,
  onInvitations,
  onOpenGroup,
}) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!user?.userId) return;

    try {
      const data = await groupApi(`/api/groups/user/${user.userId}`);
      setGroups(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('그룹 조회 실패', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const refresh = () => {
    setRefreshing(true);
    loadGroups();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>TEAM WORKSPACE</Text>
          <Text style={styles.title}>그룹 설정</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={styles.actionRow}>
          <MenuButton
            icon="people-outline"
            title="그룹 생성"
            desc="팀장이 새 그룹을 만듭니다"
            onPress={onCreate}
          />
          <MenuButton
            icon="mail-unread-outline"
            title="초대받기"
            desc="받은 그룹 초대를 확인합니다"
            onPress={onInvitations}
          />
        </View>

        <View style={styles.activeCard}>
          <Text style={styles.activeSectionLabel}>CURRENT WORKSPACE</Text>
          <Text style={styles.activeName}>
            {isPersonalGroup(activeGroup)
              ? `나 · ${activeGroup.groupName}`
              : activeGroup?.groupName || '업무공간 불러오는 중'}
          </Text>
          <Text style={styles.activeMeta}>
            {isPersonalGroup(activeGroup)
              ? '현재 선택된 1인 그룹'
              : activeGroup
              ? `현재 선택된 팀 · ${activeGroup.role === 'LEADER' ? '팀장' : '팀원'}`
              : '현재 작업공간을 불러오는 중입니다'}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>MY GROUPS</Text>
          <Text style={styles.sectionTitle}>업무공간</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#12395B" />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={34} color="#8A98A8" />
            <Text style={styles.emptyTitle}>가입한 그룹이 없습니다</Text>
            <Text style={styles.emptyDesc}>그룹을 만들거나 초대를 받아보세요.</Text>
          </View>
        ) : (
          groups.map((group) => {
            const personal = isPersonalGroup(group);
            const selected = Number(activeGroup?.groupId) === Number(group.groupId);

            return (
              <TouchableOpacity
                key={group.groupId}
                style={[styles.groupCard, selected && styles.selectedGroupCard]}
                onPress={() => onOpenGroup?.(group)}
                activeOpacity={0.85}
              >
                <View style={[styles.groupIcon, personal && styles.personalIcon]}>
                  <Ionicons name={personal ? 'person' : 'people'} size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>
                    {personal ? `나 · ${group.groupName}` : group.groupName}
                  </Text>
                  <Text style={styles.groupMeta}>
                    {personal
                      ? `1명 · ${user?.name || user?.loginId || '본인'}`
                      : `팀장 ${group.leaderName || group.leaderLoginId} · ${group.memberCount || 1}명`}
                  </Text>
                </View>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>
                    {personal ? '1인' : group.role === 'LEADER' ? '팀장' : '팀원'}
                  </Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={20} color="#2563EB" />}
                <Ionicons name="chevron-forward" size={18} color="#8A98A8" />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function MenuButton({ icon, title, desc, onPress }) {
  return (
    <TouchableOpacity style={styles.menuButton} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={25} color="#12395B" />
      </View>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuDesc}>{desc}</Text>
    </TouchableOpacity>
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
  body: { padding: 16, paddingBottom: 32 },
  actionRow: { flexDirection: 'row', gap: 12 },
  menuButton: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#D9E1EA', minHeight: 150,
  },
  menuIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#EAF1F7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  menuTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D' },
  menuDesc: { fontSize: 10, color: '#718096', lineHeight: 16, marginTop: 5 },
  activeCard: {
    backgroundColor: '#12395B', borderRadius: 18, padding: 17, marginTop: 16,
  },
  activeSectionLabel: { fontSize: 10, fontWeight: '900', color: '#C9D9E8', letterSpacing: 1.5 },
  activeName: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 5 },
  activeMeta: { color: '#DCE7F1', fontSize: 10, marginTop: 4 },
  sectionHeader: { marginTop: 24, marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.5 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#1F2D3D', marginTop: 3 },
  loadingBox: { padding: 32, alignItems: 'center' },
  emptyBox: {
    backgroundColor: '#FFFFFF', padding: 28, borderRadius: 18, alignItems: 'center',
    borderWidth: 1, borderColor: '#D9E1EA',
  },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: '#1F2D3D', marginTop: 10 },
  emptyDesc: { fontSize: 10, color: '#718096', marginTop: 5 },
  groupCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#D9E1EA', flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  groupIcon: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: '#12395B',
    alignItems: 'center', justifyContent: 'center',
  },
  personalIcon: { backgroundColor: '#3A9D68' },
  selectedGroupCard: { borderColor: '#5B8DEF', backgroundColor: '#EFF6FF' },
  groupName: { fontSize: 14, fontWeight: '900', color: '#1F2D3D' },
  groupMeta: { fontSize: 10, color: '#718096', marginTop: 4 },
  roleBadge: { backgroundColor: '#EAF1F7', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  roleText: { fontSize: 9, fontWeight: '900', color: '#12395B' },
});
