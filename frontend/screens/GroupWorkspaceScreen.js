import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WorkStatusScreen from './WorkStatusScreen';
import { formatTransferTime } from './TransferScreen';
import { CardTitle, ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { colors, shadow } from '../constants/design';
import { groupApi } from '../utils/groupApi';
import { buildMemberColors, softMemberColor } from '../utils/memberColors';

const shortDong = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split(/\s+/);
  return parts[parts.length - 1] || text;
};


function buildMemberTransferRows(members, items) {
  const tasks = (Array.isArray(items) ? items : []).filter((item) =>
    !['complete', 'completed', 'done'].includes(
      String(item.status ?? item.taskStatus ?? item.task_status ?? '').toLowerCase()
    )
  );
  return (Array.isArray(members) ? members : []).map((member) => {
    const memberTasks = tasks.filter(
      (item) => Number(item.assigneeUserId) === Number(member.userId)
    );
    const dongs = Array.from(new Set(
      memberTasks
        .map((item) => shortDong(item.adminDong || item.admin_dong))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'ko'));

    return {
      userId: member.userId,
      name: member.name || member.loginId || '이름 없음',
      dongs,
      taskCount: memberTasks.length,
      member,
    };
  });
}


export default function GroupWorkspaceScreen({
  user,
  group,
  assignments,
  onRefresh,
  onBack,
  tab = 'dashboard',
  onTabChange,
  onMembers,
  onTransfer,
  onReports,
}) {
  const [detail, setDetail] = useState(group || null);
  const [sharedTasks, setSharedTasks] = useState(Array.isArray(assignments) ? assignments : []);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [reportCount, setReportCount] = useState(null);
  const [transferRequests, setTransferRequests] = useState([]);
  const [respondingRequestId, setRespondingRequestId] = useState(null);
  const [teamAlerts, setTeamAlerts] = useState(true);
  const [activityAlerts, setActivityAlerts] = useState(true);

  useEffect(() => {
    setDetail(group || null);
  }, [group]);

  useEffect(() => {
    setSharedTasks(Array.isArray(assignments) ? assignments : []);
  }, [assignments]);

  const loadSettings = useCallback(async () => {
    if (!['settings', 'transfer'].includes(tab) || !group?.groupId || !user?.userId) return;

    try {
      setLoadingSettings(true);
      const base = `/api/groups/${group.groupId}`;
      const [groupDetail, locations, reports, transfers] = await Promise.all([
        groupApi(`${base}?userId=${user.userId}`),
        groupApi(`/api/locations/group/${group.groupId}?userId=${user.userId}`),
        groupApi(`${base}/reports?userId=${user.userId}`).catch(() => []),
        groupApi(`${base}/transfers?userId=${user.userId}`).catch(() => []),
      ]);

      setDetail(groupDetail || group);
      setSharedTasks(Array.isArray(locations) ? locations : []);
      setReportCount(Array.isArray(reports) ? reports.length : 0);
      setTransferRequests(Array.isArray(transfers) ? transfers : []);
    } catch (error) {
      setDetail(group || null);
      setSharedTasks(Array.isArray(assignments) ? assignments : []);
      setReportCount(null);
      setTransferRequests([]);
    } finally {
      setLoadingSettings(false);
    }
  }, [tab, group, user?.userId, assignments]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const members = detail?.members || group?.members || [];
  const groupName = detail?.groupName || group?.groupName || '그룹 선택';
  const regionText = [detail?.regionSido || group?.regionSido || '부산광역시', detail?.regionSigungu || group?.regionSigungu || '활동지역 미설정']
    .filter(Boolean)
    .join(' · ');

  const transferRows = useMemo(() => buildMemberTransferRows(members, sharedTasks), [members, sharedTasks]);
  const memberColors = useMemo(() => buildMemberColors(members, sharedTasks), [members, sharedTasks]);
  const receivedRequests = useMemo(() => transferRequests
    .filter((request) => Number(request.recipientUserId) === Number(user?.userId))
    .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING')
      || new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
  [transferRequests, user?.userId]);

  const respondToRequest = async (request, accept) => {
    if (respondingRequestId != null) return;
    try {
      setRespondingRequestId(request.id);
      const result = await groupApi(`/api/groups/${group.groupId}/transfers/${request.id}/${accept ? 'accept' : 'reject'}`, {
        method: 'POST',
        body: JSON.stringify({ userId: user.userId }),
      });
      await loadSettings();
      if (accept && result?.status !== 'ACCEPTED') {
        showAlert('이관 불가', '방문지가 완료됐거나 담당자가 바뀌어 요청을 종료했습니다.');
        return;
      }
      try {
        await onRefresh?.();
      } catch (refreshError) {
        console.log('이관 후 업무 목록 갱신 실패:', refreshError);
      }
      showAlert(accept ? '이관 수락' : '이관 거절', accept
        ? '지도에서 행정동을 선택해 방문지를 추가하세요.'
        : '기존 담당자가 유지됩니다.');
    } catch (error) {
      showAlert('요청 처리 실패', error.message);
    } finally {
      setRespondingRequestId(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={groupName} onBack={onBack} />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'dashboard' && styles.activeTab]}
          onPress={() => onTabChange?.('dashboard')}
        >
          <Text style={[styles.tabText, tab === 'dashboard' && styles.activeText]}>대시보드</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'transfer' && styles.activeTab]}
          onPress={() => onTabChange?.('transfer')}
        >
          <Text style={[styles.tabText, tab === 'transfer' && styles.activeText]}>업무 이관</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'settings' && styles.activeTab]}
          onPress={() => onTabChange?.('settings')}
        >
          <Text style={[styles.tabText, tab === 'settings' && styles.activeText]}>설정</Text>
        </TouchableOpacity>
      </View>

      {tab === 'dashboard' ? (
        <WorkStatusScreen
          user={user}
          group={group}
          assignments={assignments}
          onRefresh={onRefresh}
          embedded
          showDashboard
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {tab === 'settings' ? <>
          <View style={styles.card}>
            <CardTitle icon="people" title="기본 정보" />
            <InfoRow icon="pricetag" label="그룹명" value={groupName} />
            <InfoRow icon="location" label="활동 지역" value={regionText} last />
          </View>

          <View style={styles.card}>
            <CardTitle
              icon="people"
              title="팀원 관리"
              suffix={`(${members.length}명)`}
              actionLabel="팀원 추가"
              onAction={onMembers}
              tone="teal"
            />

            {loadingSettings && members.length === 0 ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : members.length === 0 ? (
              <Text style={styles.emptyText}>등록된 팀원이 없습니다.</Text>
            ) : (
              <View style={styles.memberList}>
                {members.map((member, index) => {
                  const memberColor = memberColors[String(member.userId)];
                  const memberTasks = sharedTasks.filter(
                    (item) => Number(item.assigneeUserId) === Number(member.userId)
                  );
                  const hasWorking = memberTasks.some((item) =>
                    String(item.status || item.taskStatus || item.task_status || '').toLowerCase() === 'working'
                  );
                  const hasPending = memberTasks.some((item) => {
                    const status = String(item.status || item.taskStatus || item.task_status || 'pending').toLowerCase();
                    return !['complete', 'done'].includes(status) && status !== 'working';
                  });
                  const memberStatus = hasWorking ? 'working' : hasPending ? 'scheduled' : 'idle';
                  const statusLabel = memberStatus === 'working' ? '업무 중' : memberStatus === 'scheduled' ? '업무 예정' : '대기';
                  const badgeStyle = memberStatus === 'working' ? styles.statusYellow : memberStatus === 'scheduled' ? styles.statusBlue : styles.statusGray;
                  const dotStyle = memberStatus === 'working' ? styles.dotYellow : memberStatus === 'scheduled' ? styles.dotBlue : styles.dotGray;
                  const textStyle = memberStatus === 'working' ? styles.textYellow : memberStatus === 'scheduled' ? styles.textBlue : styles.textGray;
                  return (
                    <TouchableOpacity
                      key={member.userId || `${member.loginId}-${index}`}
                      style={[styles.memberRow, index > 0 && styles.divider]}
                      activeOpacity={0.78}
                      onPress={onMembers}
                    >
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: softMemberColor(memberColor), borderColor: memberColor || '#DCE7F5' },
                        ]}
                      >
                        <Text style={styles.avatarText}>
                          {String(member.name || member.loginId || '?').slice(0, 1)}
                        </Text>
                      </View>

                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{member.name || member.loginId}</Text>
                      </View>

                      <View style={[styles.statusBadge, badgeStyle]}>
                        <View style={[styles.statusDot, dotStyle]} />
                        <Text style={[styles.statusText, textStyle]}>
                          {statusLabel}
                        </Text>
                      </View>

                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          </> : null}

          {tab === 'transfer' && <View style={styles.card}>
            <CardTitle
              icon="swap-horizontal"
              title="업무 이관"
            />
            {transferRows.length === 0 ? (
              <Text style={styles.emptyText}>표시할 팀원이 없습니다.</Text>
            ) : (
              <View style={styles.areaList}>
                {transferRows.map((item, index) => {
                  const isMe = Number(item.userId) === Number(user?.userId);
                  const dongText = item.dongs.length
                    ? item.dongs.join(', ')
                    : '담당 방문지 없음';

                  return (
                    <TouchableOpacity
                      key={item.userId || item.name}
                      style={[styles.transferMemberRow, index > 0 && styles.divider, isMe && styles.transferMemberRowDisabled]}
                      activeOpacity={isMe ? 1 : 0.78}
                      disabled={isMe}
                      onPress={() => onTransfer?.(item.member)}
                    >
                      <View style={styles.transferMemberIcon}>
                        <Ionicons name="person-outline" size={19} color={isMe ? colors.textSoft : colors.primary} />
                      </View>
                      <View style={styles.transferMemberInfo}>
                        <View style={styles.transferMemberTitleRow}>
                          <Text style={styles.transferMemberName}>{item.name}</Text>
                          {isMe ? <Text style={styles.meBadge}>본인</Text> : null}
                        </View>
                        <Text style={styles.transferMemberDongs} numberOfLines={2}>{dongText}</Text>
                      </View>
                      {!isMe ? <Ionicons name="chevron-forward" size={20} color={colors.textFaint} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>}

          {tab === 'transfer' && <View style={styles.card}>
            <CardTitle icon="mail-outline" title="이관 신청" suffix={`${receivedRequests.length}건`} />
            {loadingSettings && receivedRequests.length === 0 ? (
              <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
            ) : receivedRequests.length === 0 ? (
              <Text style={styles.emptyText}>받은 이관 신청이 없습니다.</Text>
            ) : receivedRequests.map((request, index) => (
              <View key={request.id} style={[styles.requestRow, index > 0 && styles.requestDivider]}>
                <Text style={styles.requestTitle}>{request.senderName || '팀원'} → {request.recipientName || '나'} · {request.taskIds?.length || 0}건</Text>
                <Text style={styles.requestMeta}>{request.status === 'PENDING' ? '응답 대기' : request.status === 'ACCEPTED' ? '수락' : '거절'} · {formatTransferTime(request.requestedAt)}</Text>
                <Text style={styles.requestMeta}>{(request.taskIds || []).map((id) => {
                  const task = sharedTasks.find((item) => Number(item.id ?? item.taskId ?? item.task_id) === Number(id));
                  return task ? `${shortDong(task.adminDong || task.admin_dong) || '지역 미확인'} ${task.detailAddress || task.roadAddress || `#${id}`}` : `방문지 #${id}`;
                }).join(', ')}</Text>
                {request.status === 'PENDING' && <View style={styles.requestActions}>
                  <TouchableOpacity style={[styles.requestAction, styles.requestReject]} disabled={respondingRequestId != null} onPress={() => respondToRequest(request, false)}>
                    <Text style={[styles.requestActionText, styles.requestRejectText]}>거절</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.requestAction} disabled={respondingRequestId != null} onPress={() => respondToRequest(request, true)}>
                    <Text style={styles.requestActionText}>수락</Text>
                  </TouchableOpacity>
                </View>}
              </View>
            ))}
          </View>}

          {tab === 'settings' && <>
          <TouchableOpacity style={styles.card} activeOpacity={0.78} onPress={onReports}>
            <CardTitle icon="document-text" title="그룹 보고서 모아보기" />
            <View style={styles.reportBar}>
              <View style={styles.reportSummary}>
                <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportLabel}>전체 보고서</Text>
                  <Text style={styles.reportValue}>
                    {reportCount == null ? '전체 보기' : `${reportCount}건`}
                  </Text>
                </View>
              </View>
              <View style={styles.reportAction}>
                <Text style={styles.reportActionText}>전체 보기</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.card}>
            <CardTitle icon="settings" title="그룹 설정" />
            <SettingSwitchRow
              icon="notifications-outline"
              title="팀 알림 받기"
              value={teamAlerts}
              onValueChange={setTeamAlerts}
            />
            <SettingSwitchRow
              icon="people-outline"
              title="팀원 활동 알림"
              value={activityAlerts}
              onValueChange={setActivityAlerts}
              last
            />
          </View>
          </>}
        </ScrollView>
      )}
    </View>
  );
}

function InfoRow({ icon, label, value, last }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoDivider]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SettingSwitchRow({ icon, title, value, onValueChange, last }) {
  return (
    <View style={[styles.settingRow, !last && styles.divider]}>
      <Ionicons name={icon} size={21} color={colors.primary} />
      <Text style={styles.settingTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#CBD5E1', true: '#86B9FF' }}
        thumbColor={value ? colors.primary : '#FFFFFF'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, transform: [{ translateY: -15 }] },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  activeTab: { borderBottomWidth: 3, borderColor: colors.primary },
  tabText: { color: colors.textSoft, fontWeight: '800', fontSize: 14 },
  activeText: { color: colors.primary },
  body: { padding: 14, gap: 12, paddingBottom: 36 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4ECF7',
    padding: 14,
    ...shadow,
  },
  infoRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
  },
  infoDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  infoLabel: { width: 68, color: colors.textSoft, fontSize: 11 },
  infoValue: { flex: 1, color: colors.text, fontSize: 12.5, fontWeight: '900' },
  loadingBox: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textSoft, fontSize: 11, paddingTop: 10, paddingHorizontal: 4 },
  memberList: { marginTop: 6 },
  memberRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  memberInfo: { flex: 1 },
  memberName: { color: colors.text, fontSize: 13.5, fontWeight: '900' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusYellow: { backgroundColor: colors.warningSoft },
  statusBlue: { backgroundColor: colors.primarySoft },
  statusGray: { backgroundColor: '#F1F3F7' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotYellow: { backgroundColor: colors.warning },
  dotBlue: { backgroundColor: colors.primary },
  dotGray: { backgroundColor: '#98A4B8' },
  statusText: { fontSize: 10, fontWeight: '800' },
  textYellow: { color: '#9A7000' },
  textBlue: { color: colors.primary },
  textGray: { color: colors.textSoft },
  cardDescription: { color: colors.textSoft, fontSize: 11, marginTop: 8, marginBottom: 8 },
  areaList: { marginTop: 4 },
  infoActionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  transferMemberRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  transferMemberRowDisabled: { opacity: 0.72 },
  transferMemberIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  transferMemberInfo: { flex: 1 },
  transferMemberTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  transferMemberName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  transferMemberDongs: { color: colors.textSoft, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  requestRow: { paddingVertical: 12 },
  requestDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  requestTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  requestMeta: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 4 },
  requestActions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  requestAction: { paddingVertical: 8, paddingHorizontal: 17, borderRadius: 8, backgroundColor: colors.primarySoft },
  requestActionText: { color: colors.primary, fontWeight: '800' },
  requestReject: { backgroundColor: '#FDE9EB' },
  requestRejectText: { color: '#B94D59' },
  meBadge: { color: colors.textSoft, fontSize: 9.5, fontWeight: '800', backgroundColor: colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  reportBar: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportSummary: {
    flex: 1,
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportLabel: { color: colors.textSoft, fontSize: 10.5 },
  reportValue: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 },
  reportAction: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.3,
    borderColor: '#BFD6F5',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportActionText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  settingRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 2,
  },
  settingTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
});
