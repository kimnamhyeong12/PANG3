import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, PanResponder, Platform, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
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
  const TODAY_LOCATIONS_KEY = 'pang3_today_route_locations';

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
    const restoreTodayLocations = async () => {
      try {
        const saved = await AsyncStorage.getItem(TODAY_LOCATIONS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRouteLocations(parsed);
        }
      } catch (error) {
        console.log('오늘 외근 복원 실패:', error);
      } finally {
        setTodayLocationsLoaded(true);
      }
    };
    restoreTodayLocations();
  }, []);

  useEffect(() => {
    if (!todayLocationsLoaded) return;
    AsyncStorage.setItem(TODAY_LOCATIONS_KEY, JSON.stringify(routeLocations)).catch((error) => {
      console.log('오늘 외근 저장 실패:', error);
    });
  }, [routeLocations, todayLocationsLoaded]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'login') return false;
      goBack(screen === 'register' ? 'login' : 'main');
      return true;
    });
    return () => subscription.remove();
  }, [screen]);

  const swipeBackResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) =>
        Platform.OS === 'ios' &&
        screenRef.current !== 'login' &&
        evt.nativeEvent.pageX - gestureState.dx <= 28 &&
        gestureState.dx > 18 &&
        Math.abs(gestureState.dy) < 35,
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dx > 70 && Math.abs(gestureState.dy) < 80) {
          goBack('main');
        }
      },
    })
  ).current;

  const onLocationClick = (loc, type) => {
    setSelectedLocation(loc);
    setActionType(type);
    go('fieldAction');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.app} {...swipeBackResponder.panHandlers}>
      <StatusBar barStyle="dark-content" />

      {screen === 'login' && (
        <LoginScreen
          onLogin={(loginUser) => {
            setUser(loginUser);
            historyRef.current = [];
            go('main', { replace: true });
          }}
          onRegister={() => go('register')}
        />
      )}

      {screen === 'register' && (
        <RegisterScreen onBack={() => goBack('login')} />
      )}

      {screen === 'main' && (
        <MainScreen
          onRoute={() => go('mapDirect')}
          onReport={() => go('reportList')}
          onDashboard={() => go('dashboard')}
          locations={routeLocations}
          setLocations={setRouteLocations}
        />
      )}

      {screen === 'dashboard' && (
        <DashboardScreen onBack={() => goBack('main')} />
      )}

      {screen === 'mapDirect' && (
        <MapScreen
          locations={routeLocations}
          setLocations={setRouteLocations}
          onBack={() => goBack('main')}
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
          onBack={() => goBack('reportList')}
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

            goBack('reportList');
          }}
        />
      )}

      {screen === 'reportList' && (
        <ReportListScreen
          locations={routeLocations}
          onBack={() => goBack('mapDirect')}
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
          onBack={() => goBack('reportList')}
          onDownload={(info) => {
            setDownloadInfo(info);
            go('download');
          }}
        />
      )}

      {screen === 'download' && (
        <DownloadScreen
          onBack={() => goBack('main')}
          downloadInfo={downloadInfo}
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