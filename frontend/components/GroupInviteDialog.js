import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton, ScreenHeader } from './ui';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';
export default function GroupInviteDialog({ token, user, onClose, onJoined }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => { let active = true; setLoading(true); setPreview(null); setError(''); groupApi(`/api/group-invite-links/${token}`).then(data => { if (active) setPreview(data); }).catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [token, user.userId, revision]);
  const join = async () => {
    if (lock.current || !preview) return; lock.current = true; setBusy(true); setError('');
    try { if (!preview.alreadyMember) await groupApi(`/api/group-invite-links/${token}/join`, { method: 'POST' }); await onJoined?.(); }
    catch (failure) { setError(failure.message); } finally { lock.current = false; setBusy(false); }
  };
  return <Modal visible statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaProvider><SafeAreaView edges={['bottom','left','right']} style={{ flex:1, backgroundColor:colors.background }}><ScreenHeader title="그룹 초대" onBack={() => { if (!busy) onClose(); }} /><View style={{ padding:24, gap:20 }}>
    {loading ? <Text>초대를 확인하고 있어요…</Text> : preview ? <><Text style={{ fontSize:24, fontWeight:'800', color:colors.text }}>{preview.groupName}</Text><Text style={{ color:colors.textSoft, lineHeight:23 }}>{preview.alreadyMember ? '이미 참여 중인 그룹입니다.' : '이 그룹에 참여하시겠어요? 참여 후 그룹의 공유 업무를 확인할 수 있습니다.'}</Text><PrimaryButton title={busy ? '참여 중…' : preview.alreadyMember ? '그룹 목록으로' : '참여하기'} disabled={busy} onPress={join} /></> : <SecondaryButton title="다시 확인" onPress={() => setRevision(value => value+1)} />}
    {!!error && <Text accessibilityRole="alert" style={{ color:colors.danger }}>{error}</Text>}<SecondaryButton title="닫기" disabled={busy} onPress={onClose} />
  </View></SafeAreaView></SafeAreaProvider></Modal>;
}
