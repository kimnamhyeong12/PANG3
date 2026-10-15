import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { EmptyState, ScreenHeader, SectionTitle } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors, radius } from '../constants/design';

const isPersonal = (group) => Boolean(group?.personalWorkspace || group?.personal || group?.workspaceType === 'PERSONAL');

export default function GroupScreen({ user, activeGroup, onBack, onCreate, onInvitations, onOpenGroup, tab = 'groups', onTabChange, overview }) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [groups, setGroups] = useState([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { if (!user?.userId) return; try { const data = await groupApi(`/api/groups/user/${user.userId}`); setGroups(Array.isArray(data) ? data : []); } catch (error) { showAlert('그룹 조회 실패', error.message); } finally { setLoading(false); setRefreshing(false); } }, [user?.userId]);
  useEffect(() => { load(); }, [load]);
  return <View style={styles.container}>
    <ScreenHeader root title="그룹" onBack={onBack} right={<TouchableOpacity style={styles.gear} onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="그룹 메뉴"><Ionicons name="settings-outline" size={27} color={colors.text} /></TouchableOpacity>} />
    <View style={styles.tabs}>{[['groups', '그룹 관리'], ['dashboard', '대시보드']].map(([key, label]) => <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => onTabChange?.(key)}><Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text></TouchableOpacity>)}</View>
    {tab === 'dashboard' ? overview :
    <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}>
      <View style={styles.activeCard}><View style={styles.activeIcon}><Ionicons name="briefcase" size={22} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.activeName}>{isPersonal(activeGroup) ? '내 개인 업무' : activeGroup?.groupName || '선택된 그룹 없음'}</Text><View style={styles.activeMeta}><Ionicons name="location" size={14} color={colors.primary} /><Text style={styles.activeMetaText}>{isPersonal(activeGroup) ? `${user?.workSido || '부산광역시'}${user?.workSigungu ? ` · ${user.workSigungu}` : ''}` : `${activeGroup?.regionSido || '부산광역시'}${activeGroup?.regionSigungu ? ` · ${activeGroup.regionSigungu}` : ''}`}</Text></View></View><Ionicons name="checkmark-circle" size={24} color={colors.primary} /></View>
      <SectionTitle title="내 그룹" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : !groups.length ? <EmptyState icon="people-outline" title="가입한 그룹이 없습니다" description="새 그룹을 만들거나 받은 초대를 확인하세요." /> : groups.map((group) => { const personal = isPersonal(group); const selected = Number(activeGroup?.groupId) === Number(group.groupId); return <TouchableOpacity key={group.groupId} style={[styles.groupCard, selected && styles.groupCardActive]} onPress={() => onOpenGroup?.(group)} activeOpacity={0.78}><View style={[styles.groupIcon, personal && styles.personalIcon]}><Ionicons name={personal ? 'person-outline' : 'people-outline'} size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.groupName}>{personal ? `나 · ${group.groupName}` : group.groupName}</Text><Text style={styles.groupMeta}>{personal ? '개인 업무공간' : `${group.memberCount || 1}명 · ${group.regionSigungu || '활동지역 미설정'}`}</Text></View>{selected ? <View style={styles.selectedBadge}><Text style={styles.selectedText}>사용 중</Text></View> : null}<Ionicons name="chevron-forward" size={18} color={colors.textFaint} /></TouchableOpacity>; })}
    </ScrollView>}
    <Modal transparent visible={menuOpen} animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
      <View style={{ flex: 1 }}><TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} accessibilityLabel="그룹 메뉴 닫기" onPress={() => setMenuOpen(false)} />
        <View style={[styles.menu, { top: insets.top + 62 }]}>{[['그룹 만들기', onCreate], ['받은 초대', onInvitations]].map(([label, action]) => <TouchableOpacity key={label} style={styles.menuItem} onPress={() => { setMenuOpen(false); action?.(); }}><Text style={styles.menuText}>{label}</Text></TouchableOpacity>)}</View>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0, }, body: { padding: 20, paddingTop: 0, paddingBottom: 34 },
  gear: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 }, tab: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, backgroundColor: colors.surface, justifyContent: 'center' }, tabActive: { backgroundColor: colors.primary }, tabText: { color: colors.textSoft, fontSize: 15, fontWeight: '800' }, tabTextActive: { color: '#FFFFFF' },
  menu: { position: 'absolute', right: 16, width: 190, borderRadius: 18, backgroundColor: colors.surface, paddingVertical: 8, shadowColor: '#10285B', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 }, menuItem: { minHeight: 54, paddingHorizontal: 22, justifyContent: 'center' }, menuText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  activeCard: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1.5, borderColor: '#BBD5F6', padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#2466B5', shadowOpacity: 0.10, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, activeIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, activeLabel: { color: colors.textSoft, fontSize: 10, fontWeight: '800' }, activeName: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 }, activeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 }, activeMetaText: { color: colors.primary, fontSize: 10.5, fontWeight: '700' },
  groupCard: { minHeight: 76, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 13, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11 }, groupCardActive: { borderColor: colors.primary, backgroundColor: '#F3F8FF' }, groupIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, personalIcon: { backgroundColor: colors.blueSoft }, groupName: { color: colors.text, fontSize: 14, fontWeight: '900' }, groupMeta: { color: colors.textSoft, fontSize: 10, marginTop: 4 }, selectedBadge: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, selectedText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
});
