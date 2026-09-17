import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
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
import PublicDataAssignmentScreen from './screens/PublicDataAssignmentScreen';
import { groupApi } from './utils/groupApi';
import { CustomAlertHost } from './components/CustomAlert';
import { colors } from './constants/design';

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

  // 팀 방문지 지도는 개인 지도와 경로 상태를 완전히 분리한다.
  // 그룹 화면에서 팀 방문지 관리를 열어도 개인 경로가 사라지지 않는다.
  const [teamRoadPath, setTeamRoadPath] = useState([]);
  const [teamRouteSegments, setTeamRouteSegments] = useState([]);
  const [teamCurrentSegmentIndex, setTeamCurrentSegmentIndex] = useState(0);
  const [teamOptimized, setTeamOptimized] = useState(false);
  const [teamIsGuiding, setTeamIsGuiding] = useState(false);
  const [teamTotalDuration, setTeamTotalDuration] = useState(null);
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);

  const selectActiveGroup = useCallback(async (group, targetUser = user) => {
    setActiveGroup(group || null);
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
  }, [user]);

  const restoreActiveGroup = useCallback(async (loginUser) => {
    if (!loginUser?.userId) return;

    try {
      const groups = await groupApi(`/api/groups/user/${loginUser.userId}`);

      const groupList = Array.isArray(groups) ? groups : [];
      setAvailableGroups(groupList);
      // 로그인할 때는 로그인 아이디 이름의 자동 1인 그룹이 기본 작업공간이다.
      const selected = groupList.find(isPersonalGroup) || groupList[0] || null;

      setActiveGroup(selected);

      await AsyncStorage.setItem(
        `pang3_active_group_${loginUser.userId}`,
        selected?.groupId ? String(selected.groupId) : ''
      );
    } catch (error) {
      console.log('현재 그룹 복원 실패:', error);
      setAvailableGroups([]);
      setActiveGroup(null);
    }
  }, []);

  const go = (next, options = {}) => {
    if (next === screenRef.current) return;

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

    if (!user?.userId) {
      setRouteLocations([]);
      setTodayLocationsLoaded(false);
      return;
    }

    const cacheKey = workspaceCacheKey();
    setTodayLocationsLoaded(false);
    setRouteLocations([]);

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
      const todayRows = rows.filter(isTodayWork);
      if (requestId !== workspaceLoadIdRef.current) return;
      setRouteLocations(todayRows);

      if (cacheKey) {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(todayRows));
      }
    } catch (error) {
      console.log('현재 작업공간 방문지 조회 실패:', error);

      // 네트워크가 잠시 끊겼을 때만 마지막 DB 조회 결과를 임시로 보여준다.
      try {
        const cached = cacheKey ? await AsyncStorage.getItem(cacheKey) : null;
        const parsed = cached ? JSON.parse(cached) : [];
        if (requestId !== workspaceLoadIdRef.current) return;
        setRouteLocations(
          Array.isArray(parsed) ? parsed.filter(isTodayWork) : []
        );
      } catch {
        if (requestId !== workspaceLoadIdRef.current) return;
        setRouteLocations([]);
      }
    } finally {
      if (requestId === workspaceLoadIdRef.current) {
        setTodayLocationsLoaded(true);
      }
    }
  }, [activeGroup?.groupId, user?.userId, workspaceCacheKey, calendarDayKey]);

  useEffect(() => {
    loadWorkspaceLocations();
  }, [loadWorkspaceLocations]);

  useEffect(() => {
    if (!todayLocationsLoaded) return;
    const cacheKey = workspaceCacheKey();
    if (!cacheKey) return;

    AsyncStorage.setItem(cacheKey, JSON.stringify(routeLocations)).catch((error) => {
      console.log('작업공간 방문지 캐시 저장 실패:', error);
    });
  }, [routeLocations, todayLocationsLoaded, workspaceCacheKey]);

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
    if (!group?.groupId || !user?.userId) {
      setTeamLocations([]);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/locations/group/${group.groupId}?userId=${user.userId}`
      );
      const text = await response.text();
      if (!response.ok) throw new Error(text || '팀 방문지 조회 실패');
      const data = JSON.parse(text);
      setTeamLocations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('팀 방문지 조회 실패:', error);
      setTeamLocations([]);
    }
  }, [activeGroup, user?.userId]);

  useEffect(() => {
    refreshGroupAssignments();
  }, [refreshGroupAssignments]);

  const handleLogout = () => {
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
            locations={routeLocations}
            setLocations={setRouteLocations}
            onRefreshAssignments={refreshGroupAssignments}
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
              onUpdatedGroup={(group) =>
                selectActiveGroup(group)
              }
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
          <PublicDataAssignmentScreen
            user={user}
            group={activeGroup}
            onBack={() => goBack('groupDetail')}
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
              refreshGroupAssignments();
              go('groupDetail');
            }}
            onLocationClick={onLocationClick}
            onDataChanged={refreshGroupAssignments}
            roadPath={teamRoadPath}
            setRoadPath={setTeamRoadPath}
            routeSegments={teamRouteSegments}
            setRouteSegments={setTeamRouteSegments}
            currentSegmentIndex={teamCurrentSegmentIndex}
            setCurrentSegmentIndex={setTeamCurrentSegmentIndex}
            optimized={teamOptimized}
            setOptimized={setTeamOptimized}
            isGuiding={teamIsGuiding}
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
                refreshGroupAssignments();
                go('groupDetail');
              }}
              onChanged={
                refreshGroupAssignments
              }
            />
          )}

        {screen === 'workStatus' &&
          activeGroup && (
            <WorkStatusScreen
              user={user}
              group={activeGroup}
              assignments={groupAssignments}
              onBack={() => goBack('main')}
              onRefresh={refreshGroupAssignments}
            />
          )}

        {screen === 'dashboard' && (
          <DashboardScreen
            user={user}
            activeGroup={activeGroup}
            onBack={() => goBack('main')}
            onLogout={handleLogout}
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

        {screen === 'mapDirect' && (
          <MapScreen
            user={user}
            locations={routeLocations}
            setLocations={
              setRouteLocations
            }
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
              refreshGroupAssignments();
              loadWorkspaceLocations();
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
          />
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
              refreshGroupAssignments();

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
          !['login', 'register', 'dashboard', 'settings', 'publicDataAssignment'].includes(screen) && (
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
    screen === 'teamLocations'
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
          'publicDataAssignment',
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
  },

  bottomNav: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    elevation: 12,
    shadowColor: '#163126',
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
