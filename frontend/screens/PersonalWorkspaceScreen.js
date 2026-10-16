import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../components/ui';
import { colors } from '../constants/design';
import WorkStatusScreen from './WorkStatusScreen';
import GroupReportsScreen from './GroupReportsScreen';

export default function PersonalWorkspaceScreen({ user, group, assignments, tab, onTabChange, onBack, onRefresh, onOpenReport, onEditReport, isActive }) {
  const personalGroup = { ...group, regionSido: user.workSido || group.regionSido || '부산광역시', regionSigungu: user.workSigungu || group.regionSigungu || '' };
  return <View style={styles.container}>
    <ScreenHeader title="내 개인 업무" onBack={onBack} />
    <View style={styles.tabs}>{[['dashboard', '업무현황'], ['reports', '보고서 보관함']].map(([key, label]) => <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.activeTab]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => onTabChange(key)}><Text style={[styles.label, tab === key && styles.activeLabel]}>{label}</Text></TouchableOpacity>)}</View>
    {tab === 'dashboard' ? <WorkStatusScreen user={user} group={personalGroup} assignments={assignments} onRefresh={onRefresh} embedded showDashboard />
      : <GroupReportsScreen user={user} group={personalGroup} personalArchive embedded isActive={isActive} onOpenReport={onOpenReport} onEditReport={onEditReport} />}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0 },
  tabs: { flexDirection: 'row',   borderBottomColor: colors.line, backgroundColor: colors.surface, gap: 6, paddingHorizontal: 20, borderBottomWidth: 0, paddingBottom: 12, },
  tab: {   alignItems: 'center', justifyContent: 'center',  borderBottomColor: 'transparent', flex: 1, minHeight: 44, borderBottomWidth: 0, borderRadius: 12, backgroundColor: colors.surfaceMuted, }, activeTab: { borderBottomColor: colors.primary, backgroundColor: colors.primary, borderBottomWidth: 0, },
  label: { color: colors.textSoft, fontWeight: '800', fontSize: 13, }, activeLabel: {color: '#FFFFFF', },
});
