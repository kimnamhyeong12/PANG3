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
import GroupDashboardScreen from './GroupDashboardScreen';
import { CardTitle, ScreenHeader } from '../components/ui';
import { colors, shadow } from '../constants/design';
import { groupApi } from '../utils/groupApi';

const AVATAR_COLORS = ['#DDEEFF', '#E4F8F3', '#FFF0D8', '#FCE7EF'];

const shortDong = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split(/\s+/);
  return parts[parts.length - 1] || text;
};


function buildMemberTransferRows(members, items) {
  const tasks = Array.isArray(items) ? items : [];
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
  tab = 'status',
  onTabChange,
  onMembers,
  onTransfer,
  onReports,
}) {
  const [detail, setDetail] = useState(group || null);
  const [sharedTasks, setSharedTasks] = useState(Array.isArray(assignments) ? assignments : []);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [reportCount, setReportCount] = useState(null);
  const [teamAlerts, setTeamAlerts] = useState(true);
  const [activityAlerts, setActivityAlerts] = useState(true);

  useEffect(() => {
    setDetail(group || null);
  }, [group]);

  useEffect(() => {
    setSharedTasks(Array.isArray(assignments) ? assignments : []);
  }, [assignments]);

  const loadSettings = useCallback(async () => {
    if (tab !== 'settings' || !group?.groupId || !user?.userId) return;

    try {
      setLoadingSettings(true);
      const base = `/api/groups/${group.groupId}`;
      const [groupDetail, locations, reports] = await Promise.all([
        groupApi(`${base}?userId=${user.userId}`),
        groupApi(`/api/locations/group/${group.groupId}?userId=${user.userId}`),
        groupApi(`${base}/reports?userId=${user.userId}`).catch(() => []),
      ]);

      setDetail(groupDetail || group);
      setSharedTasks(Array.isArray(locations) ? locations : []);
      setReportCount(Array.isArray(reports) ? reports.length : 0);
    } catch (error) {
      setDetail(group || null);
      setSharedTasks(Array.isArray(assignments) ? assignments : []);
      setReportCount(null);
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

  return (
    <View style={styles.root}>
      <ScreenHeader title={groupName} onBack={onBack} />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'status' && styles.activeTab]}
          onPress={() => onTabChange?.('status')}
        >
          <Text style={[styles.tabText, tab === 'status' && styles.activeText]}>작업현황</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'dashboard' && styles.activeTab]}
          onPress={() => onTabChange?.('dashboard')}
        >
          <Text style={[styles.tabText, tab === 'dashboard' && styles.activeText]}>대시보드</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'settings' && styles.activeTab]}
          onPress={() => onTabChange?.('settings')}
        >
          <Text style={[styles.tabText, tab === 'settings' && styles.activeText]}>설정</Text>
        </TouchableOpacity>
      </View>

      {tab === 'status' ? (
        <WorkStatusScreen
          user={user}
          group={group}
          assignments={assignments}
          onRefresh={onRefresh}
          embedded
        />
      ) : tab === 'dashboard' ? (
        <GroupDashboardScreen assignments={assignments} group={group} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
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
                          { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] },
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

          <View style={styles.card}>
            <CardTitle icon="swap-horizontal" title="업무 이관" />
            <Text style={styles.cardDescription}>팀원을 선택한 뒤 넘길 방문지를 직접 고릅니다.</Text>
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
          </View>

          <TouchableOpacity style={styles.card} activeOpacity={0.78} onPress={onReports}>
            <CardTitle icon="document-text" title="그룹 보고서 모아보기" />
            <Text style={styles.cardDescription}>팀 전체 보고서를 한 번에 확인합니다.</Text>
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
