import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../utils/api';
import { apiFetch } from '../utils/auth';
import { performSocialAuth } from '../utils/socialAuth';
import { showAlert } from './CustomAlert';
import { colors } from '../constants/design';

export default function SocialAuthButtons({ mode = 'login', onLogin, onVerified, onLinked, disabled = false }) {
  const [providers, setProviders] = useState(null);
  const [linked, setLinked] = useState([]);
  const [pending, setPending] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const controller = useRef(null);
  useEffect(() => {
    const abort = new AbortController();
    let mounted = true;
    const timer = setTimeout(() => { if (mounted) setLoadFailed(true); abort.abort(); }, 12000);
    setLoadFailed(false);
    Promise.all([
      fetch(`${API_BASE_URL}/api/auth/social/providers`, { signal: abort.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }),
      mode !== 'login' ? apiFetch(`${API_BASE_URL}/api/auth/social/identities`, { signal: abort.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }) : Promise.resolve([]),
    ]).then(([available, identities]) => { if (!abort.signal.aborted) { setProviders(available); setLinked(identities); } })
      .catch(() => { if (!abort.signal.aborted) setLoadFailed(true); })
      .finally(() => clearTimeout(timer));
    return () => { mounted = false; clearTimeout(timer); abort.abort(); };
  }, [mode, reload]);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => { controller.current?.abort(); setPending(''); };
  const start = async provider => {
    if (controller.current || disabled) return;
    const abort = new AbortController(); controller.current = abort; setPending(provider);
    try {
      const result = await performSocialAuth(provider, mode, abort.signal);
      if (abort.signal.aborted) return;
      controller.current = null;
      if (mode === 'login') onLogin?.(result);
      else if (mode === 'verify') onVerified?.(result.verificationToken);
      else { setReload(value => value + 1); onLinked?.(result); showAlert('연결 완료', '이 소셜 계정으로 기존 방문지와 보고서를 이용할 수 있습니다.'); }
    } catch (error) { if (!abort.signal.aborted) showAlert('소셜 로그인', error.message); }
    finally { if (controller.current === abort) controller.current = null; setPending(''); }
  };
  return <View style={{ gap: 10 }}>
    {['google', 'kakao'].filter(provider => mode !== 'verify' || linked.includes(provider)).map(provider => {
      const name = provider === 'google' ? 'Google' : '카카오';
      const connected = mode === 'link' && linked.includes(provider);
      return <Pressable key={provider} accessibilityRole="button" disabled={disabled || !!pending || !providers?.[provider] || connected}
        accessibilityLabel={`${name}${mode === 'link' ? ' 계정 연결' : '로 계속하기'}`} onPress={() => start(provider)}
        style={[styles.button, provider === 'kakao' && { backgroundColor: '#FEE500', borderColor: '#FEE500' }, (!providers?.[provider] || disabled || connected) && { opacity: 0.5 }]}>
        <Ionicons name={provider === 'google' ? 'logo-google' : 'chatbubble'} size={20} color={provider === 'google' ? '#4285F4' : '#191919'} />
        <Text style={styles.label}>{name}{connected ? ' 연결됨' : mode === 'link' ? ' 계정 연결' : '로 계속하기'}</Text>
        {providers && !providers[provider] && <Text style={{ fontSize: 11, color: colors.textSoft }}>준비 중</Text>}
      </Pressable>;
    })}
    {loadFailed && <Pressable onPress={() => setReload(value => value + 1)}><Text style={{ color: colors.primary, textAlign: 'center' }}>로그인 연결 다시 확인</Text></Pressable>}
    {mode === 'verify' && providers && !linked.length && <Text style={{ color: colors.textSoft }}>연결된 소셜 계정이 없습니다.</Text>}
    <Modal visible={!!pending} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="소셜 로그인 취소" /><View style={styles.sheet}>
        <ActivityIndicator color={colors.primary} /><Text style={styles.label}>브라우저에서 인증 후 앱으로 돌아와 주세요.</Text>
        <Pressable onPress={cancel} style={{ padding: 14 }}><Text style={{ color: colors.primary }}>취소</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  button: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', borderRadius: 14 },
  label: { color: '#191919', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#10285B66' },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, gap: 18, alignItems: 'center' },
});
