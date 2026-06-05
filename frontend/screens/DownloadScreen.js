import React from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { BackButton, PrimaryButton } from '../components/ui';
import { resolveApiUrl } from '../utils/api';

export default function DownloadScreen({ onBack, downloadInfo }) {
  const openReport = async () => {
    const url = resolveApiUrl(downloadInfo?.reportDownloadUrl);
    if (!url) {
      Alert.alert('다운로드 불가', '생성된 보고서 파일이 없습니다. 현장 화면에서 먼저 저장하세요.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.log(error);
      Alert.alert('열기 실패', url);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>다운로드</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>✅</Text>
        <Text style={styles.main}>보고서가 생성되었습니다</Text>
        <Text style={styles.desc}>
          HWPX 파일을 열어 확인하세요.{'\n'}
          (브라우저 또는 한컴오피스)
        </Text>
        <PrimaryButton title="보고서 파일 열기" onPress={openReport} />
        <PrimaryButton title="메인으로 돌아가기" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'white',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
  },
  title: { fontSize: 16, fontWeight: '900', color: '#1F2D3D' },
  center: { flex: 1, padding: 28, justifyContent: 'center', gap: 14 },
  icon: { fontSize: 52, textAlign: 'center' },
  main: { fontSize: 20, fontWeight: '900', color: '#1F2D3D', textAlign: 'center' },
  desc: { fontSize: 12, color: '#607086', textAlign: 'center', lineHeight: 20 },
});
