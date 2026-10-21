import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WorkStatusScreen from './WorkStatusScreen';
import { formatTransferTime } from './TransferScreen';
import { CardTitle, PrimaryButton, ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { colors, shadow } from '../constants/design';
import { groupApi } from '../utils/groupApi';
import { transferHistoryPage, mergeTransferHistory, compareTransferHistory } from '../utils/transferHistory';
import GroupLeaveButton from '../components/GroupLeaveButton';
import { buildMemberColors, softMemberColor } from '../utils/memberColors';
import { GroupProjectList } from './ProjectScreen';
import GroupReportsScreen from './GroupReportsScreen';

let lastProjectView = 'projects';

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
  onTransfer,
  onLeaveGroup,
  onOpenProject,
  onOpenReport,
  onOpenReports,
  onPreviewReport,
  onEditReport,
  // 보고서를 열거나 수정하는 동안 App 이 이 화면을 숨겨 둔 채 유지한다 (건별 보고서 거르기·폴더 유지)
  isActive = true,
}) {
  // H5: 프로젝트 탭 안 '프로젝트 | 건별 보고서' (건별 = 기존 그룹 보고서 전체보기 화면 그대로)
  // 보고서를 열었다 돌아와도(화면이 다시 그려져도) 보던 칸을 유지
  const [projectView, setProjectViewState] = useState(() => lastProjectView);
  const setProjectView = (value) => { lastProjectView = value; setProjectViewState(value); };
  const [detail, setDetail] = useState(group || null);
  const [sharedTasks, setSharedTasks] = useState(Array.isArray(assignments) ? assignments : []);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [transferRequests, setTransferRequests] = useState([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [respondingRequestId, setRespondingRequestId] = useState(null);
  const [teamAlerts, setTeamAlerts] = useState(true);
  const [activityAlerts, setActivityAlerts] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteId, setInviteId] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    setInviteOpen(false);
    setInviteId('');
  }, [group?.groupId]);

  useEffect(() => {
    if (tab !== 'settings') {
      setInviteOpen(false);
      setInviteId('');
      Keyboard.dismiss();
    }
  }, [tab]);

  const invite = async () => {
    const loginId = inviteId.trim();
    if (!loginId || inviting) return;
    try {
      setInviting(true);
      await groupApi(`/api/groups/${group.groupId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ inviterUserId: user.userId, inviteeLoginId: loginId }),
      });
      showAlert('초대 완료', `${loginId} 사용자에게 초대를 보냈습니다.`);
      setInviteId('');
      setInviteOpen(false);
    } catch (error) {
      showAlert('초대 실패', error.message || '초대를 보내지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setInviting(false);
    }
  };

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
      const [groupDetail, locations, transfers] = await Promise.allSettled([
        groupApi(`${base}?userId=${user.userId}`),
        groupApi(`/api/locations/group/${group.groupId}?userId=${user.userId}`),
        transferHistoryPage(group.groupId, user.userId),
      ]);

      if (groupDetail.status === 'fulfilled') setDetail(groupDetail.value || group);
      if (locations.status === 'fulfilled') setSharedTasks(Array.isArray(locations.value) ? locations.value : []);
      if (transfers.status === 'fulfilled') {
        setTransferRequests(transfers.value.items || []);
        setHistoryHasMore(Boolean(transfers.value.hasMore));
        setHistoryError(null);
      } else {
        setHistoryHasMore(false);
        setHistoryError('이관 내역을 불러오지 못했습니다. 다시 시도해주세요.');
      }
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
    .filter((request) => Number(request.recipientUserId) === Number(user?.userId)
      || Number(request.senderUserId) === Number(user?.userId))
    .sort(compareTransferHistory(user?.userId)),
  [transferRequests, user?.userId]);

  const loadMoreHistory = async () => {
    if (!historyHasMore || historyLoading) return;
    setHistoryLoading(true);
    try {
      const page = await transferHistoryPage(group.groupId, user.userId, 1);
      setTransferRequests(previous => mergeTransferHistory(previous, page.items || []));
      setHistoryHasMore(false);
    } catch (error) {
      showAlert('이관 내역 조회 실패', error.message);
    } finally { setHistoryLoading(false); }
  };

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
        ? '담당자가 변경되었습니다. 지도와 보고서에서 확인할 수 있습니다.'
        : '기존 담당자가 유지됩니다.');
    } catch (error) {
      showAlert('요청 처리 실패', error.message);
    } finally {
      setRespondingRequestId(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={groupName} onBack={isActive ? onBack : undefined} />

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
        {!(group?.personal || group?.personalWorkspace || group?.workspaceType === 'PERSONAL') && (
          <TouchableOpacity
            style={[styles.tab, tab === 'projects' && styles.activeTab]}
            onPress={() => onTabChange?.('projects')}
          >
            <Text style={[styles.tabText, tab === 'projects' && styles.activeText]}>프로젝트</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.tab, tab === 'settings' && styles.activeTab]}
          onPress={() => onTabChange?.('settings')}
        >
          <Text style={[styles.tabText, tab === 'settings' && styles.activeText]}>관리</Text>
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
      ) : tab === 'projects' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.segment} accessibilityRole="tablist">
            {[['projects', '프로젝트'], ['reports', '건별 보고서']].map(([key, label]) => (
              <TouchableOpacity key={key} style={[styles.segmentItem, projectView === key && styles.segmentActive]}
                onPress={() => setProjectView(key)} accessibilityRole="tab" accessibilityState={{ selected: projectView === key }}>
                <Text style={[styles.segmentText, projectView === key && styles.segmentTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {projectView === 'projects'
            ? <GroupProjectList user={user} group={group} onOpenProject={onOpenProject} />
            : <GroupReportsScreen user={user} group={group} embedded isActive={isActive && tab === 'projects' && projectView === 'reports'}
                onOpenReport={onOpenReport} onOpenReports={onOpenReports} onPreviewReport={onPreviewReport} onEditReport={onEditReport} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'settings' ? <>
          <View style={styles.card}>
            <CardTitle icon="information-circle-outline" title="기본 정보" />
            <InfoRow icon="pricetag" label="그룹명" value={groupName} />
            <InfoRow icon="location" label="활동 지역" value={regionText} last />
          </View>

          <View style={styles.card}>
            <CardTitle
              icon="people-outline"
              title="팀원 관리"
              suffix={`(${members.length}명)`}
              actionLabel="팀원 추가"
              onAction={() => setInviteOpen((value) => !value)}
            />

            {inviteOpen ? <View style={styles.inviteBox}>
              <TextInput
                style={styles.inviteInput}
                value={inviteId}
                onChangeText={setInviteId}
                placeholder="상대방의 로그인 아이디"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={!inviting}
                returnKeyType="send"
                onSubmitEditing={invite}
              />
              <PrimaryButton title={inviting ? '전송 중' : '초대'} onPress={invite} disabled={!inviteId.trim() || inviting} style={styles.inviteButton} />
            </View> : null}

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
                      disabled
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
            {historyError && <Text style={styles.emptyText}>{historyError}</Text>}
            {loadingSettings && receivedRequests.length === 0 ? (
              <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
            ) : receivedRequests.length === 0 ? (
              !historyError && <Text style={styles.emptyText}>주고받은 이관 신청이 없습니다.</Text>
            ) : receivedRequests.map((request, index) => (
              <View key={request.id} style={[styles.requestRow, index > 0 && styles.requestDivider]}>
                <Text style={styles.requestTitle}>{Number(request.senderUserId) === Number(user?.userId) ? '보낸 요청' : '받은 요청'} · {request.senderName || '팀원'} → {request.recipientName || '팀원'} · {request.taskIds?.length || 0}건</Text>
                <Text style={styles.requestMeta}>{request.status === 'PENDING' ? '응답 대기' : request.status === 'ACCEPTED' ? '수락' : '거절'} · {formatTransferTime(request.requestedAt)}</Text>
                <Text style={styles.requestMeta}>{(request.taskIds || []).map((id) => {
                  const task = sharedTasks.find((item) => Number(item.id ?? item.taskId ?? item.task_id) === Number(id));
                  return task ? `${shortDong(task.adminDong || task.admin_dong) || '지역 미확인'} ${task.detailAddress || task.roadAddress || `#${id}`}` : `방문지 #${id}`;
                }).join(', ')}</Text>
                {request.status === 'PENDING' && Number(request.recipientUserId) === Number(user?.userId) && <View style={styles.requestActions}>
                  <TouchableOpacity style={[styles.requestAction, styles.requestReject]} disabled={respondingRequestId != null} onPress={() => respondToRequest(request, false)}>
                    <Text style={[styles.requestActionText, styles.requestRejectText]}>거절</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.requestAction} disabled={respondingRequestId != null} onPress={() => respondToRequest(request, true)}>
                    <Text style={styles.requestActionText}>수락</Text>
                  </TouchableOpacity>
                </View>}
              </View>
            ))}
            {historyHasMore && <TouchableOpacity style={styles.historyMore} disabled={historyLoading} onPress={loadMoreHistory}>
              <Text style={styles.historyMoreText}>{historyLoading ? '불러오는 중…' : '더보기'}</Text>
            </TouchableOpacity>}
          </View>}

          {tab === 'settings' && <>

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
          <GroupLeaveButton key={group.groupId} group={group} user={user} onLeft={onLeaveGroup} />
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
    <View style={[styles.settingRow, last && styles.divider]}>
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
  segment: { flexDirection: 'row', marginHorizontal: 20, marginTop: 10, marginBottom: 4, padding: 3, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  segmentItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  segmentText: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: colors.primaryDark, fontWeight: '900' },
  historyMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  historyMoreText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  inviteBox: { marginTop: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteInput: { flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.background },
  inviteButton: { width: 68, minHeight: 44, paddingVertical: 0, paddingHorizontal: 8, borderRadius: 12 },
  root: { flex: 1, backgroundColor: colors.background, marginTop: 0 },
  tabs: {
    flexDirection: 'row',

    borderColor: colors.line,
    backgroundColor: colors.surface, gap: 6, paddingHorizontal: 20, borderBottomWidth: 0, paddingBottom: 4, },
  tab: {  alignItems: 'center', paddingVertical: 14, flex: 1, minHeight: 44, borderBottomWidth: 0, borderRadius: 12, backgroundColor: colors.surfaceMuted, },
  activeTab: {  borderColor: colors.primary, backgroundColor: colors.primary, borderBottomWidth: 0, },
  tabText: { color: colors.textSoft, fontWeight: '800', fontSize: 13, },
  activeText: {color: '#FFFFFF', },
  body: { gap: 12, padding: 20, paddingTop: 0, paddingBottom: 36 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,

    borderColor: '#E4ECF7',

    ...shadow, borderWidth: 0, shadowOpacity: 0, elevation: 0, padding: 16, },
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
  settingRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 2,
  },
  settingTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
});
