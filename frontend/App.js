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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import RegisterScreen from './screens/RegisterScreen';
import LoginScreen from './screens/LoginScreen';
import MainScreen from './screens/MainScreen';
import DashboardScreen from './screens/DashboardScreen';
import MapScreen from './screens/MapScreen';
import FieldActionScreen from './screens/FieldActionScreen';
import ReportScreen from './screens/ReportScreen';
import DownloadScreen from './screens/DownloadScreen';
import ReportListScreen from './screens/ReportListScreen';
import GroupScreen from './screens/GroupScreen';
import GroupCreateScreen from './screens/GroupCreateScreen';
import GroupInvitationsScreen from './screens/GroupInvitationsScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import AssignmentScreen from './screens/AssignmentScreen';
import WorkStatusScreen from './screens/WorkStatusScreen';
import SettingsScreen from './screens/SettingsScreen';
import { groupApi } from './utils/groupApi';
import { CustomAlertHost, showAlert } from './components/CustomAlert';
import { colors } from './constants/design';
import { locationKey, numberVisits, restoreRouteSession } from './utils/routeSession';
import { assignmentKey, splitWorkPlan } from './utils/workPlan';

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
  const [mapInitialized, setMapInitialized] = useState(false);
  const [calendarDayKey, setCalendarDayKey] = useState(getLocalDateKey());
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
    setTodayLocationsLoaded(false);
    setActiveGroup(group || null);
    setPendingWork([]);
    workPlanRef.current = { rows: [], choices: {}, key: null };
    setGroupAssignments([]);
    setRouteLocations([]);
    setRoadPath([]);
    setRouteSegments([]);
    setCurrentSegmentIndex(0);
    setOptimized(false);
    setIsGuiding(false);
    setTotalDuration(null);

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
    const scope = group?.groupId ? `group_${group.groupId}` : 'unselected';
    return `${WORKSPACE_LOCATIONS_KEY_PREFIX}_${targetUser.userId}_${scope}`;
  }, [activeGroup?.groupId, user?.userId]);

  const loadWorkspaceLocations = useCallback(async () => {
    const requestId = ++workspaceLoadIdRef.current;

    if (!user?.userId || !workspaceReady) {
      setRouteLocations([]);
      setTodayLocationsLoaded(false);
      return;
    }

    const cacheKey = workspaceCacheKey();
    setTodayLocationsLoaded(false);
    const restoreRows = async (rows, legacyRows = []) => {
      await routeSaveQueueRef.current;
      let session = null;
      try {
        const saved = await AsyncStorage.getItem(`${cacheKey}_route`);
        session = loadedWorkspaceKeyRef.current === cacheKey ? currentRouteRef.current : saved ? JSON.parse(saved) : null;
      } catch (error) {
        console.log('저장 경로 복원 실패:', error);
      }
      if (requestId !== workspaceLoadIdRef.current) return;
      const savedPlan = await AsyncStorage.getItem(`${cacheKey}_work_plan`);
      if (requestId !== workspaceLoadIdRef.current) return;
      const choices = savedPlan ? JSON.parse(savedPlan) : {};
      // A refresh may overlap optimization or guidance. Use the latest in-memory
      // session after storage reads rather than overwriting it with an older snapshot.
      if (loadedWorkspaceKeyRef.current === cacheKey) session = currentRouteRef.current;
      const personalWorkspace = isPersonalGroup(activeGroup);
      const plan = splitWorkPlan(rows, choices, calendarDayKey, savedPlan ? [] : legacyRows,
        { autoAddToday: personalWorkspace });
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
      // 그룹에서는 홈의 '내 담당 업무'와 같은 담당자 배정 데이터를 사용한다.
      // 이전 데이터에 task.group_id가 비어 있어도 task_assignments가 있으면
      // 지도와 보고서에 동일하게 표시된다.
      const path = activeGroup?.groupId
        ? `/api/groups/${activeGroup.groupId}/assignments/mine?userId=${encodeURIComponent(user.userId)}`
        : `/api/locations?userId=${encodeURIComponent(user.userId)}`;
      const data = await groupApi(path);
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
      const previous = cacheKey ? await AsyncStorage.getItem(cacheKey) : null;
      await restoreRows(rows, previous ? JSON.parse(previous) : []);

      if (cacheKey) {
        await AsyncStorage.setItem(`${cacheKey}_all_work`, JSON.stringify(rows));
      }
    } catch (error) {
      console.log('현재 작업공간 방문지 조회 실패:', error);

      // 네트워크가 잠시 끊겼을 때만 마지막 DB 조회 결과를 임시로 보여준다.
      try {
        const cached = cacheKey ? await AsyncStorage.getItem(`${cacheKey}_all_work`) || await AsyncStorage.getItem(cacheKey) : null;
        const parsed = cached ? JSON.parse(cached) : [];
        if (requestId !== workspaceLoadIdRef.current) return;
        await restoreRows(
          Array.isArray(parsed) ? parsed : [], Array.isArray(parsed) ? parsed.filter(isTodayWork) : []
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
  }, [activeGroup?.groupId, activeGroup?.personalWorkspace, activeGroup?.personal,
    activeGroup?.workspaceType, user?.userId, workspaceCacheKey, calendarDayKey, workspaceReady]);

  const addWorkToMap = async (items) => {
    if (planBusyRef.current || workPlanRef.current.key !== workspaceCacheKey()) return false;
    planBusyRef.current = true;
    const { rows, choices, key } = workPlanRef.current;
    const updated = { ...choices };
    items.filter((row) => row.status !== 'complete').forEach((row) => {
      updated[assignmentKey(row)] = calendarDayKey;
    });
    try {
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
      if (state === 'active') loadWorkspaceLocations();
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
      const data = await groupApi(
        `/api/groups/${activeGroup.groupId}/assignments?userId=${user.userId}`
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

  useEffect(() => {
    refreshGroupAssignments();
  }, [refreshGroupAssignments]);

  const handleLogout = () => {
    setWorkspaceReady(false);
    teamLoadedKeyRef.current = null;
    teamLoadIdRef.current++;
    loadedWorkspaceKeyRef.current = null;
    workPlanRef.current = { rows: [], choices: {}, key: null };
    setPendingWork([]);
    setMapInitialized(false);
    setUser(null);
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
    setActionType(type);
    go('fieldAction');
  };

  const openWorkspaceMap = () => {
    go('mapDirect');
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
                'main',
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

        {screen === 'main' && (
          <MainScreen
            user={user}
            activeGroup={activeGroup}
            availableGroups={availableGroups}
            groupAssignments={groupAssignments}
            onRoute={openWorkspaceMap}
            onReport={() =>
              go('reportList')
            }
            onGroup={() =>
              go('groupHome')
            }
            onSelectWorkspace={(group) => selectActiveGroup(group)}
            onRefreshWorkspaces={refreshAvailableGroups}
            onWorkStatus={() =>
              go('workStatus')
            }
            onDashboard={() =>
              go('dashboard')
            }
            onSettings={() =>
              go('settings')
            }
            onPublicData={() =>
              go('publicDataAssignment')
            }
            locations={routeLocations}
            setLocations={setRouteLocations}
            onRefreshAssignments={refreshCurrentWorkspace}
            pendingWork={pendingWork}
            onAddWork={addWorkToMap}
          />
        )}

        {screen === 'groupHome' && (
          <GroupScreen
            user={user}
            activeGroup={activeGroup}
            onBack={() =>
              go('main')
            }
            onCreate={() =>
              go('groupCreate')
            }
            onInvitations={() =>
              go('groupInvitations')
            }
            onOpenGroup={(group) => {
              rememberAvailableGroup(group);
              selectActiveGroup(group);
              go(isPersonalGroup(group) ? 'main' : 'groupDetail');
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
              go('groupDetail');
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
              go('groupDetail');
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
              onAssign={(group) => {
                selectActiveGroup(group);
                go('assignment');
              }}
              onTeamLocations={(group) => {
                selectActiveGroup(group);
                loadTeamLocations(group);
                go('teamLocations');
              }}
              onPublicData={(group) => {
                selectActiveGroup(group);
                go('publicDataAssignment');
              }}
            />
          )}

        {screen === 'publicDataAssignment' && activeGroup && (
          <MapScreen
            user={user}
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
              onBack={() => goBack('main')}
              onRefresh={refreshCurrentWorkspace}
            />
          )}

        {screen === 'dashboard' && (
          <DashboardScreen
            user={user}
            activeGroup={activeGroup}
            onBack={() => goBack('main')}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            user={user}
            activeGroup={activeGroup}
            onBack={() => goBack('main')}
            onUpdatedUser={setUser}
            onDashboard={() => go('dashboard')}
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
              locations={routeLocations}
              setLocations={
                setRouteLocations
              }
              previewMarkers={leaderMapMarkers}
              previewOnlyRegistrations={Boolean(activeGroup && !isPersonalGroup(activeGroup))}
              activeGroup={activeGroup}
              locationScope={!activeGroup || isPersonalGroup(activeGroup) ? 'personal' : 'team'}
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
            />
          </View>
        )}

        {screen === 'fieldAction' && (
          <FieldActionScreen
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
                        status: savedReport.progressStatus || loc.status,
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
              setActionType('report');
              go('fieldAction');
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
              goBack('main')
            }
            downloadInfo={
              downloadInfo
            }
          />
        )}

        </View>

        {user &&
          !['login', 'register', 'dashboard', 'settings'].includes(screen) && (
            <BottomNavigation
              screen={screen}
              onHome={() => go('main')}
              // 하단 메뉴도 홈에서 선택한 현재 작업공간을 그대로 따른다.
              onMap={openWorkspaceMap}
              onReport={() => go('reportList')}
              onGroup={() => go('groupHome')}
            />
          )}

        <CustomAlertHost />
      </View>
    </SafeAreaView>
  );
}


function BottomNavigation({
  screen,
  onHome,
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
          'assignment',
        ].includes(screen)
      ? 'group'
      : 'home';

  return (
    <View style={styles.bottomNav}>
      <BottomNavItem
        icon={
          activeTab === 'home'
            ? 'home'
            : 'home-outline'
        }
        label="홈"
        active={activeTab === 'home'}
        onPress={onHome}
      />

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
