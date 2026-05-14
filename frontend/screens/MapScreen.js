import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { BackButton } from '../components/ui';
import KakaoMapWebView from '../components/KakaoMapWebView';
import { LOCATIONS } from '../data/mockData';

export default function MapScreen({
  onBack,
  onLocationClick,
  locations,
  setLocations,
}) {
  const [selected, setSelected] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const markers = locations?.length ? locations : LOCATIONS;

  useEffect(() => {
    if (!locations?.length) setLocations?.(LOCATIONS);
  }, []);

  useEffect(() => {
    if (!optimizing) return;
    const t = setTimeout(() => {
      setOptimizing(false);
      setOptimized(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [optimizing]);

  const orderedMarkers = useMemo(() => markers, [markers]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SAHA-GU OFFICE</Text>
          <Text style={styles.title}>경로 설정</Text>
          <Text style={styles.desc}>
            {optimizing
              ? '최적 경로 계산 중'
              : optimized
                ? '최적 방문 순서 안내'
                : '방문지를 확인하고 경로를 실행하세요'}
          </Text>
        </View>

        <Text style={styles.count}>{markers.length}개 지점</Text>
      </View>

      {optimized && <View style={styles.doneBar}><Text style={styles.doneText}>✓ 최적 경로 계산 완료 · 예상 이동시간 약 52분</Text></View>}

      <View style={styles.routeBox}>
        <View style={styles.routeTop}>
          <Text style={styles.routeTitle}>{optimized ? 'OPTIMIZED ROUTE' : 'FIELD LOCATION'}</Text>
          {!optimized && !optimizing && <TouchableOpacity style={styles.optimizeButton} onPress={() => setOptimizing(true)}><Text style={styles.optimizeText}>경로 최적화</Text></TouchableOpacity>}
        </View>

        <FlatList
          horizontal
          data={orderedMarkers}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.routeChip} onPress={() => setSelected(item)}>
              <View style={[styles.no, { backgroundColor: item.status === 'complete' ? '#1F9D55' : index === 0 ? '#12395B' : '#94A3B8' }]}><Text style={styles.noText}>{index + 1}</Text></View>
              <Text style={styles.chipText} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.mapArea}>
        <KakaoMapWebView locations={orderedMarkers} onMarkerClick={setSelected} />
        {optimizing && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingTitle}>경로 최적화 중</Text>
            <Text style={styles.loadingDesc}>
              TSP 방문 순서와 실제 도로 경로를 계산합니다.
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity
          style={styles.modalBg}
          activeOpacity={1}
          onPress={() => setSelected(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.placeRow}>
              <View style={styles.placeIcon}>
                <Text>📍</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.placeName}>
                  {selected?.name || '이름 없음'}
                </Text>
                <Text style={styles.placeAddr}>
                  {selected?.address || '주소 없음'}
                </Text>
              </View>
            </View>

            <Text style={styles.routeTitle}>FIELD RECORD</Text>

            <View style={styles.actionRow}>
              {[
                { label: '사진', icon: '📷', type: 'photo' },
                { label: '메모', icon: '📝', type: 'memo' },
                { label: '상태', icon: '🔄', type: 'status' },
              ].map((b) => (
                <TouchableOpacity
                  key={b.type}
                  style={styles.sheetButton}
                  onPress={() => {
                    const loc = selected;
                    setSelected(null);
                    onLocationClick?.(loc, b.type);
                  }}
                >
                  <Text style={styles.sheetIcon}>{b.icon}</Text>
                  <Text style={styles.sheetLabel}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: '#607086' },
  title: { fontSize: 16, fontWeight: '900', color: '#1F2D3D', marginTop: 2 },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  count: { fontSize: 10, fontWeight: '800', color: '#12395B', backgroundColor: '#EAF1F7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  doneBar: { backgroundColor: '#12395B', paddingHorizontal: 16, paddingVertical: 10 },
  doneText: { color: 'white', fontSize: 10, fontWeight: '800' },
  routeBox: { backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#D9E1EA', padding: 12 },
  routeTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  routeTitle: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  optimizeButton: { backgroundColor: '#12395B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  optimizeText: { color: 'white', fontSize: 10, fontWeight: '800' },
  routeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8, maxWidth: 160, backgroundColor: '#F4F7FA', padding: 7, borderRadius: 14 },
  no: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  noText: { color: 'white', fontSize: 9, fontWeight: '900' },
  chipText: { fontSize: 10, color: '#1F2D3D', fontWeight: '800' },
  mapArea: { flex: 1, position: 'relative' },
  loadingOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,.92)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D' },
  loadingDesc: { fontSize: 10, color: '#718096', marginTop: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },
  handle: { width: 34, height: 4, borderRadius: 4, backgroundColor: '#D9E1EA', alignSelf: 'center', marginBottom: 16 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E6EDF3' },
  placeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EAF1F7', alignItems: 'center', justifyContent: 'center' },
  placeName: { fontSize: 14, fontWeight: '900', color: '#1F2D3D' },
  placeAddr: { fontSize: 10, color: '#718096', marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  sheetButton: { flex: 1, backgroundColor: '#EAF1F7', borderRadius: 14, borderWidth: 1, borderColor: '#D9E1EA', alignItems: 'center', paddingVertical: 16 },
  sheetIcon: { fontSize: 25 },
  sheetLabel: { marginTop: 7, fontSize: 12, fontWeight: '900', color: '#12395B' },
});