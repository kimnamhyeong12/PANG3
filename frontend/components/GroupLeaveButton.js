import React, { useState } from 'react';
import { Keyboard, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { groupApi } from '../utils/groupApi';
import { showAlert } from './CustomAlert';
import { colors } from '../constants/design';

export default function GroupLeaveButton({ group, user, onLeft }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) { setOpen(false); setPassword(''); Keyboard.dismiss(); } };
  const leave = async () => {
    if (!password || busy) return;
    setBusy(true);
    try {
      await groupApi(`/api/groups/${group.groupId}/members/me`, {
        method: 'DELETE', body: JSON.stringify({ userId: user.userId, password }),
      });
      setOpen(false); setPassword(''); Keyboard.dismiss();
      await onLeft?.(group.groupId);
    } catch (error) { showAlert('그룹 탈퇴 실패', error.message); }
    finally { setBusy(false); }
  };
  return <>
    <TouchableOpacity style={styles.leave} onPress={() => setOpen(true)}><Text style={styles.danger}>그룹 탈퇴</Text></TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <Text style={styles.title}>그룹 탈퇴</Text>
        <Text style={styles.description}>탈퇴하면 이 그룹의 작업을 볼 수 없습니다. 확인을 위해 비밀번호를 입력해 주세요.</Text>
        <TextInput style={styles.input} placeholder="현재 비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" editable={!busy} />
        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} disabled={busy} onPress={close}><Text>취소</Text></TouchableOpacity>
          <TouchableOpacity style={styles.action} disabled={!password || busy} onPress={leave}><Text style={[styles.danger, (!password || busy) && { opacity: 0.4 }]}>{busy ? '탈퇴 중…' : '그룹 탈퇴'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  leave: { padding: 16, alignItems: 'center' }, danger: { color: colors.danger, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' },
  dialog: { padding: 22, gap: 14, borderRadius: 18, backgroundColor: colors.surface },
  title: { fontSize: 18, fontWeight: '800', color: colors.text }, description: { color: colors.textSoft, lineHeight: 21 },
  input: { height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }, action: { padding: 12 },
});
