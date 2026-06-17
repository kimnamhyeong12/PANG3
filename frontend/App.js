import React, { useState } from 'react';
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
        <LoginScreen
          onLogin={(loginUser) => {
            setUser(loginUser);
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
          onRoute={() => go('mapDirect')}
          onReport={() => go('reportList')}
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