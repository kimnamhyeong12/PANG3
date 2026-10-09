import { showAlert } from '../components/CustomAlert';
// 키보드 자판 내 엔터가 안먹힘
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import KakaoMapWebView from '../components/KakaoMapWebView';
import { BUSAN_DISTRICT_CODES } from './PublicDataMapMode';
import { locationKey, numberVisits, numberOptimizedVisits } from '../utils/routeSession';
import {
  stopRouteNotification,
  updateRouteNotification,
} from '../services/notificationService';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const EMPTY_MARKERS = [];
const PUBLIC_FACILITY_CATEGORIES = [
  { key: 'aed', label: '심폐제세동기', shortLabel: 'AED', icon: 'medkit-outline' },
  { key: 'bus', label: '버스정류장', shortLabel: '버스정류장', icon: 'bus-outline' },
];

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWorkDateKey = (item) => {
  const value = item?.workDate ?? item?.work_date ?? item?.createdAt ?? item?.created_at;
  return value ? String(value).slice(0, 10) : '';
};

const formatShortDate = (value) => {
  const key = value ? String(value).slice(0, 10) : '';
  const parts = key.split('-');
  if (parts.length !== 3) return '';
  return `${parts[1]}.${parts[2]}`;
};

const getStatusColor = (status) => {
  if (status === 'complete') return '#1F9D55';
  if (status === 'working') return '#FACC15';
  return '#E74C3C';
};

const getStatusLabel = (status) => {
  if (status === 'complete') return '작업 후';
  if (status === 'working') return '작업 중';
  return '작업 전';
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
    task: loc.task || loc.taskCategory || loc.task_category || '',
    createdAt: loc.createdAt || loc.created_at || null,
    workDate: loc.workDate || loc.work_date || null,
    scheduledDate:
      loc.scheduledDate ||
      loc.scheduled_date ||
      loc.workDate ||
      loc.work_date ||
      null,
    priority: loc.priority ?? null,
  };
};

const geoDistance = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat1 = Number(a.lat ?? a.latitude);
  const lng1 = Number(a.lng ?? a.longitude);
  const lat2 = Number(b.lat ?? b.latitude);
  const lng2 = Number(b.lng ?? b.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const geometricFixedEndOrder = (start, visits, home) => {
  const remaining = [...visits];
  const result = [];
  let cursor = start;

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const score = geoDistance(cursor, candidate) + geoDistance(candidate, home) * 0.18;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    result.push(next);
    cursor = next;
  }

  const routeCost = (order) => {
    let total = 0;
    let point = start;
    order.forEach((item) => { total += geoDistance(point, item); point = item; });
    total += geoDistance(point, home);
    return total;
  };

  let improved = true;
  while (improved) {
    improved = false;
    let currentCost = routeCost(result);
    for (let i = 0; i < result.length - 1; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const candidate = [...result];
        candidate.splice(i, j - i + 1, ...candidate.slice(i, j + 1).reverse());
        const candidateCost = routeCost(candidate);
        if (candidateCost + 0.5 < currentCost) {
          result.splice(0, result.length, ...candidate);
          currentCost = candidateCost;
          improved = true;
        }
      }
    }
  }

  return result;
};

function NormalMapScreen({
  isActive = true,
  user,
  onBack,
  onLocationClick,
  onDataChanged,
  locations,
  setLocations,
  previewMarkers = EMPTY_MARKERS,
  previewOnlyRegistrations = false,
  activeGroup,
  locationScope = 'personal',
  groupAssignments = [],
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
  onSwitchToPublic,
  routeResumeToken = 0,
  selectedDong: persistedSelectedDong = null,
  onSelectedDongChange,
  pendingWork = [],
  onAddWork,
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
  const [locationSettingMode, setLocationSettingMode] = useState(false);
  const [locationMoving, setLocationMoving] = useState(false);
  const [directCenter, setDirectCenter] = useState(null);
  const [centerAddress, setCenterAddress] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [coordSheetOpen, setCoordSheetOpen] = useState(false);
  const [coordLat, setCoordLat] = useState('');
  const [coordLng, setCoordLng] = useState('');

  const [priorityMode, setPriorityMode] = useState(false);
  const [selectionPurpose, setSelectionPurpose] = useState('visit');
  const [returnLocation, setReturnLocation] = useState(null);
  const [priorityMap, setPriorityMap] = useState({});
  const [priorityLoaded, setPriorityLoaded] = useState(false);
  const [publicFacilityMode, setPublicFacilityMode] = useState(false);
  const [publicSheetOpen, setPublicSheetOpen] = useState(true);
  const [publicCategoryOpen, setPublicCategoryOpen] = useState(false);
  const [publicCategory, setPublicCategory] = useState('');
  const [publicItems, setPublicItems] = useState([]);
  const [publicSelectedIds, setPublicSelectedIds] = useState([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicSaving, setPublicSaving] = useState(false);
  const [visitListOpen, setVisitListOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingSelected, setPendingSelected] = useState([]);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [dongOpen, setDongOpen] = useState(false);
  const [dongOptions, setDongOptions] = useState([]);
  const [dongLoading, setDongLoading] = useState(false);
  const selectedDong = persistedSelectedDong;
  const selectedDongBoundary = useMemo(() => selectedDong
    ? { type: 'FeatureCollection', features: [selectedDong] }
    : null, [selectedDong]);

  const sheetY = useRef(new Animated.Value(0)).current;
  const publicSheetY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!publicSheetOpen) publicSheetY.setValue(0);
  }, [publicSheetOpen, publicSheetY]);
  const searchInputRef = useRef(null);
  const guideAdvanceRef = useRef(false);

  const visitNumbersRef = useRef({});
  const autoRouteKeyRef = useRef('');
  const visitNumberScopeRef = useRef(null);
  const returnStorageKey = `pang3:return-location:${user?.userId || 'guest'}`;
  const priorityStorageKey = `pang3:route-priorities:${user?.userId || 'guest'}:${locationScope}:${activeGroup?.groupId || 'personal'}`;

  useEffect(() => {
    let active = true;
    setPriorityLoaded(false);
    AsyncStorage.getItem(priorityStorageKey)
      .then((raw) => {
        if (!active) return;
        if (!raw) {
          setPriorityMap({});
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          setPriorityMap(parsed && typeof parsed === 'object' ? parsed : {});
        } catch {
          setPriorityMap({});
        }
      })
      .catch(() => { if (active) setPriorityMap({}); })
      .finally(() => { if (active) setPriorityLoaded(true); });
    return () => { active = false; };
  }, [priorityStorageKey]);

  useEffect(() => {
    if (!priorityLoaded) return;
    AsyncStorage.setItem(priorityStorageKey, JSON.stringify(priorityMap)).catch(() => {});
  }, [priorityLoaded, priorityMap, priorityStorageKey]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(returnStorageKey)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          const lat = Number(parsed?.lat);
          const lng = Number(parsed?.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setReturnLocation({ ...parsed, lat, lng, isReturnLocation: true });
          }
        } catch {}
      })
      .catch(() => {});
    return () => { active = false; };
  }, [returnStorageKey]);

  const saveReturnLocation = async (location) => {
    const next = location ? { ...location, isReturnLocation: true } : null;
    setReturnLocation(next);
    try {
      if (next) await AsyncStorage.setItem(returnStorageKey, JSON.stringify(next));
      else await AsyncStorage.removeItem(returnStorageKey);
    } catch (error) {
      console.log('[ReturnLocation] 저장 실패:', error?.message || error);
    }
  };
  useEffect(() => {
    if (!mapSelectMode || !directCenter || !KAKAO_REST_API_KEY) return undefined;
    let cancelled = false;
    setCenterAddress('주소 확인 중...');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${encodeURIComponent(directCenter.lng)}&y=${encodeURIComponent(directCenter.lat)}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
        if (!response.ok) throw new Error('주소 조회 실패');
        const data = await response.json();
        if (!cancelled) setCenterAddress(data.documents?.[0]?.road_address?.address_name || data.documents?.[0]?.address?.address_name || '주소를 확인할 수 없습니다.');
      } catch {
        if (!cancelled) setCenterAddress('주소를 확인할 수 없습니다.');
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mapSelectMode, directCenter?.lat, directCenter?.lng]);
  const loadDongs = async () => {
    const admCode = user?.workSido === '부산광역시'
      ? BUSAN_DISTRICT_CODES[user?.workSigungu]
      : activeGroup?.regionAdmCode;
    if (!admCode) {
      showAlert('지역 정보 필요', '설정에서 근무 시·군·구를 선택해주세요.');
      return;
    }
    setDongOpen(true);
    try {
      setDongLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/sgis/boundaries?admCode=${encodeURIComponent(admCode)}`);
      if (!response.ok) throw new Error('경계를 불러오지 못했습니다.');
      const data = await response.json();
      setDongOptions(Array.isArray(data?.features) ? data.features : []);
    } catch (error) {
      showAlert('행정동 조회 실패', error.message);
    } finally {
      setDongLoading(false);
    }
  };
  const routeMarkers = useMemo(() => {
    const scope = locationScope === 'personal'
      ? `${user?.userId}:personal`
      : `${user?.userId}:${activeGroup?.groupId}:${locationScope}`;
    if (visitNumberScopeRef.current !== scope) {
      visitNumbersRef.current = {};
      visitNumberScopeRef.current = scope;
    }
    const numbered = numberVisits(locations || [], visitNumbersRef.current)
      .map((row) => {
        const key = locationKey(row);
        const storedPriority = Number(priorityMap[key]);
        return {
          ...row,
          priority: Number.isFinite(storedPriority) && storedPriority > 0
            ? storedPriority
            : null,
        };
      });
    numbered.forEach((row) => { visitNumbersRef.current[locationKey(row)] = row.markerNumber; });
    return numbered;
  }, [locations, user?.userId, activeGroup?.groupId, locationScope, priorityMap]);
  const markers = useMemo(() => [...routeMarkers].sort((a, b) => a.markerNumber - b.markerNumber), [routeMarkers]);
  const orderedMarkers = useMemo(() => routeMarkers.filter((item) => item.status !== 'complete'), [routeMarkers]);

  // Priority markers always occupy the front slots. Non-priority markers continue
  // with normal numbers immediately after P1, P2, ... so the visible order is
  // unambiguous while priorities are being edited.
  const activeDisplayMarkers = useMemo(() => {
    const prioritized = orderedMarkers
      .filter((item) => Number.isFinite(Number(item.priority)) && Number(item.priority) > 0)
      .sort((a, b) => Number(a.priority) - Number(b.priority));
    const prioritizedKeys = new Set(prioritized.map(locationKey));
    const normal = orderedMarkers
      .filter((item) => !prioritizedKeys.has(locationKey(item)))
      .sort((a, b) => Number(a.markerNumber || 0) - Number(b.markerNumber || 0));
    const priorityCount = prioritized.length;

    return [
      ...prioritized.map((item) => ({ ...item, markerLabel: `P${Number(item.priority)}` })),
      ...normal.map((item, index) => ({ ...item, markerLabel: String(priorityCount + index + 1) })),
    ];
  }, [orderedMarkers]);

  // The visit chips/list use the same visual ordering. Removing a priority puts
  // the item back into the normal marker-number order, and the remaining labels
  // close the gap automatically.
  const visitDisplayMarkers = useMemo(() => {
    const prioritized = markers
      .filter((item) => Number.isFinite(Number(item.priority)) && Number(item.priority) > 0)
      .sort((a, b) => Number(a.priority) - Number(b.priority));
    const prioritizedKeys = new Set(prioritized.map(locationKey));
    const normal = markers
      .filter((item) => !prioritizedKeys.has(locationKey(item)))
      .sort((a, b) => Number(a.markerNumber || 0) - Number(b.markerNumber || 0));
    const priorityCount = prioritized.length;

    return [
      ...prioritized.map((item) => ({ ...item, displayMarkerLabel: `P${Number(item.priority)}` })),
      ...normal.map((item, index) => ({ ...item, displayMarkerLabel: String(priorityCount + index + 1) })),
    ];
  }, [markers]);
  const completedDisplayMarkers = useMemo(() => markers
    .filter((item) => item.status === 'complete')
    .map((item) => ({ ...item, markerLabel: String(item.markerNumber || '') })), [markers]);
  const returnDisplayMarker = useMemo(() => {
    if (!returnLocation || !Number.isFinite(Number(returnLocation.lat)) || !Number.isFinite(Number(returnLocation.lng))) return null;
    const markerNumber = markers.length + 1;
    return {
      id: '__return_location__',
      lat: Number(returnLocation.lat),
      lng: Number(returnLocation.lng),
      detailAddress: returnLocation.detailAddress || '복귀 위치',
      roadAddress: returnLocation.roadAddress || '',
      status: 'return',
      isReturnLocation: true,
      markerNumber,
      markerLabel: String(markerNumber),
      color: '#2477F3',
    };
  }, [returnLocation, markers.length]);
  const guideTargets = useMemo(() => {
    if (!returnLocation) return orderedMarkers;
    return [
      ...orderedMarkers,
      {
        id: '__return_location__',
        lat: Number(returnLocation.lat),
        lng: Number(returnLocation.lng),
        detailAddress: returnLocation.detailAddress || '복귀 위치',
        roadAddress: returnLocation.roadAddress || '',
        status: 'return',
        isReturnLocation: true,
      },
    ];
  }, [orderedMarkers, returnLocation]);
  const mapOnlyMarkers = useMemo(() => {
    const routeKeys = new Set(routeMarkers.map(locationKey));
    const lastNumber = Math.max(0, ...markers.map((item) => item.markerNumber || 0));
    return previewMarkers.filter((item) => !routeKeys.has(locationKey(item)))
      .map((item, index) => ({ ...item, markerNumber: lastNumber + index + 1 }));
  }, [previewMarkers, routeMarkers, markers]);
  const publicDisplayItems = useMemo(() => {
    const categoryInfo = PUBLIC_FACILITY_CATEGORIES.find((entry) => entry.key === publicCategory);
    return publicItems.map((item) => ({
      ...item,
      isPublicFacility: true,
      markerLabel: categoryInfo?.shortLabel === 'AED' ? 'AED' : 'B',
      markerColor: publicSelectedIds.includes(item.id) ? '#0CA678' : '#2477F3',
    }));
  }, [publicItems, publicSelectedIds, publicCategory]);
  const resumedTokenRef = useRef(null);
  const assignmentMap = useMemo(() => {
    const map = new Map();
    groupAssignments.forEach((item) => map.set(Number(item.taskId), item));
    return map;
  }, [groupAssignments]);

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
    if (!isActive) {
      return undefined;
    }

    const backAction = () => {
      if (coordSheetOpen) {
        setCoordSheetOpen(false);
        setCoordLat('');
        setCoordLng('');
        onBack?.();
        return true;
      }

      if (mapSelectMode) {
        setLocationSettingMode(false);
        setMapSelectMode(false);
        setDirectCenter(null);
        setCenterAddress('');
        setClearSearchMarkerSignal((prev) => prev + 1);
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
    isActive,
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

  const publicSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        publicSheetY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 65 || (gesture.dy > 20 && gesture.vy > 0.8)) {
          Animated.timing(publicSheetY, {
            toValue: 280,
            duration: 220,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) {
              setPublicSheetOpen(false);
            } else {
              Animated.spring(publicSheetY, { toValue: 0, useNativeDriver: true }).start();
            }
          });
        } else {
          Animated.spring(publicSheetY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(publicSheetY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const handleSetPriority = (targetLocation) => {
    if (targetLocation?.isReturnLocation || targetLocation?.isPublicFacility) return;
    if (!priorityMode) {
      onLocationClick?.(targetLocation, 'report');
      return;
    }

    const targetKey = locationKey(targetLocation);
    const currentPriority = Number(priorityMap[targetKey]);
    const hasPriority = Number.isFinite(currentPriority) && currentPriority > 0;
    const priorities = Object.entries(priorityMap)
      .map(([key, value]) => ({ key, priority: Number(value) }))
      .filter((item) => Number.isFinite(item.priority) && item.priority > 0)
      .sort((a, b) => a.priority - b.priority);

    setPriorityMap((previous) => {
      const next = { ...previous };
      if (hasPriority) {
        delete next[targetKey];
        Object.entries(next).forEach(([key, value]) => {
          const priority = Number(value);
          if (Number.isFinite(priority) && priority > currentPriority) {
            next[key] = priority - 1;
          }
        });
      } else {
        next[targetKey] = priorities.length + 1;
      }
      return next;
    });
  };

  useEffect(() => {
    if (!publicFacilityMode || !publicCategory) {
      setPublicItems([]);
      setPublicSelectedIds([]);
      return undefined;
    }
    const props = selectedDong?.properties || {};
    const fullName = String(props.adm_nm || props.adm_name || props.name || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const selectedSido = props.sido_nm || parts[0] || activeGroup?.regionSido || user?.workSido || '부산광역시';
    const selectedSigungu = props.sgg_nm || (parts.length >= 3 ? parts[parts.length - 2] : '') || activeGroup?.regionSigungu || user?.workSigungu || '';
    const selectedAdminDong = parts.length ? parts[parts.length - 1] : '';
    const admCode = props.adm_cd || props.admCode || '';

    // 공공시설물은 외부 공공데이터 API를 호출하지 않고,
    // 서버 DB에 저장된 AED/버스정류장을 행정동 이름으로 직접 조회한다.
    if (!selectedAdminDong && !admCode) {
      setPublicItems([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setPublicLoading(true);
        const query = new URLSearchParams({ category: publicCategory });
        if (selectedSido) query.append('sido', selectedSido);
        if (selectedSigungu) query.append('sigungu', selectedSigungu);
        if (selectedAdminDong) query.append('adminDong', selectedAdminDong);
        if (admCode) query.append('admCode', admCode); // 구버전 서버 fallback 호환
        const response = await fetch(`${API_BASE_URL}/api/public-data?${query.toString()}`);
        const text = await response.text();
        if (!response.ok) throw new Error(text || '공공시설물 조회 실패');
        const data = JSON.parse(text);
        if (!cancelled) setPublicItems(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if (!cancelled) {
          setPublicItems([]);
          showAlert('공공시설물 조회 실패', error.message || '공공시설물을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setPublicLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicFacilityMode, publicCategory, selectedDong, activeGroup?.regionSido, activeGroup?.regionSigungu, user?.workSido, user?.workSigungu]);

  const togglePublicFacility = (item) => {
    setPublicSelectedIds((previous) => previous.includes(item.id)
      ? previous.filter((id) => id !== item.id)
      : [...previous, item.id]);
  };

  const registerPublicFacilities = async () => {
    if (!activeGroup?.groupId) {
      showAlert('업무공간 선택 필요', '방문지를 등록할 업무공간을 먼저 선택하세요.');
      return;
    }
    if (!publicSelectedIds.length || publicSaving) return;
    try {
      setPublicSaving(true);
      const selectedItems = publicItems.filter((item) => publicSelectedIds.includes(item.id));
      const registered = [];
      const personalWorkspace = Boolean(
        activeGroup?.personalWorkspace || activeGroup?.personal || activeGroup?.workspaceType === 'PERSONAL'
      );
      for (const item of selectedItems) {
        const response = await fetch(`${API_BASE_URL}/api/locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            detailAddress: item.detailAddress,
            roadAddress: item.roadAddress,
            lat: item.lat,
            lng: item.lng,
            taskCategory: item.task,
            status: 'pending',
            sido: item.sido,
            sigungu: item.sigungu,
            adminDong: item.adminDong,
            createdByUserId: user?.userId,
            groupId: activeGroup.groupId,
            deferAssignment: !personalWorkspace,
          }),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(text || '공공시설물 방문지 등록 실패');
        const saved = JSON.parse(text);
        registered.push({
          ...saved,
          id: saved.id ?? saved.taskId ?? saved.task_id,
          detailAddress: saved.detailAddress || item.detailAddress,
          roadAddress: saved.roadAddress || item.roadAddress,
          lat: saved.lat ?? item.lat,
          lng: saved.lng ?? item.lng,
          status: saved.status || saved.taskStatus || 'pending',
          task: saved.taskCategory || saved.task || item.task,
          sido: saved.sido || item.sido,
          sigungu: saved.sigungu || item.sigungu,
          adminDong: saved.adminDong || item.adminDong,
        });
      }
      setLocations?.((previous) => {
        const source = Array.isArray(previous) ? previous : (locations || []);
        const byId = new Map(source.map((item) => [String(item.id ?? item.taskId ?? item.task_id), item]));
        registered.forEach((item) => byId.set(String(item.id ?? item.taskId ?? item.task_id), item));
        return Array.from(byId.values());
      });
      setPublicFacilityMode(false);
      setPublicCategoryOpen(false);
      setPublicCategory('');
      setPublicItems([]);
      setPublicSelectedIds([]);
      await onDataChanged?.();
      showAlert('방문지 등록 완료', `${selectedItems.length}건을 방문지로 등록했습니다.`);
    } catch (error) {
      showAlert('방문지 등록 실패', error.message || '등록 중 문제가 발생했습니다.');
    } finally {
      setPublicSaving(false);
    }
  };

  const searchPlace = async (targetPage = 1) => {
    const q = keyword.trim();

    if (!q) {
      showAlert('입력 필요', '주소나 장소명을 입력하세요.');
      return;
    }

    if (!KAKAO_REST_API_KEY) {
      showAlert(
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
        showAlert('검색 실패', '검색 결과가 없습니다.');
        return;
      }

      setSearchResults(data.documents);
      setPage(targetPage);

      const total = Math.ceil(data.meta.pageable_count / PAGE_SIZE);
      setTotalPages(total);
      setSearchModalVisible(true);
    } catch (error) {
      console.log(error);
      showAlert('검색 오류', '주소 검색 중 문제가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const setNextPlace = async (loc) => {
    const first = loc;
    const lat = Number(first.y);
    const lng = Number(first.x);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      showAlert('검색 오류', '좌표를 읽지 못했습니다.');
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
    setLocationSettingMode(false);
    setDirectCenter(null);
    setCenterAddress('');
    setAddressSearchMode(false);
    setPublicFacilityMode(false);
    setPublicCategoryOpen(false);
    setPublicCategory('');
    setPublicItems([]);
    setPublicSelectedIds([]);
    sheetY.setValue(0);
    setClearSearchMarkerSignal((prev) => prev + 1);
  };

  const handleCoordinateNext = () => {
    const lat = Number(coordLat);
    const lng = Number(coordLng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      showAlert('입력 오류', '위도와 경도를 숫자로 입력하세요.');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showAlert('입력 오류', '올바른 위도·경도 범위를 입력하세요.');
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

  const getAdministrativeRegion = async (lat, lng) => {
    if (!KAKAO_REST_API_KEY) {
      throw new Error('카카오 REST API 키가 없습니다.');
    }

    const url =
      'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json' +
      `?x=${encodeURIComponent(lng)}` +
      `&y=${encodeURIComponent(lat)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`행정구역 조회 실패: ${response.status}`);
    }

    const data = await response.json();

    // H = 행정동
    const region = data.documents?.find(
      (item) => item.region_type === 'H'
    );

    if (!region) {
      return null;
    }

    return {
      sido: region.region_1depth_name,
      sigungu: region.region_2depth_name,
      adminDong: region.region_3depth_name,
    };
  };

  const addLocation = async () => {
    if (!searchedPlace) {
      showAlert('위치 필요', '먼저 위치를 선택하세요.');
      return;
    }

    if (!placeName.trim()) {
      showAlert('방문지 이름 필요', '방문지 이름을 입력하세요.');
      return;
    }

    const region = await getAdministrativeRegion(
      searchedPlace.lat,
      searchedPlace.lng
    );

    console.log('행정구역 확인:', region);

    const newLoc = {
      detailAddress: placeName.trim(),
      roadAddress: searchedPlace.roadAddress || keyword.trim(),
      lat: searchedPlace.lat,
      lng: searchedPlace.lng,
      status: 'pending',
      task: task || '',
      // workDate는 최초 등록일, scheduledDate는 현재 업무 목록 배치일이다.
      workDate: getLocalDateKey(),
      scheduledDate: getLocalDateKey(),

      sido: region?.sido || null,
      sigungu: region?.sigungu || null,
      adminDong: region?.adminDong || null,
      createdByUserId: user?.userId,
      // 1인/다인 구분 없이 모든 방문지는 현재 선택된 실제 그룹에 저장한다.
      groupId: activeGroup?.groupId ?? null,
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

      if (!previewOnlyRegistrations) {
        setLocations?.([
          ...routeMarkers,
          {
            ...savedLocation,
            id: savedLocation.id ?? savedLocation.taskId ?? savedLocation.task_id,
            detailAddress: savedLocation.detailAddress || newLoc.detailAddress,
            roadAddress: savedLocation.roadAddress || newLoc.roadAddress,
            status: savedLocation.status || 'pending',
            task: savedLocation.taskCategory || savedLocation.task || newLoc.task || '',
            createdAt: savedLocation.createdAt || savedLocation.created_at || null,
            workDate: savedLocation.workDate || savedLocation.work_date || newLoc.workDate,
            scheduledDate:
              savedLocation.scheduledDate ||
              savedLocation.scheduled_date ||
              newLoc.scheduledDate,
            priority: savedLocation.priority || '',
          },
        ]);
      }
      onDataChanged?.();

      setKeyword('');
      setAddressSearchMode(false);
      closeAddSheet();
    } catch (error) {
      console.log(error);
      showAlert(
        'DB 저장 실패',
        '백엔드 실행 상태와 EXPO_PUBLIC_API_BASE_URL을 확인하세요.'
      );
    }
  };

  const removeLocation = async (id) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/locations/${id}`,
        { method: 'DELETE' }
      );

      const text = await res.text();
      if (!res.ok) throw new Error(text || `삭제 실패: ${res.status}`);
    } catch (error) {
      console.log('방문지 삭제 실패:', error);
      showAlert('삭제 실패', '작업 전인 방문지만 삭제할 수 있습니다.');
      return;
    }

    const nextLocations = routeMarkers.filter((loc) => loc.id !== id);
    setLocations?.(nextLocations);
    onDataChanged?.();
  };

  const confirmRemoveLocation = (loc) => {
    const name = loc.detailAddress || loc.roadAddress || '이 방문지';
    showAlert(
      '방문지 삭제',
      `‘${name}’ 방문지를 삭제할까요? 삭제한 방문지는 복구할 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '방문지 삭제', style: 'destructive', onPress: () => removeLocation(loc.id) },
      ]
    );
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

  const fetchRouteSegment = async (startLocation, endLocation, mode) => {
    const res = await fetch(`${API_BASE_URL}/api/routes/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(mode === 'walk' ? { 'X-Kakao-Walk-Key': KAKAO_REST_API_KEY || '' } : {}) },
      body: JSON.stringify({ start: startLocation, end: endLocation, transportMode: mode }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`구간 경로 계산 실패: ${res.status} / ${text}`);
    const data = JSON.parse(text);
    const segment = data.segments?.[0];
    if (!segment) throw new Error('구간 경로 정보가 없습니다.');
    return {
      segment: {
        ...segment,
        mode,
        fromName: startLocation.detailAddress || '현재 위치',
        toName: endLocation.detailAddress || '목적지',
        totalDistance: data.totalDistance ?? segment.totalDistance ?? segment.distance,
        totalDuration: data.totalDuration ?? segment.totalDuration ?? segment.duration,
      },
      totalDuration: Number(data.totalDuration ?? segment.totalDuration ?? segment.duration ?? 0) || 0,
    };
  };

  const optimizeWithFixedReturn = async (startLocation, visits, homeLocation, mode) => {
    const start = cleanLocation(startLocation, '현재 위치');
    const home = cleanLocation(homeLocation, '복귀 위치');
    const candidates = (visits || []).map((item) => cleanLocation(item)).filter(Boolean);

    if (!home) return { order: candidates, segments: [], totalDuration: 0 };
    if (!candidates.length) {
      const homeLeg = await fetchRouteSegment(start, home, mode);
      return {
        order: [],
        segments: [{ ...homeLeg.segment, isReturnSegment: true, toName: home.detailAddress || '복귀 위치' }],
        totalDuration: homeLeg.totalDuration,
      };
    }

    let ordered = candidates;
    const edgeCache = new Map();
    const edgeKey = (from, to) => `${Number(from.lat).toFixed(6)},${Number(from.lng).toFixed(6)}>${Number(to.lat).toFixed(6)},${Number(to.lng).toFixed(6)}`;
    const getLeg = async (from, to) => {
      const key = edgeKey(from, to);
      if (edgeCache.has(key)) return edgeCache.get(key);
      const result = await fetchRouteSegment(from, to, mode);
      edgeCache.set(key, result);
      return result;
    };

    // 방문지가 많지 않은 일반 외근 경로는 실제 도로 구간 시간을 기준으로
    // 시작점/복귀 위치가 고정된 TSP를 정확히 계산한다.
    if (candidates.length <= 8) {
      const n = candidates.length;
      const startCosts = new Array(n);
      const homeCosts = new Array(n);
      const betweenCosts = Array.from({ length: n }, () => new Array(n).fill(Number.POSITIVE_INFINITY));

      await Promise.all(candidates.map(async (item, i) => {
        const [fromStart, toHome] = await Promise.all([
          getLeg(start, item),
          getLeg(item, home),
        ]);
        startCosts[i] = Number(fromStart.segment?.totalDistance ?? fromStart.segment?.distance ?? 0) || fromStart.totalDuration || Number.POSITIVE_INFINITY;
        homeCosts[i] = Number(toHome.segment?.totalDistance ?? toHome.segment?.distance ?? 0) || toHome.totalDuration || Number.POSITIVE_INFINITY;
      }));

      const pairJobs = [];
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          if (i === j) continue;
          pairJobs.push((async () => {
            const result = await getLeg(candidates[i], candidates[j]);
            betweenCosts[i][j] = Number(result.segment?.totalDistance ?? result.segment?.distance ?? 0) || result.totalDuration || Number.POSITIVE_INFINITY;
          })());
        }
      }
      await Promise.all(pairJobs);

      const size = 1 << n;
      const dp = Array.from({ length: size }, () => new Array(n).fill(Number.POSITIVE_INFINITY));
      const parent = Array.from({ length: size }, () => new Array(n).fill(-1));
      for (let i = 0; i < n; i += 1) dp[1 << i][i] = startCosts[i];

      for (let mask = 1; mask < size; mask += 1) {
        for (let last = 0; last < n; last += 1) {
          const base = dp[mask][last];
          if (!Number.isFinite(base)) continue;
          for (let next = 0; next < n; next += 1) {
            if (mask & (1 << next)) continue;
            const nextMask = mask | (1 << next);
            const cost = base + betweenCosts[last][next];
            if (cost < dp[nextMask][next]) {
              dp[nextMask][next] = cost;
              parent[nextMask][next] = last;
            }
          }
        }
      }

      const fullMask = size - 1;
      let bestLast = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      for (let last = 0; last < n; last += 1) {
        const total = dp[fullMask][last] + homeCosts[last];
        if (total < bestCost) {
          bestCost = total;
          bestLast = last;
        }
      }

      const indexes = [];
      let mask = fullMask;
      let last = bestLast;
      while (last >= 0) {
        indexes.push(last);
        const prev = parent[mask][last];
        mask &= ~(1 << last);
        last = prev;
      }
      indexes.reverse();
      ordered = indexes.map((index) => candidates[index]);
    } else {
      // 방문지가 많을 때는 API 호출 폭증을 피하면서도 복귀 위치까지 포함한
      // 전체 동선을 줄이도록 고정 종료점 기반 2-opt를 적용한다.
      ordered = geometricFixedEndOrder(start, candidates, home);
    }

    const segments = [];
    let totalDuration = 0;
    let cursor = start;
    for (const target of ordered) {
      const result = await getLeg(cursor, target);
      segments.push(result.segment);
      totalDuration += result.totalDuration;
      cursor = target;
    }
    const homeLeg = await getLeg(cursor, home);
    segments.push({ ...homeLeg.segment, isReturnSegment: true, toName: home.detailAddress || '복귀 위치' });
    totalDuration += homeLeg.totalDuration;

    return { order: ordered, segments, totalDuration };
  };

  const handleOptimizeRoute = async (mode = transportMode) => {
    setGuideStartOpen(false);
    setCurrentSegmentIndex(0);
    setRoadPath([]);
    setRouteSegments([]);
    setTotalDuration(null);
    setOptimized(false);
    setIsGuiding(false);
    stopRouteNotification();

    if (!API_BASE_URL) {
      showAlert('오류', '.env의 EXPO_PUBLIC_API_BASE_URL을 확인하세요.');
      return;
    }
    if (!currentLocation) {
      showAlert('현재 위치 필요', '현재 위치를 먼저 불러와야 합니다.');
      return;
    }
    if (orderedMarkers.length === 0) {
      showAlert('남은 작업 없음', '모든 방문지의 작업이 완료되었습니다.');
      return;
    }

    try {
      setOptimizing(true);
      const completed = markers.filter((item) => item.status === 'complete');
      const priorityMarkers = orderedMarkers
        .filter((item) => Number.isFinite(Number(item.priority)) && Number(item.priority) > 0)
        .sort((a, b) => Number(a.priority) - Number(b.priority));
      const priorityKeys = new Set(priorityMarkers.map(locationKey));
      const remainingMarkers = orderedMarkers.filter((item) => !priorityKeys.has(locationKey(item)));

      let cursor = cleanLocation(currentLocation, '현재 위치');
      const composedSegments = [];
      let composedDuration = 0;

      for (const target of priorityMarkers) {
        const end = cleanLocation(target, target.detailAddress || '우선 방문지');
        const result = await fetchRouteSegment(cursor, end, mode);
        composedSegments.push(result.segment);
        composedDuration += result.totalDuration;
        cursor = end;
      }

      let optimizedRemaining = remainingMarkers;
      const validReturnLocation = returnLocation &&
        Number.isFinite(Number(returnLocation.lat)) &&
        Number.isFinite(Number(returnLocation.lng))
        ? returnLocation
        : null;

      if (validReturnLocation) {
        const fixedEndResult = await optimizeWithFixedReturn(
          cursor,
          remainingMarkers,
          validReturnLocation,
          mode
        );
        optimizedRemaining = fixedEndResult.order.map((loc) => ({
          ...remainingMarkers.find((item) => String(item.id ?? item.taskId) === String(loc.id ?? loc.taskId)),
          ...loc,
          priority: null,
        }));
        composedSegments.push(...fixedEndResult.segments);
        composedDuration += fixedEndResult.totalDuration;
      } else if (remainingMarkers.length > 0) {
        const response = await fetch(`${API_BASE_URL}/api/routes/optimize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(mode === 'walk' ? { 'X-Kakao-Walk-Key': KAKAO_REST_API_KEY || '' } : {}) },
          body: JSON.stringify({
            currentLocation: cursor,
            locations: remainingMarkers.map((item) => cleanLocation(item)).filter(Boolean),
            transportMode: mode,
          }),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`경로 최적화 실패: ${response.status} / ${text}`);
        const data = JSON.parse(text);
        optimizedRemaining = (data.optimizedLocations || []).map((loc) => ({
          ...remainingMarkers.find((item) => String(item.id ?? item.taskId) === String(loc.id ?? loc.taskId)),
          ...loc,
          lat: loc.lat ?? loc.latitude,
          lng: loc.lng ?? loc.longitude,
          priority: null,
        }));
        if (!optimizedRemaining.length) optimizedRemaining = remainingMarkers;
        if (Array.isArray(data.segments)) composedSegments.push(...data.segments);
        composedDuration += Number(data.totalDuration ?? 0) || 0;
      }

      const finalOrder = [...priorityMarkers, ...optimizedRemaining];

      setLocations?.(numberOptimizedVisits(finalOrder, completed));
      setRouteSegments(composedSegments);
      setRoadPath(composedSegments.flatMap((segment) => segment?.path || []));
      setCurrentSegmentIndex(0);
      setTotalDuration(composedDuration || null);
      setTransportMode(mode);
      setOptimized(true);
      setIsGuiding(false);
      setGuideStartOpen(false);
    } catch (error) {
      console.log(error);
      showAlert('오류', '경로 최적화 중 문제가 발생했습니다.');
    } finally {
      setOptimizing(false);
    }
  };

  const autoRouteKey = [
    ...orderedMarkers.map((item) => `${String(item.id ?? item.taskId)}:${item.priority ?? '-'}`).sort(),
    returnLocation ? `home:${returnLocation.lat}:${returnLocation.lng}` : 'home:none',
  ].join(',');
  const optimizeRemainingRoute = async () => {
    if (!API_BASE_URL || !currentLocation) return;

    // 안내 중 우선순위가 바뀌면 기존 목적지를 고정하지 않고,
    // 현재 GPS 위치에서 남은 방문지 전체를 다시 계산한다.
    // 그래서 기존 2번 방문지를 P1으로 바꾸면 즉시 그 방문지가 다음 목적지가 된다.
    const candidates = orderedMarkers.filter((item) => item.status !== 'complete');
    const validReturnLocation = returnLocation &&
      Number.isFinite(Number(returnLocation.lat)) &&
      Number.isFinite(Number(returnLocation.lng))
      ? returnLocation
      : null;
    if (!candidates.length && !validReturnLocation) return;

    try {
      setOptimizing(true);

      const priorityMarkers = candidates
        .filter((item) => Number.isFinite(Number(item.priority)) && Number(item.priority) > 0)
        .sort((a, b) => Number(a.priority) - Number(b.priority));
      const priorityKeys = new Set(priorityMarkers.map(locationKey));
      const remainingMarkers = candidates.filter((item) => !priorityKeys.has(locationKey(item)));

      let cursor = cleanLocation(currentLocation, '현재 위치');
      const nextSegments = [];
      let nextDuration = 0;

      for (const target of priorityMarkers) {
        const end = cleanLocation(target, target.detailAddress || '우선 방문지');
        const result = await fetchRouteSegment(cursor, end, transportMode);
        nextSegments.push(result.segment);
        nextDuration += result.totalDuration;
        cursor = end;
      }

      let optimizedRemaining = remainingMarkers;
      if (validReturnLocation) {
        const fixedEndResult = await optimizeWithFixedReturn(
          cursor,
          remainingMarkers,
          validReturnLocation,
          transportMode
        );
        optimizedRemaining = fixedEndResult.order.map((loc) => ({
          ...remainingMarkers.find((row) => String(row.id ?? row.taskId) === String(loc.id ?? loc.taskId)),
          ...loc,
          priority: null,
        }));
        nextSegments.push(...fixedEndResult.segments);
        nextDuration += fixedEndResult.totalDuration;
      } else if (remainingMarkers.length) {
        const response = await fetch(`${API_BASE_URL}/api/routes/optimize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(transportMode === 'walk' ? { 'X-Kakao-Walk-Key': KAKAO_REST_API_KEY || '' } : {}),
          },
          body: JSON.stringify({
            currentLocation: cursor,
            locations: remainingMarkers.map((item) => cleanLocation(item)).filter(Boolean),
            transportMode,
          }),
        });
        if (!response.ok) throw new Error('이후 경로 계산 실패');
        const data = await response.json();
        optimizedRemaining = (data.optimizedLocations || []).map((item) => ({
          ...remainingMarkers.find((row) => String(row.id ?? row.taskId) === String(item.id)),
          ...item,
          lat: item.lat ?? item.latitude,
          lng: item.lng ?? item.longitude,
          priority: null,
        }));
        if (!optimizedRemaining.length) optimizedRemaining = remainingMarkers;
        if (Array.isArray(data.segments)) nextSegments.push(...data.segments);
        nextDuration += Number(data.totalDuration ?? 0) || 0;
      }

      const finalOrder = [...priorityMarkers, ...optimizedRemaining];
      setLocations?.(numberOptimizedVisits(
        finalOrder,
        markers.filter((item) => item.status === 'complete')
      ));
      setRouteSegments(nextSegments);
      setRoadPath(nextSegments.flatMap((segment) => segment?.path || []));
      setCurrentSegmentIndex(0);
      setTotalDuration(nextDuration || null);
      setOptimized(true);
      // 안내 상태는 유지한다. 목적지만 현재 위치 기준 새 1번으로 갱신된다.
      setIsGuiding(true);
    } catch (error) {
      console.log(error);
      showAlert('경로 계산 실패', '방문지는 유지했습니다. 경로 최적화를 다시 눌러주세요.');
    } finally {
      setOptimizing(false);
    }
  };
  useEffect(() => {
    if (!isActive || !currentLocation || !autoRouteKey || optimizing) return undefined;
    if (isGuiding) {
      if (autoRouteKeyRef.current !== autoRouteKey) {
        autoRouteKeyRef.current = autoRouteKey;
        optimizeRemainingRoute();
      }
      return undefined;
    }
    if (autoRouteKeyRef.current === autoRouteKey) return undefined;
    const timer = setTimeout(() => {
      autoRouteKeyRef.current = autoRouteKey;
      handleOptimizeRoute(transportMode);
    }, 600);
    return () => clearTimeout(timer);
  }, [isActive, autoRouteKey, currentLocation?.lat, currentLocation?.lng, isGuiding, optimizing]);

  const updateGuideTargetSegment = async (targetIndex, mode = transportMode) => {
    if (!API_BASE_URL) {
      showAlert('오류', '.env의 EXPO_PUBLIC_API_BASE_URL을 확인하세요.');
      return;
    }

    if (!currentLocation) {
      showAlert('현재 위치 필요', '현재 위치를 먼저 불러와야 합니다.');
      return;
    }

    const target = guideTargets[targetIndex];

    if (!target) {
      showAlert('목적지 없음', '해당 목적지를 찾을 수 없습니다.');
      return;
    }

    try {
      setSegmentChanging(true);
      setTransportMode(mode);

      const start = cleanLocation(currentLocation, '현재 위치');
      const end = cleanLocation(target, '목적지');

      if (!start || !end) {
        showAlert('오류', '현재 위치 또는 목적지 정보를 찾을 수 없습니다.');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/routes/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(mode === 'walk' ? { 'X-Kakao-Walk-Key': KAKAO_REST_API_KEY || '' } : {}) },
        body: JSON.stringify({
          start,
          end,
          transportMode: mode,
        }),
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`안내 경로 재계산 실패: ${res.status}`);
      }

      const data = JSON.parse(text);

      if (!data.segments || data.segments.length === 0) {
        showAlert('오류', '안내 경로를 받아오지 못했습니다.');
        return;
      }

      const updatedSegment = {
        ...data.segments[0],
        mode,
        fromName: '현재 위치',
        toName: end.detailAddress || '목적지',
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
      };

      const updatedSegments = [...routeSegments];
      updatedSegments[targetIndex] = updatedSegment;

      setRouteSegments(updatedSegments);
      setCurrentSegmentIndex(targetIndex);
      setRoadPath(updatedSegments.slice(targetIndex).flatMap((segment) => segment?.path || []));

      if (data.totalDuration !== undefined && data.totalDuration !== null) {
        setTotalDuration(data.totalDuration);
      }
    } catch (error) {
      console.log(error);
      showAlert('오류', '현재 위치 기준 안내 경로를 다시 계산하지 못했습니다.');
    } finally {
      setSegmentChanging(false);
    }
  };

  const updateCurrentSegmentMode = async (mode) => {
    await updateGuideTargetSegment(currentSegmentIndex, mode);
  };

  useEffect(() => {
    if (!isActive || !currentLocation || !optimized || !routeResumeToken ||
        resumedTokenRef.current === routeResumeToken || !guideTargets[currentSegmentIndex]) return;
    resumedTokenRef.current = routeResumeToken;
    updateGuideTargetSegment(currentSegmentIndex, routeSegments[currentSegmentIndex]?.mode || transportMode);
  }, [isActive, currentLocation, optimized, routeResumeToken, currentSegmentIndex]);

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
      const rawEnd = guideTargets[currentSegmentIndex];

      const start = cleanLocation(newCurrentLocation, '현재 위치');
      const end = cleanLocation(rawEnd, '목적지');

      if (!start || !end) return;

      const res = await fetch(`${API_BASE_URL}/api/routes/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(transportMode === 'walk' ? { 'X-Kakao-Walk-Key': KAKAO_REST_API_KEY || '' } : {}) },
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
        fromName: '현재 위치',
        toName: end.detailAddress || '목적지',
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
      };

      setRouteSegments(updatedSegments);

      if (data.totalDuration !== undefined && data.totalDuration !== null) {
        setTotalDuration(data.totalDuration);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const movePrevSegment = () => {
    const prevIndex = Math.max(currentSegmentIndex - 1, 0);
    updateGuideTargetSegment(prevIndex);
  };

  const moveNextSegment = () => {
    const nextIndex = Math.min(
      currentSegmentIndex + 1,
      guideTargets.length - 1
    );

    updateGuideTargetSegment(nextIndex);
  };

  const getNextIncompleteIndex = (startIndex = 0) => {
    for (
      let index = Math.max(0, startIndex);
      index < orderedMarkers.length;
      index += 1
    ) {
      if (orderedMarkers[index]?.status !== 'complete') {
        return index;
      }
    }

    if (returnLocation && Math.max(0, startIndex) <= orderedMarkers.length) {
      return orderedMarkers.length;
    }

    return -1;
  };

  const handleStartGuidance = async () => {
    const firstIndex = getNextIncompleteIndex(0);

    if (firstIndex < 0) {
      setGuideStartOpen(false);
      setIsGuiding(false);
      await stopRouteNotification();

      showAlert(
        '안내할 업무 없음',
        '모든 방문지가 완료되었습니다.'
      );
      return;
    }

    setGuideStartOpen(false);
    setIsGuiding(true);

    await updateGuideTargetSegment(firstIndex);
  };

  const handleStopGuidance = async () => {
    setIsGuiding(false);
    await stopRouteNotification();
  };

  /*
   * 안내 상태가 꺼지면 경로 알림도 항상 제거한다.
   * 다른 화면/세션에서 setIsGuiding(false)를 호출하더라도 동일하게 동작한다.
   */
  useEffect(() => {
    if (!isGuiding) {
      stopRouteNotification();
    }
  }, [isGuiding]);

  /*
   * 현재 구간/경로가 바뀔 때 같은 notification id를 갱신한다.
   * 경로 재탐색, 이동수단 변경, 다음 방문지 전환도 모두 여기서 반영된다.
   */
  useEffect(() => {
    if (!isGuiding) {
      return;
    }

    const target =
      guideTargets[currentSegmentIndex];

    const currentSegment =
      routeSegments[currentSegmentIndex];

    if (!target || !currentSegment) {
      return;
    }

    const distance =
      currentSegment.totalDistance ??
      currentSegment.distance ??
      getPathDistance(currentSegment.path);

    const duration =
      currentSegment.totalDuration ??
      currentSegment.duration ??
      currentSegment.durationSeconds ??
      (distance ? distance / 5.5 : null);

    const durationText =
      formatDuration(duration)?.replace(/^약\s*/, '') ||
      '-';

    const distanceText =
      formatDistance(distance)?.replace(/^약\s*/, '') ||
      '-';

    const remainingCount =
      orderedMarkers
        .slice(currentSegmentIndex)
        .filter((item) => item?.status !== 'complete')
        .length;

    updateRouteNotification({
      from: currentSegment.fromName || '현재 위치',
      to:
        target.detailAddress ||
        currentSegment.toName ||
        '다음 방문지',
      duration: durationText,
      distance: distanceText,
      remainingCount,
    });
  }, [
    isGuiding,
    currentSegmentIndex,
    routeSegments,
    orderedMarkers,
    guideTargets,
  ]);

  /*
   * 현재 목적지가 complete가 되면 다음 미완료 방문지로 자동 이동한다.
   * 마지막 방문지까지 완료되면 안내와 경로 알림을 종료한다.
   */
  useEffect(() => {
    if (
      !isGuiding ||
      segmentChanging ||
      guideAdvanceRef.current
    ) {
      return;
    }

    const currentTarget =
      guideTargets[currentSegmentIndex];

    if (!currentTarget || currentTarget.isReturnLocation || currentTarget.status !== 'complete') {
      return;
    }

    const nextIndex =
      getNextIncompleteIndex(currentSegmentIndex + 1);

    guideAdvanceRef.current = true;

    if (nextIndex < 0) {
      setIsGuiding(false);

      stopRouteNotification().finally(() => {
        guideAdvanceRef.current = false;
      });

      return;
    }

    updateGuideTargetSegment(nextIndex)
      .finally(() => {
        guideAdvanceRef.current = false;
      });
  }, [
    isGuiding,
    segmentChanging,
    currentSegmentIndex,
    orderedMarkers,
    guideTargets,
  ]);

  return (
    <View style={styles.container}>
      <KakaoMapWebView
        boundaries={selectedDongBoundary}
        locations={[...activeDisplayMarkers, ...(returnDisplayMarker ? [returnDisplayMarker] : []), ...completedDisplayMarkers]}
        displayOnlyLocations={[...mapOnlyMarkers, ...publicDisplayItems]}
        directMarkerPress={publicFacilityMode}
        roadPath={roadPath}
        routeSegments={routeSegments}
        currentSegmentIndex={currentSegmentIndex}
        panelOpen={false}
        setPanelOpen={setPanelOpen}
        isGuiding={isGuiding}
        searchedPlace={searchedPlace}
        clearSearchMarkerSignal={clearSearchMarkerSignal}
        mapSelectMode={mapSelectMode && locationSettingMode}
        selectionSessionActive={mapSelectMode}
        selectionPosition={directCenter}
        onCenterChange={setDirectCenter}
        onSelectionMoveChange={setLocationMoving}
        onCurrentLocationChange={setCurrentLocation}
        onMarkerClick={(loc) => {
          if (loc?.isReturnLocation) return;
          if (loc?.isPublicFacility) {
            togglePublicFacility(loc);
            return;
          }
          if (publicFacilityMode) return;
          if (priorityMode) handleSetPriority(loc);
          else onLocationClick?.(loc, 'report');
        }}
        onLocationsChange={setLocations}
        onRerouteRequest={handleReroute}
      />

      {mapSelectMode && <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 46, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, paddingRight: 4 }}>
            <Text style={{ color: '#172033', fontWeight: '800' }}>
              {centerAddress || (selectionPurpose === 'return' ? '근무지를 지도에서 선택하세요' : (locationSettingMode ? '현재 위치를 확인하는 중...' : '위치 설정을 눌러 위치를 선택하세요'))}
            </Text>
            <Text style={{ color: '#697386', marginTop: 4 }}>
              {directCenter ? `${directCenter.lat.toFixed(6)}, ${directCenter.lng.toFixed(6)}` : '선택된 위치 없음'}
            </Text>
          </View>

          <TouchableOpacity
            style={{
              width: 92,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 9,
              backgroundColor: locationSettingMode ? '#2477F3' : '#E8F2FF',
              borderWidth: 1,
              borderColor: locationSettingMode ? '#2477F3' : '#BFD6F6',
            }}
            onPress={() => {
              setLocationMoving(false);
              setLocationSettingMode((value) => !value);
            }}
          >
            <Text style={{ color: locationSettingMode ? '#FFFFFF' : '#2477F3', fontWeight: '900', fontSize: 12 }}>
              {locationSettingMode ? '이동 중...' : '위치 설정'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#F3B9C0', backgroundColor: '#FDE9EB' }}
            onPress={() => {
              setLocationMoving(false);
              setLocationSettingMode(false);
              setMapSelectMode(false);
              setDirectCenter(null);
              setCenterAddress('');
              setSelectionPurpose('visit');
              setClearSearchMarkerSignal((prev) => prev + 1);
            }}
          >
            <Text style={{ color: '#B94D59', fontWeight: '800' }}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!directCenter}
            style={{ flex: 2, padding: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#2477F3', opacity: directCenter ? 1 : 0.5 }}
            onPress={async () => {
              const place = { lat: directCenter.lat, lng: directCenter.lng, detailAddress: centerAddress && centerAddress !== '주소 확인 중...' ? centerAddress : (selectionPurpose === 'return' ? '근무지' : '지도 선택 위치'), roadAddress: centerAddress && centerAddress !== '주소 확인 중...' ? centerAddress : '' };
              sheetY.setValue(0);
              setLocationMoving(false);
              setLocationSettingMode(false);
              setMapSelectMode(false);
              if (selectionPurpose === 'return') {
                await saveReturnLocation(place);
                setSelectionPurpose('visit');
                setDirectCenter(null);
                setCenterAddress('');
                return;
              }
              setSearchedPlace(place);
              setPlaceName(place.detailAddress);
              setTask('');
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>이 위치로 설정</Text>
          </TouchableOpacity>
        </View>
      </View>}

      {addMenuOpen && (
        <Pressable style={[StyleSheet.absoluteFill, { zIndex: 19 }]}
          accessibilityLabel="방문지 추가 메뉴 닫기" onPress={() => setAddMenuOpen(false)} />
      )}
      <View style={styles.topOverlay}>
        <View style={styles.searchControlRow}>
          <TouchableOpacity style={styles.smallTopButton} onPress={loadDongs}>
            <Ionicons name="map-outline" size={13} color="#2477F3" />
            <Text style={styles.smallTopText}>{selectedDong?.properties?.adm_nm?.split(' ').pop() || '행정동'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.searchBox}
            activeOpacity={0.9}
            onPress={() => {
              if (publicFacilityMode) {
                setPublicCategoryOpen((open) => !open);
                return;
              }
              if (!addressSearchMode) setAddMenuOpen((open) => !open);
            }}
          >

            <TouchableOpacity
              onPress={() => {
                resetAddModes();
                setAddressSearchMode(false);
                setAddMenuOpen((open) => !open);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="menu" size={18} color="#2477F3" />
            </TouchableOpacity>

            <TextInput
              ref={searchInputRef}
              value={keyword}
              onChangeText={setKeyword}
              placeholder={publicFacilityMode ? (PUBLIC_FACILITY_CATEGORIES.find((item) => item.key === publicCategory)?.label || '공공시설물 카테고리 선택') : '방문지를 추가해주세요'}
              placeholderTextColor="#9AA6B2"
              style={styles.searchInput}
              returnKeyType="search"
              editable={addressSearchMode && !publicFacilityMode}
              onFocus={() => {
                if (publicFacilityMode) {
                  setPublicCategoryOpen(true);
                  searchInputRef.current?.blur();
                } else if (!addressSearchMode) {
                  setAddMenuOpen(true);
                }
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
                if (publicFacilityMode) {
                  setPublicCategoryOpen((value) => !value);
                  searchInputRef.current?.blur();
                  return;
                }
                searchPlace(1);
                setPage(1);
              }}
              disabled={isSearching}
            >
              <Ionicons name={publicFacilityMode ? 'chevron-down' : 'search'} size={18} color="#2477F3" />
            </TouchableOpacity>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.smallTopButton,
              priorityMode && styles.priorityActive,
            ]}
            onPress={() => setPriorityMode(!priorityMode)}
          >
            <Ionicons name="list" size={13} color="#2477F3" />
            <Text style={styles.smallTopText}>
              {priorityMode ? '선택중' : '우선순위'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optimizeTopButton, (optimizing || segmentChanging) && styles.optimizeTopButtonDisabled]}
            accessibilityLabel="경로 최적화"
            disabled={optimizing || segmentChanging}
            onPress={() => {
              if (isGuiding) optimizeRemainingRoute();
              else handleOptimizeRoute(transportMode);
            }}
          >
            <Ionicons name="git-branch-outline" size={16} color="#2477F3" />
            <Text style={styles.optimizeTopText}>
              {'경로\n최적화'}
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
                setAddressSearchMode(false);
                setCoordSheetOpen(false);
                setSelectionPurpose('return');
                setDirectCenter(
                  returnLocation
                    ? { lat: Number(returnLocation.lat), lng: Number(returnLocation.lng) }
                    : null
                );
                setCenterAddress(returnLocation?.detailAddress || '');
                setLocationSettingMode(false);
                setMapSelectMode(true);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="home-outline" size={18} color="#2477F3" />
              <View style={{ flex: 1 }}>
                <Text style={styles.addMenuTitle}>근무지 지정</Text>
                <Text style={styles.addMenuDesc} numberOfLines={1}>
                  {returnLocation?.detailAddress || '경로 마지막에 돌아갈 근무지를 지정'}
                </Text>
              </View>
              {returnLocation ? (
                <Ionicons name="checkmark-circle-outline" size={19} color="#2477F3" />
              ) : null}
            </TouchableOpacity>
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
              <Ionicons name="location-outline" size={18} color="#2477F3" />
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
                setCoordSheetOpen(false);
                setDirectCenter(null);
                setCenterAddress('');
                setLocationSettingMode(false);
                setSelectionPurpose('visit');
                setMapSelectMode(true);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="map-outline" size={18} color="#2477F3" />
              <View>
                <Text style={styles.addMenuTitle}>지도에서 직접 선택</Text>
                <Text style={styles.addMenuDesc}>지도를 눌러 위치 선택</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addMenuItem}
              onPress={() => {
                if (!selectedDong) {
                  setAddMenuOpen(false);
                  showAlert('행정동 선택 필요', '공공시설물을 조회하려면 먼저 행정동을 선택해주세요.');
                  return;
                }
                resetAddModes();
                setAddMenuOpen(false);
                setPublicFacilityMode(true);
                setPublicSheetOpen(true);
                setKeyword('');
                setPublicCategory('');
                setPublicItems([]);
                setPublicSelectedIds([]);
                setPublicCategoryOpen(true);
                searchInputRef.current?.blur();
              }}
            >
              <Ionicons name="business-outline" size={18} color="#2477F3" />
              <View><Text style={styles.addMenuTitle}>공공시설물</Text><Text style={styles.addMenuDesc}>선택한 행정동의 AED · 버스정류장 조회</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuItem} onPress={() => { setAddMenuOpen(false); showAlert('준비 중', '엑셀 일괄 등록은 후속 개발 예정입니다.'); }}>
              <Ionicons name="grid-outline" size={18} color="#2477F3" />
              <View><Text style={styles.addMenuTitle}>엑셀 일괄 등록</Text><Text style={styles.addMenuDesc}>후속 개발 예정</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuItemLast} onPress={() => { setAddMenuOpen(false); showAlert('준비 중', '사진으로 등록은 후속 개발 예정입니다.'); }}>
              <Ionicons name="image-outline" size={18} color="#2477F3" />
              <View><Text style={styles.addMenuTitle}>사진으로 등록</Text><Text style={styles.addMenuDesc}>후속 개발 예정</Text></View>
            </TouchableOpacity>
          </View>
        )}

        {publicFacilityMode && publicCategoryOpen && (
          <View style={styles.publicCategoryBox}>
            <View style={styles.publicCategoryHeader}>
              <View>
                <Text style={styles.publicCategoryTitle}>공공시설물 선택</Text>
                <Text style={styles.publicCategoryDesc}>
                  {selectedDong?.properties?.adm_nm || '선택 행정동'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPublicFacilityMode(false);
                  setPublicCategoryOpen(false);
                  setPublicCategory('');
                  setPublicItems([]);
                  setPublicSelectedIds([]);
                  setPublicSheetOpen(true);
                }}
              >
                <Ionicons name="close" size={20} color="#607195" />
              </TouchableOpacity>
            </View>
            {PUBLIC_FACILITY_CATEGORIES.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.publicCategoryItem}
                onPress={() => {
                  setPublicCategory(item.key);
                  setPublicCategoryOpen(false);
                  setPublicSelectedIds([]);
                  setPublicSheetOpen(true);
                }}
              >
                <Ionicons name={item.icon} size={19} color="#2477F3" />
                <Text style={styles.publicCategoryItemText}>{item.label}</Text>
                {publicCategory === item.key ? (
                  <Ionicons name="checkmark-circle" size={19} color="#2477F3" />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.chipRowWrap}>
          {markers.length === 0 ? (
            <View style={styles.emptyChip}>
              <Ionicons name="location-outline" size={14} color="#8A98A8" />
              <Text style={styles.emptyChipText}>방문지 없음</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={visitDisplayMarkers}
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
                      {item.displayMarkerLabel}
                    </Text>
                  </View>

                  <Text style={styles.chipText} numberOfLines={1}>
                    {formatShortDate(getWorkDateKey(item))
                      ? `${formatShortDate(getWorkDateKey(item))} · `
                      : ''}
                    {item.detailAddress}
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
              color="#2477F3"
            />
          </TouchableOpacity>
        </View>

        {visitListOpen && markers.length > 0 && (
          <View style={styles.visitListCard}>
            <View style={styles.visitListHead}>
              <Text style={styles.visitCount}>방문지 {markers.length}개</Text>

              <TouchableOpacity onPress={() => setVisitListOpen(false)}>
                <Text style={styles.foldText}>접기</Text>
              </TouchableOpacity>
            </View>

            {visitDisplayMarkers.map((loc, index) => (
              <View
                key={`${loc.detailAddress || 'loc'}-${loc.lat}-${loc.lng}-${index}`}
                style={styles.visitItem}
              >
                <TouchableOpacity
                  style={styles.visitMain}
                  onPress={() => onLocationClick?.(loc, 'report')}
                >
                  <View
                    style={[
                      styles.visitNo,
                      { backgroundColor: getStatusColor(loc.status) },
                    ]}
                  >
                    <Text style={styles.visitNoText}>{loc.displayMarkerLabel}</Text>
                  </View>

                  <View style={styles.visitTextWrap}>
                    <Text style={styles.visitName} numberOfLines={2}>
                      {loc.detailAddress || '이름 없음'}
                    </Text>
                    <Text style={styles.visitTask} numberOfLines={1}>
                      {formatShortDate(getWorkDateKey(loc))
                        ? `업무일 ${formatShortDate(getWorkDateKey(loc))}`
                        : ''}
                      {loc.task
                        ? `${formatShortDate(getWorkDateKey(loc)) ? ' · ' : ''}${loc.task}`
                        : ''}
                    </Text>
                  </View>
                </TouchableOpacity>

                {(!loc.status || loc.status === 'pending') && (
                  <TouchableOpacity
                    onPress={() => confirmRemoveLocation(loc)}
                    accessibilityRole="button"
                    accessibilityLabel={`${loc.detailAddress || loc.roadAddress || '방문지'} 삭제`}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={styles.deleteText}>삭제</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {optimized && (
          <View style={styles.doneRow}>
            <View style={[styles.doneBar, isGuiding && styles.guidingBar]}>
              <Text style={styles.doneText}>
                {isGuiding
                  ? `안내 중 · ${currentSegmentIndex + 1}/${guideTargets.length}목적지`
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
                color={transportMode === 'car' ? '#FFFFFF' : '#2477F3'}
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
                color={transportMode === 'walk' ? '#FFFFFF' : '#2477F3'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                isGuiding ? styles.stopGuideButton : styles.modeButtonActive,
              ]}
              onPress={() => {
                if (isGuiding) {
                  handleStopGuidance();
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

        {isGuiding && guideTargets.length > 0 && (
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
              현재 위치 →{' '}
              {guideTargets[currentSegmentIndex]?.detailAddress ||
                routeSegments[currentSegmentIndex]?.toName ||
                '목적지'}
            </Text>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                currentSegmentIndex === guideTargets.length - 1 &&
                styles.segmentButtonDisabled,
              ]}
              onPress={moveNextSegment}
              disabled={currentSegmentIndex === guideTargets.length - 1}
            >
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!addressSearchMode && !mapSelectMode && !publicFacilityMode && !searchedPlace && !coordSheetOpen && (
        <TouchableOpacity
          style={styles.floatingModeButton}
          activeOpacity={0.88}
          onPress={() => setPendingOpen(true)}
        >
          <Ionicons name="file-tray-outline" size={20} color="#FFFFFF" />
          <Text style={styles.floatingModeButtonText}>
            미처리 업무 {pendingWork.length}
          </Text>
        </TouchableOpacity>
      )}

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

      {publicFacilityMode && publicCategory && !publicSheetOpen && (
        <TouchableOpacity
          style={styles.publicFacilityCollapsed}
          onPress={() => setPublicSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="공공시설물 목록 펼치기"
        >
          <Text style={styles.publicFacilityCollapsedText}>공공시설물 {publicItems.length}곳 보기</Text>
        </TouchableOpacity>
      )}

      {publicFacilityMode && publicCategory && publicSheetOpen && (
        <Animated.View style={[styles.publicFacilitySheet, { transform: [{ translateY: publicSheetY }] }]}>
          <View style={styles.publicFacilityHandleArea} {...publicSheetPanResponder.panHandlers}>
            <View style={styles.publicFacilityHandle} />
            <View style={styles.publicFacilityHeader}>
              <Text style={styles.publicFacilityActionTitle}>
                {publicLoading
                  ? '공공시설물을 불러오는 중...'
                  : `${PUBLIC_FACILITY_CATEGORIES.find((item) => item.key === publicCategory)?.label || '공공시설물'} ${publicItems.length}곳`}
              </Text>
              <Text style={styles.publicFacilityCount}>{publicSelectedIds.length}곳 선택</Text>
            </View>
          </View>
          <ScrollView style={styles.publicFacilityList} nestedScrollEnabled>
            {publicLoading ? (
              <Text style={styles.publicFacilityEmpty}>시설물을 불러오는 중...</Text>
            ) : publicItems.length ? publicItems.map((item) => {
              const selected = publicSelectedIds.includes(item.id);
              return (
                <TouchableOpacity key={String(item.id)} style={styles.publicFacilityRow} onPress={() => togglePublicFacility(item)}>
                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? '#2477F3' : '#8A98A8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.publicFacilityName} numberOfLines={1}>{item.detailAddress || item.roadAddress || '공공시설물'}</Text>
                    <Text style={styles.publicFacilityAddress} numberOfLines={1}>{item.roadAddress || item.adminDong || ''}</Text>
                  </View>
                </TouchableOpacity>
              );
            }) : (
              <Text style={styles.publicFacilityEmpty}>선택한 행정동에 시설물이 없습니다.</Text>
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.publicFacilityRegisterButton, (!publicSelectedIds.length || publicSaving) && styles.publicFacilityRegisterButtonDisabled]}
            disabled={!publicSelectedIds.length || publicSaving}
            onPress={registerPublicFacilities}
          >
            <Text style={styles.publicFacilityRegisterText}>
              {publicSaving ? '등록 중' : `${publicSelectedIds.length}건 등록`}
            </Text>
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
              ? '현재 위치에서 선택한 목적지까지 경로를 다시 계산합니다.'
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
              안내 시작 후 현재 위치에서 첫 번째 목적지까지 경로 안내가 진행됩니다.
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.sheetButton, styles.dismissSheetButton]}
                onPress={() => setGuideStartOpen(false)}
              >
                <Text style={[styles.sheetLabel, styles.dismissSheetLabel]}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetButton}
                onPress={handleStartGuidance}
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
                  {selected?.detailAddress || '이름 없음'}
                </Text>
                <Text style={styles.placeAddr}>
                  {selected?.roadAddress || selected?.task || '주소 없음'}
                </Text>
                {locationScope === 'team' && activeGroup && (
                  <Text style={styles.assigneeInfo}>
                    {assignmentMap.get(Number(selected?.id))
                      ? `담당자: ${assignmentMap.get(Number(selected?.id)).assigneeName || assignmentMap.get(Number(selected?.id)).assigneeLoginId}`
                      : '담당자 미지정'}
                  </Text>
                )}
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
      <Modal visible={dongOpen} transparent animationType="slide" onRequestClose={() => setDongOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ maxHeight: '70%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 18, fontWeight: '800' }}>{user?.workSigungu || '근무지역'} 행정동</Text><TouchableOpacity onPress={() => setDongOpen(false)}><Ionicons name="close" size={24} color="#465267" /></TouchableOpacity></View>
            {dongLoading ? <Text style={{ padding: 18 }}>행정동을 불러오는 중입니다.</Text> : <ScrollView>
              {dongOptions.map((feature, index) => <TouchableOpacity key={feature.properties?.adm_cd || index} style={{ padding: 13, borderBottomWidth: 1, borderColor: '#E6ECF2' }} onPress={() => { onSelectedDongChange?.(feature); setDongOpen(false); }}>
                <Text style={{ color: '#172033', fontWeight: '700' }}>{String(feature.properties?.adm_nm || feature.properties?.name || `행정동 ${index + 1}`).split(' ').pop()}</Text>
              </TouchableOpacity>)}
              {dongOptions.length === 0 && <Text style={{ padding: 18 }}>표시할 행정동이 없습니다.</Text>}
            </ScrollView>}
          </View>
        </View>
      </Modal>
      <Modal visible={pendingOpen} transparent animationType="slide" onRequestClose={() => setPendingOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ maxHeight: '75%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#172033' }}>미처리 업무 불러오기</Text>
              <TouchableOpacity onPress={() => setPendingOpen(false)}><Ionicons name="close" size={24} color="#465267" /></TouchableOpacity>
            </View>
            <Text style={{ marginTop: 5, color: '#697386' }}>선택한 업무를 오늘 지도에 표시합니다. 원래 일정은 유지됩니다.</Text>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => setPendingSelected(pendingSelected.length === pendingWork.length ? [] : pendingWork.map((item) => String(item.id ?? item.taskId)))}>
              <Text style={{ color: '#2477F3', fontWeight: '800' }}>{pendingSelected.length === pendingWork.length ? '전체 해제' : '전체 선택'}</Text>
            </TouchableOpacity>
            <ScrollView>
              {pendingWork.length === 0 ? <Text style={{ paddingVertical: 20, color: '#697386' }}>미처리 업무가 없습니다.</Text> : pendingWork.map((item) => {
                const id = String(item.id ?? item.taskId);
                const checked = pendingSelected.includes(id);
                return <TouchableOpacity key={id} onPress={() => setPendingSelected((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id])} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: '#E6ECF2' }}>
                  <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color="#2477F3" />
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: '#172033' }}>{item.detailAddress || item.roadAddress || `방문지 ${id}`}</Text><Text style={{ color: '#697386', marginTop: 2 }}>{item.adminDong || ''}</Text></View>
                </TouchableOpacity>;
              })}
            </ScrollView>
            <TouchableOpacity disabled={!pendingSelected.length || pendingBusy} onPress={async () => {
              try {
                setPendingBusy(true);
                const rows = pendingWork.filter((item) => pendingSelected.includes(String(item.id ?? item.taskId)));
                if (await onAddWork?.(rows) !== false) { setPendingSelected([]); setPendingOpen(false); }
              } finally { setPendingBusy(false); }
            }} style={{ marginTop: 12, backgroundColor: '#2477F3', opacity: !pendingSelected.length || pendingBusy ? 0.5 : 1, padding: 15, borderRadius: 12, alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{pendingBusy ? '불러오는 중' : `${pendingSelected.length}건 지도에 표시`}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function MapScreen(props) {
  return <NormalMapScreen {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FA',
    overflow: 'hidden',
  },

  persistentModeLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  hiddenModeLayer: {
    left: '100%',
  },

  topOverlay: {
    position: 'absolute',
    top: 35,
    left: 10,
    right: 10,
    zIndex: 20,
  },

  floatingModeButton: {
    position: 'absolute',
    right: 14,
    bottom: 24,
    zIndex: 18,
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    backgroundColor: '#2477F3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#2477F3',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 8,
  },

  floatingModeButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  teamModeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2477F3',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 8,
  },

  teamModeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
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
    color: '#10285B',
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
    color: '#10285B',
  },

  optimizeTopButton: {
    width: 62,
    height: 46,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  optimizeTopButtonDisabled: {
    opacity: 0.55,
  },

  optimizeTopText: {
    color: '#10285B',
    fontSize: 8.5,
    lineHeight: 10.5,
    fontWeight: '900',
    textAlign: 'center',
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
    color: '#10285B',
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
    color: '#607195',
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
    color: '#10285B',
  },

  foldText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#10285B',
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
    color: '#10285B',
  },

  visitTask: {
    marginTop: 2,
    fontSize: 10,
    color: '#607195',
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
    backgroundColor: '#2477F3',
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
    backgroundColor: '#2477F3',
    borderColor: '#2477F3',
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
    bottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 14,
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
    marginBottom: 8,
  },

  addTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#10285B',
    marginBottom: 8,
  },

  inputBox: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },

  addInput: {
    flex: 1,
    fontSize: 13,
    color: '#10285B',
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
    backgroundColor: '#2477F3',
  },

  categoryText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#607195',
  },

  categoryTextActive: {
    color: '#FFFFFF',
  },

  addButton: {
    height: 44,
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
    color: '#10285B',
  },

  loadingDesc: {
    fontSize: 10,
    color: '#607195',
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
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 60,
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
    color: '#10285B',
  },

  assigneeInfo: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '900',
    color: '#10285B',
  },

  placeAddr: {
    fontSize: 10,
    color: '#607195',
    marginTop: 3,
  },

  routeTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#607195',
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

  dismissSheetButton: {
    backgroundColor: '#FDE9EB',
    borderColor: '#F3B9C0',
  },

  dismissSheetLabel: {
    color: '#B94D59',
  },

  sheetIcon: {
    fontSize: 25,
  },

  sheetLabel: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '900',
    color: '#10285B',
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
    color: '#10285B',
  },

  searchResultItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EDF3',
  },

  searchResultName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10285B',
  },

  searchResultAddress: {
    marginTop: 4,
    fontSize: 12,
    color: '#607195',
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
    backgroundColor: '#2477F3',
    color: '#fff',
    borderRadius: 6,
    overflow: 'hidden',
  },

  closeButton: {
    marginTop: 14,
    backgroundColor: '#2477F3',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },

  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  publicCategoryBox: {
    position: 'absolute',
    top: 74,
    left: 16,
    right: 110,
    zIndex: 65,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE7F5',
    padding: 12,
    shadowColor: '#2466B5',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  publicCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  publicCategoryTitle: { color: '#10285B', fontSize: 14, fontWeight: '900' },
  publicCategoryDesc: { color: '#607195', fontSize: 10, marginTop: 3 },
  publicCategoryItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#E7EEF8',
  },
  publicCategoryItemText: { flex: 1, color: '#10285B', fontSize: 12.5, fontWeight: '800' },
  publicFacilitySheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 48,
    height: 250,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7F5',
    padding: 12,
    shadowColor: '#2466B5',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  publicFacilityHandleArea: { minHeight: 48, paddingTop: 5, paddingBottom: 6, justifyContent: 'center' },
  publicFacilityHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#CAD8E8', alignSelf: 'center', marginBottom: 8 },
  publicFacilityCollapsed: { position: 'absolute', bottom: 16, alignSelf: 'center', zIndex: 48, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE7F5', paddingHorizontal: 16, paddingVertical: 10, elevation: 7 },
  publicFacilityCollapsedText: { color: '#2477F3', fontSize: 12, fontWeight: '800' },
  publicFacilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  publicFacilityActionTitle: { color: '#10285B', fontSize: 12.5, fontWeight: '900' },
  publicFacilityCount: { color: '#2477F3', fontSize: 10, fontWeight: '800' },
  publicFacilityList: { flex: 1 },
  publicFacilityRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#EEF2F6' },
  publicFacilityName: { color: '#10285B', fontSize: 11, fontWeight: '800' },
  publicFacilityAddress: { color: '#607195', fontSize: 9, marginTop: 2 },
  publicFacilityEmpty: { color: '#607195', fontSize: 11, textAlign: 'center', paddingVertical: 18 },
  publicFacilityRegisterButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2477F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  publicFacilityRegisterButtonDisabled: { opacity: 0.4 },
  publicFacilityRegisterText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },

  addMenuBox: {
    position: 'absolute',
    top: 54,
    left: 0,
    zIndex: 50,
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 12,
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
    color: '#10285B',
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
    color: '#10285B',
    marginBottom: 6,
  },

  coordInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    borderRadius: 11,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#10285B',
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
