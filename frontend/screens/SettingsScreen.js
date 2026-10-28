import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Linking, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader, PrimaryButton } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { colors } from '../constants/design';
import { useScreenBackHandler } from '../utils/screenBack';
import SupportInquiryPanel from '../components/SupportInquiryPanel';
import CustomerSupportContent from '../components/CustomerSupportContent';
import AppInfoContent from '../components/AppInfoContent';
import AccountManagementScreen from './AccountManagementScreen';
import SocialAuthButtons from '../components/SocialAuthButtons';
import { checkNotificationPermission, requestNotificationPermission, getTaskNotificationPreference, setTaskNotificationPreference } from '../services/notificationService';

export { REGIONS, DISTRICTS_BY_REGION } from '../utils/workRegion';

export default function SettingsScreen({ user, onBack, onUpdatedUser, onLogout, onDeleteAccount }) {
  const [supportSending, setSupportSending] = useState(false);
  const [gate, setGate] = useState(false), [password, setPassword] = useState(''), [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false), [detail, setDetail] = useState(null), [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState(''), [enabled, setEnabled] = useState(null), [notificationBusy, setNotificationBusy] = useState(true);
  useEffect(() => { let active = true; setEnabled(null); setNotificationBusy(true); Promise.all([getTaskNotificationPreference(user.userId), checkNotificationPermission()]).then(([preferred, granted]) => { if (active) setEnabled(preferred && granted); }).catch(() => { if (active) setEnabled(false); }).finally(() => { if (active) setNotificationBusy(false); }); return () => { active = false; }; }, [user.userId]);
  useScreenBackHandler(() => { if (!credential) return false; setCredential(''); return true; }, !!credential);
  const verify = async () => {
    if (busy || !password) return; setBusy(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/users/${user.userId}/account/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || '비밀번호를 확인해 주세요.');
      onUpdatedUser({ ...user, ...result }); setCredential(password); setPassword(''); setGate(false);
    } catch (error) { showAlert('비밀번호 확인', error.message); } finally { setBusy(false); }
  };
  const toggleNotifications = async value => {
    if (notificationBusy) return; setNotificationBusy(true);
    try {
      if (value && !await requestNotificationPermission()) { showAlert('알림 권한', '휴대폰 설정에서 알림을 허용해 주세요.', [{ text: '닫기' }, { text: '설정 열기', onPress: () => Linking.openSettings() }]); return; }
      await setTaskNotificationPreference(user.userId, value); setEnabled(value);
    } catch (error) { showAlert('알림 설정 실패', '다시 시도해 주세요.'); } finally { setNotificationBusy(false); }
  };
  const removeAccount = async () => {
    if (busy || !deletePassword) return; setBusy(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/account`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: user.loginId, password: deletePassword }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || '계정을 탈퇴하지 못했습니다.');
      setDeleteOpen(false); setDeletePassword(''); (onDeleteAccount || onLogout)();
    } catch (error) { showAlert('계정 탈퇴 실패', error.message); } finally { setBusy(false); }
  };
  if (credential) return <AccountManagementScreen user={user} credential={credential} onBack={() => setCredential('')} onUpdatedUser={onUpdatedUser} onLogout={onLogout} />;
  const row = (icon, title, onPress, danger = false) => <TouchableOpacity style={styles.row} onPress={onPress}><Ionicons name={icon} size={21} color={danger ? colors.danger : colors.primary} /><Text style={[styles.rowText, danger && { color: colors.danger }]}>{title}</Text><Ionicons name="chevron-forward" size={17} color={colors.textFaint} /></TouchableOpacity>;
  const closeDetail = () => { if (!supportSending) setDetail(detail === 'inquiry' ? 'support' : detail === 'licenses' ? 'version' : null); };
  const closeGate = () => { if (!busy) { setGate(false); setPassword(''); } };
  return <View style={styles.container}><ScreenHeader root title="설정" onBack={onBack} /><ScrollView contentContainerStyle={[styles.body, styles.rootBody]}>
    <View style={styles.profile}><View style={styles.avatar}><Text style={styles.avatarText}>{String(user.name || user.loginId).slice(0, 1)}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{user.name || user.loginId}</Text><Text style={styles.id}>@{user.loginId}</Text></View><TouchableOpacity style={styles.manage} onPress={() => setGate(true)}><Text style={styles.manageText}>관리</Text></TouchableOpacity></View>
    <Text style={styles.sectionLabel}>간편 로그인 연결</Text>
    <SocialAuthButtons mode="link" />
    <Text style={styles.sectionLabel}>알림</Text>
    <View style={styles.card}><View style={styles.row}><Ionicons name="notifications-outline" size={21} color={colors.primary} /><Text style={styles.rowText}>업무 알림</Text>{enabled === null ? <View style={{ width: 52, height: 32 }} accessibilityLabel="알림 설정 불러오는 중" /> : <Switch value={enabled} disabled={notificationBusy} onValueChange={toggleNotifications} thumbColor={colors.primary} trackColor={{ true: '#B9D9FF', false: '#DFE8F4' }} />}</View></View>
    <Text style={styles.sectionLabel}>서비스 안내</Text>
    <View style={styles.card}>{row('megaphone-outline', '공지사항', () => setDetail('notice'))}{row('help-circle-outline', '고객센터', () => setDetail('support'))}{row('information-circle-outline', '앱 정보', () => setDetail('version'))}</View>
    <View style={styles.card}>{row('log-out-outline', '로그아웃', () => showAlert('로그아웃', '현재 계정에서 로그아웃할까요?', [{ text: '취소' }, { text: '로그아웃', onPress: onLogout }]))}{row('person-remove-outline', '계정 탈퇴', () => setDeleteOpen(true), true)}</View>
  </ScrollView>
  <Modal visible={gate || deleteOpen} transparent animationType="fade" onRequestClose={() => { if (!busy) { closeGate(); setDeleteOpen(false); setDeletePassword(''); } }}>
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} accessibilityLabel="계정 확인 닫기" onPress={() => { if (!busy) { closeGate(); setDeleteOpen(false); setDeletePassword(''); } }} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{deleteOpen ? '계정 탈퇴' : '본인 확인'}</Text>
        <Text style={styles.help}>{deleteOpen ? '탈퇴하면 로그인할 수 없습니다. 그룹 보고서는 탈퇴한 사용자 기록으로 남습니다.' : '비밀번호 또는 연결된 소셜 계정으로 인증해 주세요.'}</Text>
        {user.passwordLoginEnabled !== false && <TextInput style={styles.input} value={deleteOpen ? deletePassword : password} onChangeText={deleteOpen ? setDeletePassword : setPassword} secureTextEntry editable={!busy} placeholder="현재 비밀번호" />}
        <SocialAuthButtons mode="verify" disabled={busy} onVerified={token => {
          if (deleteOpen) setDeletePassword(token);
          else { setCredential(token); setPassword(''); setGate(false); }
        }} />
        {deletePassword.startsWith('social:') && deleteOpen && <Text style={{ color: colors.successInk }}>소셜 계정 인증 완료</Text>}
        {(deleteOpen || user.passwordLoginEnabled !== false) && <PrimaryButton title={busy ? '확인 중…' : deleteOpen ? '계정 탈퇴' : '비밀번호로 확인'} disabled={busy || !(deleteOpen ? deletePassword : password)} onPress={deleteOpen ? removeAccount : verify} />}
        <TouchableOpacity style={styles.cancel} disabled={busy} onPress={() => { closeGate(); setDeleteOpen(false); setDeletePassword(''); }}><Text>취소</Text></TouchableOpacity>
      </View>
    </View>
  </Modal>
  <Modal visible={!!detail} statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={closeDetail}>
    <SafeAreaProvider>
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={detail === 'notice' ? '공지사항' : detail === 'version' ? '앱 정보' : detail === 'licenses' ? '오픈소스 라이선스' : detail === 'inquiry' ? '문의하기' : '고객센터'} onBack={closeDetail} />
      <ScrollView key={detail} style={styles.detailScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {detail === 'notice' ? <Text style={styles.help}>등록된 공지사항이 없습니다.</Text>
          : detail === 'inquiry' ? <SupportInquiryPanel key={user.userId} user={user} onBusyChange={setSupportSending} />
          : detail === 'version' || detail === 'licenses' ? <AppInfoContent key={detail} page={detail} onLicenses={() => setDetail('licenses')} />
          : <CustomerSupportContent onInquiry={() => setDetail('inquiry')} />}
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
    </SafeAreaProvider>
  </Modal>
  </View>;
}
const styles = StyleSheet.create({
  detailScroll: { flex: 1 },
  sectionLabel: { fontSize: 12, color: colors.textSoft, marginBottom: -12 },
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0 }, body: {   paddingBottom: 30, padding: 20, gap: 20, },
  rootBody: {paddingTop: 16, },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12,   padding: 16,  borderColor: colors.line, backgroundColor: colors.primarySoft, borderWidth: 0, borderRadius: 16, }, avatar: {     alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 23, width: 46, height: 46, }, avatarText: { color: colors.primary, fontWeight: '900', fontSize: 20 }, name: { color: colors.text,  fontWeight: '900', fontSize: 16, }, id: { color: colors.textSoft, marginTop: 4, fontSize: 12 }, manage: { paddingHorizontal: 12, minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' }, manageText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  card: { backgroundColor: colors.surface,    borderColor: colors.line, borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 0, }, row: {  flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, }, rowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' }, overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,40,91,0.38)' }, sheet: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, gap: 14 }, sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' }, help: { color: colors.textSoft, fontSize: 13, lineHeight: 21, paddingVertical: 14 }, input: { height: 48, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.text, backgroundColor: colors.surfaceMuted, minHeight: 48, }, cancel: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
