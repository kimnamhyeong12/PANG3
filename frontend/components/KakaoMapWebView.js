import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const KAKAO_JAVASCRIPT_KEY =
  process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY ||
  process.env.EXPO_PUBLIC_KAKAO_MAP_API_KEY;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const DEFAULT_REGION = {
  latitude: 35.1045,
  longitude: 128.9666,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const getMarkerColorByStatus = (status) => {
  if (status === "complete") return "#1F9D55";
  if (status === "working") return "#FACC15";
  return "#E74C3C";
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
  const webViewRef = useRef(null);
  const mapReadyRef = useRef(false);
  const pendingMapCommandsRef = useRef([]);

  const sendMapCommand = (command) => {
    const payload = JSON.stringify(command);

    if (!mapReadyRef.current || !webViewRef.current) {
      pendingMapCommandsRef.current.push(payload);
      return;
    }

    webViewRef.current.injectJavaScript(
      `window.__PANG3_MAP_COMMAND__(${payload}); true;`
    );
  };

  const mapRef = useRef({
    animateToRegion: (region, duration = 500) => {
      sendMapCommand({
        type: "MOVE",
        latitude: Number(region.latitude),
        longitude: Number(region.longitude),
        latitudeDelta: Number(region.latitudeDelta || 0.02),
        longitudeDelta: Number(region.longitudeDelta || 0.02),
        duration,
      });
    },

    fitToCoordinates: (coordinates, options = {}) => {
      sendMapCommand({
        type: "FIT",
        coordinates,
        edgePadding: options.edgePadding || {},
      });
    },
  });

  const guidingRef = useRef(false);
  const followModeRef = useRef(true);
  const alertedTargetIds = useRef(new Set());
  const lastRerouteTimeRef = useRef(0);

  const segmentFocusTimerRef = useRef(null);
  const segmentFocusKeyRef = useRef(null);
  const currentPosRef = useRef(null);
  const activePathRef = useRef([]);

  const blinkAnim = useRef(new Animated.Value(1)).current;

  const [keyword, setKeyword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [task, setTask] = useState("");
  const [selectedPos, setSelectedPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pulseTargetKey, setPulseTargetKey] = useState(null);
  const [arrivalTarget, setArrivalTarget] = useState(null);
  const [directSelectMode, setDirectSelectMode] = useState(false);

  const mapLocations = useMemo(() => {
    return (locations || []).filter(
      (loc) => loc && loc.lat !== undefined && loc.lng !== undefined
    );
  }, [locations]);

  const currentTargetIndex = currentSegmentIndex;
  const currentTarget = mapLocations[currentTargetIndex];

  const activePath = isGuiding
    ? routeSegments[currentSegmentIndex]?.path || []
    : roadPath;

  useEffect(() => {
    currentPosRef.current = currentPos;
  }, [currentPos]);

  useEffect(() => {
    activePathRef.current = activePath || [];
  }, [activePath]);

  useEffect(() => {
    return () => {
      if (segmentFocusTimerRef.current) {
        clearTimeout(segmentFocusTimerRef.current);
        segmentFocusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    startCurrentLocation();
  }, []);

  useEffect(() => {
    if (!pulseTargetKey) {
      blinkAnim.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: false,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: false,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [pulseTargetKey]);

  useEffect(() => {
    if (!isGuiding) return;
    if (!currentPos) return;
    if (!mapLocations.length) return;
    if (!currentTarget) return;

    const targetStatus = currentTarget.status || "pending";

    if (targetStatus === "complete") return;

    const targetKey =
      currentTarget.id ??
      `${currentTarget.detailAddress}-${currentTarget.lat}-${currentTarget.lng}`;

    if (alertedTargetIds.current.has(targetKey)) return;

    const distance = getDistanceMeters(
      currentPos.latitude,
      currentPos.longitude,
      Number(currentTarget.lat),
      Number(currentTarget.lng)
    );

    if (distance <= 1000) {
      alertedTargetIds.current.add(targetKey);
      setPulseTargetKey(targetKey);

      setArrivalTarget({
        ...currentTarget,
        targetKey,
      });
    }
  }, [
    isGuiding,
    currentPos,
    mapLocations,
    currentSegmentIndex,
    currentTarget,
    locations,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (segmentFocusTimerRef.current) {
      clearTimeout(segmentFocusTimerRef.current);
      segmentFocusTimerRef.current = null;
    }

    const targetPath = isGuiding
      ? routeSegments[currentSegmentIndex]?.path || []
      : roadPath;

    if (!targetPath || targetPath.length < 2) return;

    const coordinates = targetPath
      .map((p) => ({
        latitude: Number(p.lat ?? p.latitude ?? p.y),
        longitude: Number(p.lng ?? p.longitude ?? p.x),
      }))
      .filter(
        (p) =>
          !Number.isNaN(p.latitude) &&
          !Number.isNaN(p.longitude)
      );

    if (coordinates.length < 2) return;

    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    const focusKey = [
      isGuiding ? "guiding" : "preview",
      currentSegmentIndex,
      coordinates.length,
      first.latitude,
      first.longitude,
      last.latitude,
      last.longitude,
    ].join("-");

    segmentFocusKeyRef.current = focusKey;

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 300,
        right: 80,
        bottom: 260,
        left: 80,
      },
      animated: true,
    });

    if (!isGuiding) return;

    segmentFocusTimerRef.current = setTimeout(() => {
      if (segmentFocusKeyRef.current !== focusKey) return;

      const latestCurrentPos = currentPosRef.current;

      if (!latestCurrentPos || !mapRef.current) return;

      mapRef.current.animateToRegion(
        {
          latitude: latestCurrentPos.latitude,
          longitude: latestCurrentPos.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        700
      );
    }, 2000);

    return () => {
      if (segmentFocusTimerRef.current) {
        clearTimeout(segmentFocusTimerRef.current);
        segmentFocusTimerRef.current = null;
      }
    };
  }, [isGuiding, currentSegmentIndex, routeSegments, roadPath]);

  const startCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "위치 권한 필요",
          "현재 위치를 사용하려면 위치 권한이 필요합니다."
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const pos = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };

      setCurrentPos(pos);

      onCurrentLocationChange?.({
        lat: pos.latitude,
        lng: pos.longitude,
        name: "현재 위치",
      });

      mapRef.current?.animateToRegion(
        {
          latitude: pos.latitude,
          longitude: pos.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        500
      );

      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 5,
        },
        (location) => {
          const newPos = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };

          setCurrentPos(newPos);

          onCurrentLocationChange?.({
            lat: newPos.latitude,
            lng: newPos.longitude,
            name: "현재 위치",
          });

          /*
          if (guidingRef.current && followModeRef.current && mapRef.current) {
            mapRef.current.animateToRegion(
              {
                latitude: newPos.latitude,
                longitude: newPos.longitude,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              },
              700
            );
          }
          */

          const latestActivePath = activePathRef.current || [];

          if (guidingRef.current && latestActivePath.length >= 2) {
            const distanceFromPath = getMinDistanceFromPath(
              newPos,
              latestActivePath
            );

            const now = Date.now();

            if (
              distanceFromPath > 60 &&
              now - lastRerouteTimeRef.current > 15000
            ) {
              console.log("경로 이탈 감지 → 재탐색");

              lastRerouteTimeRef.current = now;

              onRerouteRequest?.({
                lat: newPos.latitude,
                lng: newPos.longitude,
              });
            }
          }
        }
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        "위치 오류",
        "현재 위치를 불러오지 못했습니다."
      );
    }
  };

  const moveToPosition = (latitude, longitude) => {
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500
    );
  };

  useEffect(() => {
    setSelectedPos(null);
  }, [clearSearchMarkerSignal]);

  useEffect(() => {
    if (!searchedPlace) return;
    if (!searchedPlace.lat || !searchedPlace.lng) return;

    const lat = Number(searchedPlace.lat);
    const lng = Number(searchedPlace.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    setSelectedPos({ lat, lng });
    setPlaceName(searchedPlace.detailAddress || "");
    setKeyword(searchedPlace.roadAddress || "");
    setDirectSelectMode(false);

    moveToPosition(lat, lng);
  }, [searchedPlace]);

  const moveToCurrentLocation = () => {
    if (!currentPos || !mapRef.current) return;

    followModeRef.current = true;

    mapRef.current.animateToRegion(
      {
        latitude: currentPos.latitude,
        longitude: currentPos.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      700
    );
  };

  const getDistanceMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;

    const dLat =
      ((lat2 - lat1) * Math.PI) / 180;

    const dLng =
      ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return (
      R *
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      )
    );
  };

  const remainingActivePath = useMemo(() => {
    if (
      !isGuiding ||
      !currentPos ||
      !activePath ||
      activePath.length < 2
    ) {
      return activePath;
    }

    let closestIndex = 0;
    let closestDistance = Infinity;

    activePath.forEach((p, index) => {
      const distance = getDistanceMeters(
        currentPos.latitude,
        currentPos.longitude,
        Number(p.lat ?? p.latitude ?? p.y),
        Number(p.lng ?? p.longitude ?? p.x)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return activePath.slice(
      Math.max(closestIndex + 0, 0)
    );
  }, [isGuiding, currentPos, activePath]);

  useEffect(() => {
    guidingRef.current = isGuiding;

    if (isGuiding) {
      followModeRef.current = true;
    }
  }, [isGuiding]);

  const getMinDistanceFromPath = (
    position,
    path
  ) => {
    if (!path || path.length === 0) {
      return 0;
    }

    let minDistance = Infinity;

    for (const p of path) {
      const distance = getDistanceMeters(
        position.latitude,
        position.longitude,
        Number(p.lat ?? p.latitude ?? p.y),
        Number(p.lng ?? p.longitude ?? p.x)
      );

      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance;
  };

  const focusLocation = (loc) => {
    moveToPosition(
      Number(loc.lat),
      Number(loc.lng)
    );

    onMarkerClick?.(loc);
  };

  const removeLocation = async (id) => {
    const nextLocations =
      locations.filter(
        (loc) => loc.id !== id
      );

    onLocationsChange?.(
      nextLocations
    );

    if (
      selectedLocation?.id === id
    ) {
      setSelectedLocation(null);
    }
  };

  const getDistance = (a, b) => {
    const dx =
      Number(a.lat) - Number(b.lat);

    const dy =
      Number(a.lng) - Number(b.lng);

    return Math.sqrt(
      dx * dx + dy * dy
    );
  };

  const optimizeRoute = () => {
    if (locations.length < 2) {
      Alert.alert(
        "정렬 불가",
        "방문지가 2개 이상 필요합니다."
      );

      return;
    }

    if (!currentPos) {
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
      lat: currentPos.latitude,
      lng: currentPos.longitude,
    };

    while (
      remaining.length > 0
    ) {
      let nearestIndex = 0;

      let nearestDistance =
        getDistance(
          current,
          remaining[0]
        );

      for (
        let i = 1;
        i < remaining.length;
        i++
      ) {
        const distance =
          getDistance(
            current,
            remaining[i]
          );

        if (
          distance <
          nearestDistance
        ) {
          nearestDistance =
            distance;

          nearestIndex = i;
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

      current = nearest;
    }

    alertedTargetIds.current.clear();

    onLocationsChange?.(
      optimized
    );

    Alert.alert(
      "정렬 완료",
      "현재 위치 기준으로 가까운 순서로 정렬했습니다."
    );
  };

  const handleMapPress = (
    latitude,
    longitude
  ) => {
    if (!mapSelectMode) return;

    setSelectedPos({
      lat: latitude,
      lng: longitude,
    });

    setKeyword("");
    setPlaceName("");
    setTask("");

    setDirectSelectMode(true);

    setPanelOpen?.(false);

    onDirectPlaceSelect?.({
      lat: latitude,
      lng: longitude,
      detailAddress:
        "지도 선택 위치",
      roadAddress:
        "지도에서 선택",
    });
  };

  const handleFieldAction = (
    action
  ) => {
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

  useEffect(() => {
    const locationsForMap =
      mapLocations.map(
        (loc, index) => {
          const locKey =
            loc.id ??
            `${loc.detailAddress}-${loc.lat}-${loc.lng}`;

          return {
            ...loc,
            color:
              getMarkerColorByStatus(
                loc.status ||
                  "pending"
              ),
            current:
              isGuiding &&
              index ===
                currentTargetIndex,
            pulse:
              pulseTargetKey ===
              locKey,
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
        activePath,
      },
    });
  }, [
    mapLocations,
    selectedPos,
    currentPos,
    roadPath,
    activePath,
    isGuiding,
    currentTargetIndex,
    pulseTargetKey,
  ]);

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

  const kakaoMapHtml = `
<!doctype html>
<html>
<head>
<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"
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

.marker {
  width: 34px;
  height: 34px;
  border-radius: 17px;
  border: 3px solid white;
  box-sizing: border-box;
  color: white;
  font: 700 14px/28px Arial, sans-serif;
  text-align: center;
  box-shadow: 0 2px 7px rgba(0,0,0,.28);
}

.marker.current {
  border-color: #2563EB;
  border-width: 4px;
}

.marker.pulse {
  animation: pulse .9s infinite alternate;
}

@keyframes pulse {
  from {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(37,99,235,.55);
  }

  to {
    transform: scale(1.18);
    box-shadow: 0 0 0 10px rgba(37,99,235,0);
  }
}

.selected {
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #1F9D55;
  border: 3px solid white;
  box-shadow: 0 2px 7px rgba(0,0,0,.3);
}
</style>

<script
  src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JAVASCRIPT_KEY}&autoload=false">
</script>
</head>

<body>

<div id="map"></div>

<script>
(function(){

  var map;
  var overlays = [];
  var selectedOverlay = null;
  var roadLine = null;
  var activeLine = null;
  var userMarker = null;

  var ready = false;
  var queued = [];

  function post(data) {
    if (
      window.ReactNativeWebView
    ) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify(data)
      );
    }
  }

  function latLng(p) {
    return new window.kakao.maps.LatLng(
      Number(
        p.latitude != null
          ? p.latitude
          : (
              p.lat != null
                ? p.lat
                : p.y
            )
      ),
      Number(
        p.longitude != null
          ? p.longitude
          : (
              p.lng != null
                ? p.lng
                : p.x
            )
      )
    );
  }

  function clearOverlays() {

    overlays.forEach(
      function(o) {
        o.setMap(null);
      }
    );

    overlays = [];

    if (
      selectedOverlay
    ) {
      selectedOverlay.setMap(
        null
      );

      selectedOverlay =
        null;
    }

    if (roadLine) {
      roadLine.setMap(
        null
      );

      roadLine = null;
    }

    if (activeLine) {
      activeLine.setMap(
        null
      );

      activeLine = null;
    }
  }

  function markerHtml(
    index,
    color,
    current,
    pulse
  ) {
    return (
      '<div class="marker' +
      (current
        ? ' current'
        : '') +
      (pulse
        ? ' pulse'
        : '') +
      '" style="background:' +
      color +
      '">' +
      (index + 1) +
      '</div>'
    );
  }

  function setData(d) {

    if (!ready) {
      queued.push({
        type: 'DATA',
        data: d
      });

      return;
    }

    clearOverlays();

    (d.locations || [])
      .forEach(
        function(
          loc,
          index
        ) {

          var pos =
            new window.kakao.maps.LatLng(
              Number(loc.lat),
              Number(loc.lng)
            );

          var el =
            document.createElement(
              'div'
            );

          el.innerHTML =
            markerHtml(
              index,
              loc.color,
              loc.current,
              loc.pulse
            );

          var overlay =
            new window.kakao.maps.CustomOverlay({
              position: pos,
              content:
                el.firstChild,
              yAnchor: .5,
              xAnchor: .5,
              zIndex:
                10 + index
            });

          overlay.setMap(
            map
          );

          overlays.push(
            overlay
          );

          overlay
            .getContent()
            .addEventListener(
              'click',
              function(e) {
                e.stopPropagation();

                post({
                  type:
                    'MARKER_PRESS',
                  index:
                    index
                });
              }
            );
        }
      );

    if (
      d.selectedPos
    ) {
      var sel =
        document.createElement(
          'div'
        );

      sel.className =
        'selected';

      selectedOverlay =
        new window.kakao.maps.CustomOverlay({
          position:
            new window.kakao.maps.LatLng(
              Number(
                d.selectedPos.lat
              ),
              Number(
                d.selectedPos.lng
              )
            ),
          content:
            sel,
          yAnchor:
            .5,
          xAnchor:
            .5,
          zIndex:
            50
        });

      selectedOverlay.setMap(
        map
      );
    }

    if (
      (d.roadPath || [])
        .length >= 2
    ) {
      roadLine =
        new window.kakao.maps.Polyline({
          path:
            d.roadPath.map(
              latLng
            ),
          strokeWeight:
            5,
          strokeColor:
            '#12395B',
          strokeOpacity:
            .25,
          strokeStyle:
            'solid'
        });

      roadLine.setMap(
        map
      );
    }

    if (
      (d.activePath || [])
        .length >= 2
    ) {
      activeLine =
        new window.kakao.maps.Polyline({
          path:
            d.activePath.map(
              latLng
            ),
          strokeWeight:
            9,
          strokeColor:
            '#12395B',
          strokeOpacity:
            1,
          strokeStyle:
            'solid'
        });

      activeLine.setMap(
        map
      );
    }

    if (
      d.currentPos
    ) {

      var cp =
        new window.kakao.maps.LatLng(
          Number(
            d.currentPos.latitude
          ),
          Number(
            d.currentPos.longitude
          )
        );

      if (
        !userMarker
      ) {

        userMarker =
          new window.kakao.maps.Marker({
            position:
              cp,
            zIndex:
              100
          });

        userMarker.setMap(
          map
        );

      } else {

        userMarker.setPosition(
          cp
        );
      }
    }
  }

  function command(c) {

    if (!ready) {
      queued.push(c);
      return;
    }

    if (
      c.type === 'DATA'
    ) {
      setData(
        c.data
      );

      return;
    }

    if (
      c.type === 'MOVE'
    ) {

      map.panTo(
        new window.kakao.maps.LatLng(
          c.latitude,
          c.longitude
        )
      );

      var level =
        Math.max(
          1,
          Math.min(
            12,
            Math.round(
              Math.log2(
                Math.max(
                  c.latitudeDelta ||
                    .02,
                  c.longitudeDelta ||
                    .02
                ) /
                .002
              )
            ) +
            3
          )
        );

      map.setLevel(
        level,
        {
          animate: true
        }
      );

      return;
    }

    if (
      c.type === 'FIT'
    ) {

      var b =
        new window.kakao.maps.LatLngBounds();

      (
        c.coordinates ||
        []
      ).forEach(
        function(p) {
          b.extend(
            latLng(p)
          );
        }
      );

      if (
        (
          c.coordinates ||
          []
        ).length
      ) {
        map.setBounds(
          b,
          40,
          40,
          40,
          40
        );
      }

      return;
    }
  }

  window.__PANG3_MAP_COMMAND__ =
    command;

  function startKakaoMap() {

    if (
      !window.kakao ||
      !window.kakao.maps ||
      !window.kakao.maps.load
    ) {
      setTimeout(
        startKakaoMap,
        100
      );

      return;
    }

    window.kakao.maps.load(
      function() {

        map =
          new window.kakao.maps.Map(
            document.getElementById(
              'map'
            ),
            {
              center:
                new window.kakao.maps.LatLng(
                  ${DEFAULT_REGION.latitude},
                  ${DEFAULT_REGION.longitude}
                ),
              level:
                5
            }
          );

        window.kakao.maps.event.addListener(
          map,
          'click',
          function(
            mouseEvent
          ) {
            post({
              type:
                'MAP_PRESS',
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
          'dragstart',
          function() {
            post({
              type:
                'PAN_DRAG'
            });
          }
        );

        ready = true;

        post({
          type: 'READY'
        });

        var q =
          queued.slice();

        queued = [];

        q.forEach(
          command
        );
      }
    );
  }

  startKakaoMap();

})();
</script>

</body>
</html>
`;

  const handleWebViewMessage = (
    event
  ) => {
    try {
      const message =
        JSON.parse(
          event.nativeEvent.data
        );

      if (
        message.type ===
        "READY"
      ) {
        mapReadyRef.current =
          true;

        const queued =
          pendingMapCommandsRef.current.slice();

        pendingMapCommandsRef.current =
          [];

        queued.forEach(
          (payload) => {
            webViewRef.current?.injectJavaScript(
              `window.__PANG3_MAP_COMMAND__(${payload}); true;`
            );
          }
        );

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
        const loc =
          mapLocations[
            Number(
              message.index
            )
          ];

        if (loc) {
          focusLocation(loc);
        }
      }
    } catch (error) {
      console.log(
        "카카오맵 메시지 처리 오류",
        error
      );
    }
  };

  return (
    <View
      style={
        styles.container
      }
    >
      <WebView
        ref={
          webViewRef
        }
        style={
          styles.map
        }
        originWhitelist={[
          "*",
        ]}
        source={{
          html:
            kakaoMapHtml,
          baseUrl:
            "https://localhost/",
        }}
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
                value={
                  keyword
                }
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
                    task === item &&
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
                      task === item &&
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
              {locations.length}
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
                  loc,
                  index
                ) => (
                  <View
                    key={`${loc.detailAddress || "loc"}-${loc.lat}-${loc.lng}-${index}`}
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
                          loc
                        )
                      }
                    >
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor:
                              getMarkerColorByStatus(
                                loc.status ||
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
                          {loc.detailAddress ||
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
                          {loc.task ||
                            "현장 확인"}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        removeLocation(
                          loc.id
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

      <Modal
        visible={
          !!arrivalTarget
        }
        transparent
        animationType="slide"
        onRequestClose={() => {
          setArrivalTarget(
            null
          );

          setPulseTargetKey(
            null
          );
        }}
      >
        <TouchableOpacity
          style={
            styles.modalBackdrop
          }
          activeOpacity={
            1
          }
          onPress={() => {
            setArrivalTarget(
              null
            );

            setPulseTargetKey(
              null
            );
          }}
        >
          <TouchableOpacity
            style={
              styles.bottomSheet
            }
            activeOpacity={
              1
            }
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
              작업 지점 근처에
              도착했습니다
            </Text>

            <Text
              style={
                styles.sheetTask
              }
            >
              {arrivalTarget?.detailAddress ||
                "목적지"}{" "}
              작업을
              시작하시겠습니까?
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
                onPress={async () => {
                  if (
                    arrivalTarget?.id
                  ) {
                    await fetch(
                      `${API_BASE_URL}/api/locations/${arrivalTarget.id}/status`,
                      {
                        method:
                          "PATCH",
                        headers: {
                          "Content-Type":
                            "application/json",
                        },
                        body:
                          JSON.stringify({
                            status:
                              "working",
                          }),
                      }
                    );
                  }

                  const updated =
                    locations.map(
                      (loc) => {
                        const locKey =
                          loc.id ??
                          `${loc.detailAddress}-${loc.lat}-${loc.lng}`;

                        if (
                          locKey ===
                          arrivalTarget?.targetKey
                        ) {
                          return {
                            ...loc,
                            status:
                              "working",
                          };
                        }

                        return loc;
                      }
                    );

                  onLocationsChange?.(
                    updated
                  );

                  setArrivalTarget(
                    null
                  );

                  setPulseTargetKey(
                    null
                  );
                }}
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

    panel: {
      position: "absolute",
      top: 14,
      left: 14,
      right: 14,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 18,
      padding: 12,
      shadowColor: "#000",
      shadowOpacity: 0.18,
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
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },

    closePanelButtonText: {
      color: "#12395B",
      fontSize: 10,
      fontWeight: "900",
    },

    searchRow: {
      flexDirection: "row",
      gap: 8,
    },

    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor:
        "#D9E1EA",
      borderRadius: 10,
      paddingHorizontal: 11,
      paddingVertical: 9,
      fontSize: 12,
      color: "#1F2D3D",
      backgroundColor:
        "#FFFFFF",
    },

    searchButton: {
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor:
        "#12395B",
      alignItems: "center",
      justifyContent:
        "center",
    },

    searchButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    input: {
      marginTop: 7,
      borderWidth: 1,
      borderColor:
        "#D9E1EA",
      borderRadius: 10,
      paddingHorizontal: 11,
      paddingVertical: 9,
      fontSize: 12,
      color: "#1F2D3D",
      backgroundColor:
        "#FFFFFF",
    },

    categoryTitle: {
      marginTop: 10,
      marginBottom: 7,
      fontSize: 11,
      fontWeight: "900",
      color: "#607086",
    },

    categoryRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },

    categoryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
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
      fontWeight: "900",
      color: "#607086",
    },

    categoryTextActive: {
      color: "#FFFFFF",
    },

    addButton: {
      marginTop: 8,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor:
        "#1F9D55",
      alignItems: "center",
    },

    addButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    metaRow: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    countText: {
      fontSize: 10,
      fontWeight: "900",
      color: "#607086",
    },

    sortButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor:
        "#12395B",
    },

    sortButtonText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },

    locationList: {
      marginTop: 8,
      maxHeight: 105,
    },

    emptyText: {
      fontSize: 10,
      color: "#718096",
      marginVertical: 4,
    },

    locationItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
    },

    locationMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    badge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent:
        "center",
    },

    badgeText: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "900",
    },

    locationTextWrap: {
      flex: 1,
      minWidth: 0,
    },

    locationName: {
      fontSize: 10,
      fontWeight: "800",
      color: "#1F2D3D",
    },

    locationTask: {
      fontSize: 9,
      color: "#718096",
    },

    deleteText: {
      fontSize: 10,
      color: "#E74C3C",
      fontWeight: "900",
      paddingHorizontal: 4,
    },

    hintText: {
      marginTop: 5,
      fontSize: 9,
      color: "#718096",
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor:
        "rgba(0,0,0,0.3)",
      justifyContent:
        "flex-end",
    },

    bottomSheet: {
      width: "100%",
      backgroundColor:
        "#FFFFFF",
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 20,
    },

    handle: {
      width: 34,
      height: 4,
      backgroundColor:
        "#D9E1EA",
      borderRadius: 999,
      alignSelf: "center",
      marginBottom: 16,
    },

    sheetHead: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      paddingBottom: 15,
      borderBottomWidth: 1,
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
      alignItems: "center",
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
      fontWeight: "900",
      color: "#1F2D3D",
      marginBottom: 4,
    },

    sheetTask: {
      fontSize: 11,
      color: "#718096",
    },

    sheetLabel: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.6,
      color: "#607086",
      marginBottom: 10,
    },

    actionGrid: {
      flexDirection: "row",
      gap: 10,
    },

    actionButton: {
      flex: 1,
      borderRadius: 14,
      backgroundColor:
        "#EAF1F7",
      borderWidth: 1,
      borderColor:
        "#D9E1EA",
      paddingVertical: 14,
      alignItems: "center",
    },

    actionEmoji: {
      fontSize: 24,
      marginBottom: 5,
    },

    actionText: {
      fontSize: 12,
      fontWeight: "900",
      color: "#12395B",
    },

    placeholder: {
      flex: 1,
      backgroundColor:
        "#DDE8D5",
      alignItems: "center",
      justifyContent:
        "center",
      padding: 24,
    },

    placeholderTitle: {
      fontSize: 16,
      fontWeight: "900",
      color: "#12395B",
    },

    placeholderDesc: {
      fontSize: 11,
      color: "#607086",
      textAlign: "center",
      lineHeight: 18,
      marginTop: 8,
    },

    numberMarker: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor:
        "#FFFFFF",
      alignItems: "center",
      justifyContent:
        "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 5,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      elevation: 6,
    },

    currentTargetMarker: {
      borderWidth: 4,
      borderColor:
        "#000000",
    },

    pulseMarker: {
      borderWidth: 3,
      borderColor:
        "#2563EB",
    },

    numberMarkerText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },

    myLocationButton: {
      position: "absolute",
      right: 16,
      top: 380,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor:
        "#FFFFFF",
      alignItems: "center",
      justifyContent:
        "center",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 4,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      elevation: 6,
    },
  });