import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { USER, MOCK_ENTRIES } from '../data/mockData';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function MainScreen({
  onRoute,
  onReport,
  onDashboard,
  locations = [],
  setLocations,
}) {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const [incompleteLocations, setIncompleteLocations] = React.useState([]);
  const [selectedIds, setSelectedIds] = React.useState([]);

  const total = locations.length;
  const complete = locations.filter(
    (loc) => loc.status === 'complete' || loc.status === 'done'
  ).length;
  const pending = total - complete;
  const progress = total === 0 ? 0 : Math.round((complete / total) * 100);

  React.useEffect(() => {
    loadIncompleteLocations();
  }, []);

  const loadIncompleteLocations = async () => {
    try {
      if (!API_BASE_URL) {
        console.log('API_BASE_URL 없음');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/locations`);
      const text = await res.text();

      console.log('미처리 작업 조회 상태:', res.status);
      console.log('미처리 작업 조회 내용:', text);

      if (!res.ok) {
        throw new Error(`미처리 작업 조회 실패: ${res.status}`);
      }

      const data = JSON.parse(text);

      const incomplete = data
        .filter((loc) => {
          const status = String(loc.status || '').toLowerCase();

          return (
            status === 'pending' ||
            status === 'progress' ||
            status === 'in_progress' ||
            status === '처리중' ||
            status === '미처리'
          );
        })
        .map((loc) => ({
          ...loc,
          lat: loc.lat ?? loc.latitude,
          lng: loc.lng ?? loc.longitude,
          task: loc.task || '현장 확인',
        }));

      setIncompleteLocations(incomplete);
    } catch (error) {
      console.log(error);
      Alert.alert('오류', '미처리 작업을 불러오지 못했습니다.');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((itemId) => itemId !== id);
      }

      return [...prev, id];
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === incompleteLocations.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(incompleteLocations.map((loc) => loc.id));
  };

  const addSelectedToToday = () => {
    const selectedItems = incompleteLocations.filter((loc) =>
      selectedIds.includes(loc.id)
    );

    if (selectedItems.length === 0) {
      Alert.alert('선택 필요', '오늘 외근에 추가할 작업을 선택하세요.');
      return;
    }

    setLocations?.((prev) => {
      const current = prev || [];
      const currentIds = new Set(current.map((loc) => loc.id));

      const onlyNewItems = selectedItems.filter(
        (loc) => !currentIds.has(loc.id)
      );

      return [...current, ...onlyNewItems];
    });

    setSelectedIds([]);

    Alert.alert(
      '추가 완료',
      `${selectedItems.length}개의 미처리 작업을 오늘 외근에 추가했습니다.`
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerEyebrow}>SAHA-GU OFFICE</Text>
            <Text style={styles.headerTitle}>외근 업무 현황</Text>
            <Text style={styles.headerDesc}>{today} · 도시안전과</Text>
          </View>

          <TouchableOpacity
            onPress={onDashboard}
            style={styles.profile}
            activeOpacity={0.85}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>SG</Text>
            </View>

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

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <Kpi title="오늘 외근" value={`${total}`} />
        <Kpi title="완료" value={`${complete}`} color="#1F9D55" />
        <Kpi title="미완료" value={`${pending}`} color="#F39C12" />
      </View>

      {incompleteLocations.length > 0 && (
        <View style={styles.card}>
          <View style={styles.incompleteHeader}>
            <View>
              <Text style={styles.cardEyebrow}>INCOMPLETE FIELDWORK</Text>
              <Text style={styles.cardTitle}>미처리 작업</Text>
            </View>

            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={toggleSelectAll}
            >
              <Text style={styles.selectAllText}>
                {selectedIds.length === incompleteLocations.length
                  ? '전체 해제'
                  : '전체 선택'}
              </Text>
            </TouchableOpacity>
          </View>

          {incompleteLocations.map((item) => {
            const selected = selectedIds.includes(item.id);
            const status = String(item.status || '').toLowerCase();

            return (
              <View key={item.id} style={styles.incompleteItem}>
                <TouchableOpacity
                  onPress={() => toggleSelect(item.id)}
                  style={[
                    styles.circleSelect,
                    selected && styles.circleSelectActive,
                  ]}
                  activeOpacity={0.8}
                >
                  {selected && <Text style={styles.circleCheckText}>✓</Text>}
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName} numberOfLines={1}>
                    {item.name || '이름 없음'}
                  </Text>
                  <Text style={styles.entryMemo} numberOfLines={1}>
                    {item.address || '주소 없음'}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.entryStatus,
                    status === 'progress' || status === 'in_progress'
                      ? styles.progressStatus
                      : styles.pendingStatus,
                  ]}
                >
                  {status === 'progress' || status === 'in_progress'
                    ? '처리중'
                    : '미처리'}
                </Text>
              </View>
            );
          })}

          <TouchableOpacity
            style={[
              styles.addTodayButton,
              selectedIds.length === 0 && styles.addTodayButtonDisabled,
            ]}
            onPress={addSelectedToToday}
            disabled={selectedIds.length === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.addTodayText}>
              선택한 작업 오늘 외근에 추가
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actions}>
        <Action
          title="경로 설정"
          desc="방문지 선택 및 최적 경로 확인"
          icon="🗺️"
          onPress={onRoute}
        />
        <Action
          title="보고서 생성"
          desc="현장 기록 기반 자동 보고서"
          icon="📄"
          onPress={onReport}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>RECENT FIELDWORK</Text>
        <Text style={styles.cardTitle}>최근 방문 기록</Text>

        <Text style={styles.emptyText}>최근 방문 기록이 없습니다.</Text>
      </View>
    </ScrollView>
  );
}

function Kpi({ title, value, color = '#12395B' }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiTitle}>{title}</Text>
    </View>
  );
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
  container: {
    flex: 1,
    backgroundColor: '#F4F7FA',
  },

  header: {
    backgroundColor: '#12395B',
    padding: 20,
    paddingTop: 22,
    borderBottomWidth: 4,
    borderBottomColor: '#0F2E4A',
  },

  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },

  headerEyebrow: {
    color: 'rgba(255,255,255,.6)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
  },

  headerTitle: {
    color: 'white',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
  },

  headerDesc: {
    color: 'rgba(255,255,255,.6)',
    fontSize: 10,
    marginTop: 4,
  },

  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,.1)',
    borderColor: 'rgba(255,255,255,.2)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
  },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: 'white',
    fontWeight: '900',
  },

  profileName: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },

  profileTeam: {
    color: 'rgba(255,255,255,.55)',
    fontSize: 9,
  },

  progressBox: {
    backgroundColor: 'rgba(255,255,255,.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.15)',
    borderRadius: 18,
    padding: 14,
  },

  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  progressLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },

  progressTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,.18)',
    marginTop: 10,
    overflow: 'hidden',
  },

  progressFill: {
    height: 8,
    borderRadius: 8,
    backgroundColor: 'white',
  },

  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: -18,
  },

  kpi: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  kpiValue: {
    fontSize: 24,
    fontWeight: '900',
  },

  kpiTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#607086',
    marginTop: 4,
  },

  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },

  action: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  actionIcon: {
    fontSize: 26,
    marginBottom: 12,
  },

  actionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  actionDesc: {
    fontSize: 10,
    color: '#718096',
    lineHeight: 16,
    marginTop: 6,
  },

  card: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  cardEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#607086',
    letterSpacing: 1.6,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
    marginTop: 4,
    marginBottom: 12,
  },

  incompleteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },

  selectAllButton: {
    backgroundColor: '#EAF1F7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  selectAllText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#12395B',
  },

  incompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },

  circleSelect: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#B0B8C1',
    backgroundColor: '#F1F3F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  circleSelectActive: {
    backgroundColor: '#12395B',
    borderColor: '#12395B',
  },

  circleCheckText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },

  addTodayButton: {
    marginTop: 12,
    backgroundColor: '#12395B',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },

  addTodayButtonDisabled: {
    backgroundColor: '#B0B8C1',
  },

  addTodayText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },

  entryNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  entryNoText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '900',
  },

  entryName: {
    color: '#1F2D3D',
    fontSize: 12,
    fontWeight: '900',
  },

  entryMemo: {
    color: '#718096',
    fontSize: 10,
    marginTop: 2,
  },

  entryStatus: {
    fontSize: 9,
    fontWeight: '900',
    color: '#12395B',
    backgroundColor: '#EAF1F7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  pendingStatus: {
    color: '#C05621',
    backgroundColor: '#FFF4E5',
  },

  progressStatus: {
    color: '#12395B',
    backgroundColor: '#EAF1F7',
  },
});