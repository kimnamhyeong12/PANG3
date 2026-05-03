import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { BackButton } from '../components/ui';
import { USER, REGION_DATA, HEATMAP, DAYS, WEEKS } from '../data/mockData';

export default function DashboardScreen({ onBack }) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const maxCount = Math.max(...REGION_DATA.map((r) => r.count));
  const heatColor = (v) => {
    const p = v / 9;
    if (p > 0.77) return '#12395B';
    if (p > 0.55) return '#2E6D9C';
    if (p > 0.33) return '#6EA5C8';
    if (p > 0.11) return '#BFD4E3';
    return '#EAF1F7';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SAHA-GU OFFICE</Text>
          <Text style={styles.title}>외근 분석 대시보드</Text>
          <Text style={styles.desc}>{today} 기준</Text>
        </View>
        <View style={styles.userCircle}><Text style={styles.userText}>{USER.name[0]}</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.kpiRow}>
          <Kpi label="평균 이동" value="18분" />
          <Kpi label="절감 시간" value="52분" />
          <Kpi label="제출률" value="86%" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>AREA ANALYSIS</Text>
          <Text style={styles.cardTitle}>지역별 업무 집중도</Text>
          {REGION_DATA.map((r) => (
            <View key={r.region} style={styles.barRow}>
              <Text style={styles.region}>{r.region}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(r.count / maxCount) * 100}%` }]}><Text style={styles.barText}>{r.count}건</Text></View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>WEEKLY HEATMAP</Text>
          <Text style={styles.cardTitle}>주간 외근 업무 히트맵</Text>
          <View style={styles.heatHeader}><View style={{ width: 28 }} />{DAYS.map((d) => <Text key={d} style={styles.heatDay}>{d}</Text>)}</View>
          {HEATMAP.map((row, wi) => (
            <View key={wi} style={styles.heatRow}>
              <Text style={styles.week}>{WEEKS[wi]}</Text>
              {row.map((v, di) => <View key={`${wi}-${di}`} style={[styles.heatCell, { backgroundColor: heatColor(v) }]} />)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
function Kpi({ label, value }) {
  return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: '#607086' },
  title: { fontSize: 17, fontWeight: '900', color: '#1F2D3D', marginTop: 2 },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  userCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#12395B', alignItems: 'center', justifyContent: 'center' },
  userText: { color: 'white', fontWeight: '900' },
  body: { padding: 16, gap: 14, paddingBottom: 28 },
  kpiRow: { flexDirection: 'row', gap: 9 },
  kpi: { flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: '#D9E1EA', alignItems: 'center' },
  kpiValue: { fontSize: 20, fontWeight: '900', color: '#12395B' },
  kpiLabel: { fontSize: 10, fontWeight: '800', color: '#607086', marginTop: 5 },
  card: { backgroundColor: 'white', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  cardEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6, color: '#607086' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D', marginTop: 4, marginBottom: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  region: { width: 48, fontSize: 10, color: '#607086', fontWeight: '800' },
  barTrack: { flex: 1, height: 28, borderRadius: 9, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  barFill: { height: 28, borderRadius: 9, backgroundColor: '#12395B', justifyContent: 'center', paddingHorizontal: 8 },
  barText: { color: 'white', fontSize: 10, fontWeight: '900' },
  heatHeader: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  heatDay: { flex: 1, textAlign: 'center', fontSize: 8, color: '#718096', fontWeight: '800' },
  heatRow: { flexDirection: 'row', gap: 4, marginBottom: 4, alignItems: 'center' },
  week: { width: 28, fontSize: 8, color: '#718096', fontWeight: '800' },
  heatCell: { flex: 1, aspectRatio: 1, borderRadius: 4 },
});
