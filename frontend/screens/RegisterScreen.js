import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import { colors, radius, shadow } from '../constants/design';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const REGIONS = ['부산광역시', '서울특별시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '제주특별자치도'];

export default function RegisterScreen({ onBack }) {
  const [loginId, setLoginId] = useState('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [workSido, setWorkSido] = useState('부산광역시');
  const [regionOpen, setRegionOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordMatches = Boolean(pw) && pw === pwConfirm;
  const canSubmit = Boolean(loginId.trim() && pw && pwConfirm && passwordMatches && !loading);

  const register = async () => {
    if (!loginId.trim() || !pw || !pwConfirm || loading) return;
    if (pw !== pwConfirm) return showAlert('비밀번호 확인', '비밀번호가 서로 일치하지 않습니다.');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginId.trim(), password: pw, name: loginId.trim(), workSido }),
      });
      if (!res.ok) throw new Error('회원가입 실패');
      showAlert('가입 완료', '등록한 계정으로 로그인할 수 있습니다.');
      onBack();
    } catch (error) {
      console.log(error);
      showAlert('회원가입 실패', '이미 존재하는 아이디이거나 서버 오류입니다.');
    } finally {
      setLoading(false);
    }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
    <ScreenHeader title="회원가입" subtitle="기본 정보와 근무지역을 등록합니다." onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>회원가입</Text>
        <Text style={styles.cardDescription}>외근도우미에서 사용할 계정을 만들어주세요.</Text>

        <Field label="아이디" icon="person" value={loginId} onChangeText={setLoginId} placeholder="아이디를 입력해주세요" autoCapitalize="none" helper="영문, 숫자를 사용해 입력해주세요." />
        <Field label="비밀번호" icon="lock-closed" value={pw} onChangeText={setPw} placeholder="비밀번호를 입력해주세요" secureTextEntry={!showPw} helper="영문, 숫자, 특수문자를 조합해 입력해주세요." right={<TouchableOpacity onPress={() => setShowPw((value) => !value)}><Ionicons name={showPw ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.textFaint} /></TouchableOpacity>} />
        <Field label="비밀번호 확인" icon="lock-closed" value={pwConfirm} onChangeText={setPwConfirm} placeholder="비밀번호를 다시 입력해주세요" secureTextEntry={!showPwConfirm} error={Boolean(pwConfirm) && !passwordMatches ? '비밀번호가 일치하지 않습니다.' : ''} right={<TouchableOpacity onPress={() => setShowPwConfirm((value) => !value)}><Ionicons name={showPwConfirm ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.textFaint} /></TouchableOpacity>} />

        <Text style={styles.label}>근무지역 <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity style={styles.regionButton} onPress={() => setRegionOpen(true)} activeOpacity={0.76}>
          <View style={styles.regionIcon}><Ionicons name="location" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={styles.regionSmall}>시·도</Text><Text style={styles.regionValue}>{workSido}</Text></View>
          <Ionicons name="chevron-down" size={19} color={colors.textSoft} />
        </TouchableOpacity>
        <View style={styles.infoRow}><Ionicons name="information-circle" size={17} color={colors.primary} /><Text style={styles.infoText}>세부 활동지역은 가입 후 그룹에서 설정할 수 있습니다.</Text></View>

        <PrimaryButton title={loading ? '가입 중...' : '회원가입'} icon="arrow-forward" onPress={register} disabled={!canSubmit} style={styles.submit} />
        <TouchableOpacity style={styles.loginLink} onPress={onBack}><Text style={styles.loginMuted}>이미 계정이 있나요?</Text><Text style={styles.loginText}>로그인</Text></TouchableOpacity>
      </View>
    </ScrollView>

    <Modal visible={regionOpen} transparent animationType="fade" onRequestClose={() => setRegionOpen(false)}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setRegionOpen(false)}>
        <View style={styles.sheet}><Text style={styles.sheetTitle}>근무지역 선택</Text>{REGIONS.map((region) => <TouchableOpacity key={region} style={styles.regionOption} onPress={() => { setWorkSido(region); setRegionOpen(false); }}><Text style={[styles.optionText, workSido === region && styles.optionActive]}>{region}</Text>{workSido === region ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}</TouchableOpacity>)}</View>
      </TouchableOpacity>
    </Modal>
  </KeyboardAvoidingView>;
}

function Field({ label, icon, helper, error, right, ...props }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={[styles.inputRow, error && styles.inputError]}><Ionicons name={icon} size={18} color={colors.textFaint} /><TextInput {...props} placeholderTextColor={colors.textFaint} style={styles.input} />{right}</View>{error ? <Text style={styles.errorText}>{error}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, body: { padding: 16, paddingBottom: 30 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, ...shadow }, cardTitle: { color: colors.text, fontSize: 24, fontWeight: '900' }, cardDescription: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 15 },
  field: { marginBottom: 12 }, label: { color: colors.text, fontSize: 12, fontWeight: '900', marginBottom: 6 }, required: { color: colors.danger }, inputRow: { height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF' }, inputError: { borderColor: colors.danger }, input: { flex: 1, color: colors.text, fontSize: 12.5 }, helper: { color: colors.textSoft, fontSize: 9.5, marginTop: 5 }, errorText: { color: colors.danger, fontSize: 9.5, marginTop: 5 },
  regionButton: { height: 54, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11 }, regionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, regionSmall: { color: colors.textSoft, fontSize: 8.5 }, regionValue: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 1 }, infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 }, infoText: { color: colors.textSoft, fontSize: 9.5 },
  submit: { marginTop: 17 }, loginLink: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 15 }, loginMuted: { color: colors.textSoft, fontSize: 11 }, loginText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,40,91,0.38)', justifyContent: 'center', padding: 24 }, sheet: { backgroundColor: colors.surface, borderRadius: radius.large, padding: 17 }, sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }, regionOption: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line }, optionText: { color: colors.textSoft, fontSize: 12 }, optionActive: { color: colors.primary, fontWeight: '900' },
});
