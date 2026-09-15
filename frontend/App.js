import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import { groupApi } from './utils/groupApi';
import { CustomAlertHost } from './components/CustomAlert';

export default function App() {
  const [screen, setScreen] = useState('login');
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

  const [todayLocationsLoaded, setTodayLocationsLoaded] = useState(false);

  const TODAY_LOCATIONS_KEY_PREFIX = 'pang3_today_route_locations';

  const [activeGroup, setActiveGroup] = useState(null);
  const [groupAssignments, setGroupAssignments] = useState([]);
  const [teamLocations, setTeamLocations] = useState([]);

  const selectActiveGroup = useCallback(async (group, targetUser = user) => {
    setActiveGroup(group || null);

    if (group?.groupId && targetUser?.userId) {
      try {
        await AsyncStorage.setItem(
          `pang3_active_group_${targetUser.userId}`,
          String(group.groupId)
        );
      } catch (error) {
        console.log('현재 그룹 저장 실패:', error);
      }
    }
  }, [user]);

  const restoreActiveGroup = useCallback(async (loginUser) => {
    if (!loginUser?.userId) return;

    try {
      const [groups, savedGroupId] = await Promise.all([
        groupApi(`/api/groups/user/${loginUser.userId}`),
        AsyncStorage.getItem(`pang3_active_group_${loginUser.userId}`),
      ]);

      const groupList = Array.isArray(groups) ? groups : [];
      const restored = groupList.find(
        (group) => Number(group.groupId) === Number(savedGroupId)
      );
      const selected = restored || groupList[0] || null;

      setActiveGroup(selected);

      if (selected?.groupId) {
        await AsyncStorage.setItem(
          `pang3_active_group_${loginUser.userId}`,
          String(selected.groupId)
        );
      }
    } catch (error) {
      console.log('현재 그룹 복원 실패:', error);
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

  useEffect(() => {
    let cancelled = false;

    const restoreTodayLocations = async () => {
      if (!user?.userId) {
        setRouteLocations([]);
        setTodayLocationsLoaded(false);
        return;
      }

      setTodayLocationsLoaded(false);
      setRouteLocations([]);

      try {
        const saved = await AsyncStorage.getItem(
          `${TODAY_LOCATIONS_KEY_PREFIX}_${user.userId}`
        );

        if (saved) {
          const parsed = JSON.parse(saved);

          if (Array.isArray(parsed)) {
            if (!cancelled) setRouteLocations(parsed);
          }
        }
      } catch (error) {
        console.log('오늘 외근 복원 실패:', error);
      } finally {
        if (!cancelled) setTodayLocationsLoaded(true);
      }
    };

    restoreTodayLocations();

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  useEffect(() => {
    if (!todayLocationsLoaded || !user?.userId) return;

    AsyncStorage.setItem(
      `${TODAY_LOCATIONS_KEY_PREFIX}_${user.userId}`,
      JSON.stringify(routeLocations)
    ).catch((error) => {
      console.log('오늘 외근 저장 실패:', error);
    });
  }, [routeLocations, todayLocationsLoaded, user?.userId]);

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

  return (
    <SafeAreaView style={styles.safe}>
      <View
        style={styles.app}
        {...swipeBackResponder.panHandlers}
      >
        <StatusBar barStyle="dark-content" />

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
            groupAssignments={groupAssignments}
            onRoute={() =>
              go('mapDirect')
            }
            onReport={() =>
              go('reportList')
            }
            onGroup={() =>
              go('groupHome')
            }
            onWorkStatus={() =>
              go('workStatus')
            }
            onDashboard={() =>
              go('dashboard')
            }
            locations={routeLocations}
            setLocations={setRouteLocations}
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
              selectActiveGroup(group);
              go('groupDetail');
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
                setRoadPath([]);
                setRouteSegments([]);
                setCurrentSegmentIndex(0);
                setOptimized(false);
                setIsGuiding(false);
                loadTeamLocations(group);
                go('teamLocations');
              }}
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
            onReportPress={() => go('reportList')}
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

        {screen === 'mapDirect' && (
          <MapScreen
            user={user}
            locations={routeLocations}
            setLocations={
              setRouteLocations
            }
            activeGroup={activeGroup}
            locationScope="personal"
            groupAssignments={
              groupAssignments
            }
            onBack={() =>
              goBack('main')
            }
            onLocationClick={
              onLocationClick
            }
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
            onReportPress={() =>
              go('reportList')
            }
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
              setRouteLocations(
                (prev) =>
                  prev.map((loc) =>
                    loc.id ===
                      selectedLocation?.id
                      ? {
                        ...loc,
                        status:
                          savedReport.progressStatus ||
                          loc.status,
                      }
                      : loc
                  )
              );

              goBack('reportList');
            }}
          />
        )}

        {screen === 'reportList' && (
          <ReportListScreen
            locations={routeLocations}
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

        <CustomAlertHost />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F4F7FA',
  },

  app: {
    flex: 1,
  },
});
