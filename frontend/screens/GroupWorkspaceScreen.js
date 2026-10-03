import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WorkStatusScreen from './WorkStatusScreen';
import { colors } from '../constants/design';

const menuItems = [
  { key: 'members', title: '팀원 관리', icon: 'people-outline' },
  { key: 'transfer', title: '행정동 업무 이관', icon: 'swap-horizontal-outline' },
  { key: 'reports', title: '그룹 보고서 모아보기', icon: 'document-text-outline' },
  { key: 'settings', title: '그룹 설정', icon: 'settings-outline' },
];

export default function GroupWorkspaceScreen({ user, group, assignments, onRefresh, onChooseGroup,
  tab = 'status', onTabChange,
  onMembers, onTransfer, onReports, onSettings }) {
  const actions = { members: onMembers, transfer: onTransfer, reports: onReports, settings: onSettings };
  return <View style={styles.root}>
    <TouchableOpacity style={styles.groupTitle} onPress={onChooseGroup}>
      <Text style={styles.groupName}>{group?.groupName || '그룹 선택'}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.primary} />
    </TouchableOpacity>
    <View style={styles.tabs}>
      <TouchableOpacity style={[styles.tab, tab === 'status' && styles.activeTab]} onPress={() => onTabChange?.('status')}>
        <Text style={[styles.tabText, tab === 'status' && styles.activeText]}>작업현황</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, tab === 'settings' && styles.activeTab]} onPress={() => onTabChange?.('settings')}>
        <Text style={[styles.tabText, tab === 'settings' && styles.activeText]}>설정</Text>
      </TouchableOpacity>
    </View>
    {tab === 'status' ? <WorkStatusScreen user={user} group={group} assignments={assignments}
      onRefresh={onRefresh} embedded /> :
      <ScrollView contentContainerStyle={styles.menu}>
        {menuItems.map((item) => <TouchableOpacity key={item.key} style={styles.menuRow} onPress={actions[item.key]}>
          <Ionicons name={item.icon} size={23} color={colors.primary} />
          <Text style={styles.menuText}>{item.title}</Text>
          <Ionicons name="chevron-forward" size={19} color={colors.textSoft} />
        </TouchableOpacity>)}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  groupTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 16, paddingBottom: 11 },
  groupName: { color: colors.text, fontWeight: '900', fontSize: 17 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 }, activeTab: { borderBottomWidth: 3, borderColor: colors.primary },
  tabText: { color: colors.textSoft, fontWeight: '800', fontSize: 14 }, activeText: { color: colors.primary },
  menu: { padding: 17, gap: 10, paddingBottom: 40 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: 13 },
  menuText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
});
