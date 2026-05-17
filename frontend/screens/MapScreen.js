import React, { useMemo, useState } from 'react';
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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const getStatusColor = (status, index) => {
  if (status === 'complete') return '#1F9D55';
  if (status === 'working') return '#FACC15';
  if (status === 'pending') return '#E74C3C';
  return index === 0 ? '#12395B' : '#94A3B8';
};

export default function MapScreen({
  onBack,
  onLocationClick,
  locations,
  setLocations,

  roadPath,
  setRoadPath,
  routeSegments,
  setRouteSegments,
  currentSegmentIndex,
  setCurrentSegmentIndex,
  optimized,
  setOptimized,
  isGuiding,
  setIsGuiding,
  totalDuration,
  setTotalDuration,

  panelOpen,
  setPanelOpen,
}) {
  const [selected, setSelected] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  const [priorityMode, setPriorityMode] = useState(false);
  const [priorityCount, setPriorityCount] = useState(1);

  const markers = locations?.length ? locations : [];
  const orderedMarkers = useMemo(() => markers, [markers]);

  const handleSetPriority = (targetLocation) => {
    if (!priorityMode) {
      setSelected(targetLocation);
      return;
    }

    const updatedLocations = markers.map((loc) => {
      if (loc.id === targetLocation.id) {
        return {
          ...loc,
          priority: priorityCount,
        };
      }

      return loc;
    });

    setLocations?.(updatedLocations);
    setPriorityCount(priorityCount + 1);
  };

  const resetPriority = () => {
    const updatedLocations = markers.map((loc) => ({
      ...loc,
      priority: null,
    }));

    setLocations?.(updatedLocations);
    setPriorityCount(1);
    setPriorityMode(false);
  };

  const handleOptimizeRoute = async () => {
    if (!API_BASE_URL) {
      Alert.alert('오류', '.env의 EXPO_PUBLIC_API_BASE_URL을 확인하세요.');
      return;
    }

    if (!currentLocation) {
      Alert.alert('현재 위치 필요', '현재 위치를 먼저 불러와야 합니다.');
      return;
    }

    if (!markers || markers.length < 2) {
      Alert.alert('정렬 불가', '방문지가 2개 이상 필요합니다.');
      return;
    }

    try {
      setOptimizing(true);
      setOptimized(false);
      setIsGuiding(false);

      setRoadPath([]);
      setRouteSegments([]);
      setCurrentSegmentIndex(0);
      setTotalDuration(null);

      const res = await fetch(`${API_BASE_URL}/api/routes/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentLocation,
          locations: markers,
        }),
      });

      const text = await res.text();

      console.log('경로 최적화 요청 현재 위치:', currentLocation);
      console.log('경로 최적화 응답 상태:', res.status);
      console.log('경로 최적화 응답 내용:', text);

      if (!res.ok) {
        throw new Error(`경로 최적화 요청 실패: ${res.status}`);
      }

      const data = JSON.parse(text);

      const optimizedLocations = (data.optimizedLocations || []).map((loc) => ({
        ...loc,
        lat: loc.lat ?? loc.latitude,
        lng: loc.lng ?? loc.longitude,
        status: loc.status || 'pending',
      }));

      if (optimizedLocations.length > 0) {
        setLocations?.(optimizedLocations);
      }

      if (data.path && data.path.length > 0) {
        setRoadPath(data.path);
        setPanelOpen(false);
      }

      if (data.segments && data.segments.length > 0) {
        setRouteSegments(data.segments);
        setCurrentSegmentIndex(0);
      }

      if (data.totalDuration !== undefined && data.totalDuration !== null) {
        setTotalDuration(data.totalDuration);
      }

      setOptimized(true);

    } catch (error) {
      console.log(error);
      Alert.alert('오류', '경로 최적화 중 문제가 발생했습니다.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleStartGuide = () => {
    Alert.alert('안내 시작', '이 경로로 안내를 시작할까요?', [
      {
        text: '취소',
        style: 'cancel',
      },
      {
        text: '확인',
        onPress: () => setIsGuiding(true),
      },
    ]);
  };

  const movePrevSegment = () => {
    setCurrentSegmentIndex((prev) => Math.max(prev - 1, 0));
  };

  const moveNextSegment = () => {
    setCurrentSegmentIndex((prev) =>
      Math.min(prev + 1, routeSegments.length - 1)
    );
  };

  const formatDuration = (seconds) => {
    if (!seconds) return null;

    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
      return `약 ${minutes}분`;
    }

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return `약 ${h}시간 ${m}분`;
  };

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
              : isGuiding
                ? '현재 경로 안내 중'
                : optimized
                  ? '최적 방문 순서 안내'
                  : '방문지를 확인하고 경로를 실행하세요'}
          </Text>
        </View>

        <Text style={styles.count}>{markers.length}개 지점</Text>
      </View>

      {optimized && (
        <View style={[styles.doneBar, isGuiding && styles.guidingBar]}>
          <Text style={styles.doneText}>
            {isGuiding ? '▶ 안내 진행 중' : '✓ 최적 경로 계산 완료'}
            {formatDuration(totalDuration)
              ? ` · 예상 이동시간 ${formatDuration(totalDuration)}`
              : ''}
          </Text>
        </View>
      )}

      {optimized && routeSegments.length > 0 && (
        <View style={styles.segmentBar}>
          <Text style={styles.segmentText}>
            현재 구간 {currentSegmentIndex + 1} / {routeSegments.length}
            {'  '}
            {routeSegments[currentSegmentIndex]?.fromName || '현재 위치'}
            →
            {routeSegments[currentSegmentIndex]?.toName || '목적지'}
          </Text>

          <View style={styles.segmentButtonRow}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                currentSegmentIndex === 0 && styles.segmentButtonDisabled,
              ]}
              onPress={movePrevSegment}
              disabled={currentSegmentIndex === 0}
            >
              <Text style={styles.segmentButtonText}>이전</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                currentSegmentIndex === routeSegments.length - 1 &&
                styles.segmentButtonDisabled,
              ]}
              onPress={moveNextSegment}
              disabled={currentSegmentIndex === routeSegments.length - 1}
            >
              <Text style={styles.segmentButtonText}>다음</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.routeBox}>
        <View style={styles.routeTop}>
          {!optimizing && (
            <View style={styles.routeButtonRow}>
              <TouchableOpacity
                style={[
                  styles.priorityButton,
                  priorityMode && styles.priorityButtonActive,
                ]}
                onPress={() => setPriorityMode(!priorityMode)}
              >
                <Text style={styles.priorityButtonText}>
                  {priorityMode ? '우선순위 선택중' : '우선순위'}
                </Text>
              </TouchableOpacity>

              {priorityMode && (
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={resetPriority}
                >
                  <Text style={styles.resetButtonText}>초기화</Text>
                </TouchableOpacity>
              )}

              {optimized && (
                <TouchableOpacity
                  style={styles.addPanelButton}
                  onPress={() => setPanelOpen(true)}
                >
                  <Text style={styles.addPanelText}>방문 추가</Text>
                </TouchableOpacity>
              )}

              {optimized && !isGuiding && (
                <TouchableOpacity
                  style={styles.startGuideButton}
                  onPress={handleStartGuide}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startGuideText}>안내 시작</Text>
                </TouchableOpacity>
              )}

              {isGuiding && (
                <TouchableOpacity
                  style={styles.stopGuideButton}
                  onPress={() => setIsGuiding(false)}
                >
                  <Text style={styles.stopGuideText}>안내 종료</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.optimizeButton}
                onPress={handleOptimizeRoute}
              >
                <Text style={styles.optimizeText}>
                  {optimized ? '다시 최적화' : '경로 최적화'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <FlatList
          horizontal
          data={orderedMarkers}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.routeChip}
              onPress={() => handleSetPriority(item)}
            >
              <View
                style={[
                  styles.no,
                  {
                    backgroundColor: getStatusColor(item.status, index),
                  },
                ]}
              >
                <Text style={styles.noText}>
                  {item.priority ? `P${item.priority}` : index + 1}
                </Text>
              </View>

              <Text style={styles.chipText} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.mapArea}>
        <KakaoMapWebView
          locations={orderedMarkers}
          roadPath={roadPath}
          routeSegments={routeSegments}
          currentSegmentIndex={currentSegmentIndex}
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          isGuiding={isGuiding}
          onCurrentLocationChange={setCurrentLocation}
          onMarkerClick={setSelected}
          onLocationsChange={setLocations}
        />

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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: '#607086',
  },

  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2D3D',
    marginTop: 2,
  },

  desc: {
    fontSize: 10,
    color: '#718096',
    marginTop: 2,
  },

  count: {
    fontSize: 10,
    fontWeight: '800',
    color: '#12395B',
    backgroundColor: '#EAF1F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },

  doneBar: {
    backgroundColor: '#12395B',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  guidingBar: {
    backgroundColor: '#1F9D55',
  },

  doneText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  routeBox: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
    padding: 12,
  },

  routeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  routeTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#607086',
    letterSpacing: 1.6,
  },

  routeButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  addPanelButton: {
    backgroundColor: '#1F9D55',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  addPanelText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  startGuideButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  startGuideText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  stopGuideButton: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  stopGuideText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  optimizeButton: {
    backgroundColor: '#12395B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  optimizeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
    maxWidth: 160,
    backgroundColor: '#F4F7FA',
    padding: 7,
    borderRadius: 14,
  },

  no: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '900',
  },

  chipText: {
    fontSize: 10,
    color: '#1F2D3D',
    fontWeight: '800',
  },

  mapArea: {
    flex: 1,
    position: 'relative',
  },

  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  loadingTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  loadingDesc: {
    fontSize: 10,
    color: '#718096',
    marginTop: 6,
  },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.3)',
    justifyContent: 'flex-end',
  },

  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },

  handle: {
    width: 34,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#D9E1EA',
    alignSelf: 'center',
    marginBottom: 16,
  },

  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EDF3',
  },

  placeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF1F7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  placeAddr: {
    fontSize: 10,
    color: '#718096',
    marginTop: 3,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },

  sheetButton: {
    flex: 1,
    backgroundColor: '#EAF1F7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E1EA',
    alignItems: 'center',
    paddingVertical: 16,
  },

  sheetIcon: {
    fontSize: 25,
  },

  sheetLabel: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '900',
    color: '#12395B',
  },

  priorityButton: {
    backgroundColor: '#EAF1F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  priorityButtonActive: {
    backgroundColor: '#F39C12',
    borderColor: '#F39C12',
  },

  priorityButtonText: {
    color: '#12395B',
    fontSize: 10,
    fontWeight: '800',
  },

  resetButton: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  resetButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  segmentBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  segmentText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#12395B',
  },

  segmentButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },

  segmentButton: {
    backgroundColor: '#12395B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  segmentButtonDisabled: {
    backgroundColor: '#94A3B8',
  },

  segmentButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
  },
});