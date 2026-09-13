import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../components/ui';

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

const AREA_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#14B8A6', '#EC4899', '#6366F1'];

const normalizeStatus = (value) => {
  const status = String(value || 'pending').toLowerCase();
  if (status === 'complete' || status === 'done') return 'complete';
  if (status === 'working' || status === 'progress') return 'working';
  return 'pending';
};

const statusInfo = {
  pending: { label: '작업 전', color: '#E74C3C', icon: 'time-outline' },
  working: { label: '작업 중', color: '#E4A11B', icon: 'construct-outline' },
  complete: { label: '완료', color: '#1F9D55', icon: 'checkmark-circle-outline' },
};

export default function WorkStatusScreen({
  user,
  group,
  assignments = [],
  onBack,
  onRefresh,
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);
  const [resolvedAssignments, setResolvedAssignments] = useState(assignments);
  const isLeader = group?.role === 'LEADER';

  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    let cancelled = false;

    const resolveAreas = async () => {
      const source = Array.isArray(assignments) ? assignments : [];
      if (!KAKAO_REST_API_KEY) {
        setResolvedAssignments(source);
        return;
      }

      const cache = new Map();
      const enriched = await Promise.all(
        source.map(async (item) => {
          if (item.adminDong || item.admin_dong) return item;
          const lat = Number(item.lat ?? item.latitude);
          const lng = Number(item.lng ?? item.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return item;

          const key = `${lat},${lng}`;
          if (!cache.has(key)) {
            cache.set(key, (async () => {
              try {
                const response = await fetch(
                  'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json' +
                  `?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`,
                  { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
                );
                if (!response.ok) return null;
                const data = await response.json();
                const region = data.documents?.find((value) => value.region_type === 'H');
                return region?.region_3depth_name || null;
              } catch (_error) {
                return null;
              }
            })());
          }

          const adminDong = await cache.get(key);
          return adminDong ? { ...item, adminDong } : item;
        })
      );

      if (!cancelled) setResolvedAssignments(enriched);
    };

    resolveAreas();
    return () => { cancelled = true; };
  }, [assignments]);

  const visibleAssignments = useMemo(() => {
    const source = Array.isArray(resolvedAssignments) ? resolvedAssignments : [];
    if (isLeader) return source;
    return source.filter((item) => Number(item.assigneeUserId) === Number(user?.userId));
  }, [resolvedAssignments, isLeader, user?.userId]);

  const areas = useMemo(() => {
    const result = new Map();
    visibleAssignments.forEach((item) => {
      const area = item.adminDong || item.admin_dong || '행정동 미확인';
      if (!result.has(area)) result.set(area, []);
      result.get(area).push(item);
    });
    return Array.from(result.entries()).map(([name, items], index) => ({
      name,
      items,
      color: AREA_COLORS[index % AREA_COLORS.length],
    }));
  }, [visibleAssignments]);

  const counts = useMemo(() => {
    const value = { pending: 0, working: 0, complete: 0 };
    visibleAssignments.forEach((item) => {
      value[normalizeStatus(item.status)] += 1;
    });
    return value;
  }, [visibleAssignments]);

  const filtered = selectedArea
    ? visibleAssignments.filter((item) =>
        (item.adminDong || item.admin_dong || '행정동 미확인') === selectedArea
      )
    : visibleAssignments;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>WORK STATUS</Text>
          <Text style={styles.title}>업무 현황</Text>
          <Text style={styles.desc}>
            {group?.groupName || '현재 그룹'} · {isLeader ? '팀 전체 현황' : '내 담당 현황'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.summaryCard}>
          <Summary value={visibleAssignments.length} label="전체" />
          <View style={styles.summaryDivider} />
          <Summary value={counts.pending} label="작업 전" color="#FFB6B6" />
          <View style={styles.summaryDivider} />
          <Summary value={counts.working} label="작업 중" color="#FFE08A" />
          <View style={styles.summaryDivider} />
          <Summary value={counts.complete} label="완료" color="#8DE0AD" />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ADMINISTRATIVE AREA</Text>
          <Text style={styles.sectionTitle}>담당 구역 현황</Text>
          <Text style={styles.sectionDesc}>구역을 누르면 해당 방문지만 확인할 수 있습니다.</Text>

          {areas.length === 0 ? (
            <Text style={styles.emptyText}>배정된 방문지가 없습니다.</Text>
          ) : (
            <View style={styles.areaWrap}>
              <TouchableOpacity
                style={[styles.areaChip, !selectedArea && styles.areaChipSelected]}
                onPress={() => setSelectedArea(null)}
              >
                <Text style={[styles.areaChipText, !selectedArea && styles.areaChipTextSelected]}>전체</Text>
              </TouchableOpacity>
              {areas.map((area) => (
                <TouchableOpacity
                  key={area.name}
                  style={[styles.areaChip, selectedArea === area.name && styles.areaChipSelected]}
                  onPress={() => setSelectedArea(area.name)}
                >
                  <View style={[styles.areaDot, { backgroundColor: area.color }]} />
                  <Text style={[styles.areaChipText, selectedArea === area.name && styles.areaChipTextSelected]}>
                    {area.name} {area.items.length}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionLabel}>ASSIGNED VISITS</Text>
              <Text style={styles.sectionTitle}>{selectedArea || '전체 방문지'}</Text>
            </View>
            <Text style={styles.countText}>{filtered.length}곳</Text>
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>표시할 방문지가 없습니다.</Text>
          ) : (
            filtered.map((item) => {
              const status = statusInfo[normalizeStatus(item.status)];
              const area = item.adminDong || item.admin_dong || '행정동 미확인';
              return (
                <View key={item.assignmentId || item.taskId} style={styles.visitRow}>
                  <View style={[styles.statusIcon, { backgroundColor: `${status.color}18` }]}>
                    <Ionicons name={status.icon} size={18} color={status.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.visitName} numberOfLines={1}>
                      {item.detailAddress || item.roadAddress || `방문지 ${item.taskId}`}
                    </Text>
                    <Text style={styles.visitMeta} numberOfLines={1}>
                      {area} · {item.assigneeName || item.assigneeLoginId || '담당자 미지정'}
                    </Text>
                  </View>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Summary({ value, label, color = '#FFFFFF' }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 18, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  body: { padding: 16, gap: 14, paddingBottom: 36 },
  summaryCard: { backgroundColor: '#12395B', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  summaryLabel: { color: '#BFD0DE', fontSize: 9, fontWeight: '800', marginTop: 4 },
  summaryDivider: { width: 1, height: 34, backgroundColor: '#315779' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  sectionLabel: { fontSize: 9, fontWeight: '900', color: '#607086', letterSpacing: 1.4 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#1F2D3D', marginTop: 3 },
  sectionDesc: { fontSize: 10, color: '#718096', marginTop: 5, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  countText: { fontSize: 11, fontWeight: '900', color: '#607086' },
  areaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#D9E1EA', borderRadius: 19, paddingHorizontal: 12, backgroundColor: '#FFFFFF' },
  areaChipSelected: { backgroundColor: '#12395B', borderColor: '#12395B' },
  areaChipText: { fontSize: 11, fontWeight: '800', color: '#526274' },
  areaChipTextSelected: { color: '#FFFFFF' },
  areaDot: { width: 9, height: 9, borderRadius: 5 },
  visitRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#EDF2F7', paddingVertical: 10 },
  statusIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  visitName: { fontSize: 12, fontWeight: '900', color: '#1F2D3D' },
  visitMeta: { fontSize: 10, color: '#718096', marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '900' },
  emptyText: { fontSize: 11, color: '#718096', paddingVertical: 16, textAlign: 'center' },
});
