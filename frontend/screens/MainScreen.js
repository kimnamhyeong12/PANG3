import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { USER, LOCATIONS, MOCK_ENTRIES } from '../data/mockData';

export default function MainScreen({ onRoute, onReport, onDashboard }) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const total = LOCATIONS.length;
  const complete = LOCATIONS.filter((loc) => loc.status === 'complete').length;
  const pending = total - complete;
  const progress = Math.round((complete / total) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>SAHA-GU OFFICE</Text>
            <Text style={styles.headerTitle}>외근 업무 현황</Text>
            <Text style={styles.headerDesc}>{today} · 도시안전과</Text>
          </View>
          <TouchableOpacity onPress={onDashboard} style={styles.profile} activeOpacity={0.85}>
            <View style={styles.avatar}><Text style={styles.avatarText}>SG</Text></View>
            <View>
              <Text style={styles.profileName}>{USER.name}</Text>
              <Text style={styles.profileTeam}>{USER.team}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.progressBox}>
          <View style={styles.rowBetween}>
            <Text style={styles.progressLabel}>오늘 업무 진행률</Text>
            <Text style={styles.progressLabel}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <Kpi title="전체" value={`${total}`} />
        <Kpi title="완료" value={`${complete}`} color="#1F9D55" />
        <Kpi title="미완료" value={`${pending}`} color="#F39C12" />
      </View>

      <View style={styles.actions}>
        <Action title="경로 설정" desc="방문지 선택 및 최적 경로 확인" icon="🗺️" onPress={onRoute} />
        <Action title="보고서 생성" desc="현장 기록 기반 자동 보고서" icon="📄" onPress={onReport} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>RECENT FIELDWORK</Text>
        <Text style={styles.cardTitle}>최근 방문 기록</Text>
        {MOCK_ENTRIES.map((e, idx) => (
          <View key={e.id} style={styles.entry}>
            <View style={[styles.entryNo, { backgroundColor: e.status === 'Complete' ? '#1F9D55' : '#12395B' }]}>
              <Text style={styles.entryNoText}>{idx + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryName}>{e.name}</Text>
              <Text style={styles.entryMemo} numberOfLines={1}>{e.memo}</Text>
            </View>
            <Text style={styles.entryStatus}>{e.status === 'Complete' ? '완료' : '대기'}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Kpi({ title, value, color = '#12395B' }) {
  return <View style={styles.kpi}><Text style={[styles.kpiValue, { color }]}>{value}</Text><Text style={styles.kpiTitle}>{title}</Text></View>;
}

function Action({ title, desc, icon, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.action} activeOpacity={0.85}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionDesc}>{desc}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { backgroundColor: '#12395B', padding: 20, paddingTop: 22, borderBottomWidth: 4, borderBottomColor: '#0F2E4A' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  headerEyebrow: { color: 'rgba(255,255,255,.6)', fontSize: 10, fontWeight: '800', letterSpacing: 2.2 },
  headerTitle: { color: 'white', fontSize: 23, fontWeight: '900', marginTop: 4 },
  headerDesc: { color: 'rgba(255,255,255,.6)', fontSize: 10, marginTop: 4 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.2)', borderWidth: 1, borderRadius: 14, padding: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontWeight: '900' },
  profileName: { color: 'white', fontSize: 11, fontWeight: '800' },
  profileTeam: { color: 'rgba(255,255,255,.55)', fontSize: 9 },
  progressBox: { backgroundColor: 'rgba(255,255,255,.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,.15)', borderRadius: 18, padding: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: 'white', fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.18)', marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 8, backgroundColor: 'white' },
  kpiRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: -18 },
  kpi: { flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D9E1EA' },
  kpiValue: { fontSize: 24, fontWeight: '900' },
  kpiTitle: { fontSize: 10, fontWeight: '800', color: '#607086', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  action: { flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  actionIcon: { fontSize: 26, marginBottom: 12 },
  actionTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D' },
  actionDesc: { fontSize: 10, color: '#718096', lineHeight: 16, marginTop: 6 },
  card: { backgroundColor: 'white', marginHorizontal: 16, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  cardEyebrow: { fontSize: 11, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D', marginTop: 4, marginBottom: 12 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF2F6' },
  entryNo: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  entryNoText: { color: 'white', fontSize: 9, fontWeight: '900' },
  entryName: { color: '#1F2D3D', fontSize: 12, fontWeight: '900' },
  entryMemo: { color: '#718096', fontSize: 10, marginTop: 2 },
  entryStatus: { fontSize: 9, fontWeight: '900', color: '#12395B', backgroundColor: '#EAF1F7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
});
