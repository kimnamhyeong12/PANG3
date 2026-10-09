import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  AppState,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import RegisterScreen from './screens/RegisterScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import MapScreen from './screens/MapScreen';
import FieldActionScreen from './screens/FieldActionScreen';
import ReportScreen from './screens/ReportScreen';
import DownloadScreen from './screens/DownloadScreen';
import ReportListScreen from './screens/ReportListScreen';
import GroupReportsScreen from './screens/GroupReportsScreen';
import GroupScreen from './screens/GroupScreen';
import GroupCreateScreen from './screens/GroupCreateScreen';
import GroupInvitationsScreen from './screens/GroupInvitationsScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import GroupWorkspaceScreen from './screens/GroupWorkspaceScreen';
import AssignmentScreen from './screens/AssignmentScreen';
import WorkStatusScreen from './screens/WorkStatusScreen';
import TransferScreen from './screens/TransferScreen';
import SettingsScreen from './screens/SettingsScreen';
import { groupApi } from './utils/groupApi';
import { CustomAlertHost, showAlert } from './components/CustomAlert';
import { colors } from './constants/design';
import { locationKey, numberVisits, restoreRouteSession } from './utils/routeSession';
import { assignmentKey, splitWorkPlan } from './utils/workPlan';
import {
  NOTIFICATION_TYPES,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  checkNotificationPermission,
  stopRouteNotification,
  syncPushTokenForUser,
  unregisterPushTokenForUser,
} from './services/notificationService';

const isPersonalGroup = (group) =>
  Boolean(
    group?.personalWorkspace ||
    group?.personal ||
    group?.workspaceType === 'PERSONAL'
  );

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getScheduledDateKey = (item) => {
  const value =
    item?.scheduledDate ??
    item?.scheduled_date ??
    item?.workDate ??
    item?.work_date;
  return value ? String(value).slice(0, 10) : '';
};

const isTodayWork = (item) => {
  const scheduledDate = getScheduledDateKey(item);
  // scheduledDate 도입 전 데이터는 기존 workDate를 배치일로 사용한다.
  return !scheduledDate || scheduledDate === getLocalDateKey();
};

export default function App() {
  const [screen, setScreen] = useState('login');
  const [groupWorkspaceTab, setGroupWorkspaceTab] = useState('status');
  const [mapInitialized, setMapInitialized] = useState(false);
  const [selectedDong, setSelectedDong] = useState(null);
  const selectedDongDayRef = useRef(getLocalDateKey());
  const selectedDongVersionRef = useRef(0);
  const [transferTargetMember, setTransferTargetMember] = useState(null);
  const [transferRequestsOnly, setTransferRequestsOnly] = useState(false);

  useEffect(() => {
    let active = true;
    const version = selectedDongVersionRef.current;
    AsyncStorage.getItem('pang3:selectedDong')
      .then((value) => {
        if (!active || version !== selectedDongVersionRef.current || !value) return;
        try {
          const parsed = JSON.parse(value);
          if (parsed?.day === getLocalDateKey() && parsed?.feature?.type === 'Feature') {
            selectedDongDayRef.current = parsed.day;
            setSelectedDong(parsed.feature);
          } else {
            AsyncStorage.removeItem('pang3:selectedDong').catch(() => {});
          }
        } catch {}
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const updateSelectedDong = useCallback((feature) => {
    if (!feature) return;
    const day = getLocalDateKey();
    selectedDongVersionRef.current += 1;
    selectedDongDayRef.current = day;
    setSelectedDong(feature);
    AsyncStorage.setItem('pang3:selectedDong', JSON.stringify({ day, feature })).catch(() => {});
  }, []);
  const [calendarDayKey, setCalendarDayKey] = useState(getLocalDateKey());
  useEffect(() => {
    if (selectedDongDayRef.current === calendarDayKey) return;
    selectedDongVersionRef.current += 1;
    selectedDongDayRef.current = calendarDayKey;
    setSelectedDong(null);
    AsyncStorage.removeItem('pang3:selectedDong').catch(() => {});
  }, [calendarDayKey]);
  const [user, setUser] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [actionType, setActionType] = useState(null);

  const [routeLocations, setRouteLocations] = useState([]);
  const [reportTargets, setReportTargets] = useState([]);
  const [downloadInfo, setDownloadInfo] = useState(null);

  const [roadPath, setRoadPath] = useState([]);
  const [routeSegments, setRouteSegments] = useState([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [optimized, setOptimized] = useState(false);
  const [isGuiding, setIsGuiding] = useState(false);
  const [totalDuration, setTotalDuration] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const historyRef = useRef([]);
  const screenRef = useRef('login');
  const workspaceLoadIdRef = useRef(0);

  const [todayLocationsLoaded, setTodayLocationsLoaded] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [routeResumeToken, setRouteResumeToken] = useState(0);
  const routeSaveQueueRef = useRef(Promise.resolve());
  const loadedWorkspaceKeyRef = useRef(null);
  const [pendingWork, setPendingWork] = useState([]);
  const planBusyRef = useRef(false);
  const workPlanRef = useRef({ rows: [], choices: {}, key: null });
  const currentRouteRef = useRef(null);
  currentRouteRef.current = { day: calendarDayKey, order: routeLocations.map(locationKey), visitNumbers: Object.fromEntries(routeLocations.map((row) => [locationKey(row), row.markerNumber])), locations: routeLocations, routeSegments, currentSegmentIndex, optimized, isGuiding };

  // 앱을 자정 넘겨 계속 켜둔 경우에도 오늘 업무/미처리 업무 기준을 자동 갱신한다.
  useEffect(() => {
    const timer = setInterval(() => {
      const nextDayKey = getLocalDateKey();
      setCalendarDayKey((prev) => (prev === nextDayKey ? prev : nextDayKey));
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  const WORKSPACE_LOCATIONS_KEY_PREFIX = 'pang3_workspace_locations';

  const [activeGroup, setActiveGroup] = useState(null);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupAssignments, setGroupAssignments] = useState([]);
  const [teamLocations, setTeamLocations] = useState([]);
  const leaderMapMarkers = useMemo(() => {
    if (activeGroup?.role !== 'LEADER' || isPersonalGroup(activeGroup)) return [];
    const assignedIds = new Set(groupAssignments.map((item) => String(item.taskId)));
    return teamLocations.filter((item) => String(item.createdByUserId) === String(user?.userId) &&
      getScheduledDateKey(item) === calendarDayKey &&
      !assignedIds.has(String(item.id ?? item.taskId ?? item.task_id)));
  }, [activeGroup, teamLocations, groupAssignments, user?.userId, calendarDayKey]);

  // 팀 방문지 지도는 개인 지도와 경로 상태를 완전히 분리한다.
  // 그룹 화면에서 팀 방문지 관리를 열어도 개인 경로가 사라지지 않는다.
  const [teamRoadPath, setTeamRoadPath] = useState([]);
  const [teamRouteSegments, setTeamRouteSegments] = useState([]);
  const [teamCurrentSegmentIndex, setTeamCurrentSegmentIndex] = useState(0);
  const [teamOptimized, setTeamOptimized] = useState(false);
  const [teamIsGuiding, setTeamIsGuiding] = useState(false);
  const [teamTotalDuration, setTeamTotalDuration] = useState(null);
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [teamRouteResumeToken, setTeamRouteResumeToken] = useState(0);
  const teamLoadedKeyRef = useRef(null);
  const teamLoadIdRef = useRef(0);
  const teamSaveQueueRef = useRef(Promise.resolve());
  const teamSessionRef = useRef(null);
  teamSessionRef.current = {
    day: calendarDayKey, order: teamLocations.map(locationKey),
    visitNumbers: Object.fromEntries(teamLocations.map((row) => [locationKey(row), row.markerNumber])),
    locations: teamLocations, routeSegments: teamRouteSegments,
    currentSegmentIndex: teamCurrentSegmentIndex, optimized: teamOptimized, isGuiding: teamIsGuiding,
  };

  const selectActiveGroup = useCallback(async (group, targetUser = user) => {
    if (targetUser?.userId === user?.userId && group?.groupId === activeGroup?.groupId) {
      setActiveGroup(group || null);
      return;
    }
    setActiveGroup(group || null);
    selectedDongVersionRef.current += 1;
    selectedDongDayRef.current = getLocalDateKey();
    setSelectedDong(null);
    AsyncStorage.removeItem('pang3:selectedDong').catch(() => {});
    setGroupAssignments([]);
    setTodayLocationsLoaded(false);
    setRouteLocations([]);
    setPendingWork([]);
    setRouteSegments([]);
    setRoadPath([]);
    setCurrentSegmentIndex(0);
    setOptimized(false);
    setIsGuiding(false);

    if (targetUser?.userId) {
      try {
        await AsyncStorage.setItem(
          `pang3_active_group_${targetUser.userId}`,
          group?.groupId ? String(group.groupId) : ''
        );
      } catch (error) {
        console.log('현재 그룹 저장 실패:', error);
      }
    }
  }, [user, activeGroup?.groupId]);

  const restoreActiveGroup = useCallback(async (loginUser) => {
    if (!loginUser?.userId) return;

    try {
      const groups = await groupApi(`/api/groups/user/${loginUser.userId}`);

      const groupList = Array.isArray(groups) ? groups : [];
      setAvailableGroups(groupList);
      const savedGroupId = await AsyncStorage.getItem(`pang3_active_group_${loginUser.userId}`);
      const selected = groupList.find((group) => String(group.groupId) === savedGroupId) || groupList.find(isPersonalGroup) || groupList[0] || null;

      setActiveGroup(selected);

      await AsyncStorage.setItem(
        `pang3_active_group_${loginUser.userId}`,
        selected?.groupId ? String(selected.groupId) : ''
      );
    } catch (error) {
      console.log('현재 그룹 복원 실패:', error);
      setAvailableGroups([]);
      setActiveGroup(null);
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  const go = (next, options = {}) => {
    if (next === screenRef.current) return;

    if (next === 'mapDirect') {
      setMapInitialized(true);
    }

    if (!options.replace) {
      historyRef.current.push(screen);
    }

    screenRef.current = next;
    setScreen(next);
  };

  const goBack = (fallback = 'main') => {
    const previous = historyRef.current.pop();
    const next = previous || fallback;

    screenRef.current = next;
    setScreen(next);
  };

  const workspaceCacheKey = useCallback((targetUser = user, group = activeGroup) => {
    if (!targetUser?.userId) return null;
    return `${WORKSPACE_LOCATIONS_KEY_PREFIX}_${targetUser.userId}_${isPersonalGroup(group) ? 'personal' : `group_${group?.groupId || 'none'}`}`;
  }, [user?.userId, activeGroup]);

  const loadWorkspaceLocations = useCallback(async () => {
    const requestId = ++workspaceLoadIdRef.current;

    if (!user?.userId || !workspaceReady || !activeGroup?.groupId) {
      setRouteLocations([]);
      setTodayLocationsLoaded(false);
      return;
    }

    const cacheKey = workspaceCacheKey();
    const personalGroupId = availableGroups.find(isPersonalGroup)?.groupId;
    const legacyPersonalKey = isPersonalGroup(activeGroup) && personalGroupId
      ? `${WORKSPACE_LOCATIONS_KEY_PREFIX}_${user.userId}_group_${personalGroupId}`
      : null;
    const acceptedTransfersKey = `${cacheKey}_accepted_transfer_ids`;
    const loadAcceptedTransferIds = async () => {
      if (isPersonalGroup(activeGroup)) return new Set();
      try {
        const transfers = await groupApi(`/api/groups/${activeGroup.groupId}/transfers?userId=${user.userId}`);
        const ids = (Array.isArray(transfers) ? transfers : [])
          .filter((request) => request.status === 'ACCEPTED'
            && Number(request.recipientUserId) === Number(user.userId))
          .flatMap((request) => request.taskIds || [])
          .map(String);
        AsyncStorage.setItem(acceptedTransfersKey, JSON.stringify(ids)).catch(() => {});
        return new Set(ids);
      } catch (error) {
        const cached = await AsyncStorage.getItem(acceptedTransfersKey).catch(() => null);
        try { return new Set(cached ? JSON.parse(cached) : []); }
        catch { return new Set(); }
      }
    };
    setTodayLocationsLoaded(false);
    const restoreRows = async (rows, legacyRows = [], heldTransferIds = new Set()) => {
      await routeSaveQueueRef.current;
      let session = null;
      try {
        const saved = await AsyncStorage.getItem(`${cacheKey}_route`) ||
          (legacyPersonalKey ? await AsyncStorage.getItem(`${legacyPersonalKey}_route`) : null);
        session = loadedWorkspaceKeyRef.current === cacheKey ? currentRouteRef.current : saved ? JSON.parse(saved) : null;
      } catch (error) {
        console.log('저장 경로 복원 실패:', error);
      }
      if (requestId !== workspaceLoadIdRef.current) return;
      const newPlan = await AsyncStorage.getItem(`${cacheKey}_work_plan`);
      const savedPlan = newPlan || (legacyPersonalKey ? await AsyncStorage.getItem(`${legacyPersonalKey}_work_plan`) : null);
      if (!newPlan && savedPlan) await AsyncStorage.setItem(`${cacheKey}_work_plan`, savedPlan);
      if (requestId !== workspaceLoadIdRef.current) return;
      const choices = savedPlan ? JSON.parse(savedPlan) : {};
      // A refresh may overlap optimization or guidance. Use the latest in-memory
      // session after storage reads rather than overwriting it with an older snapshot.
      if (loadedWorkspaceKeyRef.current === cacheKey) session = currentRouteRef.current;
      const personalWorkspace = true;
      const plan = splitWorkPlan(rows, choices, calendarDayKey, savedPlan ? [] : legacyRows,
        { autoAddToday: personalWorkspace, holdUntilSelected: heldTransferIds });
      plan.map = numberVisits(plan.map, session?.visitNumbers || Object.fromEntries((session?.order || []).map((id, index) => [id, index + 1])));
      // Personal visits scheduled for today go straight onto their owner's map.
      const autoAdded = personalWorkspace
        ? plan.map.filter((row) => row.status !== 'complete' && !choices[assignmentKey(row)])
        : [];
      autoAdded.forEach((row) => { choices[assignmentKey(row)] = calendarDayKey; });
      // Persist migration once; team assignments still need an explicit decision.
      if (!savedPlan) {
        plan.map.filter((row) => row.status !== 'complete').forEach((row) => { choices[assignmentKey(row)] = calendarDayKey; });
      }
      if (!savedPlan || autoAdded.length) {
        await AsyncStorage.setItem(`${cacheKey}_work_plan`, JSON.stringify(choices));
      }
      workPlanRef.current = { rows, choices, key: cacheKey };
      setPendingWork(plan.pending);
      const sameMap = loadedWorkspaceKeyRef.current === cacheKey &&
        JSON.stringify(plan.map.map((row) => [locationKey(row), row.status]).sort()) ===
        JSON.stringify((currentRouteRef.current.locations || []).map((row) => [locationKey(row), row.status]).sort());
      if (sameMap && (session?.routeSegments?.length || 0) <= plan.map.filter((row) => row.status !== 'complete').length) return;
      const restored = restoreRouteSession(plan.map, session, calendarDayKey);
      setRouteLocations(restored?.locations || plan.map);
      setRouteSegments(restored?.segments || []);
      setRoadPath(restored?.segments.slice(restored.currentSegmentIndex).flatMap((segment) => segment?.path || []) || []);
      setCurrentSegmentIndex(restored?.currentSegmentIndex || 0);
      setOptimized(restored?.optimized || false);
      setIsGuiding(restored?.isGuiding || false);
      setTotalDuration(null);
      setRouteResumeToken((value) => value + 1);
    };

    try {
      const path = `/api/groups/${encodeURIComponent(activeGroup.groupId)}/assignments/mine?userId=${encodeURIComponent(user.userId)}`;
      const [data, heldTransferIds] = await Promise.all([groupApi(path), loadAcceptedTransferIds()]);
      const rows = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        id: item.id ?? item.taskId ?? item.locationId ?? item.task_id,
        task: item.task ?? item.taskCategory ?? item.task_category ?? '',
        status: item.status ?? item.taskStatus ?? item.task_status ?? 'pending',
        lat: item.lat ?? item.latitude,
        lng: item.lng ?? item.longitude,
        createdAt: item.createdAt ?? item.created_at ?? null,
        workDate: item.workDate ?? item.work_date ?? null,
        scheduledDate:
          item.scheduledDate ??
          item.scheduled_date ??
          item.workDate ??
          item.work_date ??
          null,
      }));
      if (requestId !== workspaceLoadIdRef.current) return;
      const previous = cacheKey ? await AsyncStorage.getItem(cacheKey) ||
        (legacyPersonalKey ? await AsyncStorage.getItem(legacyPersonalKey) : null) : null;
      await restoreRows(rows, previous ? JSON.parse(previous) : [], heldTransferIds);

      if (cacheKey) {
        await AsyncStorage.setItem(`${cacheKey}_all_work`, JSON.stringify(rows));
      }
    } catch (error) {
      console.log('현재 작업공간 방문지 조회 실패:', error);

      // 네트워크가 잠시 끊겼을 때만 마지막 DB 조회 결과를 임시로 보여준다.
      try {
        const cached = cacheKey ? await AsyncStorage.getItem(`${cacheKey}_all_work`) ||
          (legacyPersonalKey ? await AsyncStorage.getItem(`${legacyPersonalKey}_all_work`) : null) ||
          await AsyncStorage.getItem(cacheKey) ||
          (legacyPersonalKey ? await AsyncStorage.getItem(legacyPersonalKey) : null) : null;
        const parsed = cached ? JSON.parse(cached) : [];
        const acceptedIds = await AsyncStorage.getItem(acceptedTransfersKey).catch(() => null);
        let heldTransferIds = new Set();
        try { heldTransferIds = new Set(acceptedIds ? JSON.parse(acceptedIds) : []); }
        catch {}
        if (requestId !== workspaceLoadIdRef.current) return;
        await restoreRows(
          Array.isArray(parsed) ? parsed : [], Array.isArray(parsed) ? parsed.filter(isTodayWork) : [],
          heldTransferIds
        );
      } catch {
        if (requestId !== workspaceLoadIdRef.current) return;
        setRouteLocations([]);
      }
    } finally {
      if (requestId === workspaceLoadIdRef.current) {
        loadedWorkspaceKeyRef.current = cacheKey;
        setTodayLocationsLoaded(true);
      }
    }
  }, [user?.userId, activeGroup?.groupId, availableGroups, workspaceCacheKey, calendarDayKey, workspaceReady]);

  const addWorkToMap = async (items) => {
    if (planBusyRef.current) return false;
    planBusyRef.current = true;
    try {
      const key = workspaceCacheKey();
      if (!key) return false;
      if (workPlanRef.current.key !== key) await loadWorkspaceLocations();
      if (workPlanRef.current.key !== key || workspaceCacheKey() !== key) return false;
      const { rows, choices } = workPlanRef.current;
      const updated = { ...choices };
      items.filter((row) => row.status !== 'complete').forEach((row) => {
        updated[assignmentKey(row)] = calendarDayKey;
      });
      await AsyncStorage.setItem(`${key}_work_plan`, JSON.stringify(updated));
      if (workPlanRef.current.key !== key) return false;
      workPlanRef.current = { rows, choices: updated, key };
      await loadWorkspaceLocations();
      return true;
    } catch (error) {
      showAlert('저장 실패', '업무 선택을 저장하지 못했습니다. 다시 시도하세요.');
      return false;
    } finally {
      planBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!user?.userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCalendarDayKey(getLocalDateKey());
        loadWorkspaceLocations();
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && ['main', 'mapDirect'].includes(screenRef.current)) loadWorkspaceLocations();
    }, 30000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [user?.userId, loadWorkspaceLocations]);

  useEffect(() => {
    loadWorkspaceLocations();
  }, [loadWorkspaceLocations]);

  useEffect(() => {
    if (!workspaceReady) return;
    const cacheKey = workspaceCacheKey();
    if (!cacheKey || loadedWorkspaceKeyRef.current !== cacheKey) return;

    AsyncStorage.setItem(cacheKey, JSON.stringify(routeLocations)).catch((error) => {
      console.log('작업공간 방문지 캐시 저장 실패:', error);
    });
  }, [routeLocations, todayLocationsLoaded, workspaceCacheKey, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) return;
    const cacheKey = workspaceCacheKey();
    if (!cacheKey || loadedWorkspaceKeyRef.current !== cacheKey) return;
    const session = JSON.stringify({
      day: calendarDayKey,
      order: routeLocations.map(locationKey),
      visitNumbers: Object.fromEntries(routeLocations.map((row) => [locationKey(row), row.markerNumber])),
      routeSegments, currentSegmentIndex, optimized, isGuiding,
    });
    routeSaveQueueRef.current = routeSaveQueueRef.current
      .then(() => AsyncStorage.setItem(`${cacheKey}_route`, session))
      .catch((error) => console.log('진행 경로 저장 실패:', error));
  }, [routeLocations, routeSegments, currentSegmentIndex, optimized, isGuiding, todayLocationsLoaded, workspaceCacheKey, calendarDayKey, workspaceReady]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen === 'login') {
          return false;
        }

        if (screen === 'mapDirect' && historyRef.current.length === 0) {
          return false;
        }

        // 보고서 작성 화면은 자체 이탈 확인이 변경 내용을 보호한다.
        if (screen === 'fieldAction') {
          return false;
        }

        goBack(
          screen === 'register'
            ? 'login'
            : 'main'
        );

        return true;
      }
    );

    return () => subscription.remove();
  }, [screen]);

  const swipeBackResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        evt,
        gestureState
      ) =>
        Platform.OS === 'ios' &&
        screenRef.current !== 'login' &&
        evt.nativeEvent.pageX - gestureState.dx <= 28 &&
        gestureState.dx > 18 &&
        Math.abs(gestureState.dy) < 35,

      onPanResponderRelease: (
        _evt,
        gestureState
      ) => {
        if (
          gestureState.dx > 70 &&
          Math.abs(gestureState.dy) < 80
        ) {
          goBack('main');
        }
      },
    })
  ).current;

  const refreshGroupAssignments = useCallback(async () => {
    if (
      !activeGroup?.groupId ||
      !user?.userId
    ) {
      setGroupAssignments([]);
      return;
    }

    try {
      const path = `/api/locations/group/${activeGroup.groupId}?userId=${user.userId}`;
      const data = await groupApi(
        path
      );

      setGroupAssignments(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (error) {
      console.log(
        '그룹 담당자 조회 실패:',
        error.message
      );

      setGroupAssignments([]);
    }
  }, [
    activeGroup?.groupId,
    user?.userId,
  ]);

  const refreshAvailableGroups = useCallback(async () => {
    if (!user?.userId) {
      setAvailableGroups([]);
      return [];
    }

    try {
      const data = await groupApi(`/api/groups/user/${user.userId}`);
      const groups = Array.isArray(data) ? data : [];
      setAvailableGroups(groups);
      return groups;
    } catch (error) {
      console.log('업무공간 목록 조회 실패:', error.message);
      return [];
    }
  }, [user?.userId]);

  const rememberAvailableGroup = useCallback((group) => {
    if (!group?.groupId) return;
    setAvailableGroups((prev) => [
      group,
      ...prev.filter((item) => Number(item.groupId) !== Number(group.groupId)),
    ]);
  }, []);

  const loadTeamLocations = useCallback(async (group = activeGroup) => {
    const requestId = ++teamLoadIdRef.current;
    if (!group?.groupId || !user?.userId) {
      setTeamLocations([]);
      return;
    }

    const key = `${workspaceCacheKey(user, group)}_team_route`;
    const applyTeamRows = async (rows) => {
      await teamSaveQueueRef.current;
      const saved = await AsyncStorage.getItem(key);
      if (requestId !== teamLoadIdRef.current) return;
      const session = teamLoadedKeyRef.current === key ? teamSessionRef.current : saved ? JSON.parse(saved) : null;
      const numbered = numberVisits(rows, session?.visitNumbers || Object.fromEntries((session?.order || []).map((id, index) => [id, index + 1])));
      const sameMap = teamLoadedKeyRef.current === key &&
        JSON.stringify(numbered.map((row) => [locationKey(row), row.status]).sort()) ===
        JSON.stringify((teamSessionRef.current.locations || []).map((row) => [locationKey(row), row.status]).sort());
      if (sameMap && (session?.routeSegments?.length || 0) <= numbered.filter((row) => row.status !== 'complete').length) return;
      const restored = restoreRouteSession(numbered, session, calendarDayKey);
      setTeamLocations(restored?.locations || numbered);
      setTeamRouteSegments(restored?.segments || []);
      setTeamRoadPath(restored?.segments.slice(restored.currentSegmentIndex).flatMap((segment) => segment?.path || []) || []);
      setTeamCurrentSegmentIndex(restored?.currentSegmentIndex || 0);
      setTeamOptimized(restored?.optimized || false);
      setTeamIsGuiding(restored?.isGuiding || false);
      setTeamTotalDuration(null);
      teamLoadedKeyRef.current = key;
      setTeamRouteResumeToken((value) => value + 1);
    };

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/locations/group/${group.groupId}?userId=${user.userId}`
      );
      const text = await response.text();
      if (!response.ok) throw new Error(text || '팀 방문지 조회 실패');
      const data = JSON.parse(text);
      const rows = (Array.isArray(data) ? data : []).map((row) => ({
        ...row, id: row.id ?? row.taskId ?? row.task_id,
        status: row.status ?? row.taskStatus ?? row.task_status ?? 'pending',
        lat: row.lat ?? row.latitude, lng: row.lng ?? row.longitude,
      }));
      await applyTeamRows(rows);
      if (requestId === teamLoadIdRef.current) await AsyncStorage.setItem(`${key}_locations`, JSON.stringify(rows));
    } catch (error) {
      console.log('팀 방문지 조회 실패:', error);
      try {
        const cached = await AsyncStorage.getItem(`${key}_locations`);
        if (cached) await applyTeamRows(JSON.parse(cached));
      } catch (cacheError) {
        console.log('팀 지도 복원 실패:', cacheError);
      }
    }
  }, [activeGroup, user?.userId, workspaceCacheKey, calendarDayKey]);

  useEffect(() => {
    if (!workspaceReady || !user?.userId || !activeGroup?.groupId) return;
    const key = `${workspaceCacheKey()}_team_route`;
    if (teamLoadedKeyRef.current !== key) return;
    const snapshot = JSON.stringify(teamSessionRef.current);
    teamSaveQueueRef.current = teamSaveQueueRef.current
      .then(() => AsyncStorage.setItem(key, snapshot))
      .catch((error) => console.log('팀 지도 경로 저장 실패:', error));
  }, [teamLocations, teamRouteSegments, teamCurrentSegmentIndex, teamOptimized, teamIsGuiding, teamRouteResumeToken, workspaceReady, workspaceCacheKey, user?.userId, activeGroup?.groupId, calendarDayKey]);

  const refreshCurrentWorkspace = useCallback(async () => {
    await Promise.all([
      refreshGroupAssignments(),
      loadWorkspaceLocations(),
      activeGroup && !isPersonalGroup(activeGroup)
        ? loadTeamLocations(activeGroup)
        : Promise.resolve(),
    ]);
  }, [activeGroup, loadTeamLocations, loadWorkspaceLocations, refreshGroupAssignments]);

  useEffect(() => {
    if (screen === 'main' && user?.userId) {
      refreshCurrentWorkspace();
    }
  }, [screen, user?.userId, refreshCurrentWorkspace]);

  /*
 * 로그인한 사용자가 있고 알림 권한이 이미 허용돼 있으면
 * Expo Push Token을 백엔드에 등록한다.
 */
  useEffect(() => {
    console.log('[Notification DEBUG] user =', user);

    if (!user?.userId) {
      console.log('[Notification DEBUG] userId 없음');
      return undefined;
    }

    let cancelled = false;

    const syncToken = async () => {
      console.log(
        '[Notification DEBUG] 토큰 동기화 시작 userId =',
        user.userId
      );

      const granted = await checkNotificationPermission();

      console.log(
        '[Notification DEBUG] permission =',
        granted
      );

      if (!granted || cancelled) {
        console.log(
          '[Notification DEBUG] 권한 없음 또는 취소됨'
        );
        return;
      }

      const result = await syncPushTokenForUser(user);

      console.log(
        '[Notification DEBUG] 토큰 등록 결과 =',
        result
      );
    };

    syncToken();

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);
  /*
   * 앱이 실행 중일 때 업무 푸시를 받으면
   * 현재 업무/담당자 데이터를 바로 새로고침한다.
   * 아침/퇴근 요약 알림은 데이터 재조회가 필요하지 않아 제외한다.
   */
  useEffect(() => {
    if (!user?.userId) {
      return undefined;
    }

    const refreshTypes = new Set([
      NOTIFICATION_TYPES.TASK_ASSIGNED,
      NOTIFICATION_TYPES.ASSIGNEE_CHANGED,
      NOTIFICATION_TYPES.PRIORITY_CHANGED,
    ]);

    const receivedSubscription =
      addNotificationReceivedListener((notification) => {
        const type =
          notification?.request?.content?.data?.type;

        if (refreshTypes.has(type)) {
          refreshCurrentWorkspace();
        }
      });

    const responseSubscription =
      addNotificationResponseListener((response) => {
        const type =
          response?.notification?.request?.content?.data?.type;

        if (refreshTypes.has(type)) {
          refreshCurrentWorkspace();

          // 알림을 눌렀을 때 현재 업무공간 홈으로 이동한다.
          historyRef.current = [];
          go('main', { replace: true });
        }
      });

    return () => {
      receivedSubscription?.remove?.();
      responseSubscription?.remove?.();
    };
  }, [
    user?.userId,
    refreshCurrentWorkspace,
  ]);

  useEffect(() => {
    refreshGroupAssignments();
  }, [refreshGroupAssignments]);

  const handleLogout = () => {
    // 로그아웃 시 현재 사용자와 기기 Push Token 연결을 해제한다.
    // 서버가 아직 해당 API를 제공하지 않아도 로그아웃 자체는 계속 진행된다.
    if (user?.userId) {
      unregisterPushTokenForUser(user);
    }

    stopRouteNotification();

    setWorkspaceReady(false);
    teamLoadedKeyRef.current = null;
    teamLoadIdRef.current++;
    loadedWorkspaceKeyRef.current = null;
    workPlanRef.current = { rows: [], choices: {}, key: null };
    setPendingWork([]);
    setMapInitialized(false);
    setUser(null);
    setGroupWorkspaceTab('status');
    setActiveGroup(null);
    setAvailableGroups([]);
    setGroupAssignments([]);
    setSelectedLocation(null);
    setActionType(null);
    setRouteLocations([]);
    setReportTargets([]);
    setDownloadInfo(null);
    setRoadPath([]);
    setRouteSegments([]);
    setCurrentSegmentIndex(0);
    setOptimized(false);
    setIsGuiding(false);
    setTotalDuration(null);

    setTeamLocations([]);
    setTeamRoadPath([]);
    setTeamRouteSegments([]);
    setTeamCurrentSegmentIndex(0);
    setTeamOptimized(false);
    setTeamIsGuiding(false);
    setTeamTotalDuration(null);
    setTeamPanelOpen(true);

    setTodayLocationsLoaded(false);

    historyRef.current = [];
    screenRef.current = 'login';
    setScreen('login');
  };



  const onLocationClick = (
    loc,
    type
  ) => {
    setSelectedLocation(loc);
    if (loc?.status === 'complete') {
      setReportTargets([loc]);
      go('report');
      return;
    }
    setActionType(type);
    go('fieldAction');
  };

  const openWorkspaceMap = () => {
    go('mapDirect');
  };

  const openGroupWorkspace = () => {
    // 하단 '그룹' 탭은 항상 그룹 선택 화면부터 연다.
    // 사용자가 '내 그룹'에서 그룹을 선택한 뒤에만 업무현황으로 진입한다.
    go('groupHome');
  };

  const openTeamMap = async () => {
    if (!activeGroup?.groupId) {
      go('groupHome');
      return;
    }

    await loadTeamLocations(activeGroup);
    await refreshGroupAssignments();
    go('teamLocations');
  };

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View
        style={styles.app}
        {...swipeBackResponder.panHandlers}
      >
        <StatusBar barStyle="dark-content" />

        <View style={styles.screenHost}>
        {screen === 'login' && (
          <LoginScreen
            onLogin={(loginUser) => {
              setWorkspaceReady(false);
              loadedWorkspaceKeyRef.current = null;
              workspaceLoadIdRef.current++;
              teamLoadedKeyRef.current = null;
              teamLoadIdRef.current++;
              setRouteLocations([]);
              setReportTargets([]);
              setTodayLocationsLoaded(false);
              setUser(loginUser);
              setGroupAssignments([]);
              restoreActiveGroup(loginUser);

                historyRef.current = [];

                go(
                  'mapDirect',
                  {
                    replace: true,
                  }
                );
              }}
              onRegister={() =>
                go('register')
              }
            />
          )}

          {screen === 'register' && (
            <RegisterScreen
              onBack={() =>
                goBack('login')
              }
            />
          )}
        {(screen === 'main' || screen === 'dashboard') && (
          <DashboardScreen
            user={user}
            onBack={() => goBack('mapDirect')}
            onSettings={() => go('settings')}
          />
        )}

          {screen === 'groupHome' && (
            <GroupScreen
              user={user}
              activeGroup={activeGroup}
              onBack={() =>
                goBack('mapDirect')
              }
              onCreate={() =>
                go('groupCreate')
              }
              onInvitations={() =>
                go('groupInvitations')
              }
              onOpenGroup={(group) => {
                rememberAvailableGroup(group);
                if (String(group?.groupId) !== String(activeGroup?.groupId)) {
                  selectActiveGroup(group);
                  return;
                }
                setGroupWorkspaceTab('status');
                go(isPersonalGroup(group) ? 'workStatus' : 'groupWorkspace');
              }}
            />
          )}

          {screen === 'groupCreate' && (
            <GroupCreateScreen
              user={user}
              onBack={() =>
                go('groupHome')
              }
              onCreated={(group) => {
                rememberAvailableGroup(group);
                selectActiveGroup(group);
                setGroupWorkspaceTab('status');
                go('groupWorkspace');
              }}
            />
          )}

          {screen === 'groupInvitations' && (
            <GroupInvitationsScreen
              user={user}
              onBack={() =>
                go('groupHome')
              }
              onAccepted={(group) => {
                rememberAvailableGroup(group);
                selectActiveGroup(group);
                setGroupWorkspaceTab('status');
                go('groupWorkspace');
              }}
            />
          )}

          {screen === 'groupWorkspace' && activeGroup && !isPersonalGroup(activeGroup) && (
            <GroupWorkspaceScreen
              user={user}
              group={activeGroup}
              assignments={groupAssignments}
              tab={groupWorkspaceTab}
              onTabChange={(nextTab) => {
                setGroupWorkspaceTab(nextTab);
                if (nextTab === 'dashboard' || nextTab === 'status') refreshGroupAssignments();
              }}
              onRefresh={refreshCurrentWorkspace}
              onBack={() => goBack('groupHome')}
              onMembers={() => go('groupMembers')}
              onTransfer={(member) => {
                setTransferRequestsOnly(false);
                setTransferTargetMember(member || null);
                go('transfer');
              }}
              onReceivedRequests={() => {
                setTransferRequestsOnly(true);
                setTransferTargetMember(null);
                go('transfer');
              }}
              onReports={() => go('groupReports')}
              onSettings={() => go('groupSettings')}
            />
          )}

          {['groupMembers', 'groupSettings'].includes(screen) && activeGroup && (
            <GroupDetailScreen
              user={user}
              group={activeGroup}
              mode={screen === 'groupMembers' ? 'members' : 'settings'}
              onBack={() => goBack('groupWorkspace')}
              onUpdatedGroup={(group) => {
                rememberAvailableGroup(group);
                selectActiveGroup(group);
              }}
            />
          )}

          {screen === 'groupDetail' &&
            activeGroup && (
              <GroupDetailScreen
                user={user}
                group={activeGroup}
                onBack={() =>
                  go('groupHome')
                }
                onUpdatedGroup={(group) => {
                  rememberAvailableGroup(group);
                  selectActiveGroup(group);
                }}
                onWorkStatus={() => { refreshCurrentWorkspace(); go('workStatus'); }}
                onTransfer={(member) => {
                setTransferRequestsOnly(false);
                setTransferTargetMember(member || null);
                go('transfer');
              }}
                onReports={() => go('groupReports')}
              />
            )}

        {screen === 'publicDataAssignment' && activeGroup && (
          <MapScreen
            user={user}
            selectedDong={selectedDong}
            onSelectedDongChange={updateSelectedDong}
            activeGroup={activeGroup}
            publicDataMode
            locations={routeLocations}
            setLocations={setRouteLocations}
            previewMarkers={leaderMapMarkers}
            previewOnlyRegistrations={!isPersonalGroup(activeGroup)}
            locationScope={isPersonalGroup(activeGroup) ? 'personal' : 'team'}
            groupAssignments={groupAssignments}
            onBack={() => goBack('groupDetail')}
            onDataChanged={refreshCurrentWorkspace}
            onLocationClick={onLocationClick}
            roadPath={roadPath}
            setRoadPath={setRoadPath}
            routeSegments={routeSegments}
            setRouteSegments={setRouteSegments}
            currentSegmentIndex={currentSegmentIndex}
            setCurrentSegmentIndex={setCurrentSegmentIndex}
            optimized={optimized}
            setOptimized={setOptimized}
            isGuiding={isGuiding}
            setIsGuiding={setIsGuiding}
            totalDuration={totalDuration}
            setTotalDuration={setTotalDuration}
            panelOpen={panelOpen}
            setPanelOpen={setPanelOpen}
          />
        )}

        {screen === 'teamLocations' && activeGroup && (
          <MapScreen
            user={user}
            selectedDong={selectedDong}
            onSelectedDongChange={updateSelectedDong}
            locations={teamLocations}
            setLocations={setTeamLocations}
            activeGroup={activeGroup}
            locationScope="team"
            groupAssignments={groupAssignments}
            onBack={() => {
              refreshCurrentWorkspace();
              go('groupDetail');
            }}
            onLocationClick={onLocationClick}
            onDataChanged={refreshCurrentWorkspace}
            roadPath={teamRoadPath}
            setRoadPath={setTeamRoadPath}
            routeSegments={teamRouteSegments}
            setRouteSegments={setTeamRouteSegments}
            currentSegmentIndex={teamCurrentSegmentIndex}
            setCurrentSegmentIndex={setTeamCurrentSegmentIndex}
            optimized={teamOptimized}
            setOptimized={setTeamOptimized}
            isGuiding={teamIsGuiding}
            routeResumeToken={teamRouteResumeToken}
            setIsGuiding={setTeamIsGuiding}
            totalDuration={teamTotalDuration}
            setTotalDuration={setTeamTotalDuration}
            panelOpen={teamPanelOpen}
            setPanelOpen={setTeamPanelOpen}
          />
        )}

          {screen === 'assignment' &&
            activeGroup && (
              <AssignmentScreen
                user={user}
                group={activeGroup}
                onBack={() => {
                  refreshCurrentWorkspace();
                  go('groupDetail');
                }}
                onChanged={refreshCurrentWorkspace}
              />
            )}

          {screen === 'workStatus' &&
            activeGroup && (
              <WorkStatusScreen
                user={user}
                group={activeGroup}
                assignments={groupAssignments}
                onBack={() => go('groupHome')}
                onRefresh={refreshCurrentWorkspace}
              />
            )}

          {screen === 'transfer' && activeGroup && !isPersonalGroup(activeGroup) && (
            <TransferScreen
              user={user}
              group={activeGroup}
              initialRecipientId={transferTargetMember?.userId || null}
              initialRecipientName={transferTargetMember?.name || transferTargetMember?.loginId || ''}
              requestsOnly={transferRequestsOnly}
              onBack={() => {
                setTransferTargetMember(null);
                setTransferRequestsOnly(false);
                goBack('groupWorkspace');
              }}
              onChanged={refreshCurrentWorkspace}
            />
          )}

          {screen === 'settings' && (
            <SettingsScreen
              user={user}
              activeGroup={activeGroup}
              onBack={() => go('dashboard')}
              onUpdatedUser={setUser}
              onLogout={handleLogout}
            />
          )}

        {mapInitialized && (
          <View
            style={[
              styles.persistentMapLayer,
              screen !== 'mapDirect' && styles.hiddenMapLayer,
            ]}
            pointerEvents={screen === 'mapDirect' ? 'auto' : 'none'}
            accessibilityElementsHidden={screen !== 'mapDirect'}
            importantForAccessibility={
              screen === 'mapDirect' ? 'auto' : 'no-hide-descendants'
            }
          >
            <MapScreen
              user={user}
              selectedDong={selectedDong}
              onSelectedDongChange={updateSelectedDong}
              locations={routeLocations}
              setLocations={
                setRouteLocations
              }
              previewMarkers={[]}
              previewOnlyRegistrations={false}
              activeGroup={activeGroup}
              locationScope="personal"
              groupAssignments={activeGroup?.groupId ? groupAssignments : []}
              onBack={() =>
                goBack('main')
              }
              onLocationClick={
                onLocationClick
              }
              onDataChanged={() => {
                refreshCurrentWorkspace();
              }}
              roadPath={roadPath}
              setRoadPath={setRoadPath}
              routeSegments={
                routeSegments
              }
              setRouteSegments={
                setRouteSegments
              }
              currentSegmentIndex={
                currentSegmentIndex
              }
              setCurrentSegmentIndex={
                setCurrentSegmentIndex
              }
              optimized={optimized}
              setOptimized={setOptimized}
              isGuiding={isGuiding}
              setIsGuiding={setIsGuiding}
              totalDuration={
                totalDuration
              }
              setTotalDuration={
                setTotalDuration
              }
              panelOpen={panelOpen}
              setPanelOpen={setPanelOpen}
              isActive={screen === 'mapDirect'}
              persistNormalMap
              routeResumeToken={routeResumeToken}
              pendingWork={pendingWork}
              onAddWork={addWorkToMap}
            />
          </View>
        )}

          {screen === 'fieldAction' && (
            <FieldActionScreen
              user={user}
              location={selectedLocation}
              actionType={actionType}
              onBack={() =>
                goBack('reportList')
              }
              onSave={(savedReport) => {
                const applySavedStatus = (items) =>
                  items.map((loc) =>
                    Number(loc.id ?? loc.taskId) ===
                      Number(selectedLocation?.id ?? selectedLocation?.taskId)
                      ? {
                        ...loc,
                        status:
                          savedReport.progressStatus ||
                          savedReport.status ||
                          loc.status,
                        latitude:
                          savedReport.latitude ?? loc.latitude,
                        longitude:
                          savedReport.longitude ?? loc.longitude,
                        lat:
                          savedReport.latitude ?? savedReport.lat ?? loc.lat ?? loc.latitude,
                        lng:
                          savedReport.longitude ?? savedReport.lng ?? loc.lng ?? loc.longitude,
                      }
                      : loc
                  );

                setRouteLocations(applySavedStatus);
                setTeamLocations(applySavedStatus);
                refreshCurrentWorkspace();

                goBack('reportList');
              }}
            />
          )}

          {screen === 'reportList' && (
            <ReportListScreen
              locations={routeLocations}
              selectedDong={selectedDong}
              loading={!todayLocationsLoaded}
              user={user}
              activeGroup={activeGroup}
              groupAssignments={
                groupAssignments
              }
              onBack={() =>
                goBack('mapDirect')
              }
              onSelectLocation={(loc) => {
                setSelectedLocation(loc);
                if (loc.status === 'complete') {
                  setReportTargets([loc]);
                  go('report');
                } else {
                  setActionType('report');
                  go('fieldAction');
                }
              }}
              onCreateReport={(
                selectedLocations
              ) => {
                setReportTargets(
                  selectedLocations
                );

                go('report');
              }}
            />
          )}

          {screen === 'groupReports' && activeGroup && (
            <GroupReportsScreen
              group={activeGroup}
              user={user}
              selectedDong={selectedDong}
              onBack={() => goBack('groupWorkspace')}
              onOpenReport={(report) => {
                setDownloadInfo({ progressId: report.progressId, reportDownloadUrl: report.reportDownloadUrl });
                go('download');
              }}
            />
          )}

          {screen === 'report' && (
            <ReportScreen
              locations={reportTargets}
              user={user}
              activeGroup={activeGroup}
              onBack={() =>
                goBack('reportList')
              }
              onDownload={(info) => {
                setDownloadInfo(info);
                go('download');
              }}
            />
          )}

          {screen === 'download' && (
            <DownloadScreen
              onBack={() =>
                goBack('groupReports')
              }
              downloadInfo={
                downloadInfo
              }
            />
          )}

        </View>

        {user &&
          !['login', 'register', 'settings'].includes(screen) && (
            <BottomNavigation
              screen={screen}
              onDashboard={() => go('dashboard')}
              // 하단 메뉴도 홈에서 선택한 현재 작업공간을 그대로 따른다.
              onMap={openWorkspaceMap}
              onReport={() => go('reportList')}
              onGroup={openGroupWorkspace}
            />
          )}

        <CustomAlertHost />
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}


function BottomNavigation({
  screen,
  onDashboard,
  onMap,
  onReport,
  onGroup,
}) {
  const activeTab =
    screen === 'mapDirect' ||
      screen === 'teamLocations' ||
      screen === 'publicDataAssignment'
      ? 'map'
      : [
        'reportList',
        'fieldAction',
        'report',
        'download',
      ].includes(screen)
        ? 'report'
        : [
          'groupHome',
          'groupCreate',
          'groupInvitations',
          'groupDetail',
          'groupWorkspace',
          'groupMembers',
          'groupSettings',
          'groupReports',
          'transfer',
          'workStatus',
          'assignment',
        ].includes(screen)
          ? 'group'
          : 'dashboard';

  return (
    <View style={styles.bottomNav}>
      <BottomNavItem
        icon={
          activeTab === 'map'
            ? 'map'
            : 'map-outline'
        }
        label="지도"
        active={activeTab === 'map'}
        onPress={onMap}
      />

      <BottomNavItem
        icon={
          activeTab === 'report'
            ? 'document-text'
            : 'document-text-outline'
        }
        label="보고서"
        active={activeTab === 'report'}
        onPress={onReport}
      />

      <BottomNavItem
        icon={
          activeTab === 'group'
            ? 'people'
            : 'people-outline'
        }
        label="그룹"
        active={activeTab === 'group'}
        onPress={onGroup}
      />
      <BottomNavItem
        icon={activeTab === 'dashboard' ? 'settings' : 'settings-outline'}
        label="대시보드"
        active={activeTab === 'dashboard'}
        onPress={onDashboard}
      />
    </View>
  );
}

function BottomNavItem({
  icon,
  label,
  active,
  onPress,
}) {
  return (
    <TouchableOpacity
      style={styles.bottomNavItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={23}
        color={
          active
            ? colors.primary
            : colors.textFaint
        }
      />

      <Text
        style={[
          styles.bottomNavLabel,
          active &&
          styles.bottomNavLabelActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  app: {
    flex: 1,
  },

  screenHost: {
    flex: 1,
    overflow: 'hidden',
  },

  persistentMapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  hiddenMapLayer: {
    left: '100%',
  },

  bottomNav: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    elevation: 12,
    shadowColor: '#1D4F91',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: -4,
    },
  },

  bottomNavItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  bottomNavLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
  },

  bottomNavLabelActive: {
    color: colors.primary,
    fontWeight: '900',
  },

});
