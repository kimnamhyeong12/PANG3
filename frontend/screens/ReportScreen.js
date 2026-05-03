import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { BackButton, PrimaryButton } from '../components/ui';
import { LOCATIONS, USER } from '../data/mockData';

export default function ReportScreen({ onBack, onDownload }) {
  const complete = LOCATIONS.filter((l) => l.status === 'complete').length;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AUTO REPORT</Text>
          <Text style={styles.title}>외근 보고서</Text>
          <Text style={styles.desc}>현장 기록 기반 자동 생성</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.reportPaper}>
          <Text style={styles.reportTitle}>사하구 외근 업무 결과 보고서</Text>
          <Text style={styles.line}>담당자: {USER.name} / {USER.team}</Text>
          <Text style={styles.line}>총 방문지: {LOCATIONS.length}개</Text>
          <Text style={styles.line}>완료: {complete}개 / 미완료: {LOCATIONS.length - complete}개</Text>
          <View style={styles.divider} />
          {LOCATIONS.map((loc, idx) => (
            <View key={loc.id} style={styles.item}>
              <Text style={styles.itemTitle}>{idx + 1}. {loc.name}</Text>
              <Text style={styles.itemText}>{loc.address}</Text>
              <Text style={styles.itemText}>처리상태: {loc.status === 'complete' ? '완료' : '미완료'}</Text>
            </View>
          ))}
        </View>
        <PrimaryButton title="보고서 다운로드 화면" onPress={onDownload} />
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
  body: { padding: 16, gap: 16 },
  reportPaper: { backgroundColor: 'white', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#D9E1EA' },
  reportTitle: { fontSize: 18, fontWeight: '900', color: '#1F2D3D', marginBottom: 16, textAlign: 'center' },
  line: { fontSize: 12, color: '#334155', marginBottom: 6 },
  divider: { height: 1, backgroundColor: '#E6EDF3', marginVertical: 14 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' },
  itemTitle: { fontSize: 13, fontWeight: '900', color: '#12395B' },
  itemText: { fontSize: 11, color: '#607086', marginTop: 4 },
});
