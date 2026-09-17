import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Modal, ScrollView, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { BrandBar, EmptyState, SectionTitle } from '../components/ui';
import { colors, radius, shadow } from '../constants/design';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const isPersonalGroup = (group) => Boolean(group?.personalWorkspace || group?.personal || group?.workspaceType === 'PERSONAL');
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateKey = (item, scheduled = false) => {
  const value = scheduled ? item?.scheduledDate ?? item?.scheduled_date ?? item?.workDate ?? item?.work_date : item?.workDate ?? item?.work_date;
  return value ? String(value).slice(0, 10) : '';
};
const shortDate = (value) => { const parts = String(value || '').slice(0, 10).split('-'); return parts.length === 3 ? `${parts[1]}.${parts[2]}` : ''; };
const isToday = (item) => !dateKey(item, true) || dateKey(item, true) === localDateKey();
const normalizedStatus = (item) => String(item?.status || item?.taskStatus || item?.task_status || 'pending').toLowerCase();

export default function MainScreen({
  user, activeGroup, availableGroups = [], groupAssignments = [], onRoute, onReport,
  onGroup, onSelectWorkspace, onRefreshWorkspaces, onWorkStatus, onDashboard,
  onSettings, onPublicData, locations = [], setLocations, onRefreshAssignments,
}) {
  const [incompleteLocations, setIncompleteLocations] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [movingToToday, setMovingToToday] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const backPressedOnce = useRef(false);
  const backTimer = useRef(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backPressedOnce.current) { BackHandler.exitApp(); return true; }
      backPressedOnce.current = true;
      ToastAndroid.show('뒤로가기 버튼을 한 번 더 누르면 종료됩니다.', ToastAndroid.SHORT);
      backTimer.current = setTimeout(() => { backPressedOnce.current = false; }, 2000);
      return true;
    });
    return () => { subscription.remove(); if (backTimer.current) clearTimeout(backTimer.current); };
  }, []);

  const myAssignmentIds = useMemo(() => new Set(groupAssignments.filter((item) => Number(item.assigneeUserId) === Number(user?.userId)).map((item) => Number(item.taskId ?? item.locationId))), [groupAssignments, user?.userId]);
  const displayLocations = (locations || []).filter(isToday);
  const completed = displayLocations.filter((item) => ['complete', 'done'].includes(normalizedStatus(item))).length;
  const working = displayLocations.filter((item) => normalizedStatus(item) === 'working').length;
  const pending = Math.max(0, displayLocations.length - completed - working);
  const progress = displayLocations.length ? Math.round((completed / displayLocations.length) * 100) : 0;
  const visibleIncomplete = activeGroup ? incompleteLocations.filter((item) => myAssignmentIds.has(Number(item.id ?? item.taskId ?? item.task_id))) : incompleteLocations;
  const currentTask = displayLocations.find((item) => normalizedStatus(item) === 'working') || displayLocations.find((item) => !['complete', 'done'].includes(normalizedStatus(item)));
  const recentCompleted = (activeGroup && groupAssignments.length ? groupAssignments : displayLocations).filter((item) => ['complete', 'done'].includes(normalizedStatus(item))).slice(0, 3);
  const displayName = user?.name || user?.loginId || '사용자';
  const workspaceName = activeGroup?.groupName || displayName;
  const roleLabel = !activeGroup || isPersonalGroup(activeGroup) ? '개인' : activeGroup?.role === 'LEADER' ? '팀장' : '팀원';
  const openPublicData = () => {
    if (!activeGroup || isPersonalGroup(activeGroup)) {
      showAlert('팀 그룹 전용', '공공업무는 활동지역이 설정된 팀 그룹에서 사용할 수 있습니다.');
      return;
    }
    onPublicData?.(activeGroup);
  };

  const loadIncomplete = async () => {
    if (!API_BASE_URL || !user?.userId) return setIncompleteLocations([]);
    try {
      const query = `userId=${encodeURIComponent(user.userId)}${activeGroup?.groupId ? `&groupId=${encodeURIComponent(activeGroup.groupId)}` : ''}`;
      const response = await fetch(`${API_BASE_URL}/api/locations?${query}`);
      if (!response.ok) throw new Error('미처리 업무 조회 실패');
      const rows = await response.json();
      const today = localDateKey();
      setIncompleteLocations((Array.isArray(rows) ? rows : []).map((item) => ({
        ...item, id: item.id ?? item.taskId ?? item.task_id, status: item.status ?? item.taskStatus ?? item.task_status ?? 'pending',
        task: item.task ?? item.taskCategory ?? item.task_category ?? '', detailAddress: item.detailAddress ?? item.detail_address,
        roadAddress: item.roadAddress ?? item.road_address, workDate: item.workDate ?? item.work_date,
        scheduledDate: item.scheduledDate ?? item.scheduled_date ?? item.workDate ?? item.work_date,
      })).filter((item) => dateKey(item) && dateKey(item) < today && dateKey(item, true) && dateKey(item, true) < today && ['pending', 'working'].includes(normalizedStatus(item))));
    } catch (error) { console.log(error); }
  };

  useEffect(() => { loadIncomplete(); }, [user?.userId, activeGroup?.groupId, locations]);

  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  const moveSelectedToToday = async () => {
    const selected = visibleIncomplete.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) return showAlert('선택 필요', '오늘 업무로 가져올 항목을 선택하세요.');
    try {
      setMovingToToday(true);
      const moved = await Promise.all(selected.map(async (item) => {
        const response = await fetch(`${API_BASE_URL}/api/locations/${item.id}/scheduled-date`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledDate: localDateKey() }) });
        const text = await response.text();
        if (!response.ok) throw new Error(text || '업무 이동 실패');
        return { ...item, ...(text ? JSON.parse(text) : {}), scheduledDate: localDateKey() };
      }));
      const movedIds = new Set(moved.map((item) => Number(item.id ?? item.taskId ?? item.task_id)));
      setLocations?.((prev) => [...(prev || []).filter((item) => !movedIds.has(Number(item.id ?? item.taskId ?? item.task_id))), ...moved]);
      setIncompleteLocations((prev) => prev.filter((item) => !movedIds.has(Number(item.id))));
      setSelectedIds([]); onRefreshAssignments?.();
      showAlert('추가 완료', `${moved.length}건을 오늘 업무로 가져왔습니다.`);
    } catch (error) { showAlert('추가 실패', error.message || '업무를 이동하지 못했습니다.'); }
    finally { setMovingToToday(false); }
  };

  const removeIncomplete = (item) => {
    if (normalizedStatus(item) !== 'pending') return showAlert('삭제 불가', '작업 전 업무만 삭제할 수 있습니다.');
    Alert.alert('미처리 업무 삭제', '선택한 업무를 삭제하시겠습니까?', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: async () => {
      try {
        setDeletingId(item.id); const response = await fetch(`${API_BASE_URL}/api/locations/${item.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('삭제 실패');
        setIncompleteLocations((prev) => prev.filter((row) => Number(row.id) !== Number(item.id)));
        setSelectedIds((prev) => prev.filter((id) => Number(id) !== Number(item.id)));
        setLocations?.((prev) => (prev || []).filter((row) => Number(row.id ?? row.taskId) !== Number(item.id)));
      } catch (error) { showAlert('삭제 실패', error.message); } finally { setDeletingId(null); }
    } }]);
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <BrandBar />
        </View>

        <View style={styles.userRow}>
          <View><Text style={styles.date}>{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</Text><Text style={styles.userName}>{displayName}</Text><Text style={styles.region}><Ionicons name="location" size={12} color={colors.primary} /> {user?.workSido || '부산광역시'}</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{displayName.slice(0, 1)}</Text></View>
        </View>

        <TouchableOpacity style={styles.workspace} onPress={() => { setWorkspacePickerOpen(true); onRefreshWorkspaces?.(); }} activeOpacity={0.8}>
          <View style={styles.workspaceIcon}><Ionicons name={isPersonalGroup(activeGroup) ? 'person-outline' : 'people-outline'} size={19} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={styles.workspaceLabel}>현재 업무공간</Text><Text style={styles.workspaceName} numberOfLines={1}>{workspaceName}</Text></View>
          <View style={styles.roleBadge}><Text style={styles.roleText}>{roleLabel}</Text></View><Ionicons name="chevron-down" size={18} color={colors.textSoft} />
        </TouchableOpacity>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}><View><Text style={styles.summaryTitle}>오늘 업무</Text><Text style={styles.summarySub}>총 {displayLocations.length}건</Text></View><Text style={styles.progressText}>{progress}%</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <View style={styles.metrics}><Metric label="진행 전" value={pending} color={colors.pending} /><Metric label="진행 중" value={working} color={colors.warning} /><Metric label="완료" value={completed} color={colors.success} /></View>
        </View>

        <View style={styles.quickGrid}>
          <QuickAction icon="people-outline" label="업무 현황" onPress={onWorkStatus} />
          <QuickAction icon="stats-chart-outline" label="분석" onPress={onDashboard} />
          <QuickAction icon="business-outline" label="공공업무" onPress={openPublicData} />
          <QuickAction icon="settings-outline" label="설정" onPress={onSettings} />
        </View>

        <SectionTitle title="현재 업무" actionLabel="지도에서 보기" onAction={onRoute} />
        {currentTask ? <View style={styles.currentCard}><View style={styles.currentTop}><View style={[styles.statusDot, { backgroundColor: normalizedStatus(currentTask) === 'working' ? colors.warning : colors.pending }]} /><Text style={styles.currentStatus}>{normalizedStatus(currentTask) === 'working' ? '진행 중' : '진행 전'}</Text><Text style={styles.currentCount}>남은 방문지 {pending + working}곳</Text></View><Text style={styles.currentTitle} numberOfLines={1}>{currentTask.detailAddress || currentTask.task || '현장 업무'}</Text><Text style={styles.currentAddress} numberOfLines={1}>{currentTask.roadAddress || '주소 정보 없음'}</Text><TouchableOpacity style={styles.routeButton} onPress={onRoute}><Ionicons name="navigate-outline" size={17} color="#FFFFFF" /><Text style={styles.routeButtonText}>업무 경로 열기</Text></TouchableOpacity></View> : <EmptyState icon="checkmark-circle-outline" title="오늘 남은 업무가 없습니다" description="새 업무가 배정되면 이곳에 표시됩니다." />}

        <View style={styles.sectionGap}><SectionTitle title={`미처리 업무 ${visibleIncomplete.length}`} actionLabel={visibleIncomplete.length ? (selectedIds.length === visibleIncomplete.length ? '선택 해제' : '전체 선택') : undefined} onAction={() => setSelectedIds(selectedIds.length === visibleIncomplete.length ? [] : visibleIncomplete.map((item) => item.id))} /></View>
        {visibleIncomplete.length ? <View style={styles.listCard}>{visibleIncomplete.map((item, index) => { const checked = selectedIds.includes(item.id); return <View key={item.id ?? index} style={[styles.overdueRow, index > 0 && styles.rowBorder]}><TouchableOpacity style={[styles.checkbox, checked && styles.checkboxActive]} onPress={() => toggleSelect(item.id)}>{checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}</TouchableOpacity><View style={{ flex: 1 }}><View style={styles.metaRow}><Text style={styles.dateChip}>{shortDate(dateKey(item))}</Text>{item.task ? <Text style={styles.categoryChip}>{item.task}</Text> : null}<Text style={[styles.statusChip, normalizedStatus(item) === 'working' && styles.workingChip]}>{normalizedStatus(item) === 'working' ? '진행 중' : '진행 전'}</Text></View><Text style={styles.rowTitle} numberOfLines={1}>{item.detailAddress || item.roadAddress || '방문지'}</Text><Text style={styles.rowSub} numberOfLines={1}>{item.roadAddress || '주소 정보 없음'}</Text></View><TouchableOpacity disabled={deletingId !== null || normalizedStatus(item) !== 'pending'} onPress={() => removeIncomplete(item)} style={styles.deleteButton}><Ionicons name="trash-outline" size={17} color={normalizedStatus(item) === 'pending' ? colors.danger : colors.textFaint} /></TouchableOpacity></View>; })}<TouchableOpacity disabled={!selectedIds.length || movingToToday} onPress={moveSelectedToToday} style={[styles.moveButton, (!selectedIds.length || movingToToday) && styles.moveDisabled]}><Text style={styles.moveText}>{movingToToday ? '가져오는 중...' : selectedIds.length ? `${selectedIds.length}건 오늘 업무로 가져오기` : '업무를 선택하세요'}</Text></TouchableOpacity></View> : <EmptyState icon="archive-outline" title="미처리 업무가 없습니다" description="날짜가 지난 진행 전·진행 중 업무가 표시됩니다." />}

        <View style={styles.sectionGap}><SectionTitle title="최근 완료" /></View>
        <View style={styles.historyCard}>{recentCompleted.length ? recentCompleted.map((item, index) => <View key={item.id ?? item.taskId ?? index} style={[styles.historyRow, index > 0 && styles.rowBorder]}><View style={styles.checkIcon}><Ionicons name="checkmark" size={14} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.historyTitle} numberOfLines={1}>{item.detailAddress || item.task || '현장 업무'}</Text><Text style={styles.rowSub} numberOfLines={1}>{item.roadAddress || '업무 완료'}</Text></View></View>) : <Text style={styles.emptyInline}>완료된 방문 기록이 없습니다.</Text>}</View>
      </ScrollView>

      <WorkspacePicker visible={workspacePickerOpen} groups={availableGroups} activeGroup={activeGroup} user={user} onClose={() => setWorkspacePickerOpen(false)} onManage={() => { setWorkspacePickerOpen(false); onGroup?.(); }} onSelect={(group) => { onSelectWorkspace?.(group); setWorkspacePickerOpen(false); }} />
    </>
  );
}

function Metric({ label, value, color }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function QuickAction({ icon, label, onPress }) { return <TouchableOpacity style={styles.quickAction} onPress={onPress}><View style={styles.quickIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View><Text style={styles.quickLabel}>{label}</Text></TouchableOpacity>; }
function WorkspacePicker({ visible, groups, activeGroup, user, onSelect, onManage, onClose }) { return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}><View style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.modalTitle}>업무공간 선택</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.textSoft} /></TouchableOpacity></View>{groups.map((group) => { const selected = Number(group.groupId) === Number(activeGroup?.groupId); const personal = isPersonalGroup(group); return <TouchableOpacity key={group.groupId} style={[styles.workspaceOption, selected && styles.workspaceOptionActive]} onPress={() => onSelect(group)}><View style={styles.workspaceIcon}><Ionicons name={personal ? 'person-outline' : 'people-outline'} size={19} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.optionName}>{personal ? `나 · ${group.groupName}` : group.groupName}</Text><Text style={styles.rowSub}>{personal ? `개인 · ${user?.name || user?.loginId}` : `${group.memberCount || 1}명 · ${group.role === 'LEADER' ? '팀장' : '팀원'}`}</Text></View>{selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}</TouchableOpacity>; })}<TouchableOpacity style={styles.manageButton} onPress={onManage}><Ionicons name="settings-outline" size={17} color={colors.primary} /><Text style={styles.manageText}>그룹 관리</Text></TouchableOpacity></View></TouchableOpacity></Modal>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 30 },
  topBar: { marginTop: -5 },
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, date: { color: colors.textSoft, fontSize: 11, fontWeight: '700' }, userName: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 3 }, region: { color: colors.primary, fontSize: 10, marginTop: 4, fontWeight: '800' },
  avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  workspace: { marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }, workspaceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, workspaceLabel: { color: colors.textSoft, fontSize: 8.5 }, workspaceName: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 2 }, roleBadge: { backgroundColor: colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }, roleText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  summaryCard: { marginTop: 11, borderRadius: 18, backgroundColor: colors.primaryDark, padding: 15, ...shadow }, summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, summarySub: { color: '#D5E6FF', fontSize: 10, marginTop: 3 }, progressText: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' }, progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }, progressFill: { height: '100%', backgroundColor: '#5CD5CE', borderRadius: 999 }, metrics: { flexDirection: 'row', marginTop: 14 }, metric: { flex: 1, alignItems: 'center' }, metricValue: { fontSize: 19, fontWeight: '900' }, metricLabel: { color: '#D5E6FF', fontSize: 9, marginTop: 2 },
  quickGrid: { flexDirection: 'row', gap: 7, marginTop: 11, marginBottom: 19 }, quickAction: { flex: 1, minHeight: 68, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 5 }, quickIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, quickLabel: { color: colors.text, fontSize: 9.5, fontWeight: '800' },
  currentCard: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.line, padding: 17 }, currentTop: { flexDirection: 'row', alignItems: 'center' }, statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 }, currentStatus: { color: colors.textSoft, fontSize: 11, fontWeight: '800' }, currentCount: { marginLeft: 'auto', color: colors.primary, fontSize: 11, fontWeight: '900' }, currentTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 13 }, currentAddress: { color: colors.textSoft, fontSize: 11, marginTop: 5 }, routeButton: { marginTop: 16, minHeight: 46, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, routeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  sectionGap: { marginTop: 19 }, listCard: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }, overdueRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12 }, rowBorder: { borderTopWidth: 1, borderTopColor: colors.line }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#B8C5BE', alignItems: 'center', justifyContent: 'center' }, checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }, dateChip: { fontSize: 8.5, color: colors.primary, fontWeight: '900', backgroundColor: colors.primarySoft, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 }, categoryChip: { fontSize: 8.5, color: colors.textSoft, fontWeight: '800', backgroundColor: colors.surfaceMuted, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 }, statusChip: { fontSize: 8.5, color: colors.pending, fontWeight: '900' }, workingChip: { color: colors.warning }, rowTitle: { color: colors.text, fontSize: 12, fontWeight: '900' }, rowSub: { color: colors.textSoft, fontSize: 9.5, marginTop: 2 }, deleteButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }, moveButton: { minHeight: 44, backgroundColor: colors.primary, margin: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, moveDisabled: { backgroundColor: '#BBC6C0' }, moveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  historyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.large, paddingHorizontal: 15 }, historyRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 66 }, checkIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }, historyTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, emptyInline: { color: colors.textSoft, fontSize: 11, textAlign: 'center', paddingVertical: 24 },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,40,91,0.38)', justifyContent: 'flex-end' }, modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, modalTitle: { color: colors.text, fontSize: 20, fontWeight: '900' }, workspaceOption: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 66, borderTopWidth: 1, borderTopColor: colors.line }, workspaceOptionActive: { backgroundColor: '#F3F8FF' }, optionName: { color: colors.text, fontSize: 14, fontWeight: '900' }, manageButton: { height: 48, borderRadius: 14, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 }, manageText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
});
