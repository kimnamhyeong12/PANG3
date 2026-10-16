import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { PrimaryButton } from './ui';
import { colors } from '../constants/design';

export default function AccountRecovery({ mode = 'email' }) {
  const [email, setEmail] = useState('');
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const forgot = mode === 'forgot';
  const submit = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/${forgot ? 'password/forgot' : 'email/request'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), [forgot ? 'loginId' : 'password']: credential }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '요청을 처리하지 못했습니다.');
      setMessage(result.message); setCredential('');
    } catch (error) { setMessage(error.message || '연결을 확인해 주세요.'); }
    finally { setBusy(false); }
  };
  const input = { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceMuted, minHeight: 48, borderRadius: 10, padding: 12, color: colors.text };
  return <View style={{ gap: 12, padding: 16 }}>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>{forgot ? '비밀번호 찾기' : '복구 이메일 등록·변경'}</Text>
    <Text style={{ color: colors.textSoft }}>{forgot ? '아이디와 인증한 이메일을 입력해 주세요.' : '메일의 인증 링크를 열면 복구 이메일이 등록됩니다.'}</Text>
    <Text>{forgot ? '아이디' : '현재 비밀번호'}</Text>
    <TextInput accessibilityLabel={forgot ? '아이디' : '현재 비밀번호'} style={input} value={credential} onChangeText={setCredential} secureTextEntry={!forgot} autoCapitalize="none" editable={!busy} />
    <Text>이메일</Text>
    <TextInput accessibilityLabel="이메일" style={input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!busy} />
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSoft }}>{message}</Text>}
    <PrimaryButton title={busy ? '메일 요청 중…' : forgot ? '재설정 메일 받기' : '인증 메일 받기'} disabled={busy || !email.trim() || !credential} onPress={submit} />
  </View>;
}
