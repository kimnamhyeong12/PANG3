import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../components/ui';
import { groupApi } from '../utils/groupApi';

export default function GroupInvitationsScreen({ user, onBack, onAccepted }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const load = useCallback(async () => {
    if (!user?.userId) return;
    try {
      const data = await groupApi(`/api/groups/invitations?userId=${user.userId}&status=PENDING`);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('초대 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const process = async (item, action) => {
    try {
      setProcessingId(item.invitationId);
      const data = await groupApi(
        `/api/groups/invitations/${item.invitationId}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({ userId: user.userId }),
        }
      );

      if (action === 'accept') {
        Alert.alert('초대 수락', `${item.groupName} 그룹에 가입했습니다.`);
        setItems((prev) => prev.filter((v) => v.invitationId !== item.invitationId));
        onAccepted?.(data);
      } else {
        setItems((prev) => prev.filter((v) => v.invitationId !== item.invitationId));
      }
    } catch (error) {
      Alert.alert('처리 실패', error.message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GROUP INVITATIONS</Text>
          <Text style={styles.title}>초대받기</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#12395B" /></View>
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="mail-open-outline" size={36} color="#8A98A8" />
            <Text style={styles.emptyTitle}>받은 초대가 없습니다</Text>
          </View>
        ) : (
          items.map((item) => {
            const busy = processingId === item.invitationId;
            return (
              <View key={item.invitationId} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconBox}>
                    <Ionicons name="people" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{item.groupName}</Text>
                    <Text style={styles.inviter}>
                      {item.inviterName || item.inviterLoginId}님이 초대했습니다
                    </Text>
                  </View>
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.rejectButton]}
                    onPress={() => process(item, 'reject')}
                    disabled={busy}
                  >
                    <Text style={styles.rejectText}>거절</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.acceptButton]}
                    onPress={() => process(item, 'accept')}
                    disabled={busy}
                  >
                    <Text style={styles.acceptText}>{busy ? '처리 중...' : '수락'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: {
    flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingHorizontal: 14, paddingTop: 30, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA',
  },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 17, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  body: { padding: 16, gap: 12 },
  loadingBox: { padding: 32, alignItems: 'center' },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#D9E1EA' },
  emptyTitle: { marginTop: 10, fontSize: 14, fontWeight: '900', color: '#1F2D3D' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#12395B', alignItems: 'center', justifyContent: 'center' },
  groupName: { fontSize: 15, fontWeight: '900', color: '#1F2D3D' },
  inviter: { fontSize: 10, color: '#718096', marginTop: 4 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { backgroundColor: '#EDF2F7' },
  acceptButton: { backgroundColor: '#12395B' },
  rejectText: { color: '#607086', fontWeight: '900', fontSize: 12 },
  acceptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
});
