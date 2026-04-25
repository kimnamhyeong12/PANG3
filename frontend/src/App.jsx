import { useState } from "react";

import Phone from "./components/Phone";
import Login from "./pages/Login";
import Main from "./pages/Main";
import Dashboard from "./pages/Dashboard";
import KakaoMap from "./components/KakaoMap";

import {
  FieldActionScreen,
} from "./pages/Fieldwork";

import {
  ReportScreen,
  DownloadScreen,
} from "./pages/Report";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [selLoc, setSelLoc] = useState(null);
  const [actType, setActType] = useState(null);
  const [routeLocations, setRouteLocations] = useState([]);

  const go = (s) => setScreen(s);

  const onLocClick = (loc, type) => {
    setSelLoc(loc);
    setActType(type);
    go("fieldAction");
  };

  return (
    <Phone>
      {screen === "login" && <Login onLogin={() => go("main")} />}

      {screen === "main" && (
        <div className="relative h-full">
          <Main
            onRoute={() => go("mapDirect")}
            onReport={() => go("report")}
            onDashboard={() => go("dashboard")}
          />
        </div>
      )}

      {screen === "dashboard" && (
        <Dashboard onBack={() => go("main")} />
      )}

      {screen === "mapDirect" && (
        <div className="h-full">
          <KakaoMap
            onLocationClick={onLocClick}
            locations={routeLocations}
            setLocations={setRouteLocations}
          />
        </div>
      )}

      {screen === "fieldAction" && (
        <FieldActionScreen
          location={selLoc}
          actionType={actType}
          onBack={() => go("mapDirect")}
          onSave={() => go("report")}
        />
      )}

      {screen === "report" && (
        <ReportScreen
          onBack={() => go("main")}
          onDownload={() => go("download")}
        />
      )}

      {screen === "download" && (
        <DownloadScreen onBack={() => go("main")} />
      )}
    </Phone>
  );
}