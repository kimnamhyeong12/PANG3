import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { EmptyState, ScreenHeader, SectionTitle } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors, radius } from '../constants/design';

const isPersonal = (group) => Boolean(group?.personalWorkspace || group?.personal || group?.workspaceType === 'PERSONAL');

export default function GroupScreen({ user, activeGroup, onBack, onCreate, onInvitations, onOpenGroup, tab = 'groups', onTabChange, overview }) {
  const [groups, setGroups] = useState([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [hasPendingInvites, setHasPendingInvites] = useState(false);
  const loadInvitations = useCallback(async () => {
    if (!user?.userId) { setHasPendingInvites(false); return; }
    try {
      const data = await groupApi(`/api/groups/invitations?userId=${user.userId}&status=PENDING`);
      setHasPendingInvites(Array.isArray(data) && data.length > 0);
    } catch { /* Keep the last known invitation state when the network is unavailable. */ }
  }, [user?.userId]);
  const load = useCallback(async () => { if (!user?.userId) return; await Promise.all([loadInvitations(), (async () => { try { const data = await groupApi(`/api/groups/user/${user.userId}`); setGroups(Array.isArray(data) ? data : []); } catch (error) { showAlert('그룹 조회 실패', error.message); } })()]); setLoading(false); setRefreshing(false); }, [user?.userId, loadInvitations]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') loadInvitations(); });
    return () => subscription.remove();
  }, [loadInvitations]);
  return <View style={styles.container}>
    <ScreenHeader root title="그룹" onBack={onBack} right={<View style={{ flexDirection: 'row', gap: 2 }}>
      <TouchableOpacity style={styles.gear} onPress={onCreate} accessibilityRole="button" accessibilityLabel="그룹 만들기"><Ionicons name="add" size={27} color={colors.primary} /></TouchableOpacity>
      <TouchableOpacity style={styles.gear} onPress={onInvitations} accessibilityRole="button" accessibilityLabel={hasPendingInvites ? '받은 초대, 새 초대 있음' : '받은 초대'}><Ionicons name="mail-outline" size={25} color={colors.primary} />{hasPendingInvites && <View pointerEvents="none" style={styles.invitationDot} />}</TouchableOpacity>
    </View>} />
    <View style={styles.tabs}>{[['groups', '그룹 관리'], ['dashboard', '대시보드']].map(([key, label]) => <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => onTabChange?.(key)}><Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text></TouchableOpacity>)}</View>
    {tab === 'dashboard' ? overview :
    <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}>
      <View style={styles.activeCard}><View style={styles.activeIcon}><Ionicons name="briefcase" size={24} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.activeName}>{isPersonal(activeGroup) ? '내 개인 업무' : activeGroup?.groupName || '선택된 그룹 없음'}</Text><View style={styles.activeMeta}><Ionicons name="location" size={14} color={colors.primary} /><Text style={styles.activeMetaText}>{isPersonal(activeGroup) ? `${user?.workSido || '부산광역시'}${user?.workSigungu ? ` · ${user.workSigungu}` : ''}` : `${activeGroup?.regionSido || '부산광역시'}${activeGroup?.regionSigungu ? ` · ${activeGroup.regionSigungu}` : ''}`}</Text></View></View><Ionicons name="checkmark-circle" size={24} color={colors.primary} /></View>
      <SectionTitle title="내 그룹" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : !groups.length ? <EmptyState icon="people-outline" title="가입한 그룹이 없습니다" description="새 그룹을 만들거나 받은 초대를 확인하세요." /> : groups.map((group) => { const personal = isPersonal(group); const selected = Number(activeGroup?.groupId) === Number(group.groupId); return <TouchableOpacity key={group.groupId} style={[styles.groupCard, selected && styles.groupCardActive]} onPress={() => onOpenGroup?.(group)} activeOpacity={0.78}><View style={[styles.groupIcon, personal && styles.personalIcon]}><Ionicons name={personal ? 'person-outline' : 'people-outline'} size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.groupName}>{personal ? `나 · ${group.groupName}` : group.groupName}</Text><Text style={styles.groupMeta}>{personal ? '개인 업무공간' : `${group.memberCount || 1}명 · ${group.regionSigungu || '활동지역 미설정'}`}</Text></View>{selected ? <View style={styles.selectedBadge}><Text style={styles.selectedText}>사용 중</Text></View> : null}<Ionicons name="chevron-forward" size={18} color={colors.textFaint} /></TouchableOpacity>; })}
    </ScrollView>}

  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0, }, body: { padding: 20,  paddingBottom: 34, paddingTop: 8, },
  gear: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  invitationDot: { position: 'absolute', top: 7, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: colors.background },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 }, tab: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, backgroundColor: colors.surface, justifyContent: 'center', flex: 1, alignItems: 'center', fontSize: 14, }, tabActive: { backgroundColor: colors.primary }, tabText: { color: colors.textSoft,  fontWeight: '800', fontSize: 14, }, tabTextActive: { color: '#FFFFFF' },
  menu: { position: 'absolute', right: 16, width: 190, borderRadius: 18, backgroundColor: colors.surface, paddingVertical: 8, shadowColor: '#10285B', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 }, menuItem: { minHeight: 54, paddingHorizontal: 22, justifyContent: 'center' }, menuText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  activeCard: {    borderColor: '#BBD5F6',   flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#2466B5',  shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, backgroundColor: colors.primarySoft, borderWidth: 0, borderRadius: 16, padding: 16, shadowOpacity: 0, elevation: 0, marginBottom: 20, }, activeIcon: {   borderRadius: 15,  alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, width: 32, height: 40, }, activeLabel: { color: colors.textSoft, fontSize: 10, fontWeight: '800' }, activeName: { color: colors.text,  fontWeight: '900', fontSize: 16, marginTop: 0, }, activeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 }, activeMetaText: {   fontWeight: '700', fontSize: 12, color: colors.textSoft, },
  groupCard: {   backgroundColor: colors.surface,  borderColor: colors.line, padding: 13,  flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 0, minHeight: 76, marginBottom: 0, }, groupCardActive: {borderColor: colors.line, backgroundColor: colors.surface, }, groupIcon: {   borderRadius: 15,  alignItems: 'center', justifyContent: 'center', width: 32, height: 40, backgroundColor: colors.surface, }, personalIcon: {backgroundColor: colors.surface, }, groupName: { color: colors.text, fontSize: 14, fontWeight: '900' }, groupMeta: { color: colors.textSoft,  marginTop: 4, fontSize: 12, }, selectedBadge: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, selectedText: { color: colors.primary,  fontWeight: '900', fontSize: 11, },
});
