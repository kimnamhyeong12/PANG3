import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';

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
import { groupApi } from './utils/groupApi';

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

  const [activeGroup, setActiveGroup] = useState(null);
  const [groupAssignments, setGroupAssignments] = useState([]);

  const go = (next) => setScreen(next);

  const refreshGroupAssignments = useCallback(async () => {
    if (!activeGroup?.groupId || !user?.userId) {
      setGroupAssignments([]);
      return;
    }

    try {
      const data = await groupApi(
        `/api/groups/${activeGroup.groupId}/assignments?userId=${user.userId}`
      );
      setGroupAssignments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('그룹 담당자 조회 실패:', error.message);
      setGroupAssignments([]);
    }
  }, [activeGroup?.groupId, user?.userId]);

  useEffect(() => {
    refreshGroupAssignments();
  }, [refreshGroupAssignments]);

  const onLocationClick = (loc, type) => {
    setSelectedLocation(loc);
    setActionType(type);
    go('fieldAction');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {screen === 'login' && (
        <LoginScreen
          onLogin={(loginUser) => {
            setUser(loginUser);
            setActiveGroup(null);
            setGroupAssignments([]);
            go('main');
          }}
          onRegister={() => go('register')}
        />
      )}

      {screen === 'register' && (
        <RegisterScreen onBack={() => go('login')} />
      )}

      {screen === 'main' && (
        <MainScreen
          user={user}
          activeGroup={activeGroup}
          onRoute={() => go('mapDirect')}
          onReport={() => go('reportList')}
          onGroup={() => go('groupHome')}
          onDashboard={() => go('dashboard')}
          locations={routeLocations}
          setLocations={setRouteLocations}
        />
      )}

      {screen === 'groupHome' && (
        <GroupScreen
          user={user}
          activeGroup={activeGroup}
          onBack={() => go('main')}
          onCreate={() => go('groupCreate')}
          onInvitations={() => go('groupInvitations')}
          onOpenGroup={(group) => {
            setActiveGroup(group);
            go('groupDetail');
          }}
        />
      )}

      {screen === 'groupCreate' && (
        <GroupCreateScreen
          user={user}
          onBack={() => go('groupHome')}
          onCreated={(group) => {
            setActiveGroup(group);
            go('groupDetail');
          }}
        />
      )}

      {screen === 'groupInvitations' && (
        <GroupInvitationsScreen
          user={user}
          onBack={() => go('groupHome')}
          onAccepted={(group) => {
            setActiveGroup(group);
            go('groupDetail');
          }}
        />
      )}

      {screen === 'groupDetail' && activeGroup && (
        <GroupDetailScreen
          user={user}
          group={activeGroup}
          onBack={() => go('groupHome')}
          onUpdatedGroup={(group) => setActiveGroup(group)}
          onAssign={(group) => {
            setActiveGroup(group);
            go('assignment');
          }}
        />
      )}

      {screen === 'assignment' && activeGroup && (
        <AssignmentScreen
          user={user}
          group={activeGroup}
          onBack={() => {
            refreshGroupAssignments();
            go('groupDetail');
          }}
          onChanged={refreshGroupAssignments}
        />
      )}

      {screen === 'dashboard' && (
        <DashboardScreen onBack={() => go('main')} />
      )}

      {screen === 'mapDirect' && (
        <MapScreen
          locations={routeLocations}
          setLocations={setRouteLocations}
          activeGroup={activeGroup}
          groupAssignments={groupAssignments}
          onBack={() => go('main')}
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

      {screen === 'fieldAction' && (
        <FieldActionScreen
          location={selectedLocation}
          actionType={actionType}
          onBack={() => go('reportList')}
          onSave={(savedReport) => {
            setRouteLocations((prev) =>
              prev.map((loc) =>
                loc.id === selectedLocation?.id
                  ? {
                      ...loc,
                      status: savedReport.progressStatus || loc.status,
                    }
                  : loc
              )
            );

            go('reportList');
          }}
        />
      )}

      {screen === 'reportList' && (
        <ReportListScreen
          locations={routeLocations}
          activeGroup={activeGroup}
          groupAssignments={groupAssignments}
          onBack={() => go('mapDirect')}
          onSelectLocation={(loc) => {
            setSelectedLocation(loc);
            setActionType('report');
            go('fieldAction');
          }}
          onCreateReport={(selectedLocations) => {
            setReportTargets(selectedLocations);
            go('report');
          }}
        />
      )}

      {screen === 'report' && (
        <ReportScreen
          locations={reportTargets}
          onBack={() => go('reportList')}
          onDownload={(info) => {
            setDownloadInfo(info);
            go('download');
          }}
        />
      )}

      {screen === 'download' && (
        <DownloadScreen
          onBack={() => go('main')}
          downloadInfo={downloadInfo}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F4F7FA',
  },
});
