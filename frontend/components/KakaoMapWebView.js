import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const KAKAO_REST_API_KEY =
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

const KAKAO_JAVASCRIPT_KEY =
  process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY ||
  process.env.EXPO_PUBLIC_KAKAO_MAP_API_KEY;

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL;

/*
 * 목적지 접근 판정 거리
 * 100m 이내에 들어오면
 * - 목적지 파동 표시
 * - 최초 1회 도착 알림 표시
 */
const ARRIVAL_DISTANCE_METERS = 100;

/*
 * 현재 위치 버튼을 눌렀을 때 사용할 카카오맵 확대 레벨
 * 숫자가 작을수록 확대됨.
 */
const MY_LOCATION_LEVEL = 5;

const getMarkerColorByStatus = (status) => {
  if (status === "complete") {
    return "#1F9D55";
  }

  if (status === "working") {
    return "#FACC15";
  }

  return "#E74C3C";
};

/*
 * WebView 안에서 실행되는 카카오맵 HTML.
 *
 * 중요한 점:
 * DEFAULT_REGION을 사용하지 않는다.
 * 처음 획득한 실제 GPS 좌표를 center로 사용한다.
 *
 * 따라서:
 *
 * 화면 진입
 * → GPS 획득
 * → 이 HTML 생성
 * → 현재 위치를 중심으로 지도 생성
 *
 * 순서가 된다.
 */
const buildKakaoMapHtml = (
  initialLatitude,
  initialLongitude
) => {
  return `
<!doctype html>
<html>
<head>
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
/>

<style>
  html,
  body,
  #map {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  body {
    background: #EAF1F7;
  }

  /*
   * ===============================
   * 일반 방문지 마커
   * ===============================
   */

  .marker-wrap {
    position: relative;
    width: 46px;
    height: 46px;

    display: flex;
    align-items: center;
    justify-content: center;

    overflow: visible;
    cursor: pointer;
  }

  .marker {
    position: relative;

    width: 30px;
    height: 30px;

    border-radius: 50%;

    /*
     * 기존의 기본 흰 테두리는 유지.
     * 현재 목적지 검은 테두리는 사용하지 않는다.
     */
    border: 2px solid #FFFFFF;

    box-sizing: border-box;

    color: #FFFFFF;

    font-family: Arial, sans-serif;
    font-size: 13px;
    font-weight: 700;
    line-height: 26px;
    text-align: center;

    box-shadow:
      0 2px 7px rgba(0, 0, 0, 0.28);

    z-index: 5;
  }

  /*
   * ===============================
   * 목적지 접근 파동
   * ===============================
   *
   * 현재 안내 목적지의 100m 이내에서만
   * React Native가 pulse=true를 보내므로
   * 이 파동이 표시된다.
   */

  .destination-wave {
    position: absolute;

    left: 8px;
    top: 8px;

    width: 30px;
    height: 30px;

    border-radius: 50%;

    background:
      rgba(0, 81, 255, 0.9);

    opacity: 0;

    pointer-events: none;

    z-index: 1;
  }

  .marker-wrap.near .destination-wave.wave-one {
    animation:
      destinationWave 2s ease-out infinite;
  }

  .marker-wrap.near .destination-wave.wave-two {
    animation:
      destinationWave 2s ease-out infinite;

    animation-delay: 1s;
  }

  @keyframes destinationWave {
    0% {
      transform: scale(0.85);
      opacity: 0.55;
    }

    60% {
      opacity: 0.2;
    }

    100% {
      transform: scale(2.1);
      opacity: 0;
    }
  }

  /*
   * ===============================
   * 지도에서 직접 선택한 위치
   * ===============================
   */

  .selected-location {
    width: 20px;
    height: 20px;

    border-radius: 50%;

    background: #1F9D55;

    border: 3px solid #FFFFFF;

    box-shadow:
      0 2px 7px rgba(0, 0, 0, 0.3);
  }

  /*
   * ===============================
   * 현재 GPS 위치
   * ===============================
   *
   * 이전보다 작은 크기.
   *
   * 파란 점 + 흰 테두리 + 아주 옅은 범위 표시.
   * 목적지 파동과는 별개다.
   */

  .user-location {
    position: relative;

    width: 34px;
    height: 34px;

    pointer-events: none;
  }

  .user-location-halo {
    position: absolute;

    left: 3px;
    top: 3px;

    width: 28px;
    height: 28px;

    border-radius: 50%;

    background:
      rgba(66, 133, 244, 0.16);
  }

  .user-location-ring {
    position: absolute;

    left: 9px;
    top: 9px;

    width: 16px;
    height: 16px;

    border-radius: 50%;

    background: #FFFFFF;

    box-shadow:
      0 1px 4px rgba(0, 0, 0, 0.28);

    z-index: 2;
  }

  .user-location-dot {
    position: absolute;

    left: 12px;
    top: 12px;

    width: 10px;
    height: 10px;

    border-radius: 50%;

    background: #4285F4;

    z-index: 3;
  }
</style>

<script
  src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JAVASCRIPT_KEY}&autoload=false">
</script>
</head>

<body>
<div id="map"></div>

<script>
(function () {
  var map = null;

  var locationOverlays = [];
  var selectedOverlay = null;

  var roadLine = null;
  var activeLine = null;

  var userLocationOverlay = null;
  var userLocationElement = null;

  var ready = false;

  var queuedCommands = [];

  /*
   * React Native로 메시지를 보낸다.
   */
  function post(data) {
    if (!window.ReactNativeWebView) {
      return;
    }

    window.ReactNativeWebView.postMessage(
      JSON.stringify(data)
    );
  }

  /*
   * 여러 종류의 좌표 객체를
   * Kakao LatLng로 변환.
   */
  function toLatLng(point) {
    var latitude =
      point.latitude != null
        ? point.latitude
        : point.lat != null
          ? point.lat
          : point.y;

    var longitude =
      point.longitude != null
        ? point.longitude
        : point.lng != null
          ? point.lng
          : point.x;

    return new window.kakao.maps.LatLng(
      Number(latitude),
      Number(longitude)
    );
  }

  /*
   * 방문지 / 선택 위치 / 경로만 제거한다.
   *
   * 현재 위치 Overlay는 유지해서
   * GPS 갱신 때마다 새로 만들지 않는다.
   */
  function clearMapData() {
    locationOverlays.forEach(function (overlay) {
      overlay.setMap(null);
    });

    locationOverlays = [];

    if (selectedOverlay) {
      selectedOverlay.setMap(null);
      selectedOverlay = null;
    }

    if (roadLine) {
      roadLine.setMap(null);
      roadLine = null;
    }

    if (activeLine) {
      activeLine.setMap(null);
      activeLine = null;
    }
  }

  /*
   * 방문지 번호 마커 생성.
   *
   * current라는 별도 스타일은 없다.
   * 즉 현재 목적지여도 검은 테두리가 생기지 않는다.
   *
   * pulse가 true일 때만
   * 파동이 생긴다.
   */
  function createMarkerElement(
    index,
    color,
    pulse
  ) {
    var wrapper =
      document.createElement("div");

    wrapper.className =
      "marker-wrap" +
      (pulse ? " near" : "");

    var waveOne =
      document.createElement("div");

    waveOne.className =
      "destination-wave wave-one";

    var waveTwo =
      document.createElement("div");

    waveTwo.className =
      "destination-wave wave-two";

    var marker =
      document.createElement("div");

    marker.className =
      "marker";

    marker.style.background =
      color || "#E74C3C";

    marker.innerText =
      String(index + 1);

    wrapper.appendChild(waveOne);
    wrapper.appendChild(waveTwo);
    wrapper.appendChild(marker);

    return wrapper;
  }

  /*
   * 현재 GPS 위치 Overlay 최초 생성.
   */
  function createUserLocationOverlay(position) {
    userLocationElement =
      document.createElement("div");

    userLocationElement.className =
      "user-location";

    userLocationElement.innerHTML =
      '<div class="user-location-halo"></div>' +
      '<div class="user-location-ring"></div>' +
      '<div class="user-location-dot"></div>';

    userLocationOverlay =
      new window.kakao.maps.CustomOverlay({
        position: position,
        content: userLocationElement,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 200
      });

    userLocationOverlay.setMap(map);
  }

  /*
   * GPS 위치 마커 갱신.
   *
   * 지도의 중심은 자동으로 움직이지 않는다.
   * 사용자 위치 점만 이동한다.
   */
  function updateCurrentLocation(
    latitude,
    longitude
  ) {
    if (!map) {
      return;
    }

    var position =
      new window.kakao.maps.LatLng(
        Number(latitude),
        Number(longitude)
      );

    if (!userLocationOverlay) {
      createUserLocationOverlay(position);
      return;
    }

    userLocationOverlay.setPosition(position);
  }

  /*
   * 현재위치 버튼을 눌렀을 때.
   *
   * 새 GPS 요청을 하지 않는다.
   * React Native에 이미 저장되어 있는
   * 최신 좌표를 받아서 즉시 이동한다.
   */
  function moveToCurrentLocation(
    latitude,
    longitude,
    level
  ) {
    if (!map) {
      return;
    }

    var position =
      new window.kakao.maps.LatLng(
        Number(latitude),
        Number(longitude)
      );

    updateCurrentLocation(
      latitude,
      longitude
    );

    map.setLevel(
      Number(level) || ${MY_LOCATION_LEVEL},
      {
        animate: false
      }
    );

    map.setCenter(position);
  }

  /*
   * 특정 위치로 이동.
   */
  function moveToPosition(
    latitude,
    longitude,
    level
  ) {
    if (!map) {
      return;
    }

    var position =
      new window.kakao.maps.LatLng(
        Number(latitude),
        Number(longitude)
      );

    if (level != null) {
      map.setLevel(
        Number(level),
        {
          animate: true
        }
      );
    }

    map.panTo(position);
  }

  /*
   * 여러 좌표가 모두 보이도록 화면 맞춤.
   */
  function fitCoordinates(coordinates) {
    if (
      !map ||
      !coordinates ||
      coordinates.length === 0
    ) {
      return;
    }

    var bounds =
      new window.kakao.maps.LatLngBounds();

    coordinates.forEach(function (point) {
      bounds.extend(
        toLatLng(point)
      );
    });

    map.setBounds(
      bounds,
      40,
      40,
      40,
      40
    );
  }

  /*
   * React Native의 상태를 지도에 반영.
   */
  function setMapData(data) {
    if (!ready) {
      queuedCommands.push({
        type: "DATA",
        data: data
      });

      return;
    }

    clearMapData();

    /*
     * 방문지 마커
     */
    (data.locations || []).forEach(
      function (location, index) {
        var latitude =
          Number(location.lat);

        var longitude =
          Number(location.lng);

        if (
          Number.isNaN(latitude) ||
          Number.isNaN(longitude)
        ) {
          return;
        }

        var position =
          new window.kakao.maps.LatLng(
            latitude,
            longitude
          );

        var markerElement =
          createMarkerElement(
            index,
            location.color,
            !!location.pulse
          );

        var overlay =
          new window.kakao.maps.CustomOverlay({
            position: position,
            content: markerElement,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 20 + index
          });

        overlay.setMap(map);

        locationOverlays.push(
          overlay
        );

        markerElement.addEventListener(
          "click",
          function (event) {
            event.stopPropagation();

            post({
              type: "MARKER_PRESS",
              index: index
            });
          }
        );
      }
    );

    /*
     * 지도 직접 선택 위치
     */
    if (data.selectedPos) {
      var selectedElement =
        document.createElement("div");

      selectedElement.className =
        "selected-location";

      selectedOverlay =
        new window.kakao.maps.CustomOverlay({
          position:
            new window.kakao.maps.LatLng(
              Number(
                data.selectedPos.lat
              ),
              Number(
                data.selectedPos.lng
              )
            ),
          content:
            selectedElement,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 100
        });

      selectedOverlay.setMap(map);
    }

    /*
     * 전체 경로
     */
    if (
      data.roadPath &&
      data.roadPath.length >= 2
    ) {
      roadLine =
        new window.kakao.maps.Polyline({
          path:
            data.roadPath.map(
              toLatLng
            ),

          strokeWeight: 5,

          strokeColor:
            "#12395B",

          strokeOpacity: 0.25,

          strokeStyle:
            "solid"
        });

      roadLine.setMap(map);
    }

    /*
     * 현재 안내 구간
     */
    if (
      data.activePath &&
      data.activePath.length >= 2
    ) {
      activeLine =
        new window.kakao.maps.Polyline({
          path:
            data.activePath.map(
              toLatLng
            ),

          strokeWeight: 9,

          strokeColor:
            "#12395B",

          strokeOpacity: 1,

          strokeStyle:
            "solid"
        });

      activeLine.setMap(map);
    }

    /*
     * 현재 GPS 위치
     */
    if (data.currentPos) {
      updateCurrentLocation(
        data.currentPos.latitude,
        data.currentPos.longitude
      );
    }
  }

  /*
   * React Native에서 들어오는 명령.
   */
  function command(commandData) {
    if (!ready) {
      queuedCommands.push(
        commandData
      );

      return;
    }

    if (
      commandData.type === "DATA"
    ) {
      setMapData(
        commandData.data
      );

      return;
    }

    if (
      commandData.type === "MOVE"
    ) {
      moveToPosition(
        commandData.latitude,
        commandData.longitude,
        commandData.level
      );

      return;
    }

    if (
      commandData.type ===
      "MOVE_CURRENT"
    ) {
      moveToCurrentLocation(
        commandData.latitude,
        commandData.longitude,
        commandData.level
      );

      return;
    }

    if (
      commandData.type === "FIT"
    ) {
      fitCoordinates(
        commandData.coordinates
      );

      return;
    }
  }

  window.__PANG3_MAP_COMMAND__ =
    command;

  window.__updateCurrentLocation =
    updateCurrentLocation;

  window.__moveToCurrentLocation =
    moveToCurrentLocation;

  window.__moveToPosition =
    moveToPosition;

  window.__fitCoordinates =
    fitCoordinates;

  /*
   * 카카오맵 최초 생성.
   *
   * 여기서 center는
   * DEFAULT_REGION이 아니라
   * 최초 GPS 좌표다.
   */
  window.kakao.maps.load(
    function () {
      var initialPosition =
        new window.kakao.maps.LatLng(
          ${Number(initialLatitude)},
          ${Number(initialLongitude)}
        );

      map =
        new window.kakao.maps.Map(
          document.getElementById(
            "map"
          ),
          {
            center:
              initialPosition,

            level:
              ${MY_LOCATION_LEVEL}
          }
        );

      /*
       * 최초 지도 생성 시
       * 현재위치 점도 바로 만든다.
       */
      updateCurrentLocation(
        ${Number(initialLatitude)},
        ${Number(initialLongitude)}
      );

      window.kakao.maps.event.addListener(
        map,
        "click",
        function (mouseEvent) {
          post({
            type:
              "MAP_PRESS",

            latitude:
              mouseEvent
                .latLng
                .getLat(),

            longitude:
              mouseEvent
                .latLng
                .getLng()
          });
        }
      );

      window.kakao.maps.event.addListener(
        map,
        "dragstart",
        function () {
          post({
            type:
              "PAN_DRAG"
          });
        }
      );

      ready = true;

      post({
        type:
          "READY"
      });

      var commands =
        queuedCommands.slice();

      queuedCommands = [];

      commands.forEach(
        function (queuedCommand) {
          command(
            queuedCommand
          );
        }
      );
    }
  );
})();
</script>
</body>
</html>
`;
};

export default function KakaoMapWebView({
  locations = [],
  roadPath = [],
  panelOpen = true,
  setPanelOpen,

  routeSegments = [],
  currentSegmentIndex = 0,
  isGuiding = false,

  searchedPlace,
  clearSearchMarkerSignal,
  mapSelectMode,

  onDirectPlaceSelect,
  onCurrentLocationChange,
  onMarkerClick,
  onLocationsChange,
  onRerouteRequest,
}) {
  /*
   * ===============================
   * WebView / 지도 refs
   * ===============================
   */

  const webViewRef =
    useRef(null);

  const mapReadyRef =
    useRef(false);

  const pendingMapCommandsRef =
    useRef([]);

  /*
   * 처음 GPS 좌표.
   *
   * 최초 지도 생성에만 사용하고
   * 이후 GPS watch 업데이트로
   * 이 값은 바꾸지 않는다.
   */
  const initialMapPositionRef =
    useRef(null);

  /*
   * WebView source 자체도
   * 최초 1번만 만든다.
   *
   * GPS가 갱신될 때마다
   * WebView 전체가 새로고침되는 것을 방지.
   */
  const webViewSourceRef =
    useRef(null);

  /*
   * 위치 watch subscription.
   */
  const locationSubscriptionRef =
    useRef(null);

  /*
   * ===============================
   * 기타 refs
   * ===============================
   */

  const guidingRef =
    useRef(false);

  const followModeRef =
    useRef(true);

  const alertedTargetIds =
    useRef(new Set());

  const lastRerouteTimeRef =
    useRef(0);

  const segmentFocusTimerRef =
    useRef(null);

  const segmentFocusKeyRef =
    useRef(null);

  const currentPosRef =
    useRef(null);

  const activePathRef =
    useRef([]);

  /*
   * ===============================
   * States
   * ===============================
   */

  const [keyword, setKeyword] =
    useState("");

  const [placeName, setPlaceName] =
    useState("");

  const [task, setTask] =
    useState("");

  const [
    selectedPos,
    setSelectedPos,
  ] = useState(null);

  const [
    currentPos,
    setCurrentPos,
  ] = useState(null);

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState(null);

  const [
    isSearching,
    setIsSearching,
  ] = useState(false);

  /*
   * 가까워진 목적지 key.
   * 이 값이 존재할 때만
   * 해당 목적지에서 파동 표시.
   */
  const [
    pulseTargetKey,
    setPulseTargetKey,
  ] = useState(null);

  const [
    arrivalTarget,
    setArrivalTarget,
  ] = useState(null);

  const [
    directSelectMode,
    setDirectSelectMode,
  ] = useState(false);

  /*
   * 지도 최초 진입 로딩 상태.
   */
  const [
    locationLoading,
    setLocationLoading,
  ] = useState(true);

  const [
    locationError,
    setLocationError,
  ] = useState(false);

  /*
   * ===============================
   * 지도 명령 전송
   * ===============================
   */

  const sendMapCommand = (
    command
  ) => {
    const payload =
      JSON.stringify(command);

    if (
      !mapReadyRef.current ||
      !webViewRef.current
    ) {
      pendingMapCommandsRef.current.push(
        payload
      );

      return;
    }

    webViewRef.current.injectJavaScript(
      `
      if (
        window.__PANG3_MAP_COMMAND__
      ) {
        window.__PANG3_MAP_COMMAND__(
          ${payload}
        );
      }
      true;
      `
    );
  };

  /*
   * 기존 MapView에서 사용하던
   * mapRef 인터페이스 비슷하게 유지.
   */
  const mapRef = useRef({
    animateToRegion: (
      region,
      duration = 500
    ) => {
      sendMapCommand({
        type: "MOVE",

        latitude:
          Number(
            region.latitude
          ),

        longitude:
          Number(
            region.longitude
          ),

        duration,
      });
    },

    fitToCoordinates: (
      coordinates,
      options = {}
    ) => {
      sendMapCommand({
        type: "FIT",

        coordinates,

        edgePadding:
          options.edgePadding ||
          {},
      });
    },
  });

  /*
   * ===============================
   * 방문지 데이터
   * ===============================
   */

  const mapLocations =
    useMemo(() => {
      return (
        locations || []
      ).filter(
        (location) =>
          location &&
          location.lat !==
            undefined &&
          location.lng !==
            undefined
      );
    }, [locations]);

  const currentTargetIndex =
    currentSegmentIndex;

  const currentTarget =
    mapLocations[
      currentTargetIndex
    ];

  const activePath =
    isGuiding
      ? routeSegments[
          currentSegmentIndex
        ]?.path || []
      : roadPath;

  /*
   * 현재 위치 ref 항상 최신화.
   */
  useEffect(() => {
    currentPosRef.current =
      currentPos;
  }, [currentPos]);

  /*
   * 현재 경로 ref 최신화.
   */
  useEffect(() => {
    activePathRef.current =
      activePath || [];
  }, [activePath]);

  /*
   * 안내 상태 ref.
   */
  useEffect(() => {
    guidingRef.current =
      isGuiding;

    if (isGuiding) {
      followModeRef.current =
        true;
    }
  }, [isGuiding]);

  /*
   * ===============================
   * 컴포넌트 진입
   * ===============================
   */

  useEffect(() => {
    startCurrentLocation();

    return () => {
      if (
        segmentFocusTimerRef.current
      ) {
        clearTimeout(
          segmentFocusTimerRef.current
        );

        segmentFocusTimerRef.current =
          null;
      }

      if (
        locationSubscriptionRef.current
      ) {
        locationSubscriptionRef.current.remove();

        locationSubscriptionRef.current =
          null;
      }
    };
  }, []);

  /*
   * ===============================
   * 거리 계산
   * ===============================
   */

  const getDistanceMeters = (
    lat1,
    lng1,
    lat2,
    lng2
  ) => {
    const R =
      6371000;

    const dLat =
      ((lat2 - lat1) *
        Math.PI) /
      180;

    const dLng =
      ((lng2 - lng1) *
        Math.PI) /
      180;

    const a =
      Math.sin(dLat / 2) *
        Math.sin(
          dLat / 2
        ) +
      Math.cos(
        (lat1 * Math.PI) /
          180
      ) *
        Math.cos(
          (lat2 * Math.PI) /
            180
        ) *
        Math.sin(
          dLng / 2
        ) *
        Math.sin(
          dLng / 2
        );

    return (
      R *
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      )
    );
  };

  /*
   * ===============================
   * 목적지 100m 접근 판정
   * ===============================
   */

  useEffect(() => {
    /*
     * 안내 중이 아니면
     * 파동을 없앤다.
     */
    if (!isGuiding) {
      setPulseTargetKey(
        null
      );

      return;
    }

    if (!currentPos) {
      return;
    }

    if (
      !mapLocations.length
    ) {
      setPulseTargetKey(
        null
      );

      return;
    }

    if (!currentTarget) {
      setPulseTargetKey(
        null
      );

      return;
    }

    const targetStatus =
      currentTarget.status ||
      "pending";

    /*
     * 이미 완료된 목적지는
     * 파동 표시 안 함.
     */
    if (
      targetStatus ===
      "complete"
    ) {
      setPulseTargetKey(
        null
      );

      return;
    }

    const targetKey =
      currentTarget.id ??
      `${currentTarget.detailAddress}-${currentTarget.lat}-${currentTarget.lng}`;

    const distance =
      getDistanceMeters(
        currentPos.latitude,
        currentPos.longitude,

        Number(
          currentTarget.lat
        ),

        Number(
          currentTarget.lng
        )
      );

    /*
     * 100m 이내
     */
    if (
      distance <=
      ARRIVAL_DISTANCE_METERS
    ) {
      /*
       * 검은 테두리가 아니라
       * 이 key에 해당하는 마커에서
       * 파동만 표시한다.
       */
      setPulseTargetKey(
        targetKey
      );

      /*
       * 도착 알림은
       * 목적지당 최초 1번.
       */
      if (
        !alertedTargetIds.current.has(
          targetKey
        )
      ) {
        alertedTargetIds.current.add(
          targetKey
        );

        setArrivalTarget({
          ...currentTarget,
          targetKey,
        });
      }

      return;
    }

    /*
     * 다시 100m 밖으로 나가면
     * 파동 제거.
     *
     * 단, 도착 알림 최초 1회 기록은 유지.
     */
    setPulseTargetKey(
      (previousKey) =>
        previousKey ===
        targetKey
          ? null
          : previousKey
    );
  }, [
    isGuiding,
    currentPos,
    mapLocations,
    currentSegmentIndex,
    currentTarget,
  ]);

  /*
   * ===============================
   * 경로 화면 맞춤
   * ===============================
   */

  useEffect(() => {
    if (
      !mapRef.current
    ) {
      return;
    }

    if (
      segmentFocusTimerRef.current
    ) {
      clearTimeout(
        segmentFocusTimerRef.current
      );

      segmentFocusTimerRef.current =
        null;
    }

    const targetPath =
      isGuiding
        ? routeSegments[
            currentSegmentIndex
          ]?.path || []
        : roadPath;

    if (
      !targetPath ||
      targetPath.length < 2
    ) {
      return;
    }

    const coordinates =
      targetPath
        .map((point) => ({
          latitude:
            Number(
              point.lat ??
                point.latitude ??
                point.y
            ),

          longitude:
            Number(
              point.lng ??
                point.longitude ??
                point.x
            ),
        }))
        .filter(
          (point) =>
            !Number.isNaN(
              point.latitude
            ) &&
            !Number.isNaN(
              point.longitude
            )
        );

    if (
      coordinates.length <
      2
    ) {
      return;
    }

    const first =
      coordinates[0];

    const last =
      coordinates[
        coordinates.length -
          1
      ];

    const focusKey = [
      isGuiding
        ? "guiding"
        : "preview",

      currentSegmentIndex,

      coordinates.length,

      first.latitude,
      first.longitude,

      last.latitude,
      last.longitude,
    ].join("-");

    segmentFocusKeyRef.current =
      focusKey;

    mapRef.current.fitToCoordinates(
      coordinates,
      {
        edgePadding: {
          top: 300,
          right: 80,
          bottom: 260,
          left: 80,
        },

        animated: true,
      }
    );

    if (!isGuiding) {
      return;
    }

    /*
     * 경로 전체를 잠깐 보여준 뒤
     * 현재 위치로 복귀.
     */
    segmentFocusTimerRef.current =
      setTimeout(() => {
        if (
          segmentFocusKeyRef.current !==
          focusKey
        ) {
          return;
        }

        const latestCurrentPos =
          currentPosRef.current;

        if (
          !latestCurrentPos
        ) {
          return;
        }

        moveToCurrentLocation();
      }, 2000);

    return () => {
      if (
        segmentFocusTimerRef.current
      ) {
        clearTimeout(
          segmentFocusTimerRef.current
        );

        segmentFocusTimerRef.current =
          null;
      }
    };
  }, [
    isGuiding,
    currentSegmentIndex,
    routeSegments,
    roadPath,
  ]);

  /*
   * ===============================
   * 최초 GPS + GPS Watch
   * ===============================
   */

  const startCurrentLocation =
    async () => {
      try {
        setLocationLoading(
          true
        );

        setLocationError(
          false
        );

        /*
         * 기존 subscription이 있으면 제거.
         */
        if (
          locationSubscriptionRef.current
        ) {
          locationSubscriptionRef.current.remove();

          locationSubscriptionRef.current =
            null;
        }

        const {
          status,
        } =
          await Location.requestForegroundPermissionsAsync();

        if (
          status !==
          "granted"
        ) {
          setLocationLoading(
            false
          );

          setLocationError(
            true
          );

          Alert.alert(
            "위치 권한 필요",
            "현재 위치를 사용하려면 위치 권한이 필요합니다."
          );

          return;
        }

        /*
         * 최초 위치를 먼저 가져온다.
         *
         * 이게 성공하기 전까지
         * WebView를 렌더링하지 않는다.
         */
        const current =
          await Location.getCurrentPositionAsync(
            {
              accuracy:
                Location
                  .Accuracy
                  .High,
            }
          );

        const pos = {
          latitude:
            current.coords
              .latitude,

          longitude:
            current.coords
              .longitude,
        };

        /*
         * ref부터 즉시 최신화.
         */
        currentPosRef.current =
          pos;

        /*
         * 최초 지도 위치는
         * 딱 한번만 저장.
         */
        if (
          !initialMapPositionRef.current
        ) {
          initialMapPositionRef.current =
            {
              ...pos,
            };
        }

        /*
         * WebView HTML도
         * 최초 GPS 기준으로
         * 딱 한번만 만든다.
         */
        if (
          !webViewSourceRef.current
        ) {
          webViewSourceRef.current =
            {
              html:
                buildKakaoMapHtml(
                  pos.latitude,
                  pos.longitude
                ),

              baseUrl:
                "https://localhost/",
            };
        }

        setCurrentPos(
          pos
        );

        setLocationLoading(
          false
        );

        onCurrentLocationChange?.({
          lat:
            pos.latitude,

          lng:
            pos.longitude,

          name:
            "현재 위치",
        });

        /*
         * 이후에는 GPS watch.
         *
         * 지도 전체를 새로 생성하지 않고
         * 현재 위치 점만 갱신한다.
         */
        locationSubscriptionRef.current =
          await Location.watchPositionAsync(
            {
              accuracy:
                Location
                  .Accuracy
                  .High,

              timeInterval:
                5000,

              distanceInterval:
                5,
            },

            (location) => {
              const newPos = {
                latitude:
                  location.coords
                    .latitude,

                longitude:
                  location.coords
                    .longitude,
              };

              currentPosRef.current =
                newPos;

              setCurrentPos(
                newPos
              );

              onCurrentLocationChange?.({
                lat:
                  newPos.latitude,

                lng:
                  newPos.longitude,

                name:
                  "현재 위치",
              });

              /*
               * 현재 위치 마커만 움직인다.
               * 지도 중심은 자동 이동시키지 않는다.
               */
              if (
                mapReadyRef.current &&
                webViewRef.current
              ) {
                webViewRef.current.injectJavaScript(
                  `
                  if (
                    window.__updateCurrentLocation
                  ) {
                    window.__updateCurrentLocation(
                      ${Number(
                        newPos.latitude
                      )},
                      ${Number(
                        newPos.longitude
                      )}
                    );
                  }

                  true;
                  `
                );
              }

              /*
               * 경로 이탈 감지.
               * 기존 기능 유지.
               */
              const latestActivePath =
                activePathRef.current ||
                [];

              if (
                guidingRef.current &&
                latestActivePath.length >=
                  2
              ) {
                const distanceFromPath =
                  getMinDistanceFromPath(
                    newPos,
                    latestActivePath
                  );

                const now =
                  Date.now();

                if (
                  distanceFromPath >
                    60 &&
                  now -
                    lastRerouteTimeRef.current >
                    15000
                ) {
                  console.log(
                    "경로 이탈 감지 → 재탐색"
                  );

                  lastRerouteTimeRef.current =
                    now;

                  onRerouteRequest?.({
                    lat:
                      newPos.latitude,

                    lng:
                      newPos.longitude,
                  });
                }
              }
            }
          );
      } catch (error) {
        console.log(
          "현재 위치 오류:",
          error
        );

        setLocationLoading(
          false
        );

        setLocationError(
          true
        );

        Alert.alert(
          "위치 오류",
          "현재 위치를 불러오지 못했습니다."
        );
      }
    };

  /*
   * ===============================
   * 특정 위치 이동
   * ===============================
   */

  const moveToPosition = (
    latitude,
    longitude
  ) => {
    sendMapCommand({
      type: "MOVE",

      latitude:
        Number(latitude),

      longitude:
        Number(longitude),
    });
  };

  /*
   * ===============================
   * 현재 위치 버튼
   * ===============================
   *
   * 버튼을 누를 때 GPS를 새로 요청하지 않는다.
   * watch가 계속 저장 중인 최신 좌표를 사용.
   */

  const moveToCurrentLocation =
    () => {
      const pos =
        currentPosRef.current;

      if (!pos) {
        return;
      }

      followModeRef.current =
        true;

      sendMapCommand({
        type:
          "MOVE_CURRENT",

        latitude:
          pos.latitude,

        longitude:
          pos.longitude,

        level:
          MY_LOCATION_LEVEL,
      });
    };

  /*
   * ===============================
   * 검색된 장소 변경
   * ===============================
   */

  useEffect(() => {
    setSelectedPos(
      null
    );
  }, [
    clearSearchMarkerSignal,
  ]);

  useEffect(() => {
    if (!searchedPlace) {
      return;
    }

    if (
      !searchedPlace.lat ||
      !searchedPlace.lng
    ) {
      return;
    }

    const lat =
      Number(
        searchedPlace.lat
      );

    const lng =
      Number(
        searchedPlace.lng
      );

    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      return;
    }

    setSelectedPos({
      lat,
      lng,
    });

    setPlaceName(
      searchedPlace.detailAddress ||
        ""
    );

    setKeyword(
      searchedPlace.roadAddress ||
        ""
    );

    setDirectSelectMode(
      false
    );

    moveToPosition(
      lat,
      lng
    );
  }, [searchedPlace]);

  /*
   * ===============================
   * 남은 안내 경로
   * ===============================
   */

  const remainingActivePath =
    useMemo(() => {
      if (
        !isGuiding ||
        !currentPos ||
        !activePath ||
        activePath.length <
          2
      ) {
        return activePath;
      }

      let closestIndex =
        0;

      let closestDistance =
        Infinity;

      activePath.forEach(
        (point, index) => {
          const distance =
            getDistanceMeters(
              currentPos.latitude,
              currentPos.longitude,

              Number(
                point.lat ??
                  point.latitude ??
                  point.y
              ),

              Number(
                point.lng ??
                  point.longitude ??
                  point.x
              )
            );

          if (
            distance <
            closestDistance
          ) {
            closestDistance =
              distance;

            closestIndex =
              index;
          }
        }
      );

      return activePath.slice(
        Math.max(
          closestIndex,
          0
        )
      );
    }, [
      isGuiding,
      currentPos,
      activePath,
    ]);

  /*
   * ===============================
   * 경로 이탈 거리
   * ===============================
   */

  const getMinDistanceFromPath =
    (position, path) => {
      if (
        !path ||
        path.length === 0
      ) {
        return 0;
      }

      let minDistance =
        Infinity;

      for (
        const point of path
      ) {
        const distance =
          getDistanceMeters(
            position.latitude,
            position.longitude,

            Number(
              point.lat ??
                point.latitude ??
                point.y
            ),

            Number(
              point.lng ??
                point.longitude ??
                point.x
            )
          );

        if (
          distance <
          minDistance
        ) {
          minDistance =
            distance;
        }
      }

      return minDistance;
    };

  /*
   * ===============================
   * 방문지 선택 / 삭제
   * ===============================
   */

  const focusLocation = (
    location
  ) => {
    moveToPosition(
      Number(
        location.lat
      ),

      Number(
        location.lng
      )
    );

    onMarkerClick?.(
      location
    );
  };

  const removeLocation =
    async (id) => {
      const nextLocations =
        locations.filter(
          (location) =>
            location.id !== id
        );

      onLocationsChange?.(
        nextLocations
      );

      if (
        selectedLocation?.id ===
        id
      ) {
        setSelectedLocation(
          null
        );
      }
    };

  /*
   * ===============================
   * 간단 거리 정렬
   * ===============================
   */

  const getDistance = (
    a,
    b
  ) => {
    const dx =
      Number(a.lat) -
      Number(b.lat);

    const dy =
      Number(a.lng) -
      Number(b.lng);

    return Math.sqrt(
      dx * dx +
        dy * dy
    );
  };

  const optimizeRoute =
    () => {
      if (
        locations.length <
        2
      ) {
        Alert.alert(
          "정렬 불가",
          "방문지가 2개 이상 필요합니다."
        );

        return;
      }

      const pos =
        currentPosRef.current;

      if (!pos) {
        Alert.alert(
          "현재 위치 필요",
          "현재 위치를 먼저 불러와야 합니다."
        );

        return;
      }

      const remaining = [
        ...locations,
      ];

      const optimized = [];

      let current = {
        lat:
          pos.latitude,

        lng:
          pos.longitude,
      };

      while (
        remaining.length >
        0
      ) {
        let nearestIndex =
          0;

        let nearestDistance =
          getDistance(
            current,
            remaining[0]
          );

        for (
          let index = 1;
          index <
          remaining.length;
          index++
        ) {
          const distance =
            getDistance(
              current,
              remaining[index]
            );

          if (
            distance <
            nearestDistance
          ) {
            nearestDistance =
              distance;

            nearestIndex =
              index;
          }
        }

        const [nearest] =
          remaining.splice(
            nearestIndex,
            1
          );

        optimized.push(
          nearest
        );

        current =
          nearest;
      }

      /*
       * 방문지 순서가 바뀌었으므로
       * 기존 도착 알림 기록 초기화.
       */
      alertedTargetIds.current.clear();

      setPulseTargetKey(
        null
      );

      onLocationsChange?.(
        optimized
      );

      Alert.alert(
        "정렬 완료",
        "현재 위치 기준으로 가까운 순서로 정렬했습니다."
      );
    };

  /*
   * ===============================
   * 지도 직접 선택
   * ===============================
   */

  const handleMapPress = (
    latitude,
    longitude
  ) => {
    if (!mapSelectMode) {
      return;
    }

    setSelectedPos({
      lat:
        latitude,

      lng:
        longitude,
    });

    setKeyword("");

    setPlaceName("");

    setTask("");

    setDirectSelectMode(
      true
    );

    setPanelOpen?.(
      false
    );

    onDirectPlaceSelect?.({
      lat:
        latitude,

      lng:
        longitude,

      detailAddress:
        "지도 선택 위치",

      roadAddress:
        "지도에서 선택",
    });
  };

  const handleFieldAction =
    (action) => {
      if (
        !selectedLocation
      ) {
        return;
      }

      setSelectedLocation(
        null
      );

      onMarkerClick?.(
        selectedLocation,
        action
      );
    };

  /*
   * ===============================
   * React Native 데이터 → 지도
   * ===============================
   */

  useEffect(() => {
    /*
     * GPS가 없어서 아직
     * WebView가 만들어지지 않은 상태라면
     * DATA 명령을 굳이 계속 쌓지 않는다.
     */
    if (
      !initialMapPositionRef.current
    ) {
      return;
    }

    const locationsForMap =
      mapLocations.map(
        (location) => {
          const locationKey =
            location.id ??
            `${location.detailAddress}-${location.lat}-${location.lng}`;

          return {
            ...location,

            color:
              getMarkerColorByStatus(
                location.status ||
                  "pending"
              ),

            /*
             * current 스타일은 더 이상 사용하지 않는다.
             * 검은 테두리 없음.
             */

            pulse:
              pulseTargetKey ===
              locationKey,
          };
        }
      );

    sendMapCommand({
      type: "DATA",

      data: {
        locations:
          locationsForMap,

        selectedPos,

        currentPos,

        roadPath,

        /*
         * 안내 중이면 이미 지나간 경로를
         * 조금씩 잘라낸 버전을 사용.
         */
        activePath:
          isGuiding
            ? remainingActivePath
            : activePath,
      },
    });
  }, [
    mapLocations,
    selectedPos,
    currentPos,
    roadPath,
    activePath,
    remainingActivePath,
    isGuiding,
    pulseTargetKey,
  ]);

  /*
   * ===============================
   * WebView 메시지 처리
   * ===============================
   */

  const handleWebViewMessage =
    (event) => {
      try {
        const message =
          JSON.parse(
            event.nativeEvent
              .data
          );

        if (
          message.type ===
          "READY"
        ) {
          mapReadyRef.current =
            true;

          /*
           * 지도 생성 전에 들어온 명령 처리.
           */
          const queued =
            pendingMapCommandsRef.current.slice();

          pendingMapCommandsRef.current =
            [];

          queued.forEach(
            (payload) => {
              webViewRef.current?.injectJavaScript(
                `
                if (
                  window.__PANG3_MAP_COMMAND__
                ) {
                  window.__PANG3_MAP_COMMAND__(
                    ${payload}
                  );
                }

                true;
                `
              );
            }
          );

          /*
           * READY 시점의 최신 GPS로
           * 현재 위치 마커 갱신.
           *
           * 지도 시작 위치도 실제 GPS이므로
           * 다른 지역이 잠깐 보이는 현상은 없음.
           */
          const latestPos =
            currentPosRef.current;

          if (
            latestPos &&
            webViewRef.current
          ) {
            webViewRef.current.injectJavaScript(
              `
              if (
                window.__updateCurrentLocation
              ) {
                window.__updateCurrentLocation(
                  ${Number(
                    latestPos.latitude
                  )},
                  ${Number(
                    latestPos.longitude
                  )}
                );
              }

              true;
              `
            );
          }

          return;
        }

        if (
          message.type ===
          "PAN_DRAG"
        ) {
          followModeRef.current =
            false;

          return;
        }

        if (
          message.type ===
          "MAP_PRESS"
        ) {
          handleMapPress(
            Number(
              message.latitude
            ),

            Number(
              message.longitude
            )
          );

          return;
        }

        if (
          message.type ===
          "MARKER_PRESS"
        ) {
          const location =
            mapLocations[
              Number(
                message.index
              )
            ];

          if (location) {
            focusLocation(
              location
            );
          }
        }
      } catch (error) {
        console.log(
          "카카오맵 메시지 처리 오류",
          error
        );
      }
    };

  /*
   * ===============================
   * API KEY 없음
   * ===============================
   */

  if (
    !KAKAO_REST_API_KEY ||
    !KAKAO_JAVASCRIPT_KEY
  ) {
    return (
      <View
        style={
          styles.placeholder
        }
      >
        <Text
          style={
            styles.placeholderTitle
          }
        >
          카카오 API 키 필요
        </Text>

        <Text
          style={
            styles.placeholderDesc
          }
        >
          frontend/.env에
          EXPO_PUBLIC_KAKAO_REST_API_KEY와
          EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY를
          설정해주세요.
        </Text>
      </View>
    );
  }

  /*
   * ===============================
   * 최초 GPS 로딩
   * ===============================
   *
   * 여기서 WebView를 렌더링하지 않는다.
   * 그래서 예전 DEFAULT_REGION이
   * 화면에 먼저 나타날 수 없다.
   */

  if (
    locationLoading
  ) {
    return (
      <View
        style={
          styles.locationLoading
        }
      >
        <ActivityIndicator
          size="large"
          color="#12395B"
        />

        <Text
          style={
            styles.locationLoadingText
          }
        >
          현재 위치 확인 중...
        </Text>
      </View>
    );
  }

  /*
   * GPS 실패 시
   * 임의의 기본 위치 지도를 띄우지 않는다.
   */
  if (
    locationError ||
    !webViewSourceRef.current
  ) {
    return (
      <View
        style={
          styles.locationLoading
        }
      >
        <Ionicons
          name="location-outline"
          size={34}
          color="#607086"
        />

        <Text
          style={
            styles.locationErrorTitle
          }
        >
          현재 위치를 불러오지 못했습니다.
        </Text>

        <TouchableOpacity
          style={
            styles.locationRetryButton
          }
          onPress={() => {
            /*
             * 재시도 시
             * 최초 지도 생성 정보도 초기화.
             */
            mapReadyRef.current =
              false;

            pendingMapCommandsRef.current =
              [];

            initialMapPositionRef.current =
              null;

            webViewSourceRef.current =
              null;

            startCurrentLocation();
          }}
        >
          <Text
            style={
              styles.locationRetryText
            }
          >
            다시 시도
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  /*
   * ===============================
   * 실제 화면
   * ===============================
   */

  return (
    <View
      style={
        styles.container
      }
    >
      <WebView
        ref={webViewRef}
        style={styles.map}
        originWhitelist={[
          "*",
        ]}
        source={
          webViewSourceRef.current
        }
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onMessage={
          handleWebViewMessage
        }
        onError={(
          event
        ) => {
          console.log(
            "카카오맵 WebView 오류",
            event.nativeEvent
          );
        }}
      />

      {currentPos && (
        <TouchableOpacity
          style={
            styles.myLocationButton
          }
          onPress={
            moveToCurrentLocation
          }
        >
          <Ionicons
            name="locate"
            size={24}
            color="#12395B"
          />
        </TouchableOpacity>
      )}

      {panelOpen && (
        <View
          style={
            styles.panel
          }
        >
          <TouchableOpacity
            style={
              styles.closePanelButton
            }
            onPress={() => {
              setPanelOpen?.(
                false
              );

              setDirectSelectMode(
                false
              );
            }}
          >
            <Text
              style={
                styles.closePanelButtonText
              }
            >
              접기
            </Text>
          </TouchableOpacity>

          {!directSelectMode && (
            <View
              style={
                styles.searchRow
              }
            >
              <TextInput
                value={keyword}
                onChangeText={
                  setKeyword
                }
                placeholder="주소/장소"
                placeholderTextColor="#8A98A8"
                style={
                  styles.searchInput
                }
                returnKeyType="search"
              />

              <TouchableOpacity
                style={
                  styles.searchButton
                }
                disabled={
                  isSearching
                }
              >
                <Text
                  style={
                    styles.searchButtonText
                  }
                >
                  {isSearching
                    ? "검색중"
                    : "검색"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput
            value={
              placeName
            }
            onChangeText={
              setPlaceName
            }
            placeholder="방문지 이름"
            placeholderTextColor="#8A98A8"
            style={
              styles.input
            }
          />

          <Text
            style={
              styles.categoryTitle
            }
          >
            작업 카테고리
          </Text>

          <View
            style={
              styles.categoryRow
            }
          >
            {[
              "점검",
              "공사",
              "안전",
              "환경",
              "민원",
            ].map(
              (item) => (
                <TouchableOpacity
                  key={
                    item
                  }
                  style={[
                    styles.categoryButton,

                    task ===
                      item &&
                      styles.categoryButtonActive,
                  ]}
                  onPress={() =>
                    setTask(
                      item
                    )
                  }
                >
                  <Text
                    style={[
                      styles.categoryText,

                      task ===
                        item &&
                        styles.categoryTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          <View
            style={
              styles.metaRow
            }
          >
            <Text
              style={
                styles.countText
              }
            >
              방문지{" "}
              {
                locations.length
              }
              개
            </Text>

            <TouchableOpacity
              style={
                styles.sortButton
              }
              onPress={
                optimizeRoute
              }
            >
              <Text
                style={
                  styles.sortButtonText
                }
              >
                정렬
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={
              styles.locationList
            }
          >
            {locations.length ===
            0 ? (
              <Text
                style={
                  styles.emptyText
                }
              >
                추가로 방문하세요.
              </Text>
            ) : (
              locations.map(
                (
                  location,
                  index
                ) => (
                  <View
                    key={`${location.detailAddress || "loc"}-${location.lat}-${location.lng}-${index}`}
                    style={
                      styles.locationItem
                    }
                  >
                    <TouchableOpacity
                      style={
                        styles.locationMain
                      }
                      onPress={() =>
                        focusLocation(
                          location
                        )
                      }
                    >
                      <View
                        style={[
                          styles.badge,

                          {
                            backgroundColor:
                              getMarkerColorByStatus(
                                location.status ||
                                  "pending"
                              ),
                          },
                        ]}
                      >
                        <Text
                          style={
                            styles.badgeText
                          }
                        >
                          {index +
                            1}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.locationTextWrap
                        }
                      >
                        <Text
                          style={
                            styles.locationName
                          }
                          numberOfLines={
                            1
                          }
                        >
                          {location.detailAddress ||
                            "이름 없음"}
                        </Text>

                        <Text
                          style={
                            styles.locationTask
                          }
                          numberOfLines={
                            1
                          }
                        >
                          {location.task ||
                            "현장 확인"}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        removeLocation(
                          location.id
                        )
                      }
                    >
                      <Text
                        style={
                          styles.deleteText
                        }
                      >
                        삭제
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              )
            )}
          </ScrollView>

          {currentPos && (
            <Text
              style={
                styles.hintText
              }
            >
              {isGuiding
                ? `안내 중 · 현재 목적지: ${
                    currentTarget?.detailAddress ||
                    "마지막 구간"
                  }`
                : "안내 시작 전"}
            </Text>
          )}
        </View>
      )}

      {/* 도착 알림 */}
      <Modal
        visible={
          !!arrivalTarget
        }
        transparent
        animationType="slide"
        onRequestClose={() => {
          /*
           * 모달만 닫는다.
           *
           * 아직 100m 이내라면
           * 목적지 파동은 계속 유지된다.
           */
          setArrivalTarget(
            null
          );
        }}
      >
        <TouchableOpacity
          style={
            styles.modalBackdrop
          }
          activeOpacity={1}
          onPress={() => {
            setArrivalTarget(
              null
            );
          }}
        >
          <TouchableOpacity
            style={
              styles.bottomSheet
            }
            activeOpacity={1}
            onPress={() => {}}
          >
            <View
              style={
                styles.handle
              }
            />

            <Text
              style={
                styles.sheetLabel
              }
            >
              ARRIVAL NOTICE
            </Text>

            <Text
              style={
                styles.sheetTitle
              }
            >
              작업 지점 근처에 도착했습니다
            </Text>

            <Text
              style={
                styles.sheetTask
              }
            >
              {arrivalTarget?.detailAddress ||
                "목적지"}{" "}
              작업을 시작하시겠습니까?
            </Text>

            <View
              style={
                styles.actionGrid
              }
            >
              <TouchableOpacity
                style={
                  styles.actionButton
                }
                onPress={() => {
                  /*
                   * 나중에 눌러도
                   * 100m 이내면 파동은 유지.
                   */
                  setArrivalTarget(
                    null
                  );
                }}
              >
                <Text
                  style={
                    styles.actionText
                  }
                >
                  나중에
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={
                  styles.actionButton
                }
                onPress={
                  async () => {
                    try {
                      if (
                        arrivalTarget?.id
                      ) {
                        await fetch(
                          `${API_BASE_URL}/api/locations/${arrivalTarget.id}/status`,
                          {
                            method:
                              "PATCH",

                            headers:
                              {
                                "Content-Type":
                                  "application/json",
                              },

                            body:
                              JSON.stringify(
                                {
                                  status:
                                    "working",
                                }
                              ),
                          }
                        );
                      }

                      const updated =
                        locations.map(
                          (
                            location
                          ) => {
                            const locationKey =
                              location.id ??
                              `${location.detailAddress}-${location.lat}-${location.lng}`;

                            if (
                              locationKey ===
                              arrivalTarget?.targetKey
                            ) {
                              return {
                                ...location,

                                status:
                                  "working",
                              };
                            }

                            return location;
                          }
                        );

                      onLocationsChange?.(
                        updated
                      );

                      setArrivalTarget(
                        null
                      );

                      /*
                       * 작업 시작했으면
                       * 해당 목적지 파동 종료.
                       */
                      setPulseTargetKey(
                        null
                      );
                    } catch (
                      error
                    ) {
                      console.log(
                        "작업 상태 변경 오류:",
                        error
                      );

                      Alert.alert(
                        "오류",
                        "작업 상태를 변경하지 못했습니다."
                      );
                    }
                  }
                }
              >
                <Text
                  style={
                    styles.actionText
                  }
                >
                  작업 시작
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
    },

    map: {
      flex: 1,
    },

    /*
     * 최초 GPS 확인 화면
     */
    locationLoading: {
      flex: 1,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "#EAF1F7",

      padding: 24,
    },

    locationLoadingText: {
      marginTop: 12,

      fontSize: 14,

      fontWeight:
        "800",

      color:
        "#12395B",
    },

    locationErrorTitle: {
      marginTop: 12,

      fontSize: 13,

      fontWeight:
        "800",

      color:
        "#607086",

      textAlign:
        "center",
    },

    locationRetryButton: {
      marginTop: 16,

      backgroundColor:
        "#12395B",

      borderRadius: 12,

      paddingHorizontal:
        18,

      paddingVertical:
        11,
    },

    locationRetryText: {
      color:
        "#FFFFFF",

      fontSize: 12,

      fontWeight:
        "900",
    },

    /*
     * 상단 방문지 패널
     */
    panel: {
      position:
        "absolute",

      top: 14,

      left: 14,

      right: 14,

      backgroundColor:
        "#FFFFFF",

      borderRadius: 18,

      padding: 12,

      shadowColor:
        "#000",

      shadowOpacity:
        0.18,

      shadowRadius: 16,

      shadowOffset: {
        width: 0,
        height: 8,
      },

      elevation: 8,
    },

    closePanelButton: {
      alignSelf:
        "flex-end",

      marginBottom: 8,

      backgroundColor:
        "#EAF1F7",

      paddingHorizontal:
        10,

      paddingVertical:
        5,

      borderRadius:
        999,
    },

    closePanelButtonText: {
      color:
        "#12395B",

      fontSize: 10,

      fontWeight:
        "900",
    },

    searchRow: {
      flexDirection:
        "row",

      gap: 8,
    },

    searchInput: {
      flex: 1,

      borderWidth: 1,

      borderColor:
        "#D9E1EA",

      borderRadius: 10,

      paddingHorizontal:
        11,

      paddingVertical:
        9,

      fontSize: 12,

      color:
        "#1F2D3D",

      backgroundColor:
        "#FFFFFF",
    },

    searchButton: {
      paddingHorizontal:
        14,

      borderRadius: 10,

      backgroundColor:
        "#12395B",

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    searchButtonText: {
      color:
        "#FFFFFF",

      fontSize: 12,

      fontWeight:
        "900",
    },

    input: {
      marginTop: 7,

      borderWidth: 1,

      borderColor:
        "#D9E1EA",

      borderRadius: 10,

      paddingHorizontal:
        11,

      paddingVertical:
        9,

      fontSize: 12,

      color:
        "#1F2D3D",

      backgroundColor:
        "#FFFFFF",
    },

    categoryTitle: {
      marginTop: 10,

      marginBottom: 7,

      fontSize: 11,

      fontWeight:
        "900",

      color:
        "#607086",
    },

    categoryRow: {
      flexDirection:
        "row",

      gap: 8,

      flexWrap:
        "wrap",
    },

    categoryButton: {
      paddingHorizontal:
        14,

      paddingVertical:
        10,

      borderRadius: 12,

      borderWidth: 1,

      borderColor:
        "#D9E1EA",

      backgroundColor:
        "#FFFFFF",
    },

    categoryButtonActive: {
      backgroundColor:
        "#12395B",

      borderColor:
        "#12395B",
    },

    categoryText: {
      fontSize: 12,

      fontWeight:
        "900",

      color:
        "#607086",
    },

    categoryTextActive: {
      color:
        "#FFFFFF",
    },

    addButton: {
      marginTop: 8,

      paddingVertical:
        11,

      borderRadius: 10,

      backgroundColor:
        "#1F9D55",

      alignItems:
        "center",
    },

    addButtonText: {
      color:
        "#FFFFFF",

      fontSize: 12,

      fontWeight:
        "900",
    },

    metaRow: {
      marginTop: 8,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",
    },

    countText: {
      fontSize: 10,

      fontWeight:
        "900",

      color:
        "#607086",
    },

    sortButton: {
      paddingHorizontal:
        12,

      paddingVertical:
        7,

      borderRadius:
        999,

      backgroundColor:
        "#12395B",
    },

    sortButtonText: {
      color:
        "#FFFFFF",

      fontSize: 10,

      fontWeight:
        "900",
    },

    locationList: {
      marginTop: 8,

      maxHeight: 105,
    },

    emptyText: {
      fontSize: 10,

      color:
        "#718096",

      marginVertical:
        4,
    },

    locationItem: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 8,

      paddingVertical:
        4,
    },

    locationMain: {
      flex: 1,

      minWidth: 0,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 8,
    },

    badge: {
      width: 22,

      height: 22,

      borderRadius: 11,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    badgeText: {
      color:
        "#FFFFFF",

      fontSize: 9,

      fontWeight:
        "900",
    },

    locationTextWrap: {
      flex: 1,

      minWidth: 0,
    },

    locationName: {
      fontSize: 10,

      fontWeight:
        "800",

      color:
        "#1F2D3D",
    },

    locationTask: {
      fontSize: 9,

      color:
        "#718096",
    },

    deleteText: {
      fontSize: 10,

      color:
        "#E74C3C",

      fontWeight:
        "900",

      paddingHorizontal:
        4,
    },

    hintText: {
      marginTop: 5,

      fontSize: 9,

      color:
        "#718096",
    },

    /*
     * 도착 알림
     */
    modalBackdrop: {
      flex: 1,

      backgroundColor:
        "rgba(0,0,0,0.3)",

      justifyContent:
        "flex-end",
    },

    bottomSheet: {
      width:
        "100%",

      backgroundColor:
        "#FFFFFF",

      borderTopLeftRadius:
        26,

      borderTopRightRadius:
        26,

      padding: 20,
    },

    handle: {
      width: 34,

      height: 4,

      backgroundColor:
        "#D9E1EA",

      borderRadius:
        999,

      alignSelf:
        "center",

      marginBottom: 16,
    },

    sheetHead: {
      flexDirection:
        "row",

      gap: 12,

      alignItems:
        "center",

      paddingBottom: 15,

      borderBottomWidth:
        1,

      borderBottomColor:
        "#E6EDF3",

      marginBottom: 14,
    },

    pinBox: {
      width: 42,

      height: 42,

      borderRadius: 14,

      backgroundColor:
        "#EAF1F7",

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    pinEmoji: {
      fontSize: 20,
    },

    sheetTextWrap: {
      flex: 1,

      minWidth: 0,
    },

    sheetTitle: {
      fontSize: 15,

      fontWeight:
        "900",

      color:
        "#1F2D3D",

      marginBottom: 4,
    },

    sheetTask: {
      fontSize: 11,

      color:
        "#718096",
    },

    sheetLabel: {
      fontSize: 10,

      fontWeight:
        "900",

      letterSpacing:
        1.6,

      color:
        "#607086",

      marginBottom: 10,
    },

    actionGrid: {
      flexDirection:
        "row",

      gap: 10,

      marginTop: 16,
    },

    actionButton: {
      flex: 1,

      borderRadius: 14,

      backgroundColor:
        "#EAF1F7",

      borderWidth: 1,

      borderColor:
        "#D9E1EA",

      paddingVertical:
        14,

      alignItems:
        "center",
    },

    actionEmoji: {
      fontSize: 24,

      marginBottom: 5,
    },

    actionText: {
      fontSize: 12,

      fontWeight:
        "900",

      color:
        "#12395B",
    },

    /*
     * API KEY 안내
     */
    placeholder: {
      flex: 1,

      backgroundColor:
        "#DDE8D5",

      alignItems:
        "center",

      justifyContent:
        "center",

      padding: 24,
    },

    placeholderTitle: {
      fontSize: 16,

      fontWeight:
        "900",

      color:
        "#12395B",
    },

    placeholderDesc: {
      fontSize: 11,

      color:
        "#607086",

      textAlign:
        "center",

      lineHeight: 18,

      marginTop: 8,
    },

    /*
     * 현재 위치 버튼
     */
    myLocationButton: {
      position:
        "absolute",

      right: 16,

      top: 380,

      width: 44,

      height: 44,

      borderRadius: 22,

      backgroundColor:
        "#FFFFFF",

      alignItems:
        "center",

      justifyContent:
        "center",

      shadowColor:
        "#000",

      shadowOpacity:
        0.2,

      shadowRadius: 4,

      shadowOffset: {
        width: 0,
        height: 2,
      },

      elevation: 6,
    },
  });