import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, PrimaryButton } from '../components/ui';
import WorkplaceField from '../components/WorkplaceField';
import { showAlert } from '../components/CustomAlert';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { colors } from '../constants/design';

export default function AccountManagementScreen({ user, credential, regions, districtsByRegion, onBack, onUpdatedUser, onLogout }) {
  const [name, setName] = useState(user.name || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sido, setSido] = useState(user.workSido || '부산광역시');
  const [district, setDistrict] = useState(user.workSigungu || '');
  const [workplace, setWorkplace] = useState({ workplaceAddress: user.workplaceAddress || '', workplaceLat: user.workplaceLat, workplaceLng: user.workplaceLng });
  const [email, setEmail] = useState(user.email || '');
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
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
        <Text style={styles.label}>근무지역</Text>
        {['sido', 'district'].map(side => <TouchableOpacity key={side} style={styles.region} disabled={busy} onPress={() => setPicker(side)}>
          <View style={styles.regionIcon}><Ionicons name={side === 'sido' ? 'location' : 'navigate'} size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={styles.regionSmall}>{side === 'sido' ? '시·도' : '시·군·구'}</Text><Text style={styles.regionText}>{side === 'sido' ? sido : district || '구·군 선택'}</Text></View>
          <Ionicons name="chevron-down" size={18} color={colors.textSoft} />
        </TouchableOpacity>)}
        <WorkplaceField value={workplace} onChange={setWorkplace} userId={user.userId} disabled={busy} />
        {field('이메일', email, setEmail, { keyboardType: 'email-address', autoCapitalize: 'none', placeholder: '이메일 주소' })}
        <TouchableOpacity disabled={busy || !email.trim() || email.trim() === user.email} onPress={changeEmail} style={styles.emailButton}><Text style={styles.emailText}>인증 메일 받기</Text></TouchableOpacity>
        <PrimaryButton title={busy ? '처리 중…' : '변경사항 저장'} onPress={save} disabled={busy || !name.trim() || !district || !workplace?.workplaceAddress || password !== confirm} />
      </View>
    </ScrollView>
    <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}><View style={styles.overlay}><TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} /><View style={styles.sheet}><Text style={styles.label}>{picker === 'sido' ? '시·도 선택' : '구·군 선택'}</Text><ScrollView>{(picker === 'sido' ? regions : districtsByRegion[sido] || []).map(value => <TouchableOpacity key={value} style={styles.option} onPress={() => { if (picker === 'sido') { setSido(value); setDistrict(''); } else setDistrict(value); setPicker(null); }}><Text>{value}</Text></TouchableOpacity>)}</ScrollView></View></View></Modal>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, marginTop: -15 }, body: { padding: 16, paddingBottom: 30 },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 12 }, field: { gap: 6 },
  label: { color: colors.text, fontSize: 12, fontWeight: '800' }, id: { color: colors.textSoft, marginBottom: 5 }, input: { height: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, color: colors.text, backgroundColor: '#FFFFFF' },
  region: { minHeight: 54, gap: 10, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, regionText: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 1 }, regionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, regionSmall: { color: colors.textSoft, fontSize: 8.5 },
  emailButton: { minHeight: 40, alignSelf: 'flex-end', justifyContent: 'center' }, emailText: { color: colors.primary, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,40,91,0.38)' }, sheet: { maxHeight: '70%', padding: 18, backgroundColor: colors.surface, borderRadius: 18 }, option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
});
