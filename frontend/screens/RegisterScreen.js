import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import { colors, radius } from '../constants/design';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const REGIONS = ['부산광역시', '서울특별시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '제주특별자치도'];

export default function RegisterScreen({ onBack }) {
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [workSido, setWorkSido] = useState('부산광역시');
  const [regionOpen, setRegionOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!loginId.trim() || !name.trim() || !pw || loading) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginId.trim(), password: pw, name: name.trim(), workSido }),
      });
      if (!res.ok) throw new Error('회원가입 실패');
      showAlert('가입 완료', '등록한 계정으로 로그인할 수 있습니다.');
      onBack();
    } catch (error) {
      console.log(error);
      showAlert('회원가입 실패', '이미 존재하는 아이디이거나 서버 오류입니다.');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScreenHeader title="회원가입" subtitle="기본 정보와 근무지역을 등록합니다" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>계정 정보</Text>
          <Field label="아이디" value={loginId} onChangeText={setLoginId} placeholder="로그인 아이디" autoCapitalize="none" />
          <Field label="이름" value={name} onChangeText={setName} placeholder="이름" />
          <Field label="비밀번호" value={pw} onChangeText={setPw} placeholder="비밀번호" secureTextEntry />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>근무지역</Text>
          <Text style={styles.help}>개인의 기본 근무지역입니다. 그룹 활동지역은 그룹 생성 시 구·군 단위로 따로 설정합니다.</Text>
          <TouchableOpacity style={styles.regionButton} onPress={() => setRegionOpen(true)}>
            <View style={styles.regionIcon}><Ionicons name="location-outline" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.regionLabel}>시·도</Text><Text style={styles.regionValue}>{workSido}</Text></View>
            <Ionicons name="chevron-down" size={19} color={colors.textSoft} />
          </TouchableOpacity>
        </View>

        <PrimaryButton title={loading ? '가입 중...' : '회원가입'} onPress={register} disabled={!loginId.trim() || !name.trim() || !pw || loading} />
      </ScrollView>

      <Modal visible={regionOpen} transparent animationType="fade" onRequestClose={() => setRegionOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setRegionOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>근무지역 선택</Text>
            {REGIONS.map((region) => <TouchableOpacity key={region} style={styles.regionOption} onPress={() => { setWorkSido(region); setRegionOpen(false); }}><Text style={[styles.optionText, workSido === region && styles.optionActive]}>{region}</Text>{workSido === region ? <Ionicons name="checkmark-circle" size={21} color={colors.primary} /> : null}</TouchableOpacity>)}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} placeholderTextColor={colors.textFaint} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, gap: 14, paddingBottom: 36 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.large, padding: 18, gap: 14 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  field: { gap: 7 }, label: { color: colors.textSoft, fontSize: 11, fontWeight: '800' },
  input: { height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, paddingHorizontal: 15, color: colors.text, backgroundColor: '#FBFCFB' },
  help: { color: colors.textSoft, fontSize: 11, lineHeight: 17 },
  regionButton: { height: 64, borderRadius: radius.medium, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12 },
  regionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  regionLabel: { color: colors.textSoft, fontSize: 10 }, regionValue: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,35,28,0.38)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.large, padding: 18 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 },
  regionOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line },
  optionText: { color: colors.textSoft, fontSize: 13 }, optionActive: { color: colors.primary, fontWeight: '900' },
});
