import { showAlert } from '../components/CustomAlert';
// 키보드 자판 내 엔터가 안먹힘
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import KakaoMapWebView from '../components/KakaoMapWebView';
import PlaceSearchOverlay from '../components/PlaceSearchOverlay';
import SearchResultSheet from '../components/SearchResultSheet';
import WorkplaceField from '../components/WorkplaceField';
import { KakaoNavigationView, beginRouteSession, isKakaoNavigationAvailable } from '../modules/kakao-navigation';
import {
  stopRouteNotification,
  updateRouteNotification,
} from '../services/notificationService';
import { isRegisteredPlace, placeLocation } from '../utils/placeSearch';
import { locationKey } from '../utils/routeSession';
import { remainingRouteProgress } from '../utils/routeProgress';
import { hasVisitCoordinates, promoteVisit, recommendVisitOrder, visitSetKey } from '../utils/visitOrder';
import { BUSAN_DISTRICT_CODES } from './PublicDataMapMode';
// 엑셀,csv 데이터 업로드
import BulkUploadModal from '../components/BulkUploadModal';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const EMPTY_MARKERS = [];
const dongName = (value) => String(value || '').trim().split(/\s+/).pop().replace(/제(?=\d+동$)/, '') || '';
const PUBLIC_FACILITY_CATEGORIES = [
  { key: 'aed', label: '심폐제세동기', shortLabel: 'AED', icon: 'medkit-outline' },
  { key: 'bus', label: '버스정류장', shortLabel: '버스정류장', icon: 'bus-outline' },
];

function facilityViewCoordinates(feature, items) {
  const points = [];
  const collect = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      points.push({ lat: coordinates[1], lng: coordinates[0] });
    } else coordinates.forEach(collect);
  };
  collect(feature?.geometry?.coordinates);
  const located = (points.length ? points : items).filter(hasVisitCoordinates);
  if (!located.length) return [];
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  located.forEach((point) => {
    south = Math.min(south, Number(point.lat)); north = Math.max(north, Number(point.lat));
    west = Math.min(west, Number(point.lng)); east = Math.max(east, Number(point.lng));
  });
  return [{ lat: south, lng: west }, { lat: north, lng: east }];
}

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

const isCompleted = (item) => ['complete', 'completed', 'done'].includes(
  String(item?.status ?? item?.taskStatus ?? item?.task_status ?? '').toLowerCase()
);

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
  setCurrentSegmentIndex,
  setOptimized,
  isGuiding,
  setIsGuiding,
  setTotalDuration,
  setPanelOpen,
  routeResumeToken = 0,
  recordReturn,
  pendingWork = [],
  onAddWork,
  onUpdatedUser,
  onSearchVisibilityChange,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [resultsMode, setResultsMode] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchPinId, setSelectedSearchPinId] = useState(null);
  const [resultQuery, setResultQuery] = useState('');
  const [mapHeight, setMapHeight] = useState(600);
  const [focusRequest, setFocusRequest] = useState({ coordinates: [], token: 0 });
  const [workplaceOpen, setWorkplaceOpen] = useState(false);
  const [workplaceCandidate, setWorkplaceCandidate] = useState(null);
  const [workplaceBusy, setWorkplaceBusy] = useState(false);
  useEffect(() => { if (isActive) onSearchVisibilityChange?.(searchOpen); return () => { if (isActive) onSearchVisibilityChange?.(false); }; }, [searchOpen, isActive]);
  const focusPlaces = (rows) => setFocusRequest(previous => ({ coordinates: rows.filter(hasVisitCoordinates), token: previous.token + 1 }));
  const [preview, setPreview] = useState(null);
  const previewRequestRef = useRef(0);
  const guideRequestRef = useRef(0);
  const orderSetRef = useRef(null);
  const workspaceScopeRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [transportMode, setTransportMode] = useState('car');
  const [segmentChanging, setSegmentChanging] = useState(false);
  const [kakaoDestination, setKakaoDestination] = useState(null);
  const [nativeProgress, setNativeProgress] = useState(null);

  const [keyword, setKeyword] = useState('');
  const [searchedPlace, setSearchedPlace] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [task, setTask] = useState('');
  const registrationBusyRef = useRef(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [clearSearchMarkerSignal, setClearSearchMarkerSignal] = useState(0);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [mapSelectMode, setMapSelectMode] = useState(false);
  const [locationSettingMode, setLocationSettingMode] = useState(false);
  const [locationMoving, setLocationMoving] = useState(false);
  const [directCenter, setDirectCenter] = useState(null);
  const [centerAddress, setCenterAddress] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [coordSheetOpen, setCoordSheetOpen] = useState(false);
  const [coordLat, setCoordLat] = useState('');
  const [coordLng, setCoordLng] = useState('');

  const [returnLocation, setReturnLocation] = useState(null);
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
  const [favoriteDongNames, setFavoriteDongNames] = useState([]);
  const [dongOptions, setDongOptions] = useState([]);
  const [dongLoading, setDongLoading] = useState(false);
  const dongLoadIdRef = useRef(0);
  const dongSheetY = useRef(new Animated.Value(0)).current;
  const [selectedDong, setSelectedDong] = useState(null);
  const selectedDongName = dongName(selectedDong?.properties?.adm_nm || selectedDong?.properties?.name);
  const favoriteDongKey = `pang3:favorite-dongs:${user?.userId || 'guest'}:${activeGroup?.groupId || 'personal'}`;
  // 엑셀, csv 데이터 업로드
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setFavoriteDongNames([]);
    setDongOptions([]);
    setDongOpen(false);
    setDongLoading(false);
    dongLoadIdRef.current += 1;
    AsyncStorage.getItem(favoriteDongKey).then((raw) => {
      if (!active) return;
      try {
        const names = JSON.parse(raw || '[]');
        setFavoriteDongNames(Array.isArray(names) ? names.filter((name) => typeof name === 'string') : []);
      } catch {
        setFavoriteDongNames([]);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [favoriteDongKey]);
  const toggleFavoriteDong = (name) => {
    setFavoriteDongNames((previous) => {
      const next = previous.includes(name)
        ? previous.filter((item) => item !== name)
        : [...previous, name];
      AsyncStorage.setItem(favoriteDongKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const sortedDongOptions = useMemo(() => [...dongOptions].sort((left, right) => {
    const leftName = dongName(left.properties?.adm_nm || left.properties?.name);
    const rightName = dongName(right.properties?.adm_nm || right.properties?.name);
    return Number(favoriteDongNames.includes(rightName)) - Number(favoriteDongNames.includes(leftName))
      || leftName.localeCompare(rightName, 'ko');
  }), [dongOptions, favoriteDongNames]);

  const sheetY = useRef(new Animated.Value(0)).current;
  const publicSheetY = useRef(new Animated.Value(0)).current;
  const pendingSheetY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!dongOpen) {
      dongSheetY.setValue(0);
    }
  }, [dongOpen, dongSheetY]);
  useEffect(() => {
    if (!isActive) { setDongOpen(false); setSearchOpen(false); }
  }, [isActive]);
  useEffect(() => {
    if (!publicSheetOpen) publicSheetY.setValue(0);
  }, [publicSheetOpen, publicSheetY]);
  useEffect(() => {
    if (!pendingOpen) pendingSheetY.setValue(0);
  }, [pendingOpen, pendingSheetY]);
  useEffect(() => {
    setReturnLocation(user?.workplaceAddress && user?.workplaceLat != null && user?.workplaceLng != null
      ? { detailAddress: '근무지', roadAddress: user.workplaceAddress, lat: Number(user.workplaceLat), lng: Number(user.workplaceLng), isReturnLocation: true }
      : null);
  }, [user?.userId, user?.workplaceAddress, user?.workplaceLat, user?.workplaceLng]);

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
  const loadDongs = async (openSheet = true) => {
    const requestId = ++dongLoadIdRef.current;
    const teamDistrict = locationScope === 'team' ? activeGroup?.regionSigungu : null;
    const admCode = teamDistrict
      ? ((activeGroup?.regionSido || '').includes('부산')
        ? BUSAN_DISTRICT_CODES[teamDistrict]
        : null) || activeGroup?.regionAdmCode
      : user?.workSido === '부산광역시'
        ? BUSAN_DISTRICT_CODES[user?.workSigungu]
        : activeGroup?.regionAdmCode;
    if (!admCode) {
      setDongLoading(false);
      showAlert('지역 정보 필요', '설정에서 근무 시·군·구를 선택해주세요.');
      return;
    }
    if (openSheet) {
      setPendingOpen(false);
      setDongOpen(true);
    }
    try {
      setDongLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/sgis/boundaries?admCode=${encodeURIComponent(admCode)}`);
      if (!response.ok) throw new Error('경계를 불러오지 못했습니다.');
      const data = await response.json();
      if (requestId === dongLoadIdRef.current) {
        setDongOptions(Array.isArray(data?.features) ? data.features : []);
      }
    } catch (error) {
      if (requestId === dongLoadIdRef.current) showAlert('행정동 조회 실패', error.message);
    } finally {
      if (requestId === dongLoadIdRef.current) setDongLoading(false);
    }
  };
  const selectDong = (feature) => {
    setSelectedDong(feature);
    setPublicItems([]);
    setPublicSelectedIds([]);
    setDongOpen(false);
    setPublicSheetOpen(true);
    if (!publicCategory) setPublicCategoryOpen(true);
  };
  const markers = useMemo(() => [...(locations || [])].sort((a, b) =>
    (a.markerNumber || Infinity) - (b.markerNumber || Infinity)), [locations]);
  const orderedMarkers = useMemo(() => markers.filter((item) => !isCompleted(item)), [markers]);
  const activeDisplayMarkers = useMemo(() => orderedMarkers.map((item) => ({ ...item,
    markerLabel: String(item.markerNumber || '') })), [orderedMarkers]);
  const completedDisplayMarkers = useMemo(() => markers.filter(isCompleted)
    .map((item) => ({ ...item, markerLabel: '✓' })), [markers]);
  const visitDisplayMarkers = useMemo(() => [...activeDisplayMarkers, ...completedDisplayMarkers]
    .map((item) => ({ ...item, displayMarkerLabel: item.markerLabel })), [activeDisplayMarkers, completedDisplayMarkers]);
  const returnDisplayMarker = useMemo(() => hasVisitCoordinates(returnLocation) ? {
    ...returnLocation, id: '__return_location__', status: 'return', isReturnLocation: true,
    markerLabel: '복귀', markerColor: '#2477F3',
  } : null, [returnLocation]);
  const mapOnlyMarkers = useMemo(() => {
    const keys = new Set(markers.map(locationKey));
    return previewMarkers.filter((item) => !keys.has(locationKey(item)))
      .map((item) => ({ ...item, markerLabel: isCompleted(item) ? '✓' : '·' }));
  }, [previewMarkers, markers]);
  const allVisits = useMemo(() => [...markers, ...mapOnlyMarkers,
    ...(returnDisplayMarker ? [returnDisplayMarker] : [])], [markers, mapOnlyMarkers, returnDisplayMarker]);
  const activeSegment = routeSegments?.[0]?.destinationKey ? routeSegments[0] : null;
  const activeTarget = activeSegment ? allVisits.find((item) => locationKey(item) === activeSegment.destinationKey) : null;
  const previewTarget = preview ? allVisits.find((item) => locationKey(item) === preview.targetKey) : null;
  const cardTarget = preview ? previewTarget : (isGuiding ? activeTarget : null);
  const cardSegment = preview ? preview.segment : activeSegment;
  const guidanceProgress = useMemo(() => {
    if (!isGuiding || !activeSegment) return null;
    if (activeSegment.mode === 'car') return nativeProgress?.destinationKey === activeSegment.destinationKey ? nativeProgress : null;
    return remainingRouteProgress(activeSegment, currentLocation);
  }, [isGuiding, activeSegment, currentLocation, nativeProgress]);
  const cardDistance = !preview && guidanceProgress ? guidanceProgress.distance : cardSegment?.totalDistance;
  const cardDuration = !preview && guidanceProgress ? guidanceProgress.duration : cardSegment?.totalDuration;
  const routeVisibleKey = preview?.segment ? preview.targetKey : (!preview && isGuiding ? activeSegment?.destinationKey : null);
  const publicDisplayItems = useMemo(() => {
    const categoryInfo = PUBLIC_FACILITY_CATEGORIES.find((entry) => entry.key === publicCategory);
    return publicItems.map((item) => ({
      ...item,
      isPublicFacility: true,
      markerLabel: categoryInfo?.shortLabel === 'AED' ? 'AED' : 'B',
      markerColor: publicSelectedIds.includes(item.id) ? '#0CA678' : '#2477F3',
    }));
  }, [publicItems, publicSelectedIds, publicCategory]);
  const displayLocations = useMemo(() => [...activeDisplayMarkers, ...completedDisplayMarkers,
    ...(returnDisplayMarker ? [returnDisplayMarker] : [])], [activeDisplayMarkers, completedDisplayMarkers, returnDisplayMarker]);
  const searchPins = resultsMode ? searchResults.map((place, index) => {
    const id = `search:${place.id}:${index}`; const selected = id === selectedSearchPinId;
    return { ...placeLocation(place), id, isSearchResult: true, isSelectedSearch: selected, markerLabel: selected ? '✓' : '⌕', markerColor: selected ? '#F97316' : '#168DE2', status: 'search' };
  }) : [];
  const displayOnlyLocations = [...mapOnlyMarkers, ...publicDisplayItems, ...searchPins];
  const publicViewCoordinates = useMemo(() => publicFacilityMode && selectedDong
    ? facilityViewCoordinates(selectedDong, publicItems) : [], [publicFacilityMode, selectedDong, publicItems]);
  const assignmentMap = useMemo(() => {
    const map = new Map();
    groupAssignments.forEach((item) => map.set(Number(item.taskId), item));
    return map;
  }, [groupAssignments]);

  useEffect(() => {
    setPanelOpen?.(false);
  }, []);

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
      if (dongOpen) {
        setDongOpen(false);
        return true;
      }

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

      if (resultsMode) { setResultsMode(false); return true; }
      if (searchedPlace) {
        closeAddSheet();
        return true;
      }


      if (visitListOpen) {
        setVisitListOpen(false);
        return true;
      }

      if (preview) {
        previewRequestRef.current += 1;
        setPreview(null);
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
    dongOpen,
    coordSheetOpen,
    mapSelectMode,
    addMenuOpen,
    searchedPlace,
    resultsMode,
    visitListOpen,
    preview,
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

  const pendingSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => pendingSheetY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 65 || (gesture.dy > 20 && gesture.vy > 0.8)) {
          Animated.timing(pendingSheetY, {
            toValue: 280,
            duration: 220,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) {
              setPendingOpen(false);
            } else {
              Animated.spring(pendingSheetY, { toValue: 0, useNativeDriver: true }).start();
            }
          });
        } else {
          Animated.spring(pendingSheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pendingSheetY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const dongSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => dongSheetY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 65 || (gesture.dy > 20 && gesture.vy > 0.8)) {
          Animated.timing(dongSheetY, {
            toValue: 280,
            duration: 220,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) setDongOpen(false);
            else Animated.spring(dongSheetY, { toValue: 0, useNativeDriver: true }).start();
          });
        } else {
          Animated.spring(dongSheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dongSheetY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (!publicFacilityMode || !selectedDong || !publicCategory) {
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
    setPublicItems([]);
    setPublicSelectedIds([]);
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

  const openSearch = () => { setSearchInitialQuery(resultsMode ? resultQuery : ''); resetAddModes(); setAddMenuOpen(false); setResultsMode(false); setSearchOpen(true); };
  const showResults = (rows, query) => {
    setSelectedSearchPinId(null);
    setSearchResults(rows); setResultQuery(query); setKeyword(query); setResultsMode(true); setSearchOpen(false);
    focusPlaces(rows.map(placeLocation));
  };
  const addSearchPlace = (place) => {
    if (isRegisteredPlace(place, locations || [])) return;
    setSearchOpen(false); setResultsMode(false); setNextPlace(place);
  };
  const saveWorkplace = async () => {
    if (!workplaceCandidate?.workplaceAddress || workplaceBusy) return;
    setWorkplaceBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${user.userId}/workplace`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workplaceCandidate) });
      if (!response.ok) throw new Error('근무지를 저장하지 못했습니다.');
      onUpdatedUser?.({ ...user, ...(await response.json()) }); setWorkplaceOpen(false);
      showAlert('등록 완료', '근무지를 등록했습니다. 메뉴의 근무지 복귀로 안내를 시작할 수 있습니다.');
    } catch (error) { showAlert('저장 실패', error.message); }
    finally { setWorkplaceBusy(false); }
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
    focusPlaces([nextLoc]);

  };

  const resetAddModes = () => {
    setResultsMode(false); setSearchOpen(false);
    setPendingOpen(false);
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

    if (!coordLat.trim() || !coordLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
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
    if (registrationBusyRef.current) return;
    if (!searchedPlace) {
      showAlert('위치 필요', '먼저 위치를 선택하세요.');
      return;
    }

    if (!placeName.trim()) {
      showAlert('방문지 이름 필요', '방문지 이름을 입력하세요.');
      return;
    }

    registrationBusyRef.current = true; setRegistrationBusy(true);
    let region;
    try {
      region = await getAdministrativeRegion(searchedPlace.lat, searchedPlace.lng);
    } catch (error) {
      showAlert('행정구역 조회 실패', error.message);
      registrationBusyRef.current = false; setRegistrationBusy(false);
      return;
    }

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
        setLocations?.((previous) => [
          ...(Array.isArray(previous) ? previous : locations || []),
          {
            ...newLoc,
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
      focusPlaces([newLoc]);
      showAlert('방문지 등록 완료', `${newLoc.detailAddress}을(를) 오늘 업무에 추가했습니다.`);

      setKeyword('');

      closeAddSheet();
    } catch (error) {
      console.log(error);
      showAlert(
        'DB 저장 실패',
        '백엔드 실행 상태와 EXPO_PUBLIC_API_BASE_URL을 확인하세요.'
      );
    } finally {
      registrationBusyRef.current = false; setRegistrationBusy(false);
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

    setLocations?.((previous) => (Array.isArray(previous) ? previous : locations || []).filter((loc) => loc.id !== id));
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
    if (seconds == null || !Number.isFinite(Number(seconds))) return null;

    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
      return `약 ${minutes}분`;
    }

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return `약 ${h}시간 ${m}분`;
  };

  const formatDistance = (meters) => {
    if (meters == null || !Number.isFinite(Number(meters))) return null;

    if (meters >= 1000) {
      return `약 ${(meters / 1000).toFixed(1)}km`;
    }

    return `약 ${Math.round(meters)}m`;
  };

  const fetchRouteSegment = async (startLocation, endLocation, mode) => {
    const res = await fetch(`${API_BASE_URL}/api/routes/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(mode === 'walk' ? { 'X-Kakao-Walk-Key': KAKAO_REST_API_KEY || '' } : {}) },
      body: JSON.stringify({ start: startLocation, end: endLocation, transportMode: mode, ...(mode === 'car' ? { routePriority: 'RECOMMEND' } : {}) }),
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

  const scopeKey = `${user?.userId}:${activeGroup?.groupId}:${locationScope}`;
  const membershipKey = visitSetKey(locations || []);
  const liveVisitsRef = useRef(allVisits);
  liveVisitsRef.current = allVisits;
  const resumedRouteRef = useRef(null);

  useEffect(() => {
    workspaceScopeRef.current = scopeKey;
    orderSetRef.current = null;
    previewRequestRef.current += 1;
    guideRequestRef.current += 1;
    setPreview(null);
    setSegmentChanging(false);
    setKakaoDestination(null);
    setNativeProgress(null);
    setPublicFacilityMode(false);
    setSearchOpen(false); setResultsMode(false); setFocusRequest({ coordinates: [], token: 0 });
    setDongOpen(false);
    setSelectedDong(null);
    return () => {
      previewRequestRef.current += 1;
      guideRequestRef.current += 1;
    };
  }, [scopeKey]);

  useEffect(() => {
    if (!isActive || !hasVisitCoordinates(currentLocation)) return;
    if (orderSetRef.current === membershipKey) return;
    const first = orderSetRef.current === null;
    orderSetRef.current = membershipKey;
    if (first && (locations || []).every((row) => row.visitOrderVersion === 2)) return;
    const pinnedKey = isGuiding ? activeSegment?.destinationKey : null;
    setLocations?.((previous) => recommendVisitOrder(
      Array.isArray(previous) ? previous : locations || [], currentLocation, pinnedKey
    ));
  }, [isActive, membershipKey, currentLocation, scopeKey, isGuiding, activeSegment?.destinationKey]);

  const clearGuidance = () => {
    guideRequestRef.current += 1;
    setIsGuiding(false);
    setKakaoDestination(null);
    setNativeProgress(null);
    setRouteSegments([]);
    setRoadPath([]);
    setCurrentSegmentIndex(0);
    setOptimized(false);
    setTotalDuration(null);
    setSegmentChanging(false);
    stopRouteNotification();
  };

  // An accepted transfer can remove the current destination from the sender's map.
  // Never keep guiding to a removed or completed task, or resume a legacy full route.
  useEffect(() => {
    if (routeSegments?.length && (!activeSegment || !activeTarget || isCompleted(activeTarget))) {
      clearGuidance();
    }
    if (preview && (!previewTarget ||
        (preview.coords && preview.coords !== `${previewTarget.lat},${previewTarget.lng}`))) {
      previewRequestRef.current += 1;
      setPreview(null);
    }
  }, [allVisits, activeSegment, routeSegments, preview]);

  const previewVisit = async (target, mode = transportMode) => {
    if (!hasVisitCoordinates(target)) {
      showAlert('위치 정보 없음', '이 방문지의 좌표를 확인할 수 없습니다.');
      return;
    }
    const request = ++previewRequestRef.current;
    const targetKey = locationKey(target);
    setPreview({ targetKey, mode, segment: null, loading: true, coords: `${target.lat},${target.lng}` });
    setVisitListOpen(false);
    if (!hasVisitCoordinates(currentLocation)) {
      setPreview({ targetKey, mode, segment: null, loading: false, error: '현재 위치를 확인한 뒤 다시 시도해 주세요.' });
      return;
    }
    try {
      const result = await fetchRouteSegment(cleanLocation(currentLocation), cleanLocation(target), mode);
      if (request !== previewRequestRef.current || !liveVisitsRef.current.some((row) => locationKey(row) === targetKey)) return;
      setPreview({ targetKey, mode, loading: false, coords: `${target.lat},${target.lng}`,
        segment: { ...result.segment, destinationKey: targetKey } });
    } catch (error) {
      if (request === previewRequestRef.current) {
        setPreview({ targetKey, mode, segment: null, loading: false, error: '경로를 불러오지 못했습니다. 다시 시도해 주세요.' });
      }
    }
  };

  const handleVisitPress = (target) => {
    if (target?.isSearchResult) { setSelectedSearchPinId(target.id); focusPlaces([target]); return; }
    if (target?.isPublicFacility) { togglePublicFacility(target); return; }
    if (publicFacilityMode) return;
    if (isCompleted(target)) { onLocationClick?.(target, 'report'); return; }
    if (locationKey(target) === routeVisibleKey && !target.isReturnLocation) {
      onLocationClick?.(target, 'report');
      return;
    }
    if (preview?.loading && preview.targetKey === locationKey(target)) return;
    previewVisit(target);
  };

  const handledRecordRef = useRef(null);
  const [recordNextOffer, setRecordNextOffer] = useState(null);
  const nextVisit = (excluded) => markers.find((row) => !isCompleted(row) && !row.isReturnLocation &&
    locationKey(row) !== String(excluded) && hasVisitCoordinates(row));
  useEffect(() => {
    if (!isActive || !recordReturn || recordReturn.token === handledRecordRef.current) return;
    handledRecordRef.current = recordReturn.token;
    clearGuidance();
    previewRequestRef.current += 1; setPreview(null);
    const next = nextVisit(recordReturn.taskId);
    if (recordReturn.status === 'complete') {
      setRecordNextOffer(null);
      if (next) previewVisit(next);
    } else if (recordReturn.status === 'working') {
      setRecordNextOffer({ taskId: recordReturn.taskId, scope: scopeKey });
    } else setRecordNextOffer(null);
  }, [isActive, recordReturn?.token, scopeKey]);

  const handleStartGuidance = async (explicitTarget = null) => {
    const target = explicitTarget?.isReturnLocation ? explicitTarget : cardTarget;
    if (!target || isCompleted(target) || segmentChanging || preview?.loading) return;
    if (!hasVisitCoordinates(currentLocation)) {
      showAlert('현재 위치 확인 중', '현재 위치를 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    const targetKey = locationKey(target);
    const mode = preview?.mode || activeSegment?.mode || transportMode;
    if (mode === 'car' && !isKakaoNavigationAvailable()) {
      showAlert('차량 안내 사용 불가', '카카오 차량 안내가 포함된 Android 앱에서 이용해 주세요. 도보 안내는 현재 지도에서 사용할 수 있습니다.');
      return;
    }
    const request = ++guideRequestRef.current;
    const scope = workspaceScopeRef.current;
    setSegmentChanging(true);
    try {
      const result = await fetchRouteSegment(cleanLocation(currentLocation), cleanLocation(target), mode);
      const liveTarget = liveVisitsRef.current.find((row) => locationKey(row) === targetKey);
      if (request !== guideRequestRef.current || scope !== workspaceScopeRef.current || !liveTarget || isCompleted(liveTarget)) return;
      // Commit only after a route succeeds. Browsing and failed requests never renumber visits.
      setLocations?.((previous) => promoteVisit(
        [...(Array.isArray(previous) ? previous : locations || [])].sort((a, b) =>
          (a.markerNumber || Infinity) - (b.markerNumber || Infinity)), targetKey
      ));
      setRouteSegments([{ ...result.segment, destinationKey: targetKey }]);
      setRoadPath(result.segment.path || []);
      setCurrentSegmentIndex(0);
      setTotalDuration(result.totalDuration);
      setTransportMode(mode);
      setNativeProgress(null);
      resumedRouteRef.current = `${scopeKey}:${routeResumeToken}:${targetKey}`;
      setOptimized(true);
      beginRouteSession();
      setIsGuiding(true);
      previewRequestRef.current += 1;
      setPreview(null);
      if (mode === 'car' && Platform.OS === 'android' && isKakaoNavigationAvailable()) {
        setKakaoDestination({ lat: Number(target.lat), lng: Number(target.lng),
          name: target.detailAddress || target.roadAddress || '방문지',
          address: target.roadAddress || target.detailAddress || '',
          startLat: Number(currentLocation.lat), startLng: Number(currentLocation.lng), destinationKey: targetKey });
      } else setKakaoDestination(null);
    } catch (error) {
      if (request === guideRequestRef.current) showAlert('안내 시작 실패', '경로를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (request === guideRequestRef.current) setSegmentChanging(false);
    }
  };

  const handleStopGuidance = () => {
    clearGuidance();
    setSegmentChanging(false);
  };

  const handleReroute = async (position = currentLocation, mode = activeSegment?.mode || transportMode) => {
    if (mode === 'car') return;
    if (segmentChanging || !isGuiding || !activeTarget || isCompleted(activeTarget) || !hasVisitCoordinates(position)) return;
    const targetKey = locationKey(activeTarget);
    const request = ++guideRequestRef.current;
    try {
      const result = await fetchRouteSegment(cleanLocation(position), cleanLocation(activeTarget), mode);
      if (request !== guideRequestRef.current) return;
      setRouteSegments([{ ...result.segment, destinationKey: targetKey }]);
      setRoadPath(result.segment.path || []);
      setTotalDuration(result.totalDuration);
      setTransportMode(mode);
    } catch (error) {
      console.log('목적지 경로 재탐색 실패:', error.message);
    }
  };

  useEffect(() => {
    const key = `${scopeKey}:${routeResumeToken}:${activeSegment?.destinationKey}`;
    if (!isActive || !isGuiding || !activeTarget || !hasVisitCoordinates(currentLocation) || resumedRouteRef.current === key) return;
    resumedRouteRef.current = key;
    if (activeSegment.mode === 'car') {
      if (!isKakaoNavigationAvailable()) { clearGuidance(); return; }
      setNativeProgress(null);
      setKakaoDestination({ lat: Number(activeTarget.lat), lng: Number(activeTarget.lng),
        name: activeTarget.detailAddress || activeTarget.roadAddress || '방문지',
        address: activeTarget.roadAddress || activeTarget.detailAddress || '',
        startLat: Number(currentLocation.lat), startLng: Number(currentLocation.lng), destinationKey: activeSegment.destinationKey });
    } else handleReroute(currentLocation);
  }, [isActive, isGuiding, routeResumeToken, scopeKey, activeTarget, currentLocation]);

  const handleTransportPress = (mode) => {
    setTransportMode(mode);
    if (cardTarget) previewVisit(cardTarget, mode);
  };

  
  useEffect(() => {
    if (!isGuiding || !activeTarget || !activeSegment) { stopRouteNotification(); return; }
    updateRouteNotification({ from: '현재 위치', to: activeTarget.detailAddress || activeTarget.roadAddress || '방문지',
      duration: formatDuration(guidanceProgress?.duration ?? activeSegment.totalDuration)?.replace(/^약\s*/, '') || '-',
      distance: formatDistance(guidanceProgress?.distance ?? activeSegment.totalDistance ?? getPathDistance(activeSegment.path))?.replace(/^약\s*/, '') || '-',
      remainingCount: orderedMarkers.length });
  }, [isGuiding, activeTarget, activeSegment, guidanceProgress, orderedMarkers.length]);

  return (
    <View style={styles.container} onLayout={event => setMapHeight(event.nativeEvent.layout.height)}>
      {recordNextOffer?.scope === scopeKey && isActive && nextVisit(recordNextOffer.taskId) && <TouchableOpacity
        accessibilityRole="button" accessibilityLabel="다음 방문지 경로 보기"
        style={{ position: 'absolute', top: 110, right: 16, zIndex: 20, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12 }}
        onPress={() => { const next = nextVisit(recordNextOffer.taskId); setRecordNextOffer(null); if (next) previewVisit(next); }}>
        <Text style={{ color: '#2477F3', fontWeight: '700' }}>다음 방문지</Text>
      </TouchableOpacity>}
      <KakaoMapWebView
        locations={displayLocations}
        displayOnlyLocations={displayOnlyLocations}
        directMarkerPress
        guideTarget={activeTarget}
        onReturnArrival={handleStopGuidance}
        previewRouteSegment={preview?.segment || null}
        highlightedLocationKey={resultsMode ? selectedSearchPinId : cardTarget ? locationKey(cardTarget) : null}
        focusCoordinates={publicFacilityMode ? publicViewCoordinates : focusRequest.coordinates}
        focusToken={focusRequest.token}
        focusPadding={resultsMode ? { top: 120, bottom: mapHeight * 0.53, left: 40, right: 40 } : { top: 160, bottom: 140, left: 40, right: 40 }}
        roadPath={isGuiding ? roadPath : []}
        routeSegments={activeSegment ? routeSegments : EMPTY_MARKERS}
        currentSegmentIndex={0}
        panelOpen={false}
        setPanelOpen={setPanelOpen}
        isGuiding={isGuiding && !kakaoDestination}
        searchedPlace={searchedPlace}
        clearSearchMarkerSignal={clearSearchMarkerSignal}
        mapSelectMode={mapSelectMode && locationSettingMode}
        selectionSessionActive={mapSelectMode}
        selectionPosition={directCenter}
        onCenterChange={setDirectCenter}
        onSelectionMoveChange={setLocationMoving}
        onCurrentLocationChange={setCurrentLocation}
        onMarkerClick={handleVisitPress}
        onLocationsChange={(next) => {
          const updated = new Map(next.filter((item) => !item.isReturnLocation).map((item) => [locationKey(item), item]));
          setLocations?.((previous) => (Array.isArray(previous) ? previous : locations || [])
            .map((item) => updated.has(locationKey(item)) ? { ...item, status: updated.get(locationKey(item)).status } : item));
          onDataChanged?.();
        }}
        onRerouteRequest={handleReroute}
      />
      {kakaoDestination && (
        <KakaoNavigationView
          style={StyleSheet.absoluteFillObject}
          destination={kakaoDestination}
          onError={(event) => {
            clearGuidance();
            showAlert('카카오 길안내 오류', event.nativeEvent?.message || '길안내를 시작하지 못했습니다.');
          }}
          onEnded={(event) => {
            if (event.nativeEvent?.destinationKey === activeSegment?.destinationKey) handleStopGuidance();
          }}
          onProgress={(event) => {
            const data = event.nativeEvent;
            if (data?.destinationKey !== activeSegment?.destinationKey || !Number.isFinite(data.distance) || !Number.isFinite(data.duration) || data.distance < 0 || data.duration < 0) return;
            setNativeProgress(data);
          }}
          onArrived={(event) => {
            if (event.nativeEvent?.destinationKey !== activeSegment?.destinationKey) return;
            const target = activeTarget;
            clearGuidance();
            if (target && !target.isReturnLocation) showAlert('목적지에 도착했습니다', '방문지의 작업 기록을 작성할까요?', [
              { text: '나중에', style: 'cancel' },
              { text: '작업 기록 작성', onPress: () => onLocationClick?.(target, 'report') },
            ]);
          }}
        />
      )}

      {mapSelectMode && <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 46, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, paddingRight: 4 }}>
            <Text style={{ color: '#172033', fontWeight: '800' }}>
              {centerAddress || (locationSettingMode ? '현재 위치를 확인하는 중...' : '위치 설정을 눌러 위치를 선택하세요')}
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

              setClearSearchMarkerSignal((prev) => prev + 1);
            }}
          >
            <Text style={{ color: '#B94D59', fontWeight: '800' }}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!directCenter}
            style={{ flex: 2, padding: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#2477F3', opacity: directCenter ? 1 : 0.5 }}
            onPress={async () => {
              const place = { lat: directCenter.lat, lng: directCenter.lng, detailAddress: centerAddress && centerAddress !== '주소 확인 중...' ? centerAddress : '지도 선택 위치', roadAddress: centerAddress && centerAddress !== '주소 확인 중...' ? centerAddress : '' };
              sheetY.setValue(0);
              setLocationMoving(false);
              setLocationSettingMode(false);
              setMapSelectMode(false);
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
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.searchControlRow}>
          {publicFacilityMode && <TouchableOpacity
            style={styles.smallTopButton}
            onPress={() => { setPublicCategoryOpen(false); dongOpen ? setDongOpen(false) : loadDongs(); }}
            accessibilityRole="button"
            accessibilityLabel="공공시설물 조회 지역 선택"
          >
            <Ionicons name="map-outline" size={13} color="#2477F3" />
            <Text style={styles.smallTopText}>{selectedDongName || '행정동'}</Text>
          </TouchableOpacity>}
          <View style={styles.searchBox}>
            <TouchableOpacity onPress={() => { resetAddModes(); setAddMenuOpen(value => !value); }} accessibilityLabel="방문지 추가 방법"><Ionicons name="menu" size={21} color="#2477F3" /></TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, height: 44 }} disabled={publicFacilityMode || resultsMode}
              onPress={() => { resetAddModes(); setAddMenuOpen(value => !value); }}
              accessibilityRole="button" accessibilityLabel="방문지 추가 방법" accessible={!publicFacilityMode && !resultsMode}>
              <View pointerEvents="none" style={{ flex: 1 }}>
                <TextInput style={styles.searchInput} value={publicFacilityMode ? (PUBLIC_FACILITY_CATEGORIES.find(item => item.key === publicCategory)?.label || '') : resultsMode ? resultQuery : ''} placeholder={publicFacilityMode ? '공공시설물 카테고리 선택' : '방문지를 추가해주세요'} placeholderTextColor="#9AA6B2" editable={false} accessible={publicFacilityMode || resultsMode} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { if (resultsMode) { setResultsMode(false); setKeyword(''); } else if (publicFacilityMode) { if (!selectedDong) loadDongs(); else setPublicCategoryOpen(value => !value); } else setAddMenuOpen(value => !value); }} accessibilityLabel={resultsMode ? '검색 결과 닫기' : '방문지 추가 방법'}><Ionicons name={resultsMode ? 'close' : publicFacilityMode ? 'chevron-down' : 'search'} size={23} color="#2477F3" /></TouchableOpacity>
          </View>

          {publicFacilityMode && <TouchableOpacity style={styles.smallTopButton}
            accessibilityLabel="공공시설물 조회 닫기" onPress={() => { resetAddModes(); setDongOpen(false); }}>
            <Ionicons name="close" size={20} color="#2477F3" />
          </TouchableOpacity>}
        </View>
        {addMenuOpen && (
          <View style={styles.addMenuBox}>
            <TouchableOpacity style={styles.addMenuItem} onPress={() => { setAddMenuOpen(false); returnDisplayMarker ? handleStartGuidance(returnDisplayMarker) : setWorkplaceOpen(true); }}><Ionicons name="home-outline" size={18} color="#2477F3" /><View style={{ flex: 1 }}><Text style={styles.addMenuTitle}>근무지 복귀</Text><Text style={styles.addMenuDesc}>{user?.workplaceAddress || '근무지를 등록하고 복귀 안내 시작'}</Text></View></TouchableOpacity>
            <TouchableOpacity
              style={styles.addMenuItem}
              onPress={() => {
                resetAddModes();
                setAddMenuOpen(false);
                openSearch();
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

                setCoordSheetOpen(false);
                setDirectCenter(null);
                setCenterAddress('');
                setLocationSettingMode(true);

                setMapSelectMode(true);

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
                resetAddModes();
                setAddMenuOpen(false);
                setPublicFacilityMode(true);
                setPublicSheetOpen(true);
                setKeyword('');
                setPublicCategory('');
                setPublicItems([]);
                setPublicSelectedIds([]);
                setPublicCategoryOpen(false);
                loadDongs();

              }}
            >
              <Ionicons name="business-outline" size={18} color="#2477F3" />
              <View><Text style={styles.addMenuTitle}>공공시설물</Text><Text style={styles.addMenuDesc}>행정동을 선택해 AED · 버스정류장 조회</Text></View>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.addMenuItem} 
              onPress={() => { 
                setAddMenuOpen(false); 
                setBulkUploadOpen(true);
              }}
            >
              <Ionicons name="grid-outline" size={18} color="#2477F3" />
              <View>
                <Text style={styles.addMenuTitle}>엑셀 일괄 등록</Text>
                <Text style={styles.addMenuDesc}>xcel · CSV 파일 불러오기</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuItemLast} onPress={() => { setAddMenuOpen(false); showAlert('준비 중', '사진으로 등록은 후속 개발 예정입니다.'); }}>
              <Ionicons name="image-outline" size={18} color="#2477F3" />
              <View><Text style={styles.addMenuTitle}>사진으로 등록</Text><Text style={styles.addMenuDesc}>후속 개발 예정</Text></View>
            </TouchableOpacity>
          </View>
        )}

        {publicFacilityMode && selectedDong && publicCategoryOpen && !dongOpen && (
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
              style={styles.visitChipList}
              data={visitDisplayMarkers}
              keyExtractor={(item, idx) => String(item.id ?? idx)}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.routeChip}
                  onPress={() => handleVisitPress(item)}
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
              <Text style={styles.visitCount}>방문지 {orderedMarkers.length}개 · 추천 방문 순서</Text>

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
                  onPress={() => handleVisitPress(loc)}
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

        {!resultsMode && !publicFacilityMode && !mapSelectMode && !searchedPlace && !coordSheetOpen && cardTarget && (
          <View style={styles.destinationCard}>
            <View style={styles.destinationHead}>
              <TouchableOpacity style={styles.destinationInfo}
                accessibilityLabel={cardTarget.isReturnLocation ? '복귀 목적지' : '보고서 작성'}
                accessibilityRole={cardTarget.isReturnLocation ? 'text' : 'button'}
                disabled={cardTarget.isReturnLocation}
                onPress={() => onLocationClick?.(cardTarget, 'report')}>
                <Text style={styles.destinationName} numberOfLines={1}>{cardTarget.detailAddress || cardTarget.roadAddress || '방문지'}</Text>
                <Text style={styles.destinationMeta} numberOfLines={2}>
                  {!preview && isGuiding ? '안내 중 · ' : ''}
                  {preview?.loading ? '경로를 불러오는 중…' : preview?.error ||
                    [formatDistance(cardDistance), formatDuration(cardDuration)].filter(Boolean).join(' · ')}
                </Text>
              </TouchableOpacity>
            <View style={styles.destinationActions}>
              {['car', 'walk'].map((mode) => (
                <TouchableOpacity key={mode} accessibilityLabel={mode === 'car' ? '차량 경로' : '도보 경로'}
                  disabled={preview?.loading || segmentChanging}
                  onPress={() => handleTransportPress(mode)}
                  style={[styles.destinationMode, (preview?.mode || activeSegment?.mode || transportMode) === mode && styles.destinationModeActive]}>
                  <Ionicons name={mode === 'car' ? 'car' : 'walk'} size={19}
                    color="#FFFFFF" />
                </TouchableOpacity>
              ))}
              {preview || !isGuiding ? (
                <TouchableOpacity style={[styles.startButton, (!cardSegment || isCompleted(cardTarget) || segmentChanging) && { opacity: 0.4 }]}
                  accessibilityLabel={isGuiding ? '이곳으로 안내 변경' : '안내 시작'}
                  disabled={!cardSegment || isCompleted(cardTarget) || segmentChanging}
                  onPress={handleStartGuidance}>
                  <Ionicons name="play-circle" size={25} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.stopButton} accessibilityLabel="안내 종료" onPress={handleStopGuidance}>
                  <Ionicons name="stop-circle" size={25} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
              {preview && <TouchableOpacity style={styles.destinationClose}
                accessibilityLabel={isGuiding ? '현재 안내로 돌아가기' : '경로 미리보기 닫기'}
                onPress={() => { previewRequestRef.current += 1; setPreview(null); }}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>}
            </View>
            {preview?.error && <TouchableOpacity onPress={() => previewVisit(cardTarget, preview.mode)}>
              <Text style={styles.retryText}>경로 다시 불러오기</Text>
            </TouchableOpacity>}
          </View>
        )}
      </View>

      {!resultsMode && !mapSelectMode && !publicFacilityMode && !searchedPlace && !coordSheetOpen && !pendingOpen && !dongOpen && (
        <TouchableOpacity
          style={styles.publicFacilityCollapsed}
          activeOpacity={0.88}
          onPress={() => setPendingOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="미처리 업무 목록 펼치기"
        >
          <Text style={styles.publicFacilityCollapsedText}>
            미처리 업무 {pendingWork.length}건 보기
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

          <TouchableOpacity style={styles.addButton} onPress={addLocation} disabled={registrationBusy}>
            <Text style={styles.addButtonText}>{registrationBusy ? '등록 중...' : '방문지 추가'}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {publicFacilityMode && publicCategory && !publicSheetOpen && !dongOpen && (
        <TouchableOpacity
          style={styles.publicFacilityCollapsed}
          onPress={() => setPublicSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="공공시설물 목록 펼치기"
        >
          <Text style={styles.publicFacilityCollapsedText}>공공시설물 {publicItems.length}곳 보기</Text>
        </TouchableOpacity>
      )}

      {publicFacilityMode && publicCategory && publicSheetOpen && !dongOpen && (
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

      {pendingOpen && !publicFacilityMode && !dongOpen && (
        <Animated.View style={[styles.publicFacilitySheet, { transform: [{ translateY: pendingSheetY }] }]}>
          <View style={styles.publicFacilityHandleArea} {...pendingSheetPanResponder.panHandlers}>
            <View style={styles.publicFacilityHandle} />
            <View style={styles.publicFacilityHeader}>
              <Text style={styles.publicFacilityActionTitle}>미처리 업무 {pendingWork.length}건</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.pendingSelectAll}
            onPress={() => setPendingSelected(pendingWork.length > 0 && pendingSelected.length === pendingWork.length ? [] : pendingWork.map((item) => String(item.id ?? item.taskId)))}
          >
            <Text style={styles.publicFacilityCount}>{pendingSelected.length}건 선택</Text>
            <Text style={styles.pendingSelectAllText}>{pendingWork.length > 0 && pendingSelected.length === pendingWork.length ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
          <ScrollView style={styles.publicFacilityList} nestedScrollEnabled>
            {pendingWork.length === 0 ? <Text style={styles.publicFacilityEmpty}>미처리 업무가 없습니다.</Text> : pendingWork.map((item) => {
              const id = String(item.id ?? item.taskId);
              const checked = pendingSelected.includes(id);
              return <TouchableOpacity key={id} style={styles.publicFacilityRow} onPress={() => setPendingSelected((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id])}>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? '#2477F3' : '#8A98A8'} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.publicFacilityName} numberOfLines={1}>{item.detailAddress || item.roadAddress || `방문지 ${id}`}</Text>
                  <Text style={styles.publicFacilityAddress} numberOfLines={1}>{item.adminDong || ''}</Text>
                </View>
              </TouchableOpacity>;
            })}
          </ScrollView>
          <TouchableOpacity
            style={[styles.publicFacilityRegisterButton, (!pendingSelected.length || pendingBusy) && styles.publicFacilityRegisterButtonDisabled]}
            disabled={!pendingSelected.length || pendingBusy}
            onPress={async () => {
              try {
                setPendingBusy(true);
                const rows = pendingWork.filter((item) => pendingSelected.includes(String(item.id ?? item.taskId)));
                if (await onAddWork?.(rows) !== false) { setPendingSelected([]); setPendingOpen(false); focusPlaces(rows); showAlert('업무 추가 완료', `${rows.length}건을 오늘 업무에 추가했습니다.`); }
              } finally { setPendingBusy(false); }
            }}
          >
            <Text style={styles.publicFacilityRegisterText}>{pendingBusy ? '불러오는 중' : `${pendingSelected.length}건 지도에 표시`}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {dongOpen && isActive && (
        <Animated.View style={[styles.publicFacilitySheet, { transform: [{ translateY: dongSheetY }] }]}>
          <View style={styles.publicFacilityHandleArea} {...dongSheetPanResponder.panHandlers}>
            <View style={styles.publicFacilityHandle} />
            <View style={styles.publicFacilityHeader}>
              <Text style={styles.publicFacilityActionTitle}>공공시설물 조회 지역</Text>
              <TouchableOpacity accessibilityLabel="조회 지역 선택 닫기" onPress={() => setDongOpen(false)}><Ionicons name="close" size={22} color="#607195" /></TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.publicFacilityList} nestedScrollEnabled>
            {dongLoading ? <Text style={styles.publicFacilityEmpty}>행정동을 불러오는 중...</Text>
              : sortedDongOptions.length ? sortedDongOptions.map((feature, index) => {
                const name = dongName(feature.properties?.adm_nm || feature.properties?.name);
                const selected = name === selectedDongName;
                return <View
                  key={feature.properties?.adm_cd || index}
                  style={[styles.dongOption, selected && styles.dongOptionSelected]}
                >
                  <TouchableOpacity style={styles.dongOptionMain} onPress={() => selectDong(feature)}
                    accessibilityRole="button" accessibilityLabel={`${name}${selected ? ', 현재 선택' : ''}`}>
                    <Text style={styles.dongOptionText}>{name || `행정동 ${index + 1}`}</Text>
                  </TouchableOpacity>
                  <View style={styles.dongOptionEnd}>
                    {selected ? <Ionicons name="checkmark-circle" size={17} color="#2477F3" /> : null}
                    <TouchableOpacity onPress={() => toggleFavoriteDong(name)}
                      accessibilityRole="button" accessibilityLabel={`${name} 즐겨찾기`}>
                      <Ionicons name={favoriteDongNames.includes(name) ? 'star' : 'star-outline'} size={18} color="#2477F3" />
                    </TouchableOpacity>
                  </View>
                </View>;
              }) : <Text style={styles.publicFacilityEmpty}>표시할 행정동이 없습니다.</Text>}
          </ScrollView>
        </Animated.View>
      )}

      {segmentChanging && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#2477F3" />
          <Text style={styles.loadingTitle}>안내 경로를 준비하는 중</Text>
        </View>
      )}

      {resultsMode && !searchedPlace && <SearchResultSheet height={mapHeight} results={searchResults} query={resultQuery} locations={locations || []} onPick={place => {
        const index = searchResults.indexOf(place);
        setSelectedSearchPinId(`search:${place.id}:${index}`);
        focusPlaces([placeLocation(place)]);
      }} onAdd={addSearchPlace} />}
      {searchOpen && isActive && <PlaceSearchOverlay userId={user?.userId} initialQuery={searchInitialQuery} center={currentLocation} districtOnly locations={locations || []} onClose={() => setSearchOpen(false)} onResults={showResults} onAdd={addSearchPlace} />}
      <Modal visible={workplaceOpen} transparent animationType="fade" onRequestClose={() => !workplaceBusy && setWorkplaceOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' }}><View style={{ padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#10285B' }}>근무지 등록</Text>
          <WorkplaceField value={workplaceCandidate} onChange={setWorkplaceCandidate} userId={user?.userId} disabled={workplaceBusy} />
          <TouchableOpacity disabled={!workplaceCandidate?.workplaceAddress || workplaceBusy} onPress={saveWorkplace} style={{ backgroundColor: '#2477F3', padding: 14, borderRadius: 12, alignItems: 'center', opacity: workplaceCandidate?.workplaceAddress ? 1 : 0.5 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{workplaceBusy ? '저장 중...' : '근무지 저장'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={workplaceBusy} onPress={() => setWorkplaceOpen(false)} style={{ padding: 14, alignItems: 'center' }}><Text>닫기</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <BulkUploadModal
        visible={bulkUploadOpen}
        userId={user?.userId}
        groupId={activeGroup?.groupId ?? null}
        onDataChanged={onDataChanged}
        apiBaseUrl={API_BASE_URL}
        onClose={() => setBulkUploadOpen(false)}
      />
    </View>
  );
}

export default function MapScreen(props) {
  return <NormalMapScreen {...props} />;
}

const styles = StyleSheet.create({
  destinationCard: { marginTop: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: '#2477F3', elevation: 3 },
  destinationHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  destinationInfo: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  destinationName: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  destinationMeta: { color: '#E3EEFF', fontSize: 10, marginTop: 3 },
  destinationClose: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  destinationActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  destinationMode: { width: 36, height: 44, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  destinationModeActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
  startButton: { width: 44, height: 44, borderRadius: 9, backgroundColor: '#145CCD', alignItems: 'center', justifyContent: 'center' },
  stopButton: { width: 44, height: 44, borderRadius: 9, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', paddingVertical: 6, paddingHorizontal: 3 },
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






  chipRowWrap: {
    marginTop: 5,
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
  visitChipList: { flex: 1, minWidth: 0 },

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
    marginTop: 5,
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
    marginTop: 5,
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
    marginTop: 5,
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

  nativeGuideButton: {
    marginTop: 10,
    backgroundColor: '#2477F3',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 16,
  },

  nativeGuideButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
  pendingSelectAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  pendingSelectAllText: { color: '#2477F3', fontSize: 10, fontWeight: '800' },
  publicFacilityList: { flex: 1 },
  publicFacilityRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#EEF2F6' },
  publicFacilityName: { color: '#10285B', fontSize: 11, fontWeight: '800' },
  publicFacilityAddress: { color: '#607195', fontSize: 9, marginTop: 2 },
  publicFacilityEmpty: { color: '#607195', fontSize: 11, textAlign: 'center', paddingVertical: 18 },
  dongOption: { minHeight: 48, paddingHorizontal: 8, borderTopWidth: 1, borderColor: '#EEF2F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dongOptionMain: { flex: 1, minHeight: 48, justifyContent: 'center' },
  dongOptionWithWork: { backgroundColor: '#E8F1FF' },
  dongOptionSelected: { borderLeftWidth: 3, borderLeftColor: '#2477F3' },
  dongOptionEnd: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dongOptionText: { color: '#465267', fontSize: 13, fontWeight: '700' },
  dongOptionTextWithWork: { color: '#10285B', fontWeight: '900' },
  dongWorkCount: { color: '#1551A6', fontSize: 11, fontWeight: '900' },
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
