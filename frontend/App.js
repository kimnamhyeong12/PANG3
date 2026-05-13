import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';

import LoginScreen from './screens/LoginScreen';
import MainScreen from './screens/MainScreen';
import DashboardScreen from './screens/DashboardScreen';
import MapScreen from './screens/MapScreen';
import FieldActionScreen from './screens/FieldActionScreen';
import ReportScreen from './screens/ReportScreen';
import DownloadScreen from './screens/DownloadScreen';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [actionType, setActionType] = useState(null);

  // 오늘 외근 경로에 들어갈 방문지 목록
  const [routeLocations, setRouteLocations] = useState([]);

  const go = (next) => setScreen(next);

  const onLocationClick = (loc, type) => {
    setSelectedLocation(loc);
    setActionType(type);
    go('fieldAction');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {screen === 'login' && (
        <LoginScreen onLogin={() => go('main')} />
      )}

      {screen === 'main' && (
        <MainScreen
          onRoute={() => go('mapDirect')}
          onReport={() => go('report')}
          onDashboard={() => go('dashboard')}
          locations={routeLocations}
          setLocations={setRouteLocations}
        />
      )}

      {screen === 'dashboard' && (
        <DashboardScreen onBack={() => go('main')} />
      )}

      {screen === 'mapDirect' && (
        <MapScreen
          locations={routeLocations}
          setLocations={setRouteLocations}
          onBack={() => go('main')}
          onLocationClick={onLocationClick}
        />
      )}

      {screen === 'fieldAction' && (
        <FieldActionScreen
          location={selectedLocation}
          actionType={actionType}
          onBack={() => go('mapDirect')}
          onSave={() => go('report')}
        />
      )}

      {screen === 'report' && (
        <ReportScreen
          onBack={() => go('main')}
          onDownload={() => go('download')}
        />
      )}

      {screen === 'download' && (
        <DownloadScreen onBack={() => go('main')} />
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