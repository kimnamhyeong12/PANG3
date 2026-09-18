import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { CardTitle, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors, radius, shadow } from '../constants/design';

const AVATAR_COLORS = ['#DDEEFF', '#E4F8F3', '#FFF0D8', '#FCE7EF'];
const DISTRICTS = ['중구','서구','동구','영도구','부산진구','동래구','남구','북구','해운대구','사하구','금정구','강서구','연제구','수영구','사상구','기장군'];
const DISTRICT_CODES = {
  중구: '21010', 서구: '21020', 동구: '21030', 영도구: '21040', 부산진구: '21050',
  동래구: '21060', 남구: '21070', 북구: '21080', 해운대구: '21090', 사하구: '21100',
  금정구: '21110', 강서구: '21120', 연제구: '21130', 수영구: '21140', 사상구: '21150', 기장군: '21310',
};

export default function GroupDetailScreen({ user, group, onBack, onAssign, onTeamLocations, onPublicData, onUpdatedGroup }) {
  const [detail, setDetail] = useState(group || null);
  const [inviteId, setInviteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamAlerts, setTeamAlerts] = useState(true);
  const [activityAlerts, setActivityAlerts] = useState(true);
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionSaving, setRegionSaving] = useState(false);
  const [draftDistrict, setDraftDistrict] = useState(group?.regionSigungu || '');

  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;
    try {
      const data = await groupApi(`/api/groups/${group.groupId}?userId=${user.userId}`);
      setDetail(data);
      onUpdatedGroup?.(data);
    } catch (error) {
      showAlert('그룹 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [group?.groupId, user?.userId]);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!inviteId.trim() || inviting) return;
    try {
      setInviting(true);
      await groupApi(`/api/groups/${group.groupId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ inviterUserId: user.userId, inviteeLoginId: inviteId.trim() }),
      });
      showAlert('초대 완료', `${inviteId.trim()} 사용자에게 초대를 보냈습니다.`);
      setInviteId('');
      setInviteOpen(false);
    } catch (error) {
      showAlert('초대 실패', error.message);
    } finally {
      setInviting(false);
    }
  };

  const saveRegion = async () => {
    if (!draftDistrict || regionSaving) return;
    try {
      setRegionSaving(true);
      const data = await groupApi(`/api/groups/${group.groupId}/region`, {
        method: 'PATCH',
        body: JSON.stringify({
          leaderUserId: user.userId,
          regionSido: '부산광역시',
          regionSigungu: draftDistrict,
          regionAdmCode: DISTRICT_CODES[draftDistrict],
        }),
      });
      const next = { ...detail, ...data };
      setDetail(next);
      onUpdatedGroup?.(next);
      setRegionOpen(false);
      showAlert('활동지역 변경 완료', `부산광역시 ${draftDistrict}로 변경했습니다.`);
    } catch (error) {
      showAlert('활동지역 변경 실패', error.message);
    } finally {
      setRegionSaving(false);
    }
  };

  const members = detail?.members || [];
  const assignments = detail?.assignments || [];
  const isLeader = detail?.role === 'LEADER';
  const groupName = detail?.groupName || group?.groupName || '그룹';
  const regionSido = detail?.regionSido || '부산광역시';
  const regionSigungu = detail?.regionSigungu || '';
  const leaderName = detail?.leaderName || detail?.leaderLoginId || members.find((member) => member.role === 'LEADER')?.name || '-';
  const dongs = useMemo(() => [...new Set(assignments.map((item) => item.adminDong || item.admin_dong || item.admDong || '').filter(Boolean))], [assignments]);
  const openPublicData = () => {
    if (regionSigungu && (detail?.regionAdmCode || DISTRICT_CODES[regionSigungu])) {
      onPublicData?.(detail);
      return;
    }
    if (isLeader) {
      setDraftDistrict('');
      setRegionOpen(true);
      return;
    }
    showAlert('활동지역 미설정', '그룹장에게 활동 구·군 설정을 요청하세요.');
  };

  if (loading) return <View style={styles.container}><ScreenHeader title="그룹 설정" subtitle="팀원과 지역 업무를 효율적으로 관리하세요." onBack={onBack} /><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>그룹 정보를 불러오는 중입니다.</Text></View></View>;

  return <View style={styles.container}>
    <ScreenHeader title="그룹 설정" subtitle="팀원과 지역 업무를 효율적으로 관리하세요." onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <CardTitle icon="people" title="기본 정보" />
        <InfoRow icon="pricetag" label="그룹명" value={groupName} />
        <InfoRow icon="ribbon" label="그룹장" value={leaderName} />
        <InfoRow icon="location" label="활동 지역" value={regionSigungu ? `${regionSido} · ${regionSigungu}` : '활동지역 미설정'} last />
        {isLeader ? <SecondaryButton title={regionSigungu ? '활동지역 변경' : '활동지역 설정'} icon="location-outline" onPress={() => { setDraftDistrict(regionSigungu); setRegionOpen(true); }} style={styles.fullButton} /> : null}
        <SecondaryButton title="팀 방문지 지도 열기" icon="map-outline" onPress={() => onTeamLocations?.(detail)} style={styles.fullButton} />
      </View>

      <View style={styles.card}>
        <CardTitle icon="people" title="팀원 관리" suffix={`(${members.length}명)`} actionLabel={isLeader ? '팀원 추가' : undefined} onAction={() => setInviteOpen((value) => !value)} tone="teal" />
        {inviteOpen ? <View style={styles.inviteBox}><TextInput style={styles.inviteInput} value={inviteId} onChangeText={setInviteId} placeholder="상대방의 로그인 아이디" placeholderTextColor={colors.textFaint} autoCapitalize="none" /><PrimaryButton title={inviting ? '전송 중' : '초대'} onPress={invite} disabled={!inviteId.trim() || inviting} style={styles.inviteButton} /></View> : null}
        <View style={styles.memberList}>{members.map((member, index) => {
          const leader = member.role === 'LEADER';
          const assignedCount = assignments.filter((item) => Number(item.assigneeUserId) === Number(member.userId)).length;
          return <TouchableOpacity key={member.userId} style={[styles.memberRow, index > 0 && styles.divider]} activeOpacity={0.75} onPress={() => isLeader && onAssign?.(detail)}><View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }]}><Text style={styles.avatarText}>{String(member.name || member.loginId || '?').slice(0, 1)}</Text></View><View style={styles.memberInfo}><Text style={styles.memberName}>{member.name || member.loginId}</Text><Text style={[styles.memberRole, leader && styles.leaderRole]}>{leader ? '♛  그룹장' : `팀원${assignedCount ? ` · ${assignedCount}건 배정` : ''}`}</Text></View><View style={[styles.statusBadge, leader ? styles.statusGreen : assignedCount ? styles.statusBlue : styles.statusGray]}><View style={[styles.statusDot, leader ? styles.dotGreen : assignedCount ? styles.dotBlue : styles.dotGray]} /><Text style={[styles.statusText, leader ? styles.textGreen : assignedCount ? styles.textBlue : styles.textGray]}>{leader ? '관리 중' : assignedCount ? '업무 중' : '대기'}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textFaint} /></TouchableOpacity>;
        })}</View>
      </View>

      <View style={styles.managementGrid}>
        <TouchableOpacity style={styles.managementCard} activeOpacity={0.76} onPress={() => onAssign?.(detail)}>
          <View style={styles.managementIcon}><Ionicons name="map" size={22} color="#FFFFFF" /></View>
          <Text style={styles.managementTitle}>담당구역 관리</Text>
          <Text style={styles.managementDescription} numberOfLines={2}>{dongs.length ? `${dongs.length}개 행정동 담당 현황` : regionSigungu ? `${regionSigungu} 담당구역 설정` : '활동지역을 먼저 설정하세요'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} style={styles.managementArrow} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.managementCard, styles.publicManagementCard]} activeOpacity={0.76} onPress={openPublicData}>
          <View style={[styles.managementIcon, styles.managementIconTeal]}><Ionicons name="business" size={22} color="#FFFFFF" /></View>
          <Text style={styles.managementTitle}>지역 공공업무</Text>
          <Text style={styles.managementDescription} numberOfLines={2}>행정동·카테고리 선택 후 방문지 등록</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.teal} style={styles.managementArrow} />
        </TouchableOpacity>
      </View>

      {isLeader ? <View style={styles.card}>
        <CardTitle icon="settings" title="그룹 설정" />
        <SettingRow icon="notifications" title="팀 알림 받기" description="새로운 업무와 공지사항을 알려드립니다." value={teamAlerts} onValueChange={setTeamAlerts} />
        <SettingRow icon="people" title="팀원 활동 알림" description="팀원의 업무 시작과 완료 상태를 확인합니다." value={activityAlerts} onValueChange={setActivityAlerts} last />
      </View> : null}
    </ScrollView>
    <Modal visible={regionOpen} transparent animationType="fade" onRequestClose={() => setRegionOpen(false)}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRegionOpen(false)}>
        <View style={styles.regionSheet} onStartShouldSetResponder={() => true}>
          <View style={styles.regionSheetHeader}>
            <View><Text style={styles.regionSheetTitle}>활동 구·군 선택</Text><Text style={styles.regionSheetSub}>부산광역시의 담당 구·군을 선택하세요.</Text></View>
            <TouchableOpacity onPress={() => setRegionOpen(false)}><Ionicons name="close" size={22} color={colors.textSoft} /></TouchableOpacity>
          </View>
          <ScrollView style={styles.regionList}>
            {DISTRICTS.map((item) => <TouchableOpacity key={item} style={[styles.regionOption, draftDistrict === item && styles.regionOptionActive]} onPress={() => setDraftDistrict(item)}><Text style={[styles.regionOptionText, draftDistrict === item && styles.regionOptionTextActive]}>{item}</Text>{draftDistrict === item ? <Ionicons name="checkmark-circle" size={21} color={colors.primary} /> : null}</TouchableOpacity>)}
          </ScrollView>
          <PrimaryButton title={regionSaving ? '저장 중...' : '활동지역 저장'} onPress={saveRegion} disabled={!draftDistrict || regionSaving} />
        </View>
      </TouchableOpacity>
    </Modal>
  </View>;
}

function InfoRow({ icon, label, value, last }) { return <View style={[styles.infoRow, !last && styles.infoDivider]}><Ionicons name={icon} size={18} color={colors.primary} /><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={1}>{value}</Text></View>; }
function SettingRow({ icon, title, description, value, onValueChange, last }) { return <View style={[styles.settingRow, !last && styles.divider]}><Ionicons name={icon} size={21} color={colors.primary} /><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingDescription}>{description}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#CBD5E1', true: '#86B9FF' }} thumbColor={value ? colors.primary : '#FFFFFF'} /></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, body: { padding: 14, gap: 10, paddingBottom: 27 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, loadingText: { color: colors.textSoft, fontSize: 11 },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#E4ECF7', padding: 14, ...shadow },
  infoRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 }, infoDivider: { borderBottomWidth: 1, borderBottomColor: colors.line }, infoLabel: { width: 68, color: colors.textSoft, fontSize: 10.5 }, infoValue: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '900' }, fullButton: { marginTop: 8 },
  inviteBox: { marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 9 }, inviteInput: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, color: colors.text, fontSize: 12 }, inviteButton: { minHeight: 44, width: 74, borderRadius: 12, paddingHorizontal: 8 },
  memberList: { marginTop: 6 }, memberRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 }, divider: { borderTopWidth: 1, borderTopColor: colors.line }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }, avatarText: { color: colors.text, fontSize: 16, fontWeight: '900' }, memberInfo: { flex: 1 }, memberName: { color: colors.text, fontSize: 12.5, fontWeight: '900' }, memberRole: { color: colors.textSoft, fontSize: 9.5, marginTop: 3 }, leaderRole: { color: colors.primary, fontWeight: '800' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 }, statusGreen: { backgroundColor: colors.successSoft }, statusBlue: { backgroundColor: colors.primarySoft }, statusGray: { backgroundColor: '#F1F3F7' }, statusDot: { width: 7, height: 7, borderRadius: 4 }, dotGreen: { backgroundColor: colors.success }, dotBlue: { backgroundColor: colors.primary }, dotGray: { backgroundColor: '#98A4B8' }, statusText: { fontSize: 10, fontWeight: '800' }, textGreen: { color: '#07805D' }, textBlue: { color: colors.primary }, textGray: { color: colors.textSoft },
  managementGrid: { flexDirection: 'row', gap: 10 }, managementCard: { flex: 1, minHeight: 132, borderRadius: 18, padding: 14, backgroundColor: colors.surface, borderWidth: 1.3, borderColor: '#CFE0F6', ...shadow }, publicManagementCard: { borderColor: '#C9ECE9' }, managementIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, managementIconTeal: { backgroundColor: colors.teal }, managementTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 10 }, managementDescription: { color: colors.textSoft, fontSize: 9.5, lineHeight: 14, marginTop: 4, paddingRight: 14 }, managementArrow: { position: 'absolute', right: 12, bottom: 12 },
  settingRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2 }, settingTitle: { color: colors.text, fontSize: 12, fontWeight: '900' }, settingDescription: { color: colors.textSoft, fontSize: 9, lineHeight: 13, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 35, 72, 0.34)', justifyContent: 'flex-end' }, regionSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 28, maxHeight: '78%' }, regionSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }, regionSheetTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, regionSheetSub: { color: colors.textSoft, fontSize: 11, marginTop: 4 }, regionList: { maxHeight: 410, marginBottom: 14 }, regionOption: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, regionOptionActive: { backgroundColor: colors.primarySoft }, regionOptionText: { color: colors.text, fontSize: 13, fontWeight: '700' }, regionOptionTextActive: { color: colors.primary, fontWeight: '900' },
});
