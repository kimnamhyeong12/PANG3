import { useState } from "react";

import Phone from "./components/Phone";
import Login from "./pages/Login";
import Main from "./pages/Main";
import Dashboard from "./pages/Dashboard";
import RouteSelectSheet from "./components/RouteSelectSheet";

import {
  UploadFlowScreen,
  MapScreen,
  FieldActionScreen,
} from "./pages/Fieldwork";

import {
  ReportScreen,
  DownloadScreen,
} from "./pages/Report";

import { LOCATIONS } from "./data/mockData";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [showRouteSheet, setShowRouteSheet] = useState(false);
  const [selLoc, setSelLoc] = useState(null);
  const [actType, setActType] = useState(null);
  const [markers, setMarkers] = useState([]);

  const go = (s) => setScreen(s);

  const onLocClick = (loc, type) => {
    setSelLoc(loc);
    setActType(type);
    go("fieldAction");
  };

  const openRouteSheet = () => setShowRouteSheet(true);
  const closeRouteSheet = () => setShowRouteSheet(false);

  return (
    <Phone>
      {screen === "login" && <Login onLogin={() => go("main")} />}

      {screen === "main" && (
        <div className="relative h-full">
          <Main
            onRoute={openRouteSheet}
            onReport={() => go("report")}
            onDashboard={() => go("dashboard")}
          />

          {showRouteSheet && (
            <RouteSelectSheet
              onClose={closeRouteSheet}
              onDirect={() => {
                closeRouteSheet();
                go("mapDirect");
              }}
              onUpload={() => {
                closeRouteSheet();
                go("uploadFlow");
              }}
            />
          )}
        </div>
      )}

      {screen === "dashboard" && <Dashboard onBack={() => go("main")} />}

      {screen === "uploadFlow" && (
        <UploadFlowScreen
          onBack={() => {
            go("main");
            openRouteSheet();
          }}
          onComplete={(mkrs) => {
            setMarkers(mkrs);
            go("map");
          }}
        />
      )}

      {screen === "mapDirect" && (
        <MapScreen
          onBack={() => {
            go("main");
            openRouteSheet();
          }}
          onLocationClick={onLocClick}
          markers={LOCATIONS}
          fromDirect
        />
      )}

      {screen === "map" && (
        <MapScreen
          onBack={() => {
            go("main");
            openRouteSheet();
          }}
          onLocationClick={onLocClick}
          markers={markers.length > 0 ? markers : LOCATIONS}
        />
      )}

      {screen === "fieldAction" && (
        <FieldActionScreen
          location={selLoc}
          actionType={actType}
          onBack={() => go("map")}
          onSave={() => go("report")}
        />
      )}

      {screen === "report" && (
        <ReportScreen
          onBack={() => go("main")}
          onDownload={() => go("download")}
        />
      )}

      {screen === "download" && <DownloadScreen onBack={() => go("main")} />}
    </Phone>
  );
}