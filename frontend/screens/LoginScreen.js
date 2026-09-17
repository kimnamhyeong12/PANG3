import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/CustomAlert';
import { PrimaryButton } from '../components/ui';
import { colors, radius } from '../constants/design';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function LoginScreen({ onLogin, onRegister }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const login = async () => {
    if (!id.trim() || !pw || loading) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: id.trim(), password: pw }),
      });
      if (!res.ok) throw new Error('로그인 실패');
      onLogin(await res.json());
    } catch (error) {
      console.log(error);
      showAlert('로그인 실패', '아이디 또는 비밀번호를 확인해주세요.');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.logo}><Ionicons name="navigate" size={24} color="#FFFFFF" /></View>
          <View>
            <Text style={styles.brand}>외근도우미</Text>
            <Text style={styles.brandSub}>현장업무 관리</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>로그인</Text>
          <Text style={styles.description}>업무 계정으로 접속하세요.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>아이디</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={19} color={colors.textSoft} />
            <TextInput value={id} onChangeText={setId} placeholder="아이디 입력" placeholderTextColor={colors.textFaint} autoCapitalize="none" returnKeyType="next" style={styles.input} />
          </View>

          <Text style={styles.label}>비밀번호</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={19} color={colors.textSoft} />
            <TextInput value={pw} onChangeText={setPw} placeholder="비밀번호 입력" placeholderTextColor={colors.textFaint} secureTextEntry={!showPassword} returnKeyType="done" onSubmitEditing={login} style={styles.input} />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSoft} /></TouchableOpacity>
          </View>

          <PrimaryButton title={loading ? '로그인 중...' : '로그인'} onPress={login} disabled={!id.trim() || !pw || loading} style={styles.loginButton} />

          <TouchableOpacity style={styles.registerButton} onPress={onRegister} activeOpacity={0.7}>
            <Text style={styles.registerMuted}>처음 사용하시나요?</Text>
            <Text style={styles.registerText}>회원가입</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 58, paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.text, fontSize: 20, fontWeight: '900' },
  brandSub: { color: colors.textSoft, fontSize: 11, marginTop: 2 },
  intro: { marginTop: 74, marginBottom: 30 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  description: { color: colors.textSoft, fontSize: 13, marginTop: 8 },
  form: { gap: 10 },
  label: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 4 },
  inputRow: { height: 56, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  input: { flex: 1, color: colors.text, fontSize: 14 },
  loginButton: { marginTop: 12 },
  registerButton: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, padding: 10 },
  registerMuted: { color: colors.textSoft, fontSize: 12 },
  registerText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
});
