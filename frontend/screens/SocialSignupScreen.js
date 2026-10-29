import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenHeader, PrimaryButton } from '../components/ui';
import WorkRegionField from '../components/WorkRegionField';
import WorkplaceField from '../components/WorkplaceField';
import { colors } from '../constants/design';
import { API_BASE_URL } from '../utils/api';
import { apiFetch } from '../utils/auth';
import { isOptionalWorkRegionValid, parseWorkRegion, serializeWorkRegion } from '../utils/workRegion';

export default function SocialSignupScreen({ user, onComplete, onCancel }) {
  const [name, setName] = useState(user.name || '');
  const [region, setRegion] = useState(() => parseWorkRegion(user.workSido, user.workSigungu));
  const [workplace, setWorkplace] = useState(user.workplaceAddress ? {
    workplaceAddress: user.workplaceAddress, workplaceLat: user.workplaceLat, workplaceLng: user.workplaceLng,
  } : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const regionValid = isOptionalWorkRegionValid(region);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (!lock.current) onCancel(); return true; });
    return () => subscription.remove();
  }, [onCancel]);
  const submit = async () => {
    if (lock.current || !name.trim() || !regionValid) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/social/complete-profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), workSido: region.sido, workSigungu: serializeWorkRegion(region), ...workplace }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || '가입 정보를 저장하지 못했습니다. 다시 시도해 주세요.');
      if (!result || result.userId !== user.userId || result.socialProfilePending !== false) throw new Error('가입 완료 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
      onComplete(result);
    } catch (failure) { setError(failure.message || '가입 정보를 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScreenHeader title="가입 정보 확인" onBack={() => { if (!lock.current) onCancel(); }} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>소셜 계정 인증이 완료됐어요. 핀워크에서 사용할 정보를 확인해 주세요.</Text>
      <View style={styles.field}><Text style={styles.label}>이름 <Text style={styles.required}>*</Text></Text>
        <TextInput accessibilityLabel="이름" style={styles.input} value={name} onChangeText={setName} maxLength={50} editable={!busy} placeholder="사용할 이름을 입력해 주세요." placeholderTextColor={colors.textSoft} />
      </View>
      <WorkRegionField value={region} onChange={setRegion} disabled={busy} />
      {!regionValid && <Text style={styles.error}>근무지역을 끝까지 선택하거나 선택 해제해 주세요.</Text>}
      <WorkplaceField value={workplace} onChange={setWorkplace} userId={user.userId} disabled={busy} />
      <Text style={styles.help}>근무지역과 근무지는 나중에 설정에서도 등록할 수 있어요.</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <PrimaryButton title={busy ? '저장 중…' : '가입 완료'} onPress={submit} disabled={busy || !name.trim() || !regionValid} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, body: { padding: 20, paddingBottom: 32, gap: 18 },
  intro: { color: colors.textSoft, fontSize: 14, lineHeight: 23 }, field: { gap: 10 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' }, required: { color: colors.danger },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, color: colors.text, fontSize: 14 },
  help: { color: colors.textSoft, fontSize: 12, lineHeight: 20 }, error: { color: colors.danger, fontSize: 13, lineHeight: 21 },
});
