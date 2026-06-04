import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { PrimaryButton } from '../components/ui';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function LoginScreen({ onLogin, onRegister }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!id || !pw || loading) return;

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loginId: id,
          password: pw,
        }),
      });

      if (!res.ok) {
        throw new Error('로그인 실패');
      }

      const data = await res.json();

      console.log('로그인 성공:', data);

      onLogin(data);
    } catch (error) {
      console.log(error);
      Alert.alert('로그인 실패', '아이디 또는 비밀번호를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>SG</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SAHA-GU OFFICE</Text>
          <Text style={styles.title}>외근 업무 지원 시스템</Text>
          <Text style={styles.desc}>스마트 현장 순회 및 보고 자동화 시스템</Text>
          <Text style={styles.sub}>FIELDWORK ASSISTANT</Text>
        </View>
      </View>

      <View style={styles.loginArea}>
        <Text style={styles.section}>SECURE LOGIN</Text>
        <Text style={styles.loginTitle}>직원 로그인</Text>

        <Text style={styles.label}>직원번호 또는 업무용 이메일</Text>
        <TextInput
          value={id}
          onChangeText={setId}
          placeholder="예: saha2026 또는 name@saha.go.kr"
          autoCapitalize="none"
          style={styles.input}
        />

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          value={pw}
          onChangeText={setPw}
          placeholder="비밀번호 입력"
          secureTextEntry
          style={styles.input}
        />

        <PrimaryButton
          title={loading ? '인증 중...' : '로그인'}
          onPress={login}
          disabled={!id || !pw || loading}
        />

        <Text style={styles.registerText} onPress={onRegister}>
          계정이 없으신가요? 회원가입
        </Text>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            본 시스템은 사하구청 외근 담당자 전용 시스템입니다. 모든 접속 기록은 보안 정책에 따라 저장됩니다.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA', paddingHorizontal: 28 },
  header: { flexDirection: 'row', gap: 14, paddingTop: 44, paddingBottom: 28 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#12395B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: 'white', fontWeight: '900', fontSize: 18 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: '#607086',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#1F2D3D', marginTop: 5 },
  desc: { fontSize: 10, color: '#718096', marginTop: 4 },
  sub: {
    marginTop: 14,
    fontSize: 10,
    letterSpacing: 2.7,
    fontWeight: '700',
    color: '#5E7B95',
  },
  loginArea: { flex: 1 },
  section: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: '#607086',
  },
  loginTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2D3D',
    marginTop: 4,
    marginBottom: 20,
  },
  label: { fontSize: 11, fontWeight: '800', color: '#607086', marginBottom: 8 },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D9E1EA',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 16,
    fontSize: 13,
  },
  registerText: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: '#12395B',
  },
  notice: {
    marginTop: 22,
    backgroundColor: '#EAF1F7',
    borderWidth: 1,
    borderColor: '#D9E1EA',
    borderRadius: 14,
    padding: 14,
  },
  noticeText: { fontSize: 10, lineHeight: 17, color: '#607086' },
});