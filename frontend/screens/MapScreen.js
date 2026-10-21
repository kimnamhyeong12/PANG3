import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '../components/CustomAlert';
import { colors, workStatus } from '../constants/design';
import { apiFetch as fetch } from '../utils/auth';
import { coordinateInput } from '../utils/coordinateInput';
import { maneuverGuide } from '../utils/maneuverGuide';
import { safetyGuideNotice } from '../utils/safetyGuide';
import { consumeScreenBack, useBackSwipe, useScreenBackHandler } from '../utils/screenBack';
// 키보드 자판 내 엔터가 안먹힘
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import ManeuverGuideCard from '../components/ManeuverGuideCard';
import MapWorkspaceSwitcher from '../components/MapWorkspaceSwitcher';
import PlaceSearchOverlay from '../components/PlaceSearchOverlay';
import SafetyGuideBadge from '../components/SafetyGuideBadge';
import SearchResultSheet from '../components/SearchResultSheet';
import RegistrationFab from '../components/RegistrationFab';
import WorkplaceField from '../components/WorkplaceField';
import { BUSAN_DISTRICT_CODES } from '../constants/busanDistricts';
import { KakaoNavigationView, KakaoWalkingMapView, isWalkingMapAvailable, beginRouteSession, discardSdkPreview, endRouteSession, isKakaoNavigationAvailable, isSdkPreviewAvailable, previewSdkRoute, wasRouteTaskRemoved } from '../modules/kakao-navigation';
import {
  stopRouteNotification,
  updateRouteNotification,
} from '../services/notificationService';
import { isRegisteredPlace, placeLocation, searchViewportPlaces } from '../utils/placeSearch';
import { remainingRouteProgress, routeCompletion, routeTrafficRail } from '../utils/routeProgress';
import { locationKey } from '../utils/routeSession';
import { hasVisitCoordinates, numberVisitOrder, promoteVisit, recommendVisitOrder, visitSetKey } from '../utils/visitOrder';
// 엑셀,csv 데이터 업로드
import BulkUploadModal from '../components/BulkUploadModal';
import PhotoUploadScreen from './PhotoUploadScreen';
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

const getStatusColor = (status) => workStatus(status).color;

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
  root = true,
  isActive = true,
  user,
  onBack,
  onPhotoUploadHome,
  onLocationClick,
  onDataChanged,
  locations,
  setLocations,
  previewMarkers = EMPTY_MARKERS,
  previewOnlyRegistrations = false,
  activeGroup,
  onSelectGroup,
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
  panelOpen = false,
  setPanelOpen,
  routeResumeToken = 0,
  recordReturn,
  pendingWork = [],
  onAddWork,
  onUpdatedUser,
  onSearchVisibilityChange,
  renderGuidanceNavigation,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [resultsMode, setResultsMode] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchPinId, setSelectedSearchPinId] = useState(null);
  const [resultQuery, setResultQuery] = useState('');
  const [mapHeight, setMapHeight] = useState(600);
  const screenInsets = useSafeAreaInsets();
  const [topOverlayBottom, setTopOverlayBottom] = useState(0);
  const [visitStripHeight, setVisitStripHeight] = useState(52);
  const [bottomOverlayHeight, setBottomOverlayHeight] = useState(0);
  const [pendingOverlayHeight, setPendingOverlayHeight] = useState(0);
  const [focusRequest, setFocusRequest] = useState({ coordinates: [], token: 0 });
  const [workplaceOpen, setWorkplaceOpen] = useState(false);
  const [workplaceCandidate, setWorkplaceCandidate] = useState(null);
  const [workplaceBusy, setWorkplaceBusy] = useState(false);
  useEffect(() => { if (isActive) onSearchVisibilityChange?.(searchOpen); return () => { if (isActive) onSearchVisibilityChange?.(false); }; }, [searchOpen, isActive]);
  const focusPlaces = (rows) => setFocusRequest(previous => ({ coordinates: rows.filter(hasVisitCoordinates), token: previous.token + 1 }));
  const [preview, setPreview] = useState(null);
  const [previewDetailView, setPreviewDetailView] = useState(false);
  const previewRequestRef = useRef(0);
  const guideRequestRef = useRef(0);
  const orderSetRef = useRef(null);
  const workspaceScopeRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [transportMode, setTransportMode] = useState('car');
  const [segmentChanging, setSegmentChanging] = useState(false);
  const [kakaoDestination, setKakaoDestination] = useState(null);
  const [multiArrival, setMultiArrival] = useState(false);
  const [nativeProgress, setNativeProgress] = useState(null);
  const [nativeSafety, setNativeSafety] = useState(null);
  const [nativeManeuver, setNativeManeuver] = useState(null);
  const [nearbyCategory, setNearbyCategory] = useState(null);
  const [guideMap3D, setGuideMap3D] = useState(true);
  const [walkHeadingFollow, setWalkHeadingFollow] = useState(true);
  const [walkOverviewRequest, setWalkOverviewRequest] = useState(0);
  const [walkingMapError, setWalkingMapError] = useState('');
  const [walkingMapReady, setWalkingMapReady] = useState(false);
  const [guideRecenterRequest, setGuideRecenterRequest] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [searchedPlace, setSearchedPlace] = useState(null);
  const [registrationDraft, setRegistrationDraft] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [task, setTask] = useState('');
  const registrationBusyRef = useRef(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [markerMoveBusy, setMarkerMoveBusy] = useState(false);
  const markerMoveBusyRef = useRef(false);
  const [clearSearchMarkerSignal, setClearSearchMarkerSignal] = useState(0);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [mapSelectMode, setMapSelectMode] = useState(false);
  const [coordinateText, setCoordinateText] = useState({ lat: '', lng: '' });
  const coordinateFocused = useRef(false);
  const [coordinateRequest, setCoordinateRequest] = useState(null);
  const [guideMenuOpen, setGuideMenuOpen] = useState(false);
  const [guideShowDestination, setGuideShowDestination] = useState(true);
  const [guideCurrentAddress, setGuideCurrentAddress] = useState('');
  const currentAddressCell = hasVisitCoordinates(currentLocation)
    ? `${Number(currentLocation.lat).toFixed(3)},${Number(currentLocation.lng).toFixed(3)}` : '';
  useEffect(() => {
    if (!isActive || !isGuiding) { setGuideShowDestination(true); return; }
    const timer = setInterval(() => setGuideShowDestination(value => !value), 6000);
    timer?.unref?.();
    return () => clearInterval(timer);
  }, [isActive, isGuiding]);
  useEffect(() => {
    if (!isActive || !isGuiding || !currentAddressCell || !KAKAO_REST_API_KEY) return;
    let active = true;
    const controller = new AbortController();
    setGuideCurrentAddress('');
    fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${encodeURIComponent(currentLocation.lng)}&y=${encodeURIComponent(currentLocation.lat)}`, {
      signal: controller.signal, headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    }).then(response => response.ok ? response.json() : null).then(data => {
      if (active) setGuideCurrentAddress(data?.documents?.[0]?.road_address?.address_name || data?.documents?.[0]?.address?.address_name || '');
    }).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, [isActive, isGuiding, currentAddressCell]);
  useEffect(() => { if (!isActive || !isGuiding) setGuideMenuOpen(false); }, [isActive, isGuiding]);
  const updateSelectionCenter = (point) => {
    setDirectCenter(point);
    if (!coordinateFocused.current) setCoordinateText({ lat: point.lat.toFixed(6), lng: point.lng.toFixed(6) });
  };
  const editCoordinate = (key, text) => {
    const next = { ...coordinateText, [key]: text };
    setCoordinateText(next);
    const point = coordinateInput(next.lat, next.lng);
    if (point) { setDirectCenter(point); setCoordinateRequest({ ...point, token: Date.now() }); }
  };

  const [locationSettingMode, setLocationSettingMode] = useState(false);
  const [directCenter, setDirectCenter] = useState(null);
  const [centerAddress, setCenterAddress] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [coordSheetOpen, setCoordSheetOpen] = useState(false);
  const [coordLat, setCoordLat] = useState('');
  const [coordLng, setCoordLng] = useState('');

  const [returnLocation, setReturnLocation] = useState(null);
  const [includeReturn, setIncludeReturn] = useState(true);
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
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
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
    if (!isActive) { setDongOpen(false); setSearchOpen(false); setPhotoUploadOpen(false); }
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
    markerLabel: '', markerColor: '#2477F3',
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
  const routeCompletionRatio = routeCompletion(activeSegment?.totalDistance, guidanceProgress?.distance);
  const trafficRail = useMemo(() => routeTrafficRail(activeSegment?.trafficSections), [activeSegment?.trafficSections]);
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
  const showReturnMarker = Boolean(returnDisplayMarker && (preview?.targetKey === locationKey(returnDisplayMarker)
    || (isGuiding && activeSegment?.destinationKey === locationKey(returnDisplayMarker))));
  const displayLocations = useMemo(() => [...activeDisplayMarkers, ...completedDisplayMarkers,
    ...(showReturnMarker ? [returnDisplayMarker] : [])], [activeDisplayMarkers, completedDisplayMarkers, returnDisplayMarker, showReturnMarker]);
  const searchPins = resultsMode ? searchResults.map((place, index) => {
    const id = `search:${place.id}:${index}`; const selected = id === selectedSearchPinId;
    return { ...placeLocation(place), id, isSearchResult: true, isSelectedSearch: selected, markerLabel: selected ? '✓' : '⌕', markerColor: selected ? '#F97316' : '#168DE2', status: 'search' };
  }) : [];
  const displayOnlyLocations = [...mapOnlyMarkers, ...publicDisplayItems, ...searchPins];
  const publicViewCoordinates = useMemo(() => publicFacilityMode && selectedDong
    ? facilityViewCoordinates(selectedDong, publicItems) : [], [publicFacilityMode, selectedDong, publicItems]);

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

  const closeAddSheet = (discard = false) => {
    setRegistrationDraft(discard ? null : searchedPlace ? { place: searchedPlace, name: placeName, task } : registrationDraft);
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

  useScreenBackHandler(() => {
      if (searchOpen) { setSearchOpen(false); return true; }
      if (guideMenuOpen) { setGuideMenuOpen(false); return true; }
      if (dongOpen) {
        setDongOpen(false);
        return true;
      }

      if (coordSheetOpen) {
        setCoordSheetOpen(false);
        setCoordLat('');
        setCoordLng('');
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
        if (registrationBusy) return true;
        closeAddSheet();
        return true;
      }
      if (resultsMode) { setResultsMode(false); setSelectedSearchPinId(null); return true; }
      if (pendingOpen) {
        if (!pendingBusy) { setPendingOpen(false); setPendingSelected([]); }
        return true;
      }
      if (publicCategoryOpen) { setPublicCategoryOpen(false); return true; }
      if (publicFacilityMode) {
        if (!publicSaving) resetAddModes();
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
      if (panelOpen) { setPanelOpen?.(false); return true; }
      if (isGuiding) { requestStopGuidance(); return true; }
      return false;
  }, isActive);

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

  const allPublicSelected = publicItems.length > 0 && publicItems.every(item => publicSelectedIds.includes(item.id));
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
    focusPlaces(searchViewportPlaces(rows).map(placeLocation));
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

      closeAddSheet(true);
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
      return `${minutes}분`;
    }

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return `${h}시간 ${m}분`;
  };

  const formatDistance = (meters) => {
    if (meters == null || !Number.isFinite(Number(meters))) return null;

    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }

    return `${Math.round(meters)}m`;
  };

  const fetchRouteSegment = async (startLocation, endLocation, mode, allowMultiple = multiArrival) => {
    if (mode === 'car') {
      const segment = await previewSdkRoute({ startLat: Number(startLocation.lat), startLng: Number(startLocation.lng),
        lat: Number(endLocation.lat), lng: Number(endLocation.lng), name: endLocation.detailAddress || endLocation.name || '방문지',
        address: endLocation.roadAddress || '', routePriority: 'TIME', multiArrival: allowMultiple });
      return { segment: { ...segment, mode, fromName: '현재 위치', toName: endLocation.detailAddress || '목적지' },
        totalDuration: segment.totalDuration };
    }
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

  const scopeKey = `${user?.userId}:${activeGroup?.groupId}:${locationScope}`;
  const membershipKey = visitSetKey(locations || []);
  const [recommendationBasis, setRecommendationBasis] = useState('distance');
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [recommendationReadyKey, setRecommendationReadyKey] = useState('');
  const [nextAfterCompletion, setNextAfterCompletion] = useState(null);
  const recommendationReturn = includeReturn ? returnDisplayMarker : null;
  const returnOrderKey = recommendationReturn ? `${recommendationReturn.lat}:${recommendationReturn.lng}` : '';
  const locationReady = hasVisitCoordinates(currentLocation);
  const liveVisitsRef = useRef(allVisits);
  liveVisitsRef.current = allVisits;
  const resumedRouteRef = useRef(null);
  const [resumeRetryToken, setResumeRetryToken] = useState(0);
  const resumeRetryTimerRef = useRef(null);
  const resumeFailureCountRef = useRef(0);
  useEffect(() => () => {
    clearTimeout(resumeRetryTimerRef.current);
    resumeFailureCountRef.current = 0;
  }, [isActive, isGuiding, scopeKey]);

  useEffect(() => {
    workspaceScopeRef.current = scopeKey;
    orderSetRef.current = null;
    previewRequestRef.current += 1;
    guideRequestRef.current += 1;
    setPreview(null);
    setSegmentChanging(false);
    setKakaoDestination(null);
    setNativeProgress(null); setNativeSafety(null); setNativeManeuver(null);
    setPublicFacilityMode(false);
    setRegistrationDraft(null);
    setSearchOpen(false); setResultsMode(false); setFocusRequest({ coordinates: [], token: 0 });
    setDongOpen(false);
    setSelectedDong(null);
    return () => {
      previewRequestRef.current += 1;
      guideRequestRef.current += 1;
    };
  }, [scopeKey]);

  useEffect(() => {
    if (!isActive || !locationReady) return;
    const pinnedKey = isGuiding ? activeSegment?.destinationKey : null;
    const recommendationKey = `${scopeKey}:${membershipKey}:${returnOrderKey}:${transportMode}:${pinnedKey || ''}`;
    if (orderSetRef.current === recommendationKey) return;
    orderSetRef.current = recommendationKey;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    setRecommendationBasis('distance');
    setRecommendationReadyKey('');
    setRecommendationBusy(true);
    setLocations?.((previous) => recommendVisitOrder(
      Array.isArray(previous) ? previous : locations || [], currentLocation, pinnedKey, recommendationReturn
    ));
    const pending = (locations || []).filter(row => !isCompleted(row));
    if (!pending.length) { clearTimeout(timer); setRecommendationBusy(false); setRecommendationReadyKey(recommendationKey); return; }
    fetch(`${API_BASE_URL}/api/routes/order`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ currentLocation, locations: pending, returnLocation: recommendationReturn,
        pinnedKey, transportMode }),
    }).then(async response => {
      if (!response.ok) throw new Error('추천 순서를 불러오지 못했습니다.');
      const result = await response.json();
      if (!active || orderSetRef.current !== recommendationKey || !Array.isArray(result.optimizedLocations)) return;
      const keys = result.optimizedLocations.map(locationKey);
      if (keys.length !== pending.length || new Set(keys).size !== pending.length ||
          pending.some(row => !keys.includes(locationKey(row)))) return;
      setLocations?.(previous => {
        const rows = Array.isArray(previous) ? previous : locations || [];
        const byKey = new Map(rows.map(row => [locationKey(row), row]));
        return numberVisitOrder([...keys.map(key => byKey.get(key)).filter(Boolean), ...rows.filter(isCompleted)]);
      });
      setRecommendationBasis(result.basis === 'roadDuration' ? 'roadDuration' : 'distance');
    }).catch(() => { /* The visible distance recommendation remains available. */ })
      .finally(() => { clearTimeout(timer); if (active) { setRecommendationBusy(false); setRecommendationReadyKey(recommendationKey); } });
    return () => { active = false; clearTimeout(timer); controller.abort(); orderSetRef.current = null; };
  }, [isActive, membershipKey, locationReady, scopeKey, returnOrderKey, transportMode, isGuiding, activeSegment?.destinationKey]);

  const clearGuidance = () => {
    if (isGuiding) endRouteSession();
    guideRequestRef.current += 1;
    setIsGuiding(false);
    setGuideMenuOpen(false);
    setKakaoDestination(null);
    setNativeProgress(null); setNativeSafety(null); setNativeManeuver(null);
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

  const previewVisit = async (target, mode = transportMode, allowMultiple = multiArrival) => {
    if (!hasVisitCoordinates(target)) {
      showAlert('위치 정보 없음', '이 방문지의 좌표를 확인할 수 없습니다.');
      return;
    }
    const request = ++previewRequestRef.current;
    const targetKey = locationKey(target);
    setPreviewDetailView(false);
    setPreview({ targetKey, mode, segment: null, loading: true, coords: `${target.lat},${target.lng}` });
    setVisitListOpen(false);
    if (!hasVisitCoordinates(currentLocation)) {
      setPreview({ targetKey, mode, segment: null, loading: false, error: '현재 위치를 확인한 뒤 다시 시도해 주세요.' });
      return;
    }
    try {
      const result = await fetchRouteSegment(cleanLocation(currentLocation), cleanLocation(target), mode, allowMultiple);
      if (request !== previewRequestRef.current || !liveVisitsRef.current.some((row) => locationKey(row) === targetKey)) {
        discardSdkPreview(result.segment.sdkPreviewId); return;
      }
      setPreview({ targetKey, mode, loading: false, coords: `${target.lat},${target.lng}`,
        segment: { ...result.segment, destinationKey: targetKey, previewCameraId: request } });
      return true;
    } catch (error) {
      if (request === previewRequestRef.current) {
        setPreview({ targetKey, mode, segment: null, loading: false,
          error: mode === 'car' ? error.message || 'SDK 경로를 불러오지 못했습니다.' : '경로를 불러오지 못했습니다. 다시 시도해 주세요.' });
      }
    }
  };

  const handleVisitPress = (target) => {
    if (markerMoveBusyRef.current) return;
    setNextAfterCompletion(null);
    if (target?.isSearchResult) { setSelectedSearchPinId(target.id); focusPlaces([target]); return; }
    if (target?.isPublicFacility) { togglePublicFacility(target); return; }
    if (publicFacilityMode) return;
    if (isCompleted(target) || target.status === 'working') { onLocationClick?.(target, 'report'); return; }
    if (locationKey(target) === routeVisibleKey && !target.isReturnLocation) {
      onLocationClick?.(target, 'report');
      return;
    }
    if (preview?.loading && preview.targetKey === locationKey(target)) return;
    previewVisit(target);
  };

  const handleMarkerDrag = async (target, point) => {
    if (markerMoveBusyRef.current || !hasVisitCoordinates(point)) return;
    const id = target.id ?? target.taskId;
    if (id == null) return;
    const previous = { lat: Number(target.lat ?? target.latitude), lng: Number(target.lng ?? target.longitude) };
    if (Math.abs(previous.lat - point.lat) + Math.abs(previous.lng - point.lng) < 0.000001) return;
    markerMoveBusyRef.current = true; setMarkerMoveBusy(true);
    const applyPosition = (position) => setLocations?.(rows => rows.map(row => String(row.id ?? row.taskId) === String(id)
      ? { ...row, lat: position.lat, lng: position.lng, latitude: position.lat, longitude: position.lng } : row));
    previewRequestRef.current += 1; setPreview(null);
    applyPosition(point);
    try {
      const latest = await fetch(`${API_BASE_URL}/api/task-progress/task/${id}`);
      if (!latest.ok) throw new Error('최신 보고서를 확인하지 못했습니다.');
      const text = await latest.text();
      const report = text.trim() ? JSON.parse(text) : null;
      let address = report?.locationAddress || target.roadAddress || target.detailAddress || '';
      if (KAKAO_REST_API_KEY) {
        try {
          const response = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${point.lng}&y=${point.lat}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
          if (response.ok) {
            const data = await response.json();
            address = data.documents?.[0]?.road_address?.address_name || data.documents?.[0]?.address?.address_name || address;
          }
        } catch (_) { /* Coordinates can still be saved with the existing address. */ }
      }
      const response = await fetch(`${API_BASE_URL}/api/task-progress/task/${id}/location`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: point.lat, longitude: point.lng, locationAddress: address,
          ...(report?.progressId ? { progressId: report.progressId, expectedRevision: report.revision } : {}) }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.message || '위치를 저장하지 못했습니다.');
      applyPosition({ lat: Number(saved.taskLatitude ?? point.lat), lng: Number(saved.taskLongitude ?? point.lng) });
      if (isGuiding && activeSegment?.destinationKey === String(id)) handleStopGuidance();
      onDataChanged?.();
    } catch (error) {
      applyPosition(previous);
      showAlert('위치 변경 실패', error.message || '원래 위치로 되돌렸습니다.');
    } finally { markerMoveBusyRef.current = false; setMarkerMoveBusy(false); }
  };

  const handledRecordRef = useRef(null);
  const nextVisit = (excluded) => markers.find((row) => !isCompleted(row) && !row.isReturnLocation &&
    locationKey(row) !== String(excluded) && hasVisitCoordinates(row)) || recommendationReturn;
  useEffect(() => {
    if (!isActive || !recordReturn || recordReturn.token === handledRecordRef.current) return;
    handledRecordRef.current = recordReturn.token;
    clearGuidance();
    previewRequestRef.current += 1; setPreview(null);
    if (hasVisitCoordinates(recordReturn)) focusPlaces([recordReturn]);
    if (recordReturn.status === 'complete') {
      setNextAfterCompletion({ excluded: recordReturn.taskId, scope: scopeKey });
    } else setNextAfterCompletion(null);
  }, [isActive, recordReturn?.token, scopeKey]);

  useEffect(() => {
    if (!nextAfterCompletion || !isActive || isGuiding || recommendationBusy) return;
    if (nextAfterCompletion.scope !== scopeKey) { setNextAfterCompletion(null); return; }
    const expectedKey = `${scopeKey}:${membershipKey}:${returnOrderKey}:${transportMode}:`;
    if (recommendationReadyKey !== expectedKey) return;
    setNextAfterCompletion(null);
    const next = nextVisit(nextAfterCompletion.excluded);
    if (next && !preview) previewVisit(next);
  }, [nextAfterCompletion, isActive, isGuiding, recommendationBusy, recommendationReadyKey, scopeKey, membershipKey, returnOrderKey, transportMode, markers, preview]);

  const handleStartGuidance = async (explicitTarget = null, requestedMode = null) => {
    const target = hasVisitCoordinates(explicitTarget) ? explicitTarget : cardTarget;
    if (!target || isCompleted(target) || segmentChanging || preview?.loading) return;
    if (!hasVisitCoordinates(currentLocation)) {
      showAlert('현재 위치 확인 중', '현재 위치를 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    const targetKey = locationKey(target);
    const mode = requestedMode || preview?.mode || activeSegment?.mode || transportMode;
    if (mode === 'car' && !isKakaoNavigationAvailable()) {
      showAlert('차량 안내 사용 불가', '카카오 차량 안내가 포함된 Android 앱에서 이용해 주세요. 도보 안내는 현재 지도에서 사용할 수 있습니다.');
      return;
    }
    const request = ++guideRequestRef.current;
    const scope = workspaceScopeRef.current;
    setSegmentChanging(true);
    try {
      let result;
      if (mode === 'car' && preview?.segment) {
        const origin = preview.segment.previewOrigin;
        const movedMeters = origin ? Math.hypot((Number(currentLocation.lat) - origin.lat) * 111000,
          (Number(currentLocation.lng) - origin.lng) * 111000 * Math.cos(origin.lat * Math.PI / 180)) : 0;
        if (!isSdkPreviewAvailable(preview.segment.sdkPreviewId) || movedMeters > 30) {
          if (await previewVisit(target, mode)) {
            showAlert('경로 새로고침', '미리보기 경로가 갱신됐습니다. 확인한 뒤 안내를 시작해 주세요.');
          }
          return;
        }
        result = { segment: preview.segment, totalDuration: preview.segment.totalDuration };
      } else result = await fetchRouteSegment(cleanLocation(currentLocation), cleanLocation(target), mode);
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
      setNativeProgress(null); setNativeSafety(null); setNativeManeuver(null);
      resumedRouteRef.current = `${scopeKey}:${routeResumeToken}:${targetKey}`;
      setOptimized(true);
      beginRouteSession();
      setIsGuiding(true);
      previewRequestRef.current += 1;
      setPreview(null);
      if (mode === 'car' && Platform.OS === 'android' && isKakaoNavigationAvailable()) {
        setKakaoDestination({ previewId: result.segment.sdkPreviewId, destinationKey: targetKey });
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
    setGuideMenuOpen(false);
  };

  const requestStopGuidance = () => {
    showAlert('안내 종료', '길안내를 종료할까요?', [
      { text: '계속 안내', style: 'cancel' },
      { text: '안내 종료', style: 'destructive', onPress: handleStopGuidance },
    ]);
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
    // Task removal stopped the old SDK/notification, but did not end the user's
    // destination. Begin a fresh native session before rebuilding that route.
    beginRouteSession();
    if (activeSegment.mode === 'car') {
      if (!isKakaoNavigationAvailable()) { clearGuidance(); return; }
      if (!isSdkPreviewAvailable(activeSegment.sdkPreviewId)) {
        setKakaoDestination(null);
        setNativeProgress(null); setNativeSafety(null); setNativeManeuver(null);
        const request = ++guideRequestRef.current;
        fetchRouteSegment(cleanLocation(currentLocation), cleanLocation(activeTarget), 'car', activeSegment.arrivalMode === 'MULTI').then(result => {
          if (request !== guideRequestRef.current) return;
          resumeFailureCountRef.current = 0;
          clearTimeout(resumeRetryTimerRef.current);
          resumedRouteRef.current = null;
          setRouteSegments([{ ...result.segment, destinationKey: activeSegment.destinationKey }]);
          setRoadPath(result.segment.path || []);
          setTotalDuration(result.totalDuration);
        }).catch(() => {
          if (request !== guideRequestRef.current) return;
          // A transient route request failure must not turn an unfinished
          // destination into an explicit stop. Retry without adding a button.
          if (++resumeFailureCountRef.current < 3) {
            resumeRetryTimerRef.current = setTimeout(() => {
              resumedRouteRef.current = null;
              setResumeRetryToken(value => value + 1);
            }, 5000);
          } else showAlert('안내 재개 대기', '목적지는 보관했습니다. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요.');
        });
        return;
      }
      setNativeProgress(null); setNativeSafety(null); setNativeManeuver(null);
      setKakaoDestination({ previewId: activeSegment.sdkPreviewId, destinationKey: activeSegment.destinationKey });
    } else handleReroute(currentLocation);
  }, [isActive, isGuiding, routeResumeToken, resumeRetryToken, scopeKey, activeTarget, activeSegment, currentLocation]);

  const handleTransportPress = (mode) => {
    setTransportMode(mode);
    if (cardTarget) previewVisit(cardTarget, mode);
  };

  const walkingNative = isWalkingMapAvailable() && isGuiding && activeSegment?.mode === 'walk' && !walkingMapError;
  useEffect(() => { setWalkingMapError(''); setWalkingMapReady(false); }, [isGuiding, activeSegment?.destinationKey, activeSegment?.mode]);
  useEffect(() => {
    if (!walkingNative || walkingMapReady || !isActive || preview) return;
    const timeout = setTimeout(() => setWalkingMapError('도보 지도 시작 시간 초과'), 15000);
    return () => clearTimeout(timeout);
  }, [walkingNative, walkingMapReady, isActive, preview]);
  const walkingNativePath = useMemo(() => [...(guidanceProgress?.remainingPath || activeSegment?.path || []), ...(activeSegment?.connectorPath || [])]
    .map(point => ({ lat: Number(point.lat ?? point.latitude ?? point.y), lng: Number(point.lng ?? point.longitude ?? point.x) }))
    .filter(hasVisitCoordinates), [activeSegment, guidanceProgress?.remainingPath]);
  const raisedSheetVisible = coordSheetOpen || searchedPlace || resultsMode || pendingOpen || dongOpen ||
    (publicFacilityMode && !!publicCategory && publicSheetOpen && !publicCategoryOpen);
  const showMapBack = !root || (Platform.OS === 'ios' && !!(searchOpen || coordSheetOpen || mapSelectMode ||
    addMenuOpen || resultsMode || searchedPlace || pendingOpen || publicFacilityMode || publicCategoryOpen ||
    visitListOpen || preview || dongOpen || panelOpen));
  const guideMenuSwipe = useBackSwipe(() => setGuideMenuOpen(false), guideMenuOpen && isActive);
  const workplaceSwipe = useBackSwipe(() => setWorkplaceOpen(false), workplaceOpen && !workplaceBusy);


  useEffect(() => {
    if (!isGuiding || !activeTarget || !activeSegment) { stopRouteNotification(); return; }
    updateRouteNotification({ from: '현재 위치', to: activeTarget.detailAddress || activeTarget.roadAddress || '방문지',
      duration: formatDuration(guidanceProgress?.duration ?? activeSegment.totalDuration)?.replace(/^약\s*/, '') || '-',
      distance: formatDistance(guidanceProgress?.distance ?? activeSegment.totalDistance ?? getPathDistance(activeSegment.path))?.replace(/^약\s*/, '') || '-',
      remainingCount: orderedMarkers.length });
  }, [isGuiding, activeTarget, activeSegment, guidanceProgress, orderedMarkers.length]);

  return (
    <View style={styles.container} onLayout={event => setMapHeight(event.nativeEvent.layout.height)}>
      <KakaoMapWebView
        locations={displayLocations}
        displayOnlyLocations={displayOnlyLocations}
        directMarkerPress
        guideTarget={activeTarget}
        onReturnArrival={handleStopGuidance}
        previewRouteSegment={preview?.segment || null}
        previewDestination={isActive ? previewTarget : null}
        previewDetailView={previewDetailView}
        emphasizeHighlighted={!!preview}
        routeViewportPadding={{ top: topOverlayBottom ? topOverlayBottom + (preview ? 48 : 56) : 300,
          bottom: !resultsMode && !mapSelectMode && !publicFacilityMode && !searchedPlace && !coordSheetOpen && !pendingOpen && !dongOpen
            ? (cardTarget ? bottomOverlayHeight : 0) + pendingOverlayHeight + (preview ? 28 : 52) : 40, left: preview ? 24 : 40, right: preview ? 24 : 40 }}
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
        mapSelectMode={mapSelectMode}
        selectionSessionActive={mapSelectMode}
        selectionPosition={directCenter}
        onCenterChange={updateSelectionCenter}
        selectionCoordinateRequest={coordinateRequest}
        onCurrentLocationChange={setCurrentLocation}
        onMarkerClick={handleVisitPress}
        onMarkerDrag={handleMarkerDrag}
        markerDragEnabled={!markerMoveBusy}
        onLocationsChange={(next) => {
          const updated = new Map(next.filter((item) => !item.isReturnLocation).map((item) => [locationKey(item), item]));
          setLocations?.((previous) => (Array.isArray(previous) ? previous : locations || [])
            .map((item) => updated.has(locationKey(item)) ? { ...item, status: updated.get(locationKey(item)).status } : item));
          onDataChanged?.();
        }}
        onRerouteRequest={handleReroute}
      />
      {walkingNative && <KakaoWalkingMapView style={[StyleSheet.absoluteFill, { height: mapHeight }, preview && { opacity: 0 }]}
        pointerEvents={preview ? 'none' : 'auto'} userLocation={currentLocation ? { lat: Number(currentLocation.lat), lng: Number(currentLocation.lng) } : null}
        route={walkingNativePath} mapActive={isActive && !preview} headingFollow={walkHeadingFollow}
        recenterRequest={guideRecenterRequest} overviewRequest={walkOverviewRequest}
        onReady={event => { setWalkingMapReady(true); if (!event.nativeEvent?.headingAvailable) { setWalkHeadingFollow(false); showAlert('방향 센서', '이 기기에서는 북쪽 고정 지도를 사용합니다.'); } }}
        onError={event => { setWalkingMapError(event.nativeEvent?.message || '도보 지도 오류'); showAlert('도보 지도', '네이티브 지도를 불러오지 못해 기본 지도로 안내합니다.'); }} />}
      {walkingNative && !walkingMapReady && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSoft, marginTop: 12 }}>도보 지도 준비 중</Text></View>}
      {walkingNative && !preview && <View style={[styles.guideNearbyControls, { bottom: bottomOverlayHeight + 28 }]}>
        <TouchableOpacity accessibilityLabel="내 위치로 돌아가기" onPress={() => { setWalkHeadingFollow(true); setGuideRecenterRequest(value => value + 1); }} style={styles.guideNearbyButton}><Ionicons name="locate" size={24} color={colors.primary} /></TouchableOpacity>
      </View>}
      {kakaoDestination && (
        <KakaoNavigationView
          style={[StyleSheet.absoluteFill, { top: 0 }, preview && { opacity: 0 }]}
          pointerEvents={preview ? 'none' : 'auto'}
          destination={kakaoDestination}
          mapActive={isActive && !preview}
          nearbyCategory={nearbyCategory}
          map3D={guideMap3D}
          recenterRequest={guideRecenterRequest}
          onNearbyError={(event) => showAlert('주변 장소', event.nativeEvent?.message || '주변 장소를 불러오지 못했습니다.')}
          onRouteChanged={(event) => {
            const data = event.nativeEvent;
            if (data?.destinationKey !== activeSegment?.destinationKey || !Array.isArray(data.path) || !data.path.length) return;
            const end = data.path[data.path.length - 1];
            setRouteSegments((previous) => previous.map((segment, index) => index === 0
              ? { ...segment, path: data.path, totalDistance: data.totalDistance, totalDuration: data.totalDuration,
                trafficSections: Array.isArray(data.trafficSections) ? data.trafficSections : [],
                navigationDestination: { lat: end.latitude, lng: end.longitude } } : segment));
            setRoadPath(data.path);
            setTotalDuration(data.totalDuration);
          }}
          onError={(event) => {
            if (wasRouteTaskRemoved()) return;
            clearGuidance();
            showAlert('카카오 길안내 오류', event.nativeEvent?.message || '길안내를 시작하지 못했습니다.');
          }}
          onEnded={(event) => {
            if (wasRouteTaskRemoved() || event.nativeEvent?.reason === 'task_removed') return;
            if (event.nativeEvent?.destinationKey === activeSegment?.destinationKey) handleStopGuidance();
          }}
          onProgress={(event) => {
            const data = event.nativeEvent;
            if (data?.destinationKey !== activeSegment?.destinationKey || !Number.isFinite(data.distance) || !Number.isFinite(data.duration) || data.distance < 0 || data.duration < 0) return;
            setNativeProgress(data);
          }}
          onSafetyUpdate={(event) => {
            const data = event.nativeEvent;
            if (data?.destinationKey !== activeSegment?.destinationKey) return;
            setNativeSafety(safetyGuideNotice(data, activeSegment.destinationKey));
          }}
          onManeuverUpdate={(event) => {
            const data = event.nativeEvent;
            if (data?.destinationKey !== activeSegment?.destinationKey) return;
            setNativeManeuver(maneuverGuide(data, activeSegment.destinationKey));
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

      {isGuiding && kakaoDestination && !preview && <>
        <View pointerEvents="none" style={{ position: 'absolute', top: screenInsets.top + 8, left: 12, width: 200, maxWidth: '70%', zIndex: 19 }}>
          <ManeuverGuideCard guide={nativeManeuver?.destinationKey === activeSegment?.destinationKey ? nativeManeuver : null} />
        </View>
        <View style={[styles.guideNearbyControls, { bottom: bottomOverlayHeight + 28 }]}>
          {[['gas', '주유소'], ['parking', '주차장']].map(([category, label]) => <TouchableOpacity
            key={category} accessibilityRole="button" accessibilityLabel={`주변 ${label}`} accessibilityState={{ selected: nearbyCategory === category }}
            onPress={() => setNearbyCategory(previous => previous === category ? null : category)}
            style={[styles.guideNearbyButton, nearbyCategory === category && styles.guideNearbySelected]}>
            {category === 'parking' ? <Text style={styles.guideParkingIcon}>P</Text> : <MaterialCommunityIcons name="gas-station-outline" size={22} color={colors.primary} />}
          </TouchableOpacity>)}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={guideMap3D ? '2D 지도로 전환' : '3D 지도로 전환'}
            onPress={() => setGuideMap3D(value => !value)} style={styles.guideNearbyButton}>
            <Text style={styles.guideMapModeText}>{guideMap3D ? '2D' : '3D'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="내 위치로 돌아가기"
            onPress={() => setGuideRecenterRequest(value => value + 1)} style={[styles.guideNearbyButton, { borderBottomWidth: 0 }]}>
            <Ionicons name="locate-outline" size={23} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </>}

      {isGuiding && !preview && routeCompletionRatio != null && <View pointerEvents="none" style={[styles.routeProgressRail, { bottom: bottomOverlayHeight + 228 }]}
        accessible accessibilityRole="progressbar" accessibilityLabel="목적지까지 이동 진행률"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(routeCompletionRatio * 100) }}>
        <View style={[styles.routeProgressTrack, { height: Math.max(72, Math.min(320, mapHeight * 0.36, mapHeight - bottomOverlayHeight - 228 - screenInsets.top - 20)) }]}>
          <View style={styles.routeTrafficClip}>
            {trafficRail.map((section, index) => <View key={index} style={{ position: 'absolute', left: 0, right: 0,
              bottom: `${section.start * 100}%`, height: `${section.fraction * 100}%`, backgroundColor: section.color }} />)}
            <View style={[styles.routeProgressPassed, { height: `${routeCompletionRatio * 100}%` }]} />
          </View>
          <View style={[styles.routeProgressPosition, { bottom: `${routeCompletionRatio * 100}%` }]}>
            <Ionicons name="navigate" size={14} color={colors.primary} style={{ transform: [{ rotate: '-45deg' }] }} />
          </View>
        </View>
      </View>}

      {isGuiding && kakaoDestination && !preview && nativeSafety?.destinationKey === activeSegment?.destinationKey && <View
        pointerEvents="none" style={{ position: 'absolute', left: 12, top: mapHeight * 0.5 - 100, zIndex: 15 }}>
        <SafetyGuideBadge notice={nativeSafety} />
      </View>}

      {isGuiding && kakaoDestination && !preview && <View pointerEvents="none"
        style={{ position: 'absolute', left: 12, top: mapHeight * 0.5, minWidth: 94, alignItems: 'center', zIndex: 15 }}>
        <Text accessibilityLabel="현재 속도" style={{ fontSize: 48, lineHeight: 56, includeFontPadding: false, fontWeight: '900', color: colors.text,
          textShadowColor: '#FFFFFF', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } }}>
          {nativeProgress?.destinationKey === activeSegment?.destinationKey && nativeProgress.speedValid === true
            && Number.isFinite(nativeProgress.speed) ? Math.max(0, Math.round(nativeProgress.speed)) : '—'}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text, textShadowColor: '#FFFFFF',
          textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } }}>km/h</Text>
      </View>}

      {mapSelectMode && <View style={styles.selectionCard}>
        <Text style={styles.selectionAddress}>{centerAddress || '주소 확인 중…'}</Text>
        <View style={styles.coordinateRow}>{[['lat', '위도'], ['lng', '경도']].map(([key, label]) => <View key={key} style={{ flex: 1 }}>
          <Text style={styles.coordinateLabel}>{label}</Text>
          <TextInput style={styles.coordinateInput} value={coordinateText[key]} onChangeText={text => editCoordinate(key, text)}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'} selectTextOnFocus
            onFocus={() => { coordinateFocused.current = true; }} onBlur={() => { coordinateFocused.current = false; }}
            accessibilityLabel={`${label} 직접 입력`} />
        </View>)}</View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}
            onPress={() => {
              setLocationSettingMode(false);
              setMapSelectMode(false);
              setDirectCenter(null);
              setCenterAddress('');

              setClearSearchMarkerSignal((prev) => prev + 1);
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: '800' }}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!directCenter}
            style={{ flex: 2, padding: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#2477F3', opacity: directCenter ? 1 : 0.5 }}
            onPress={async () => {
              const place = { lat: directCenter.lat, lng: directCenter.lng, detailAddress: centerAddress && centerAddress !== '주소 확인 중...' ? centerAddress : '지도 선택 위치', roadAddress: centerAddress && centerAddress !== '주소 확인 중...' ? centerAddress : '' };
              sheetY.setValue(0);
              setLocationSettingMode(false);
              setMapSelectMode(false);
              setSearchedPlace(place);
              setPlaceName(place.detailAddress);
              setTask('');
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>이 위치 선택</Text>
          </TouchableOpacity>
        </View>
      </View>}

      {(raisedSheetVisible || visitListOpen || publicCategoryOpen) && <Pressable
        style={[StyleSheet.absoluteFill, { zIndex: raisedSheetVisible ? 29 : 19 }]}
        accessibilityLabel="열린 목록 닫기" onPress={() => {
          Keyboard.dismiss(); setCoordSheetOpen(false); setPendingOpen(false); setDongOpen(false);
          setPublicSheetOpen(false); setPublicCategoryOpen(false); setVisitListOpen(false);
          setResultsMode(false); if (searchedPlace) closeAddSheet();
          previewRequestRef.current += 1; setPreview(null);
        }} />}
      {Platform.OS === 'ios' && isGuiding && <TouchableOpacity accessibilityRole="button" accessibilityLabel="뒤로가기"
        onPress={() => { if (!consumeScreenBack()) onBack?.(); }}
        style={[styles.smallTopButton, { position: 'absolute', top: screenInsets.top + 6, left: 12, minWidth: 44, zIndex: 80 }]}>
        <Ionicons name="arrow-back" size={22} color="#2477F3" />
      </TouchableOpacity>}
      {!isGuiding && <View style={[styles.topOverlay, { top: screenInsets.top + 6 }, publicCategoryOpen && { zIndex: 40 }, Platform.OS === 'ios' && showMapBack && { zIndex: 80 }]} pointerEvents="box-none"
        onLayout={event => { const { y, height } = event.nativeEvent.layout; setTopOverlayBottom(y + height); }}>
        {(!isGuiding || preview) && <View style={styles.searchControlRow}>
          {showMapBack && <TouchableOpacity style={[styles.smallTopButton, { minWidth: 44, minHeight: 44 }]} accessibilityLabel="뒤로가기" onPress={() => { if (!consumeScreenBack()) onBack?.(); }}><Ionicons name="arrow-back" size={22} color="#2477F3" /></TouchableOpacity>}
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
            <TouchableOpacity style={{ flex: 1, height: 44 }} disabled={publicFacilityMode || resultsMode}
              onPress={() => { resetAddModes(); openSearch(); }}
              accessibilityRole="button" accessibilityLabel="주소 또는 장소 검색" accessible={!publicFacilityMode && !resultsMode}>
              <View pointerEvents="none" style={{ flex: 1 }}>
                <TextInput style={styles.searchInput} value={publicFacilityMode ? (PUBLIC_FACILITY_CATEGORIES.find(item => item.key === publicCategory)?.label || '') : resultsMode ? resultQuery : ''} placeholder={publicFacilityMode ? '공공시설물 카테고리 선택' : '주소 또는 장소 검색'} placeholderTextColor="#9AA6B2" editable={false} accessible={publicFacilityMode || resultsMode} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { if (resultsMode) { setResultsMode(false); setKeyword(''); } else if (publicFacilityMode) { if (!selectedDong) loadDongs(); else setPublicCategoryOpen(value => !value); } else { resetAddModes(); openSearch(); } }} accessibilityLabel={resultsMode ? '검색 결과 닫기' : '방문지 추가 방법'}><Ionicons name={resultsMode ? 'close' : publicFacilityMode ? 'chevron-down' : 'search'} size={23} color="#2477F3" /></TouchableOpacity>
          </View>

          {publicFacilityMode && <TouchableOpacity style={[styles.smallTopButton, styles.compactCloseButton]} hitSlop={6}
            accessibilityLabel="공공시설물 조회 닫기" onPress={() => { resetAddModes(); setDongOpen(false); }}>
            <Ionicons name="close" size={18} color="#2477F3" />
          </TouchableOpacity>}
        </View>}
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

        <View style={styles.chipRowWrap} onLayout={event => setVisitStripHeight(event.nativeEvent.layout.height)}>
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
                  style={[styles.routeChip, { backgroundColor: workStatus(item.status).background }]}
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
            accessibilityLabel={visitListOpen ? '방문지 목록 접기' : '방문지 목록 펼치기'}
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

            <Text style={{ color: '#64748B', fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 }}>
              {recommendationBusy ? '추천 순서 계산 중' : recommendationBasis === 'roadDuration' ? '이동시간 기준 추천' : '거리 기준 추천'}
              {recommendationReturn ? ' · 근무지 복귀 포함' : returnDisplayMarker ? ' · 복귀 제외' : ' · 근무지 미등록'}{'\n'}원하는 방문지를 선택해 먼저 방문할 수 있습니다.
            </Text>
            <TouchableOpacity accessibilityRole="switch" accessibilityLabel="근무지 복귀 포함 경로 추천"
              accessibilityState={{ checked: includeReturn && !!returnDisplayMarker }}
              onPress={() => returnDisplayMarker ? setIncludeReturn(value => !value) : setWorkplaceOpen(true)}
              style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
              <Text style={{ color: '#2477F3', fontSize: 12 }}>{returnDisplayMarker ? `근무지 복귀 포함: ${includeReturn ? '켜짐' : '꺼짐'}` : '복귀 근무지 등록'}</Text>
            </TouchableOpacity>
            <ScrollView accessibilityLabel="방문지 목록" style={{ maxHeight: Math.max(120, mapHeight - screenInsets.top - screenInsets.bottom - 320) }}
              nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            {visitDisplayMarkers.map((loc, index) => (
              <View
                key={`${loc.detailAddress || 'loc'}-${loc.lat}-${loc.lng}-${index}`}
                style={[styles.visitItem, preview?.targetKey === locationKey(loc) && { backgroundColor: colors.primarySoft }]}
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
            {recommendationReturn && <TouchableOpacity style={styles.visitItem} accessibilityRole="button"
              accessibilityLabel="마지막 목적지 근무지 복귀 경로 보기" onPress={() => previewVisit(recommendationReturn)}>
              <Ionicons name="home-outline" size={20} color="#2477F3" />
              <View style={styles.visitTextWrap}>
                <Text style={styles.visitName}>마지막 목적지 · 근무지 복귀</Text>
                <Text style={styles.visitTask} numberOfLines={1}>{recommendationReturn.roadAddress}</Text>
              </View>
            </TouchableOpacity>}
            </ScrollView>
          </View>
        )}

        <View style={styles.workspaceSwitcherRow}><MapWorkspaceSwitcher userId={user?.userId} activeGroup={activeGroup} onSelect={onSelectGroup} /></View>
      </View>}
      {mapSelectMode && <View style={[styles.selectionHint, { top: screenInsets.top + 124 }]} pointerEvents="none"><Text style={styles.selectionHintText}>지도를 움직여 위치를 선택하세요</Text></View>}
      {!resultsMode && !publicFacilityMode && !mapSelectMode && !searchedPlace && !coordSheetOpen && cardTarget && (
        <View style={styles.destinationCard}
          onLayout={event => setBottomOverlayHeight(event.nativeEvent.layout.height)}>
          {isGuiding && !preview ? <>
            <View style={styles.guidanceBar}>
            <View style={styles.guidanceBarInfo}>
              <TouchableOpacity style={styles.guidancePlaceRow} onPress={() => setGuideShowDestination(value => !value)} accessibilityLabel="현재 위치와 목적지 번갈아 보기">
                <Ionicons name={guideShowDestination ? 'location' : 'locate-outline'} size={18} color={colors.textSoft} />
                <Text style={styles.guidancePlaceText} numberOfLines={1}>{guideShowDestination ? (cardTarget.detailAddress || cardTarget.roadAddress || '방문지') : (guideCurrentAddress || '위치 확인 중…')}</Text>
              </TouchableOpacity>
              <View style={styles.guidanceMetrics}>
                <Text style={styles.guidanceDistance}>{formatDistance(cardDistance)}</Text>
                <Text style={styles.guidanceArrival}>{formatDuration(cardDuration) || '시간 확인 중'}</Text>
              </View>
            </View>
              <View style={styles.guidanceTools}>
                <TouchableOpacity style={styles.guidanceRefreshButton} disabled={segmentChanging}
                  onPress={() => handleStartGuidance(activeTarget, activeSegment?.mode || transportMode)}
                  accessibilityLabel="경로 새로고침">
                  {segmentChanging ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="refresh" size={22} color={colors.text} />}
                </TouchableOpacity>
                <TouchableOpacity style={styles.guidanceMenuButton} onPress={() => setGuideMenuOpen(true)} accessibilityLabel="지도 보고서 그룹 설정 메뉴"><Ionicons name="menu" size={25} color={colors.text} /></TouchableOpacity>
              </View>
            </View>
            <View style={styles.guidanceActions}>
              {['car', 'walk'].map(mode => {
                const selected = (activeSegment?.mode || transportMode) === mode;
                return <TouchableOpacity key={mode} accessibilityRole="button" accessibilityState={{ selected }}
                  accessibilityLabel={mode === 'car' ? '차량 안내' : '도보 안내'} disabled={segmentChanging}
                  style={[styles.guidanceAction, selected && styles.guidanceActionActive]}
                  onPress={() => { if (!selected) handleStartGuidance(activeTarget, mode); }}>
                  <Ionicons name={mode === 'car' ? 'car-outline' : 'walk-outline'} size={18} color={selected ? colors.primary : colors.textSoft} />
                  <Text style={[styles.guidanceActionText, selected && { color: colors.primary }]}>{mode === 'car' ? '차량' : '도보'}</Text>
                </TouchableOpacity>;
              })}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="안내 종료" style={[styles.guidanceAction, styles.guidanceStopAction]} onPress={requestStopGuidance}>
                <Ionicons name="stop-circle-outline" size={18} color={colors.danger} /><Text style={[styles.guidanceActionText, { color: colors.danger }]}>안내 종료</Text>
              </TouchableOpacity>
            </View>
          </> : <>
            <View style={styles.destinationTitleRow}>
              <TouchableOpacity style={{ flex: 1, minWidth: 0, minHeight: 40, justifyContent: 'center' }} disabled={cardTarget.isReturnLocation} onPress={() => onLocationClick?.(cardTarget, 'report')}>
                <Text style={styles.destinationName} numberOfLines={1}>{cardTarget.detailAddress || cardTarget.roadAddress || '방문지'}</Text>
              </TouchableOpacity>
              {!!preview?.segment && <TouchableOpacity accessibilityRole="button" accessibilityLabel={previewDetailView ? '전체 경로 보기' : '목적지 확대'} style={styles.previewOverviewButton} onPress={() => setPreviewDetailView(value => !value)}>
                <Text style={styles.previewOverviewText}>{previewDetailView ? '전체 경로' : '확대'}</Text>
              </TouchableOpacity>}
              <TouchableOpacity style={styles.routeMenuButton} accessibilityLabel="경로 미리보기 닫기" onPress={() => { previewRequestRef.current += 1; setPreview(null); }}><Ionicons name="close" size={20} color={colors.textSoft} /></TouchableOpacity>
            </View>
            <View style={styles.destinationModesRow}>
              <View style={styles.previewMetrics}>
                {preview?.loading || preview?.error ? <Text style={styles.previewMessage}>{preview?.loading ? '경로 확인 중…' : preview.error}</Text> : <>
                  <Text style={styles.previewDistanceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{formatDistance(cardDistance)}</Text>
                  <Text style={styles.previewDurationText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{formatDuration(cardDuration)}</Text>
                </>}
              </View>
              {['car', 'walk'].map(mode => {
                const selected = (preview?.mode || activeSegment?.mode || transportMode) === mode;
                return <TouchableOpacity key={mode} accessibilityRole="button" accessibilityState={{ selected }}
                  disabled={segmentChanging || preview?.loading}
                  style={[styles.guidanceAction, selected && styles.guidanceActionActive]}
                  onPress={() => handleTransportPress(mode)} accessibilityLabel={mode === 'car' ? '차량 경로' : '도보 경로'}>
                  <Ionicons name={mode === 'car' ? 'car-outline' : 'walk-outline'} size={18} color={selected ? colors.primary : colors.textSoft} />
                  <Text style={[styles.guidanceActionText, selected && { color: colors.primary }]}>{mode === 'car' ? '차량' : '도보'}</Text>
                </TouchableOpacity>;
              })}
            </View>
            <TouchableOpacity style={[styles.routeStart, (!cardSegment || isCompleted(cardTarget) || segmentChanging) && { opacity: 0.4 }]} disabled={!cardSegment || isCompleted(cardTarget) || segmentChanging} onPress={() => handleStartGuidance()}><Text style={styles.routeStartText}>{isGuiding ? '이곳으로 안내 변경' : '안내 시작'}</Text></TouchableOpacity>
            {!!preview?.error && <TouchableOpacity onPress={() => previewVisit(cardTarget, preview.mode)} style={{ minHeight: 36, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>경로 다시 불러오기</Text></TouchableOpacity>}
          </>}

        </View>
      )}
      <Modal visible={guideMenuOpen && isActive && isGuiding} transparent navigationBarTranslucent={false} statusBarTranslucent={false} animationType="fade" onRequestClose={() => setGuideMenuOpen(false)}>
        <Pressable {...guideMenuSwipe} style={[styles.guideMenuBackdrop, { paddingBottom: Math.max(screenInsets.bottom, 16) + 20 }]} onPress={() => setGuideMenuOpen(false)}>
          <View style={styles.guideMenuSheet} onStartShouldSetResponder={() => true}>
          {renderGuidanceNavigation?.(() => setGuideMenuOpen(false))}
          </View>
        </Pressable>
      </Modal>

      {!isGuiding && !resultsMode && !mapSelectMode && !publicFacilityMode && !searchedPlace && !coordSheetOpen && !pendingOpen && !dongOpen && (
        <TouchableOpacity
          style={[styles.publicFacilityCollapsed, cardTarget && { bottom: bottomOverlayHeight + 28 }]}
          onLayout={event => setPendingOverlayHeight(event.nativeEvent.layout.height)}
          activeOpacity={0.88}
          onPress={() => setPendingOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="미처리 업무 목록 펼치기"
        >
          <Text style={styles.publicFacilityCollapsedText}>
            미처리 업무 {pendingWork.length}건
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
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={allPublicSelected ? '공공시설물 전체 해제' : '공공시설물 전체 선택'}
                disabled={publicLoading || publicSaving || !publicItems.length}
                style={[styles.publicSelectAllButton, (publicLoading || publicSaving || !publicItems.length) && { opacity: 0.4 }]}
                onPress={() => setPublicSelectedIds(allPublicSelected ? [] : publicItems.map(item => item.id))}>
                <Text style={styles.publicSelectAllText}>{allPublicSelected ? '전체 해제' : '전체 선택'}</Text>
              </TouchableOpacity>
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
      {!isGuiding && !searchOpen && !mapSelectMode && !searchedPlace && !coordSheetOpen && !pendingOpen && !dongOpen && !(publicFacilityMode && publicSheetOpen) && !resultsMode && <RegistrationFab
        open={addMenuOpen} onClose={() => setAddMenuOpen(false)} onToggle={() => setAddMenuOpen(value => !value)}
        bottom={cardTarget ? bottomOverlayHeight + 23 : 23}
        items={[
          ...(registrationDraft ? [{ label: '작성 이어하기', icon: 'create-outline', onPress: () => { sheetY.setValue(0); setSearchedPlace(registrationDraft.place); setPlaceName(registrationDraft.name); setTask(registrationDraft.task); } }] : []),
          { label: '지도 선택', icon: 'map-outline', onPress: () => { resetAddModes(); setDirectCenter(null); setCenterAddress(''); setLocationSettingMode(true); setCoordinateText({ lat: '', lng: '' }); setCoordinateRequest(null); setMapSelectMode(true); } },
          { label: '공공시설물', icon: 'business-outline', onPress: () => { resetAddModes(); setPublicFacilityMode(true); setPublicSheetOpen(true); setKeyword(''); setPublicCategory(''); setPublicItems([]); setPublicSelectedIds([]); setPublicCategoryOpen(false); loadDongs(); } },
          { label: '엑셀 등록', icon: 'grid-outline', onPress: () => setBulkUploadOpen(true) },
          { label: '사진 등록', icon: 'image-outline', onPress: () => setPhotoUploadOpen(true) },
          { label: '근무지', icon: 'home-outline', onPress: () => returnDisplayMarker ? previewVisit(returnDisplayMarker) : setWorkplaceOpen(true) },
        ]} />}
      {searchOpen && isActive && <PlaceSearchOverlay userId={user?.userId} initialQuery={searchInitialQuery} center={currentLocation} locations={locations || []} onClose={() => setSearchOpen(false)} onResults={showResults} onAdd={addSearchPlace} />}
      <Modal visible={workplaceOpen} transparent animationType="fade" onRequestClose={() => !workplaceBusy && setWorkplaceOpen(false)}>
        <View {...workplaceSwipe} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' }}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel="근무지 등록 닫기" onPress={() => !workplaceBusy && setWorkplaceOpen(false)} /><View style={{ padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#10285B' }}>근무지 등록</Text>
          <WorkplaceField value={workplaceCandidate} onChange={setWorkplaceCandidate} userId={user?.userId} disabled={workplaceBusy} />
          <TouchableOpacity disabled={!workplaceCandidate?.workplaceAddress || workplaceBusy} onPress={saveWorkplace} style={{ backgroundColor: '#2477F3', padding: 14, borderRadius: 12, alignItems: 'center', opacity: workplaceCandidate?.workplaceAddress ? 1 : 0.5 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{workplaceBusy ? '저장 중...' : '근무지 저장'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={workplaceBusy} onPress={() => setWorkplaceOpen(false)} style={{ padding: 14, alignItems: 'center' }}><Text>닫기</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <PhotoUploadScreen
        visible={photoUploadOpen && isActive}
        onHome={onPhotoUploadHome}
        userId={user?.userId}
        groupId={activeGroup?.groupId ?? null}
        onDataChanged={onDataChanged}
        apiBaseUrl={API_BASE_URL}
        onClose={() => setPhotoUploadOpen(false)}
      />
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
  workspaceSwitcherRow: { alignItems: 'flex-end', marginTop: 5 },
  routeProgressRail: { position: 'absolute', right: 8, width: 28, alignItems: 'center', zIndex: 15 },
  routeProgressTrack: { width: 10, borderRadius: 6, backgroundColor: '#FFFFFF', elevation: 1 },
  routeTrafficClip: { position: 'absolute', left: 2, right: 2, top: 2, bottom: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.primary },
  routeProgressPassed: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#9CA3AF' },
  routeProgressPosition: { position: 'absolute', left: -9, marginBottom: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.primary },
  guideNearbyControls: { position: 'absolute', right: 20, zIndex: 18, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', elevation: 3 },
  guideNearbyButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  guideNearbySelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  guideMapModeText: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  guideNearbyText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  guideParkingIcon: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  selectionCard: { position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 46, backgroundColor: colors.surface, padding: 18, borderRadius: 22 },
  selectionAddress: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 10 },
  coordinateRow: { flexDirection: 'row', gap: 10 }, coordinateLabel: { color: colors.textSoft, fontSize: 12, marginBottom: 4 },
  coordinateInput: { minHeight: 44, borderRadius: 10, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, color: colors.text, fontSize: 14 },
  selectionHint: { position: 'absolute', left: 20, right: 20, borderRadius: 10, backgroundColor: colors.text, padding: 9, zIndex: 21, alignItems: 'center' }, selectionHintText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  guidanceRefreshButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  guidanceBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guidanceBarInfo: { flex: 1, minWidth: 0 },
  guidancePlaceRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6 },
  guidancePlaceText: { flexShrink: 1, color: colors.textSoft, fontSize: 12, textAlign: 'left' },
  guidanceMetrics: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  guidanceArrival: { color: colors.textSoft, fontSize: 14, fontWeight: '700', textAlign: 'left' },
  guidanceDistance: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'left' },
  guidanceTools: { flexDirection: 'row', alignItems: 'center' },
  guidanceMenuButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  guidanceActions: { flexDirection: 'row', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  guidanceAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 10 },
  guidanceActionActive: { backgroundColor: colors.primarySoft },
  guidanceActionText: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  guidanceStopAction: { marginLeft: 'auto' },
  previewMetrics: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', columnGap: 6 },
  previewDistanceText: { flexShrink: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  previewDurationText: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  previewOverviewButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primarySoft },
  previewOverviewText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  durationText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  previewMessage: { color: colors.textSoft, fontSize: 13 },
  destinationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, routeMenuButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  destinationModesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 }, transportPill: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 18 }, transportPillActive: { backgroundColor: colors.primary }, transportText: { color: colors.textSoft, fontSize: 12, fontWeight: '700' }, transportTextActive: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  distanceText: { color: colors.text, fontSize: 22, fontWeight: '900' }, arrivalText: { color: colors.textSoft, fontSize: 12, marginTop: 2 },
  routeStart: { minHeight: 46, backgroundColor: colors.primary, borderRadius: 14, marginTop: 8, justifyContent: 'center', alignItems: 'center' }, routeStartText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  guideMenuSheet: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  guideMenuBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 20, backgroundColor: 'rgba(16,40,91,0.25)' },

  destinationCard: { marginTop: 5, paddingHorizontal: 8, paddingVertical: 6, position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 25, backgroundColor: colors.surface, borderRadius: 20, padding: 16, elevation: 2, },
  destinationHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  destinationInfo: { minWidth: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  destinationName: {   fontWeight: '900', color: colors.text, fontSize: 14, },
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


    zIndex: 20, left: 20, right: 20, },
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


    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    shadowColor: '#000',

    shadowRadius: 8,
    shadowOffset: { width: 0, }, borderRadius: 16, height: 52, elevation: 1, shadowOpacity: 0.06, },

  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#10285B',
    paddingVertical: 0,
  },

  compactCloseButton: { width: 32, minWidth: 32, height: 32, paddingHorizontal: 0, borderRadius: 9, alignSelf: 'center' },
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

    minHeight: 48,

    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',

    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 }, marginTop: 10, borderRadius: 14, elevation: 1, shadowOpacity: 0.04, },
  visitChipList: { flex: 1, minWidth: 0 },

  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,

    backgroundColor: '#FFFFFF',

    borderColor: '#E6EDF3',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 12, maxWidth: 270, borderWidth: 0, },

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

    color: '#10285B',
    fontWeight: '900', maxWidth: 215, fontSize: 11, },

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
  publicSelectAllButton: { minHeight: 32, paddingHorizontal: 8, justifyContent: 'center' },
  publicSelectAllText: { color: '#2477F3', fontSize: 12, fontWeight: '700' },
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
