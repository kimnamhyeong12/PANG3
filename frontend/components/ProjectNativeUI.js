import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReportFilters from './ReportFilters';
import { PrimaryButton, ScreenHeader, SecondaryButton } from './ui';
import { colors, workStatus } from '../constants/design';
import { projectFilterOptions, recordDay } from '../utils/projectWorkflow';

export function ProjectFilters({ rows, value, onChange, disabled }) {
  const options = projectFilterOptions(rows);
  return <View pointerEvents={disabled ? 'none' : 'auto'}><ReportFilters {...options} workerLabel="담당자"
    search={value.search} onSearchChange={search => onChange({ ...value, search })}
    worker={value.worker} onWorkerChange={worker => onChange({ ...value, worker })}
    dong={value.dong} onDongChange={dong => onChange({ ...value, dong })}
    startDate={value.start} endDate={value.end} onDateChange={range => onChange({ ...value, ...range })}/></View>;
}
export function ProjectModal({ title, onClose, children, action, busy = false }) {
  const insets = useSafeAreaInsets();
  return <Modal visible animationType="slide" onRequestClose={() => !busy && onClose()}>
    <View style={projectStyles.root}><ScreenHeader title={title} onBack={!busy ? onClose : undefined}/>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={projectStyles.body}>{children}</ScrollView>
      {action && <View style={[projectStyles.bottom, { paddingBottom: Math.max(12, insets.bottom) }]}>{action}</View>}
    </View>
  </Modal>;
}
export function ProjectError({ message, onRetry }) {
  return message ? <View style={projectStyles.error}><Text style={projectStyles.errorText}>{message}</Text>{onRetry && <SecondaryButton title="다시 불러오기" onPress={onRetry}/>}</View> : null;
}
export function ProjectLoading() { return <ActivityIndicator color={colors.primary} style={{ padding: 24 }}/>; }
export function ProjectStatus({ row }) {
  const status = workStatus(String(row.progressStatus || row.taskStatus || row.status || '').toLowerCase());
  return <View style={[projectStyles.badge, { backgroundColor: status.background }]}><Text style={{ fontSize: 11, fontWeight: '700', color: status.ink }}>{status.label}</Text></View>;
}
export function ProjectCheckRow({ row, checked, onPress, disabled, record = false }) {
  return <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={`${row.detailAddress || row.roadAddress || '방문지'} 선택`}
    disabled={disabled} onPress={onPress} style={[projectStyles.row, checked && { backgroundColor: colors.primarySoft }]}>
    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={23} color={checked ? colors.primary : colors.textFaint}/>
    <View style={projectStyles.grow}><Text style={projectStyles.name}>{row.detailAddress || row.roadAddress || '방문지'}</Text>
      {!!row.roadAddress && <Text style={projectStyles.meta}>{row.roadAddress}</Text>}
      {record && <Text style={projectStyles.meta}>{[row.assigneeName, recordDay(row.createdAt)].filter(Boolean).join(' · ')}</Text>}
    </View>{!record && <ProjectStatus row={row}/>}</TouchableOpacity>;
}
export { PrimaryButton, SecondaryButton };
export const projectStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  panel: { padding: 16, gap: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingText: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  grow: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '800', color: colors.text, lineHeight: 21 },
  meta: { fontSize: 12, color: colors.textSoft, lineHeight: 18, marginTop: 3 },
  row: { minHeight: 70, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  bottom: { padding: 16, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  error: { padding: 14, gap: 12, backgroundColor: colors.dangerSoft, borderRadius: 12 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
