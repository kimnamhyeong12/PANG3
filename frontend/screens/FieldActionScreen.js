import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { BackButton, PrimaryButton } from '../components/ui';

function getAiRecommendation(memo) {
  const text = memo.toLowerCase();
  if (text.includes('배수') || text.includes('토사') || text.includes('침수') || text.includes('악취')) {
    return { category: '배수시설 관리', risk: '높음', riskColor: '#DC2626', report: '배수구 내 토사 적체로 인해 배수 불량 및 침수 위험이 우려되어 정비 요청이 필요함.' };
  }
  if (text.includes('파손') || text.includes('균열') || text.includes('전선') || text.includes('부식')) {
    return { category: '시설물 안전', risk: '높음', riskColor: '#DC2626', report: '시설물 파손 또는 균열이 확인되어 안전조치 및 보수 요청이 필요함.' };
  }
  return { category: '일반 점검', risk: '보통', riskColor: '#F39C12', report: '현장 점검 결과 특이사항을 기록하고 추후 필요 시 재확인함.' };
}

export default function FieldActionScreen({ location, actionType, onBack, onSave }) {
  const [memo, setMemo] = useState('');
  const [status, setStatus] = useState(location?.status || 'pending');
  const [photo, setPhoto] = useState(null);
  const rec = getAiRecommendation(memo);

  const pickImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>FIELD RECORD</Text>
          <Text style={styles.title}>{location?.name || '방문지 기록'}</Text>
          <Text style={styles.desc}>{location?.address}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>업무 유형</Text>
          <Text style={styles.typeText}>{actionType === 'photo' ? '사진 기록' : actionType === 'memo' ? '메모 작성' : '상태 변경'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>현장 사진</Text>
          {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <View style={styles.photoEmpty}><Text style={styles.photoEmptyText}>촬영된 사진 없음</Text></View>}
          <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}><Text style={styles.secondaryText}>카메라로 촬영</Text></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>현장 메모</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            multiline
            placeholder="예: 배수구 토사 적체, 시설물 파손, 악취 발생 등"
            style={styles.memo}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>처리 상태</Text>
          <View style={styles.statusRow}>
            <TouchableOpacity style={[styles.statusBtn, status === 'pending' && styles.statusActive]} onPress={() => setStatus('pending')}><Text style={[styles.statusText, status === 'pending' && styles.statusTextActive]}>미완료</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.statusBtn, status === 'complete' && styles.statusActive]} onPress={() => setStatus('complete')}><Text style={[styles.statusText, status === 'complete' && styles.statusTextActive]}>완료</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.aiCard}>
          <Text style={styles.aiEyebrow}>AI RECOMMENDATION</Text>
          <Text style={styles.aiTitle}>{rec.category}</Text>
          <Text style={[styles.risk, { color: rec.riskColor }]}>위험도: {rec.risk}</Text>
          <Text style={styles.aiReport}>{rec.report}</Text>
        </View>

        <PrimaryButton title="저장 후 보고서로 이동" onPress={onSave} />
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'white', padding: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 16, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096' },
  body: { padding: 16, gap: 14, paddingBottom: 30 },
  card: { backgroundColor: 'white', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  cardTitle: { fontSize: 12, fontWeight: '900', color: '#607086', marginBottom: 10 },
  typeText: { color: '#12395B', fontSize: 16, fontWeight: '900' },
  photo: { height: 180, borderRadius: 14, marginBottom: 10 },
  photoEmpty: { height: 150, borderRadius: 14, backgroundColor: '#EAF1F7', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  photoEmptyText: { fontSize: 11, color: '#718096', fontWeight: '800' },
  secondaryButton: { backgroundColor: '#12395B', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: 'white', fontWeight: '900', fontSize: 12 },
  memo: { minHeight: 120, borderRadius: 14, borderWidth: 1, borderColor: '#D9E1EA', padding: 12, textAlignVertical: 'top', fontSize: 13 },
  statusRow: { flexDirection: 'row', gap: 10 },
  statusBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#D9E1EA', padding: 13, alignItems: 'center' },
  statusActive: { backgroundColor: '#12395B', borderColor: '#12395B' },
  statusText: { fontSize: 12, fontWeight: '900', color: '#607086' },
  statusTextActive: { color: 'white' },
  aiCard: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1, borderRadius: 18, padding: 16 },
  aiEyebrow: { fontSize: 10, fontWeight: '900', color: '#C2410C', letterSpacing: 1.4 },
  aiTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D', marginTop: 6 },
  risk: { fontSize: 12, fontWeight: '900', marginTop: 8 },
  aiReport: { fontSize: 11, lineHeight: 18, color: '#607086', marginTop: 8 },
});
