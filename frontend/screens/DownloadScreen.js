import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BackButton, PrimaryButton } from '../components/ui';

export default function DownloadScreen({ onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>다운로드 완료</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>✅</Text>
        <Text style={styles.main}>보고서가 생성되었습니다</Text>
        <Text style={styles.desc}>실제 파일 저장은 expo-file-system 또는 서버 PDF API와 연결하면 됩니다.</Text>
        <PrimaryButton title="메인으로 돌아가기" onPress={onBack} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', padding: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  title: { fontSize: 16, fontWeight: '900', color: '#1F2D3D' },
  center: { flex: 1, padding: 28, justifyContent: 'center', gap: 14 },
  icon: { fontSize: 52, textAlign: 'center' },
  main: { fontSize: 20, fontWeight: '900', color: '#1F2D3D', textAlign: 'center' },
  desc: { fontSize: 12, color: '#607086', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
});
