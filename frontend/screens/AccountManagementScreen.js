import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ScreenHeader, PrimaryButton } from '../components/ui';
import WorkplaceField from '../components/WorkplaceField';
import { showAlert } from '../components/CustomAlert';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { colors } from '../constants/design';
import WorkRegionField from '../components/WorkRegionField';
import { parseWorkRegion, serializeWorkRegion, isOptionalWorkRegionValid } from '../utils/workRegion';

export default function AccountManagementScreen({ user, credential, onBack, onUpdatedUser, onLogout }) {
  const [name, setName] = useState(user.name || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [region, setRegion] = useState(() => parseWorkRegion(user.workSido, user.workSigungu));
  const sido = region.sido;
  const district = serializeWorkRegion(region);
  const [workplace, setWorkplace] = useState({ workplaceAddress: user.workplaceAddress || '', workplaceLat: user.workplaceLat, workplaceLng: user.workplaceLng });
  const [email, setEmail] = useState(user.email || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy || !name.trim() || !isOptionalWorkRegionValid(region)) return;
    if (password !== confirm) return showAlert('비밀번호 확인', '새 비밀번호가 서로 일치하지 않습니다.');
    setBusy(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/users/${user.userId}/account`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: credential, name: name.trim(), newPassword: password, workSido: sido, workSigungu: district, ...workplace }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '변경사항을 저장하지 못했습니다.');
      if (result.requiresLogin) { showAlert('비밀번호 변경 완료', '새 비밀번호로 다시 로그인해 주세요.'); onLogout(); }
      else { onUpdatedUser({ ...user, ...result }); showAlert('저장 완료', '계정 정보를 변경했습니다.'); onBack(); }
    } catch (error) { showAlert('저장 실패', error.message); }
    finally { setBusy(false); }
  };
  const changeEmail = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/email/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: credential, email: email.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '인증 메일을 보내지 못했습니다.');
      showAlert('인증 메일 발송', result.message || '메일의 인증 링크를 열면 이메일이 변경됩니다.');
    } catch (error) { showAlert('이메일 변경', error.message); }
    finally { setBusy(false); }
  };
  const field = (label, value, setter, props = {}) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={setter} editable={!busy} style={styles.input} {...props} /></View>;
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScreenHeader title="계정 관리" onBack={() => { if (!busy) onBack(); }} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.label}>아이디</Text><Text style={styles.id}>@{user.loginId}</Text>
        {field('이름', name, setName, { maxLength: 50, placeholder: '이름' })}
        {field('새 비밀번호', password, setPassword, { secureTextEntry: true, placeholder: '변경할 때만 입력하세요', autoCapitalize: 'none' })}
        {field('새 비밀번호 확인', confirm, setConfirm, { secureTextEntry: true, placeholder: '새 비밀번호를 다시 입력하세요', autoCapitalize: 'none' })}
        <WorkRegionField value={region} onChange={setRegion} disabled={busy} />
        <WorkplaceField value={workplace} onChange={setWorkplace} userId={user.userId} disabled={busy} />
        {field('이메일', email, setEmail, { keyboardType: 'email-address', autoCapitalize: 'none', placeholder: '이메일 주소' })}
        <TouchableOpacity disabled={busy || !email.trim() || email.trim() === user.email} onPress={changeEmail} style={styles.emailButton}><Text style={styles.emailText}>인증 메일 받기</Text></TouchableOpacity>
        <PrimaryButton title={busy ? '처리 중…' : '변경사항 저장'} onPress={save} disabled={busy || !name.trim() || !isOptionalWorkRegionValid(region) || password !== confirm} />
      </View>
    </ScrollView>

  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0 }, body: { padding: 16, paddingBottom: 30, paddingHorizontal: 20, },
  card: { backgroundColor: colors.surface,   borderColor: colors.line, padding: 18, gap: 12, borderWidth: 0, shadowOpacity: 0, elevation: 0, borderRadius: 16, }, field: { gap: 6 },
  label: { color: colors.text, fontSize: 12, fontWeight: '800' }, id: { color: colors.textSoft, marginBottom: 5 }, input: { height: 48, paddingHorizontal: 12,  borderWidth: 1, minHeight: 48, backgroundColor: colors.surfaceMuted, borderColor: colors.line, borderRadius: 12, fontSize: 14, color: colors.text, },
  emailButton: { minHeight: 40, alignSelf: 'flex-end', justifyContent: 'center' }, emailText: { color: colors.primary, fontWeight: '800' },
});
