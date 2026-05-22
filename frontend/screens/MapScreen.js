// 키보드 자판 내 엔터가 안먹힘
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
} from 'react-native';
import KakaoMapWebView from '../components/KakaoMapWebView';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

const getStatusColor = (status) => {
  if (status === 'complete') return '#1F9D55';
  if (status === 'working') return '#FACC15';
  return '#E74C3C';
};

const getStatusLabel = (status) => {
  if (status === 'complete') return '작업완료';
  if (status === 'working') return '작업중';
  return '미작업';
};

const cleanLocation = (loc, fallbackName = '위치') => {
  if (!loc) return null;

  return {
    id: loc.id ?? null,
    detailAddress: loc.detailAddress || fallbackName,
    roadAddress: loc.roadAddress || '',
    lat: Number(loc.lat ?? loc.latitude),
    lng: Number(loc.lng ?? loc.longitude),
    status: loc.status || 'pending',
    task: loc.task || '',
    priority: loc.priority ?? null,
  };
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
  const [transportMode, setTransportMode] = useState('car');
  const [segmentChanging, setSegmentChanging] = useState(false);
  const [guideStartOpen, setGuideStartOpen] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [searchedPlace, setSearchedPlace] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [task, setTask] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [clearSearchMarkerSignal, setClearSearchMarkerSignal] = useState(0);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addressSearchMode, setAddressSearchMode] = useState(false);
  const [mapSelectMode, setMapSelectMode] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [coordSheetOpen, setCoordSheetOpen] = useState(false);
  const [coordLat, setCoordLat] = useState('');
  const [coordLng, setCoordLng] = useState('');

  const [priorityMode, setPriorityMode] = useState(false);
  const [priorityCount, setPriorityCount] = useState(1);
  const [visitListOpen, setVisitListOpen] = useState(false);

  const sheetY = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef(null);

  const markers = locations?.length ? locations : [];
  const orderedMarkers = useMemo(() => markers, [markers]);

  const [searchResults, setSearchResults] = useState([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 7;

  const goFirst = () => searchPlace(1);
  const goLast = () => searchPlace(totalPages);

  const goPrev = () => {
    if (page > 1) searchPlace(page - 1);
  };

  const goNext = () => {
    if (page < totalPages) searchPlace(page + 1);
  };

  const getPageNumbers = () => {
    const maxVisible = 5;

    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    const pages = [];

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  useEffect(() => {
    setPanelOpen?.(false);
  }, []);

  useEffect(() => {
    const mode = routeSegments[currentSegmentIndex]?.mode;

    if (mode === 'walk' || mode === 'car') {
      setTransportMode(mode);
    } else if (!optimized) {
      setTransportMode('car');
    }
  }, [currentSegmentIndex, routeSegments, optimized]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const closeAddSheet = () => {
    Animated.timing(sheetY, {
      toValue: 420,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setSearchedPlace(null);
      setPlaceName('');
      setTask('');
      sheetY.setValue(0);
      setClearSearchMarkerSignal((prev) => prev + 1);
    });
  };

  useEffect(() => {
    const backAction = () => {
      if (coordSheetOpen) {
        setCoordSheetOpen(false);
        setCoordLat('');
        setCoordLng('');
        onBack?.();
        return true;
      }

      if (mapSelectMode) {
        setMapSelectMode(false);
        return true;
      }

      if (addMenuOpen) {
        setAddMenuOpen(false);
        return true;
      }

      if (searchedPlace) {
        closeAddSheet();
        return true;
      }

      if (guideStartOpen) {
        setGuideStartOpen(false);
        return true;
      }

      if (visitListOpen) {
        setVisitListOpen(false);
        return true;
      }

      if (selected) {
        setSelected(null);
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => subscription.remove();
  }, [
    coordSheetOpen,
    mapSelectMode,
    addMenuOpen,
    searchedPlace,
    guideStartOpen,
    visitListOpen,
    selected,
  ]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 8,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          sheetY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90) {
          closeAddSheet();
        } else {
          Animated.spring(sheetY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

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

  const searchPlace = async (targetPage = 1) => {
    const q = keyword.trim();

    if (!q) {
      Alert.alert('입력 필요', '주소나 장소명을 입력하세요.');
      return;
    }

    if (!KAKAO_REST_API_KEY) {
      Alert.alert(
        'REST API 키 필요',
        '.env의 EXPO_PUBLIC_KAKAO_REST_API_KEY를 확인하세요.'
      );
      return;
    }

    try {
      setIsSearching(true);

      const keywordUrl =
        `https://dapi.kakao.com/v2/local/search/keyword.json` +
        `?query=${encodeURIComponent(q)}&page=${targetPage}&size=7`;

      const res = await fetch(keywordUrl, {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      });

      const data = await res.json();

      if (!data.documents || data.documents.length === 0) {
        Alert.alert('검색 실패', '검색 결과가 없습니다.');
        return;
      }

      setSearchResults(data.documents);
      setPage(targetPage);

      const total = Math.ceil(data.meta.pageable_count / PAGE_SIZE);
      setTotalPages(total);
      setSearchModalVisible(true);
    } catch (error) {
      console.log(error);
      Alert.alert('검색 오류', '주소 검색 중 문제가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const setNextPlace = async (loc) => {
    const first = loc;
    const lat = Number(first.y);
    const lng = Number(first.x);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      Alert.alert('검색 오류', '좌표를 읽지 못했습니다.');
      return;
    }

    const nextLoc = {
      detailAddress: first.place_name,
      roadAddress: first.road_address_name || first.address_name,
      lat,
      lng,
      task: '',
      priority: null,
    };

    sheetY.setValue(0);
    setSearchedPlace(nextLoc);
    setPlaceName(nextLoc.detailAddress);
    setTask('');
    setSearchModalVisible(false);
    setAddressSearchMode(false);
  };

  const resetAddModes = () => {
    setCoordSheetOpen(false);
    setSearchedPlace(null);
    setPlaceName('');
    setTask('');
    setCoordLat('');
    setCoordLng('');
    setMapSelectMode(false);
    setAddressSearchMode(false);
    sheetY.setValue(0);
    setClearSearchMarkerSignal((prev) => prev + 1);
  };

  const handleCoordinateNext = () => {
    const lat = Number(coordLat);
    const lng = Number(coordLng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      Alert.alert('입력 오류', '위도와 경도를 숫자로 입력하세요.');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert('입력 오류', '올바른 위도·경도 범위를 입력하세요.');
      return;
    }

    const nextLoc = {
      detailAddress: `좌표 위치 (${lat}, ${lng})`,
      roadAddress: `위도 ${lat}, 경도 ${lng}`,
      lat,
      lng,
      task: '',
      priority: null,
    };

    sheetY.setValue(0);
    setSearchedPlace(nextLoc);
    setPlaceName(nextLoc.detailAddress);
    setTask('');
    setCoordSheetOpen(false);
    setCoordLat('');
    setCoordLng('');
    setAddressSearchMode(false);
  };

  const addLocation = async () => {
    if (!searchedPlace) {
      Alert.alert('위치 필요', '먼저 위치를 선택하세요.');
      return;
    }

    if (!placeName.trim()) {
      Alert.alert('방문지 이름 필요', '방문지 이름을 입력하세요.');
      return;
    }

    const newLoc = {
      detailAddress: searchedPlace.detailAddress,
      roadAddress: searchedPlace.roadAddress || keyword.trim(),
      lat: searchedPlace.lat,
      lng: searchedPlace.lng,
      status: 'pending',
      task: task || '점검',
    };

    try {
      if (!API_BASE_URL) {
        throw new Error('API_BASE_URL 없음');
      }

      const res = await fetch(`${API_BASE_URL}/api/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoc),
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`저장 실패: ${res.status}`);
      }

      const savedLocation = JSON.parse(text);

      setLocations?.([
        ...markers,
        {
          ...savedLocation,
          status: savedLocation.status || 'pending',
          task: savedLocation.task || newLoc.task,
        },
      ]);

      setKeyword('');
      setAddressSearchMode(false);
      closeAddSheet();
    } catch (error) {
      console.log(error);
      Alert.alert(
        'DB 저장 실패',
        '백엔드 실행 상태와 EXPO_PUBLIC_API_BASE_URL을 확인하세요.'
      );
    }
  };

  const removeLocation = async (id) => {
    const nextLocations = markers.filter((loc) => loc.id !== id);
    setLocations?.(nextLocations);
  };

  const getPathDistance = (path = []) => {
    if (!path || path.length < 2) return null;

    let total = 0;

    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];

      const lat1 = Number(a.lat ?? a.latitude ?? a.y);
      const lng1 = Number(a.lng ?? a.longitude ?? a.x);
      const lat2 = Number(b.lat ?? b.latitude ?? b.y);
      const lng2 = Number(b.lng ?? b.longitude ?? b.x);

      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;

      const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;

      total += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    return total;
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

  const formatDistance = (meters) => {
    if (!meters) return null;

    if (meters >= 1000) {
      return `약 ${(meters / 1000).toFixed(1)}km`;
    }

    return `약 ${Math.round(meters)}m`;
  };

  const getGuideSummary = () => {
    if (!isGuiding) {
      return formatDuration(totalDuration)
        ? ` · 예상 이동시간 ${formatDuration(totalDuration)}`
        : '';
    }

    const currentSegment = routeSegments[currentSegmentIndex];

    if (!currentSegment) return '';

    const distance =
      currentSegment.totalDistance ??
      currentSegment.distance ??
      getPathDistance(currentSegment.path);

    const duration =
      currentSegment.totalDuration ??
      currentSegment.duration ??
      currentSegment.durationSeconds ??
      (distance ? distance / 5.5 : null);

    const distanceText = formatDistance(distance);
    const durationText = formatDuration(duration);

    if (distanceText && durationText) {
      return ` · 남은거리 ${distanceText} · 남은시간 ${durationText}`;
    }

    if (distanceText) {
      return ` · 남은거리 ${distanceText}`;
    }

    if (durationText) {
      return ` · 구간시간 ${durationText}`;
    }

    return '';
  };

  const handleOptimizeRoute = async (mode = transportMode) => {
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

      const cleanCurrentLocation = cleanLocation(currentLocation, '현재 위치');
      const cleanMarkers = markers
        .map((loc) => cleanLocation(loc))
        .filter((loc) => loc && !Number.isNaN(loc.lat) && !Number.isNaN(loc.lng));

      const res = await fetch(`${API_BASE_URL}/api/routes/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLocation: cleanCurrentLocation,
          locations: cleanMarkers,
          transportMode: mode,
        }),
      });

      const text = await res.text();

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
      }

      if (data.segments && data.segments.length > 0) {
        setRouteSegments(data.segments);
        setCurrentSegmentIndex(0);
      }

      if (data.totalDuration !== undefined && data.totalDuration !== null) {
        setTotalDuration(data.totalDuration);
      }

      setTransportMode(mode);
      setOptimized(true);
    } catch (error) {
      console.log(error);
      Alert.alert('오류', '경로 최적화 중 문제가 발생했습니다.');
    } finally {
      setOptimizing(false);
    }
  };

  const updateCurrentSegmentMode = async (mode) => {
    if (!API_BASE_URL) {
      Alert.alert('오류', '.env의 EXPO_PUBLIC_API_BASE_URL을 확인하세요.');
      return;
    }

    if (!currentLocation) {
      Alert.alert('현재 위치 필요', '현재 위치를 먼저 불러와야 합니다.');
      return;
    }

    if (!routeSegments || routeSegments.length === 0) {
      Alert.alert('구간 없음', '먼저 경로 최적화를 실행하세요.');
      return;
    }

    try {
      setSegmentChanging(true);
      setTransportMode(mode);

      const rawStart =
        currentSegmentIndex === 0
          ? currentLocation
          : orderedMarkers[currentSegmentIndex - 1];

      const rawEnd = orderedMarkers[currentSegmentIndex];

      const start = cleanLocation(rawStart, '현재 위치');
      const end = cleanLocation(rawEnd, '목적지');

      if (!start || !end) {
        Alert.alert('오류', '현재 구간 정보를 찾을 수 없습니다.');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/routes/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start,
          end,
          transportMode: mode,
        }),
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`구간 경로 변경 실패: ${res.status}`);
      }

      const data = JSON.parse(text);

      if (!data.segments || data.segments.length === 0) {
        Alert.alert('오류', '구간 경로를 받아오지 못했습니다.');
        return;
      }

      const updatedSegment = {
        ...data.segments[0],
        mode,
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
      };

      const updatedSegments = [...routeSegments];
      updatedSegments[currentSegmentIndex] = updatedSegment;

      setRouteSegments(updatedSegments);

      const mergedPath = updatedSegments.flatMap((segment) => segment.path || []);
      setRoadPath(mergedPath);

      const nextTotalDuration = updatedSegments.reduce((sum, segment) => {
        return sum + Number(segment.totalDuration || 0);
      }, 0);

      if (nextTotalDuration > 0) {
        setTotalDuration(nextTotalDuration);
      }
    } catch (error) {
      console.log(error);
      Alert.alert('오류', '현재 구간 경로 변경 중 문제가 발생했습니다.');
    } finally {
      setSegmentChanging(false);
    }
  };

  const handleTransportPress = (mode) => {
    if (optimized && isGuiding) {
      updateCurrentSegmentMode(mode);
      return;
    }

    handleOptimizeRoute(mode);
  };

  const handleReroute = async (newCurrentLocation) => {
    if (!API_BASE_URL) return;
    if (!routeSegments || routeSegments.length === 0) return;

    try {
      const rawEnd = orderedMarkers[currentSegmentIndex];

      const start = cleanLocation(newCurrentLocation, '현재 위치');
      const end = cleanLocation(rawEnd, '목적지');

      if (!start || !end) return;

      const res = await fetch(`${API_BASE_URL}/api/routes/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start,
          end,
          transportMode,
        }),
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error('재탐색 실패');
      }

      const data = JSON.parse(text);

      if (!data.segments || data.segments.length === 0) return;

      const updatedSegments = [...routeSegments];

      updatedSegments[currentSegmentIndex] = {
        ...data.segments[0],
        mode: transportMode,
      };

      setRouteSegments(updatedSegments);

      const mergedPath = updatedSegments.flatMap((segment) => segment.path || []);
      setRoadPath(mergedPath);
    } catch (error) {
      console.log(error);
    }
  };

  const movePrevSegment = () => {
    setCurrentSegmentIndex((prev) => Math.max(prev - 1, 0));
  };

  const moveNextSegment = () => {
    setCurrentSegmentIndex((prev) =>
      Math.min(prev + 1, routeSegments.length - 1)
    );
  };

  return (
    <View style={styles.container}>
      <KakaoMapWebView
        locations={orderedMarkers}
        roadPath={roadPath}
        routeSegments={routeSegments}
        currentSegmentIndex={currentSegmentIndex}
        panelOpen={false}
        setPanelOpen={setPanelOpen}
        isGuiding={isGuiding}
        searchedPlace={searchedPlace}
        clearSearchMarkerSignal={clearSearchMarkerSignal}
        mapSelectMode={mapSelectMode}
        onDirectPlaceSelect={(place) => {
          if (!mapSelectMode) return;

          sheetY.setValue(0);
          setSearchedPlace(place);
          setPlaceName(place.detailAddress || '지도 선택 위치');
          setTask('');
          setMapSelectMode(false);
        }}
        onCurrentLocationChange={setCurrentLocation}
        onMarkerClick={setSelected}
        onLocationsChange={setLocations}
        onRerouteRequest={handleReroute}
      />

      <View style={styles.topOverlay}>
        <View style={styles.searchControlRow}>
          <TouchableOpacity
            style={styles.searchBox}
            activeOpacity={0.9}
            onPress={() => {
              if (!addressSearchMode) setAddMenuOpen(true);
            }}
          >
            <TouchableOpacity onPress={onBack}>
              <Ionicons name="chevron-back" size={20} color="#12395B" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                resetAddModes();
                setAddressSearchMode(false);
                setAddMenuOpen(true);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="menu" size={18} color="#1F2D3D" />
            </TouchableOpacity>

            <TextInput
              ref={searchInputRef}
              value={keyword}
              onChangeText={setKeyword}
              placeholder="방문지를 추가해주세요"
              placeholderTextColor="#9AA6B2"
              style={styles.searchInput}
              returnKeyType="search"
              editable={addressSearchMode}
              onFocus={() => {
                if (!addressSearchMode) setAddMenuOpen(true);
              }}
              onSubmitEditing={() => {
                searchPlace(1);
                setPage(1);
              }}
            />

            {keyword.length > 0 && (
              <TouchableOpacity onPress={() => setKeyword('')}>
                <Ionicons name="close-circle" size={16} color="#9AA6B2" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => {
                searchPlace(1);
                setPage(1);
              }}
              disabled={isSearching}
            >
              <Ionicons name="search" size={18} color="#111827" />
            </TouchableOpacity>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.smallTopButton,
              priorityMode && styles.priorityActive,
            ]}
            onPress={() => setPriorityMode(!priorityMode)}
          >
            <Ionicons name="list" size={13} color="#0F3A5F" />
            <Text style={styles.smallTopText}>
              {priorityMode ? '선택중' : '우선순위'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.smallTopButton}
            onPress={() => handleOptimizeRoute(transportMode)}
            disabled={optimizing || segmentChanging}
          >
            <Ionicons name="git-branch-outline" size={13} color="#0F3A5F" />
            <Text style={styles.smallTopText}>
              {optimizing ? '계산중' : '경로 최적화'}
            </Text>
          </TouchableOpacity>
        </View>

        {addMenuOpen && (
          <View style={styles.addMenuBox}>
            <TouchableOpacity
              style={styles.addMenuItem}
              onPress={() => {
                resetAddModes();
                setAddMenuOpen(false);
                setAddressSearchMode(true);
                setTimeout(() => {
                  searchInputRef.current?.focus();
                }, 100);
              }}
            >
              <Ionicons name="location" size={18} color="#2563EB" />
              <View>
                <Text style={styles.addMenuTitle}>주소/장소로 검색</Text>
                <Text style={styles.addMenuDesc}>도로명, 지번, 상호명으로 검색</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addMenuItem}
              onPress={() => {
                resetAddModes();
                setAddMenuOpen(false);
                setAddressSearchMode(false);
                setMapSelectMode(false);
                setCoordSheetOpen(true);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="locate" size={18} color="#22C55E" />
              <View>
                <Text style={styles.addMenuTitle}>위도·경도로 입력</Text>
                <Text style={styles.addMenuDesc}>위도와 경도를 직접 입력</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addMenuItemLast}
              onPress={() => {
                resetAddModes();
                setAddMenuOpen(false);
                setAddressSearchMode(false);
                setCoordSheetOpen(false);
                setMapSelectMode(true);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="map" size={18} color="#7C3AED" />
              <View>
                <Text style={styles.addMenuTitle}>지도에서 직접 선택</Text>
                <Text style={styles.addMenuDesc}>지도를 눌러 위치 선택</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {mapSelectMode && (
          <TouchableOpacity
            style={styles.mapSelectNotice}
            onPress={() => setMapSelectMode(false)}
          >
            <Ionicons name="map" size={14} color="#FFFFFF" />
            <Text style={styles.mapSelectNoticeText}>
              지도에서 위치를 눌러주세요 · 취소하려면 터치
            </Text>
          </TouchableOpacity>
        )}

        {priorityMode && (
          <TouchableOpacity style={styles.priorityResetBox} onPress={resetPriority}>
            <Text style={styles.priorityResetText}>우선순위 초기화</Text>
          </TouchableOpacity>
        )}

        <View style={styles.chipRowWrap}>
          {orderedMarkers.length === 0 ? (
            <View style={styles.emptyChip}>
              <Ionicons name="location-outline" size={14} color="#8A98A8" />
              <Text style={styles.emptyChipText}>방문지 없음</Text>
            </View>
          ) : (
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
                      { backgroundColor: getStatusColor(item.status) },
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
          )}

          <TouchableOpacity
            style={styles.chevronButton}
            onPress={() => setVisitListOpen(!visitListOpen)}
          >
            <Ionicons
              name={visitListOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#1F2D3D"
            />
          </TouchableOpacity>
        </View>

        {visitListOpen && orderedMarkers.length > 0 && (
          <View style={styles.visitListCard}>
            <View style={styles.visitListHead}>
              <Text style={styles.visitCount}>방문지 {orderedMarkers.length}개</Text>

              <TouchableOpacity onPress={() => setVisitListOpen(false)}>
                <Text style={styles.foldText}>접기</Text>
              </TouchableOpacity>
            </View>

            {orderedMarkers.map((loc, index) => (
              <View
                key={`${loc.detailAddress || 'loc'}-${loc.lat}-${loc.lng}-${index}`}
                style={styles.visitItem}
              >
                <TouchableOpacity
                  style={styles.visitMain}
                  onPress={() => setSelected(loc)}
                >
                  <View
                    style={[
                      styles.visitNo,
                      { backgroundColor: getStatusColor(loc.status) },
                    ]}
                  >
                    <Text style={styles.visitNoText}>{index + 1}</Text>
                  </View>

                  <View style={styles.visitTextWrap}>
                    <Text style={styles.visitName} numberOfLines={1}>
                      {loc.detailAddress || '이름 없음'}
                    </Text>
                    <Text style={styles.visitTask} numberOfLines={1}>
                      {loc.task || getStatusLabel(loc.status)}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => removeLocation(loc.id)}>
                  <Text style={styles.deleteText}>삭제</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {optimized && (
          <View style={styles.doneRow}>
            <View style={[styles.doneBar, isGuiding && styles.guidingBar]}>
              <Text style={styles.doneText}>
                {isGuiding
                  ? `안내 중 · ${currentSegmentIndex + 1}/${routeSegments.length}구간`
                  : '경로 계산 완료'}
                {getGuideSummary()}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.modeButton,
                transportMode === 'car' && styles.modeButtonActive,
              ]}
              onPress={() => handleTransportPress('car')}
              disabled={optimizing || segmentChanging}
            >
              <Ionicons
                name="car"
                size={18}
                color={transportMode === 'car' ? '#FFFFFF' : '#12395B'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                transportMode === 'walk' && styles.modeButtonActive,
              ]}
              onPress={() => handleTransportPress('walk')}
              disabled={optimizing || segmentChanging}
            >
              <Ionicons
                name="walk"
                size={18}
                color={transportMode === 'walk' ? '#FFFFFF' : '#12395B'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                isGuiding ? styles.stopGuideButton : styles.modeButtonActive,
              ]}
              onPress={() => {
                if (isGuiding) {
                  setIsGuiding(false);
                } else {
                  setGuideStartOpen(true);
                }
              }}
            >
              <Ionicons
                name={isGuiding ? 'stop-circle' : 'play-circle'}
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        )}

        {isGuiding && routeSegments.length > 0 && (
          <View style={styles.segmentControlBar}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                currentSegmentIndex === 0 && styles.segmentButtonDisabled,
              ]}
              onPress={movePrevSegment}
              disabled={currentSegmentIndex === 0}
            >
              <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.segmentText} numberOfLines={1}>
              {routeSegments[currentSegmentIndex]?.fromName || '현재 위치'} →{' '}
              {routeSegments[currentSegmentIndex]?.toName || '목적지'}
            </Text>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                currentSegmentIndex === routeSegments.length - 1 &&
                  styles.segmentButtonDisabled,
              ]}
              onPress={moveNextSegment}
              disabled={currentSegmentIndex === routeSegments.length - 1}
            >
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {coordSheetOpen && (
        <Animated.View
          style={[
            styles.addSheet,
            keyboardVisible && styles.addSheetKeyboardUp,
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.coordHeader}>
            <Text style={styles.addTitle}>위도·경도 입력</Text>

            <TouchableOpacity
              onPress={() => {
                setCoordSheetOpen(false);
                setCoordLat('');
                setCoordLng('');
              }}
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.coordRow}>
            <View style={styles.coordInputWrap}>
              <Text style={styles.coordLabel}>위도</Text>
              <TextInput
                value={coordLat}
                onChangeText={setCoordLat}
                placeholder="예) 35.233123"
                placeholderTextColor="#9AA6B2"
                keyboardType="decimal-pad"
                style={styles.coordInput}
              />
            </View>

            <View style={styles.coordInputWrap}>
              <Text style={styles.coordLabel}>경도</Text>
              <TextInput
                value={coordLng}
                onChangeText={setCoordLng}
                placeholder="예) 129.084321"
                placeholderTextColor="#9AA6B2"
                keyboardType="decimal-pad"
                style={styles.coordInput}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.addButton} onPress={handleCoordinateNext}>
            <Text style={styles.addButtonText}>다음</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {searchedPlace && (
        <Animated.View
          style={[
            styles.addSheet,
            keyboardVisible && styles.addSheetKeyboardUp,
            {
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.sheetHandle} />

          <Text style={styles.addTitle}>방문지 추가</Text>

          <View style={styles.inputBox}>
            <Ionicons name="location-outline" size={18} color="#6B7280" />
            <TextInput
              value={placeName}
              onChangeText={setPlaceName}
              placeholder="방문지 이름"
              placeholderTextColor="#9AA6B2"
              style={styles.addInput}
            />
          </View>

          <View style={styles.inputBox}>
            <Ionicons name="pricetag-outline" size={18} color="#6B7280" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {['점검', '공사', '안전', '환경', '민원'].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.categoryChip,
                    task === item && styles.categoryChipActive,
                  ]}
                  onPress={() => setTask(item)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      task === item && styles.categoryTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.addButton} onPress={addLocation}>
            <Text style={styles.addButtonText}>방문지 추가</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {(optimizing || segmentChanging) && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingTitle}>
            {segmentChanging ? '구간 경로 변경 중' : '경로 최적화 중'}
          </Text>
          <Text style={styles.loadingDesc}>
            {segmentChanging
              ? '현재 구간의 이동수단 기준으로 경로를 다시 계산합니다.'
              : '방문 순서와 실제 도로 경로를 계산합니다.'}
          </Text>
        </View>
      )}

      <Modal
        visible={guideStartOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGuideStartOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBg}
          activeOpacity={1}
          onPress={() => setGuideStartOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />

            <Text style={styles.routeTitle}>GUIDE START</Text>
            <Text style={styles.placeName}>이 경로로 안내를 시작할까요?</Text>
            <Text style={styles.placeAddr}>
              안내 시작 후 현재 구간 중심으로 경로 안내가 진행됩니다.
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.sheetButton}
                onPress={() => setGuideStartOpen(false)}
              >
                <Text style={styles.sheetLabel}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetButton}
                onPress={() => {
                  setGuideStartOpen(false);
                  setCurrentSegmentIndex(0);
                  setIsGuiding(true);
                }}
              >
                <Text style={styles.sheetLabel}>안내 시작</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
              <View
                style={[
                  styles.placeIcon,
                  { backgroundColor: getStatusColor(selected?.status) },
                ]}
              >
                <Text style={styles.placeIconText}>📍</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.placeName}>
                  {selected?.name || '이름 없음'}
                </Text>
                <Text style={styles.placeAddr}>
                  {selected?.address || selected?.task || '주소 없음'}
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

      <Modal
        visible={searchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <View style={styles.searchModalBackdrop}>
          <View style={styles.searchModal}>
            <Text style={styles.searchModalTitle}>검색 결과</Text>

            <ScrollView>
              {searchResults.map((place, index) => (
                <TouchableOpacity
                  key={`${place.id || place.place_name || index}`}
                  style={styles.searchResultItem}
                  onPress={() => setNextPlace(place)}
                >
                  <Text style={styles.searchResultName}>
                    {place.place_name || place.address_name}
                  </Text>

                  <Text style={styles.searchResultAddress}>
                    {place.road_address_name || place.address_name}
                  </Text>
                </TouchableOpacity>
              ))}

              <View style={styles.pagination}>
                <TouchableOpacity onPress={goFirst}>
                  <Text style={styles.pageBtn}>{'<<'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={goPrev}>
                  <Text style={styles.pageBtn}>{'<'}</Text>
                </TouchableOpacity>

                {getPageNumbers().map((p) => (
                  <TouchableOpacity key={p} onPress={() => searchPlace(p)}>
                    <Text
                      style={[
                        styles.pageNumber,
                        p === page && styles.pageActive,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity onPress={goNext}>
                  <Text style={styles.pageBtn}>{'>'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={goLast}>
                  <Text style={styles.pageBtn}>{'>>'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSearchModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FA',
  },

  topOverlay: {
    position: 'absolute',
    top: 48,
    left: 10,
    right: 10,
    zIndex: 20,
  },

  searchControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  searchBox: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2D3D',
    paddingVertical: 0,
  },

  smallTopButton: {
    height: 46,
    minWidth: 78,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  smallTopText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F3A5F',
  },

  priorityActive: {
    backgroundColor: '#FFF7E6',
    borderColor: '#FACC15',
  },

  priorityResetBox: {
    alignSelf: 'flex-end',
    marginTop: 7,
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },

  priorityResetText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  chipRowWrap: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
    maxWidth: 178,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EDF3',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 12,
  },

  no: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },

  chipText: {
    fontSize: 10,
    color: '#1F2D3D',
    fontWeight: '900',
    maxWidth: 130,
  },

  emptyChip: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },

  emptyChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#607086',
  },

  chevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FA',
    marginLeft: 4,
  },

  visitListCard: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 13,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },

  visitListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },

  visitCount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  foldText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#12395B',
    backgroundColor: '#EAF1F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  visitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },

  visitMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  visitNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  visitNoText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  visitTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  visitName: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  visitTask: {
    marginTop: 2,
    fontSize: 10,
    color: '#718096',
  },

  deleteText: {
    fontSize: 11,
    color: '#E74C3C',
    fontWeight: '900',
    paddingHorizontal: 6,
  },

  doneRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  doneBar: {
    flex: 1,
    backgroundColor: '#12395B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },

  guidingBar: {
    backgroundColor: '#1F9D55',
  },

  doneText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },

  modeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E1EA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  modeButtonActive: {
    backgroundColor: '#12395B',
    borderColor: '#12395B',
  },

  stopGuideButton: {
    backgroundColor: '#E74C3C',
    borderColor: '#E74C3C',
  },

  segmentControlBar: {
    marginTop: 8,
    backgroundColor: 'rgba(18, 57, 91, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  segmentText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  segmentButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  segmentButtonDisabled: {
    backgroundColor: '#94A3B8',
  },

  addSheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 50,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 16,
    zIndex: 30,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },

  addSheetKeyboardUp: {
    bottom: 350,
  },

  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C9D3DF',
    alignSelf: 'center',
    marginBottom: 13,
  },

  addTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
  },

  inputBox: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },

  addInput: {
    flex: 1,
    fontSize: 13,
    color: '#1F2D3D',
    paddingVertical: 0,
  },

  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F4F7FA',
    marginRight: 7,
  },

  categoryChipActive: {
    backgroundColor: '#12395B',
  },

  categoryText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#607086',
  },

  categoryTextActive: {
    color: '#FFFFFF',
  },

  addButton: {
    height: 50,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  addButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 100,
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
    textAlign: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeIconText: {
    fontSize: 20,
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

  routeTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#607086',
    letterSpacing: 1.6,
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

  searchModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  searchModal: {
    width: '88%',
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
  },

  searchModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 14,
    color: '#12395B',
  },

  searchResultItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EDF3',
  },

  searchResultName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2D3D',
  },

  searchResultAddress: {
    marginTop: 4,
    fontSize: 12,
    color: '#718096',
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },

  pageBtn: {
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 6,
  },

  pageNumber: {
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#333',
  },

  pageActive: {
    backgroundColor: '#12395B',
    color: '#fff',
    borderRadius: 6,
    overflow: 'hidden',
  },

  closeButton: {
    marginTop: 14,
    backgroundColor: '#12395B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },

  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  addMenuBox: {
    marginTop: 8,
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },

  addMenuItemLast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },

  addMenuTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  addMenuDesc: {
    marginTop: 2,
    fontSize: 9,
    color: '#8A98A8',
  },

  coordRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },

  coordInputWrap: {
    flex: 1,
  },

  coordLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1F2D3D',
    marginBottom: 6,
  },

  coordInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#1F2D3D',
    backgroundColor: '#FFFFFF',
  },

  coordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  mapSelectNotice: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  mapSelectNoticeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
});