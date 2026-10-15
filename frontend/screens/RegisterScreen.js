import { apiFetch as fetch } from '../utils/auth';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import { colors, shadow } from '../constants/design';
import WorkplaceField from '../components/WorkplaceField';
import WorkRegionField from '../components/WorkRegionField';
import { emptyWorkRegion, isWorkRegionComplete, serializeWorkRegion } from '../utils/workRegion';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
export default function RegisterScreen({ onBack }) {
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [checkedId, setCheckedId] = useState('');
  const [idMessage, setIdMessage] = useState('');
  const [checkingId, setCheckingId] = useState(false);
  const currentId = useRef('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [region, setRegion] = useState(emptyWorkRegion);
  const workSido = region.sido;
  const workSigungu = serializeWorkRegion(region);
  const [workplace, setWorkplace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const passwordMatches = Boolean(pw) && pw === pwConfirm;
  const canSubmit = Boolean(name.trim() && checkedId === loginId.trim() && loginId.trim() && pw.trim() && pw.length >= 8 && pwConfirm && passwordMatches && isWorkRegionComplete(region) && !checkingId && !loading);

  const checkId = async () => {
    const value = loginId.trim();
    if (checkingId || !value) return;
    setCheckingId(true); setCheckedId(''); setIdMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login-id/availability?loginId=${encodeURIComponent(value)}`);
      const result = await response.json();
      if (currentId.current.trim() !== value) return;
      if (!response.ok) throw new Error(result.message || '아이디를 확인하지 못했습니다.');
      if (result.available) { setCheckedId(value); setIdMessage('사용할 수 있는 아이디입니다.'); }
      else setIdMessage('이미 사용 중인 아이디입니다.');
    } catch (error) { if (currentId.current.trim() === value) setIdMessage(error.message || '아이디를 확인하지 못했습니다.'); }
    finally { setCheckingId(false); }
  };

  const register = async () => {
    if (!canSubmit) return;
    if (pw !== pwConfirm) return showAlert('비밀번호 확인', '비밀번호가 서로 일치하지 않습니다.');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginId.trim(), password: pw, email: email.trim(), name: name.trim(), workSido, workSigungu, ...workplace }),
      });
      if (!res.ok) { const result = await res.json().catch(() => null); throw new Error(result?.message || '회원가입 실패'); }
      showAlert('가입 완료', '회원가입이 완료되었습니다. 등록한 아이디로 로그인해 주세요.');
      onBack();
    } catch (error) {
      console.log(error);
      showAlert('회원가입 실패', error.message || '입력한 정보와 서버 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
    <ScreenHeader title="회원가입" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.card}>

        <Field label="아이디" required icon="person" value={loginId} onChangeText={value => { currentId.current = value; setLoginId(value); setCheckedId(''); setIdMessage(''); }} placeholder="아이디를 입력해주세요" autoCapitalize="none" error={idMessage && checkedId !== loginId.trim() ? idMessage : ''} helper={idMessage || '영문·숫자 등 3~50자로 입력해주세요.'} right={<TouchableOpacity onPress={checkId} disabled={checkingId || !loginId.trim()} style={styles.idCheck}><Text style={styles.idCheckText}>{checkingId ? '확인 중' : '중복 확인'}</Text></TouchableOpacity>} />
        <Field label="이름" required icon="person-outline" value={name} onChangeText={setName} placeholder="이름을 입력해주세요" maxLength={50} />
        <Field label="비밀번호" required icon="lock-closed" value={pw} onChangeText={setPw} placeholder="비밀번호를 입력해주세요" secureTextEntry={!showPw} helper="영문, 숫자, 특수문자를 조합해 입력해주세요." right={<TouchableOpacity onPress={() => setShowPw((value) => !value)}><Ionicons name={showPw ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.textFaint} /></TouchableOpacity>} />
        <Field label="비밀번호 확인" required icon="lock-closed" value={pwConfirm} onChangeText={setPwConfirm} placeholder="비밀번호를 다시 입력해주세요" secureTextEntry={!showPwConfirm} error={Boolean(pwConfirm) && !passwordMatches ? '비밀번호가 일치하지 않습니다.' : ''} right={<TouchableOpacity onPress={() => setShowPwConfirm((value) => !value)}><Ionicons name={showPwConfirm ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.textFaint} /></TouchableOpacity>} />

        <WorkRegionField value={region} onChange={setRegion} disabled={loading} required />

        <WorkplaceField value={workplace} onChange={setWorkplace} disabled={loading} />

        <Field label="이메일" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="이메일 주소" keyboardType="email-address" autoCapitalize="none" />

        <PrimaryButton title={loading ? '가입 중...' : '회원가입'} icon="arrow-forward" onPress={register} disabled={!canSubmit} style={styles.submit} />
        <TouchableOpacity style={styles.loginLink} onPress={onBack}><Text style={styles.loginMuted}>이미 계정이 있나요?</Text><Text style={styles.loginText}>로그인</Text></TouchableOpacity>
      </View>
    </ScrollView>


  </KeyboardAvoidingView>;
}

function Field({ label, required, icon, helper, error, right, ...props }) {
  return <View style={styles.field}><Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text><View style={[styles.inputRow, error && styles.inputError]}><Ionicons name={icon} size={18} color={colors.textFaint} /><TextInput {...props} placeholderTextColor={colors.textFaint} style={styles.input} />{right}</View>{error ? <Text style={styles.errorText}>{error}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, body: { padding: 16, paddingBottom: 30 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, ...shadow },
  field: { marginBottom: 12 }, label: { color: colors.text, fontSize: 12, fontWeight: '900', marginBottom: 6 }, required: { color: colors.danger }, inputRow: { height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF' }, inputError: { borderColor: colors.danger }, input: { flex: 1, color: colors.text, fontSize: 12.5 }, helper: { color: colors.textSoft, fontSize: 9.5, marginTop: 5 }, errorText: { color: colors.danger, fontSize: 9.5, marginTop: 5 },
  idCheck: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }, idCheckText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  submit: { marginTop: 17 }, loginLink: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 15 }, loginMuted: { color: colors.textSoft, fontSize: 11 }, loginText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
});
