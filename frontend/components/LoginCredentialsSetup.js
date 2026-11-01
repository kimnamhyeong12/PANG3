import React, { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PrimaryButton } from './ui';
import SocialAuthButtons from './SocialAuthButtons';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { colors } from '../constants/design';
import { needsLoginSetup } from '../utils/accountIdentity';

export default function LoginCredentialsSetup({ user, onCompleted, onBusyChange }) {
  const setup = needsLoginSetup(user);
  const [loginId, setLoginId] = useState(setup ? '' : user.loginId), [checkedId, setCheckedId] = useState('');
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [checking, setChecking] = useState(false), [busy, setBusy] = useState(false), [authenticating, setAuthenticating] = useState(false);
  const [idMessage, setIdMessage] = useState(''), [error, setError] = useState('');
  const [credential,setCredential] = useState('');
  const currentId = useRef(setup ? '' : user.loginId), lock = useRef(false);
  const valid = checkedId && checkedId === loginId.trim() && checkedId !== user.loginId && (!setup || password.length >= 8 && password === confirm);
  const check = async () => {
    const value = loginId.trim();
    if (checking || !value) return;
    setChecking(true); setCheckedId(''); setIdMessage('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/login-id/availability?loginId=${encodeURIComponent(value)}`);
      const result = await response.json();
      if (currentId.current.trim() !== value) return;
      if (!response.ok) throw new Error(result.message || '아이디 중복 확인에 실패했습니다.');
      setCheckedId(result.available ? value : ''); setIdMessage(result.available ? '사용할 수 있는 아이디입니다.' : '이미 사용 중인 아이디입니다.');
    } catch (failure) { if (currentId.current.trim() === value) setIdMessage(failure.message); }
    finally { setChecking(false); }
  };
  const save = async credential => {
    if (lock.current || !valid) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/users/${user.userId}/login-credentials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: checkedId, password: setup ? password : undefined, credential }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '아이디·비밀번호를 설정하지 못했습니다.');
      setPassword(''); setConfirm(''); setAuthenticating(false); onCompleted();
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  };
  return <View style={styles.section}>
    <Text style={styles.title}>{setup ? '아이디·비밀번호 설정' : '아이디 변경'}</Text>
    {setup&&<Text style={styles.hint}>아이디·비밀번호 로그인을 추가합니다. 기존 Google·카카오 로그인도 계속 사용할 수 있습니다.</Text>}
    <Text style={styles.label}>아이디</Text>
    <View style={styles.row}><TextInput accessibilityLabel={setup ? "설정할 아이디" : "변경할 아이디"} style={[styles.input, styles.idInput]} value={loginId} autoCapitalize="none" autoCorrect={false} maxLength={50} editable={!busy && !authenticating} onChangeText={value => { currentId.current = value; setLoginId(value); setCheckedId(''); setIdMessage(''); }}/><TouchableOpacity accessibilityRole="button" accessibilityLabel="아이디 중복 확인" disabled={checking || busy || authenticating || !loginId.trim()} onPress={check} style={styles.check}><Text style={styles.checkText}>{checking ? '확인 중…' : '중복 확인'}</Text></TouchableOpacity></View>
    <Text style={styles.hint}>{idMessage || '영문·숫자 또는 _, ., -를 사용해 3~50자로 입력해 주세요.'}</Text>
    {setup&&<><Text style={styles.label}>비밀번호</Text><TextInput accessibilityLabel="설정할 비밀번호" style={styles.input} value={password} secureTextEntry autoCapitalize="none" editable={!busy && !authenticating} onChangeText={setPassword}/>
    <Text style={styles.label}>비밀번호 확인</Text><TextInput accessibilityLabel="설정할 비밀번호 확인" style={styles.input} value={confirm} secureTextEntry autoCapitalize="none" editable={!busy && !authenticating} onChangeText={setConfirm}/>
    {!!confirm && password !== confirm && <Text style={styles.error}>비밀번호가 서로 일치하지 않습니다.</Text>}
    </>}
    <PrimaryButton title={setup ? "아이디·비밀번호 설정" : "아이디 변경"} disabled={!valid || checking || busy || authenticating} onPress={() => { setError(''); setCredential(''); setAuthenticating(true); }}/>
    <Modal visible={authenticating} transparent animationType="fade" onRequestClose={() => !busy && setAuthenticating(false)}>
      <View style={styles.overlay}><View style={styles.sheet}>
        <Text style={styles.title}>{setup ? '연결된 계정으로 인증' : '아이디 변경 확인'}</Text><Text style={styles.hint}>{setup ? '가입하거나 연결한 Google·카카오 계정으로 인증하면 아이디·비밀번호가 저장됩니다.' : '현재 비밀번호 또는 연결된 Google·카카오 계정으로 인증해 주세요.'}</Text>
        {!setup&&<><TextInput accessibilityLabel="현재 비밀번호" style={styles.input} secureTextEntry autoCapitalize="none" value={credential} onChangeText={setCredential} editable={!busy}/><PrimaryButton title="인증 후 아이디 변경" disabled={busy||!credential} onPress={()=>save(credential)}/></>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {busy ? <Text>저장 중…</Text> : <SocialAuthButtons mode="verify" onVerified={save}/>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.cancel} onPress={() => setAuthenticating(false)}><Text>취소</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 12, paddingBottom: 18, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' }, label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  hint: { color: colors.textSoft, fontSize: 12, lineHeight: 20 }, error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' }, idInput: { flex: 1, minWidth: 0 },
  input: { height: 48, paddingHorizontal: 12, backgroundColor: colors.surfaceMuted, borderColor: colors.line, borderWidth: 1, borderRadius: 12, color: colors.text, fontSize: 14 },
  check: { paddingHorizontal: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, checkText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#10285B66' }, sheet: { backgroundColor: colors.surface, borderRadius: 18, padding: 22, gap: 16 },
  cancel: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
