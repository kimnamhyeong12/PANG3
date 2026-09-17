import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BackButton, PrimaryButton } from '../components/ui';
import { groupApi } from '../utils/groupApi';

export default function GroupCreateScreen({ user, onBack, onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!name.trim() || !user?.userId || loading) return;

    try {
      setLoading(true);
      const data = await groupApi('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), userId: user.userId }),
      });
      Alert.alert('그룹 생성 완료', `${data.groupName} 그룹이 생성되었습니다.`);
      onCreated?.(data);
    } catch (error) {
      Alert.alert('그룹 생성 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CREATE TEAM</Text>
          <Text style={styles.title}>그룹 생성</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.label}>그룹 이름</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="예: 상수도 현장점검 A팀"
            style={styles.input}
            maxLength={50}
          />
          <Text style={styles.help}>
            그룹을 생성하면 {user?.name || user?.loginId || '현재 사용자'}님이 자동으로 팀장이 됩니다.
          </Text>
        </View>

        <PrimaryButton
          title={loading ? '생성 중...' : '그룹 만들기'}
          onPress={create}
          disabled={!name.trim() || loading}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: {
  flexDirection: 'row',
  gap: 12,
  alignItems: 'center',
  backgroundColor: '#FFFFFF',

  paddingHorizontal: 14,
  paddingTop: 30,
  paddingBottom: 14,

  borderBottomWidth: 1,
  borderBottomColor: '#D9E1EA',
},
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 17, fontWeight: '900', color: '#1F2D3D' },
  body: { padding: 16, gap: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#D9E1EA' },
  label: { fontSize: 12, fontWeight: '900', color: '#1F2D3D', marginBottom: 9 },
  input: {
    height: 52, borderWidth: 1, borderColor: '#D9E1EA', borderRadius: 14,
    paddingHorizontal: 14, backgroundColor: '#FFFFFF', fontSize: 13,
  },
  help: { fontSize: 10, color: '#718096', lineHeight: 16, marginTop: 10 },
});
