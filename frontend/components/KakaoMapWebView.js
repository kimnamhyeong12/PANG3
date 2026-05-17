import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
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
  onCurrentLocationChange,
  onMarkerClick,
  onLocationsChange,
}) {
  const mapRef = useRef(null);
  const guidingRef = useRef(false);
  const followModeRef = useRef(true);
  const alertedTargetIds = useRef(new Set());

  const [keyword, setKeyword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [task, setTask] = useState("");
  const [selectedPos, setSelectedPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pulseTargetKey, setPulseTargetKey] = useState(null);

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
    guidingRef.current = isGuiding;

    if (isGuiding) {
      followModeRef.current = true;
    }
  }, [isGuiding]);

  useEffect(() => {
    startCurrentLocation();
  }, []);

  useEffect(() => {
    if (!isGuiding) return;
    if (!currentPos) return;
    if (!mapLocations.length) return;
    if (!currentTarget) return;

    const targetStatus = currentTarget.status || "pending";
    if (targetStatus !== "pending") return;

    const targetKey =
      currentTarget.id ??
      `${currentTarget.name}-${currentTarget.lat}-${currentTarget.lng}`;

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

      Alert.alert(
        "작업 시작",
        `${currentTarget.name} 근처에 도착했습니다. 작업을 시작하시겠습니까?`,
        [
          {
            text: "취소",
            style: "cancel",
            onPress: () => setPulseTargetKey(null),
          },
          {
            text: "확인",
            onPress: () => {
              const updated = locations.map((loc) => {
                const locKey = loc.id ?? `${loc.name}-${loc.lat}-${loc.lng}`;

                if (locKey === targetKey) {
                  return { ...loc, status: "working" };
                }

                return loc;
              });

              onLocationsChange?.(updated);
              setPulseTargetKey(null);
            },
          },
        ]
      );
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

    const targetPath = isGuiding ? activePath : roadPath;
    if (!targetPath || targetPath.length < 2) return;

    const coordinates = targetPath.map((p) => ({
      latitude: Number(p.lat ?? p.latitude ?? p.y),
      longitude: Number(p.lng ?? p.longitude ?? p.x),
    }));

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 120,
        right: 60,
        bottom: 220,
        left: 60,
      },
      animated: true,
    });

    if (isGuiding && currentPos) {
      setTimeout(() => {
        mapRef.current?.animateToRegion(
          {
            latitude: currentPos.latitude,
            longitude: currentPos.longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          },
          1000
        );
      }, 1500);
    }
  }, [isGuiding, currentSegmentIndex, roadPath, activePath]);

  const startCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("위치 권한 필요", "현재 위치를 사용하려면 위치 권한이 필요합니다.");
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
        }
      );
    } catch (error) {
      console.log(error);
      Alert.alert("위치 오류", "현재 위치를 불러오지 못했습니다.");
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
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const searchPlace = async () => {
    const q = keyword.trim();

    if (!q) {
      Alert.alert("입력 필요", "주소나 장소명을 입력하세요.");
      return;
    }

    if (!KAKAO_REST_API_KEY) {
      Alert.alert(
        "REST API 키 필요",
        "mobile/.env에 EXPO_PUBLIC_KAKAO_REST_API_KEY를 넣어야 합니다."
      );
      return;
    }

    try {
      setIsSearching(true);

      const keywordUrl =
        "https://dapi.kakao.com/v2/local/search/keyword.json?query=" +
        encodeURIComponent(q);

      let res = await fetch(keywordUrl, {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      });

      let data = await res.json();

      if (!data.documents || data.documents.length === 0) {
        const addressUrl =
          "https://dapi.kakao.com/v2/local/search/address.json?query=" +
          encodeURIComponent(q);

        res = await fetch(addressUrl, {
          headers: {
            Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
          },
        });

        data = await res.json();
      }

      if (!data.documents || data.documents.length === 0) {
        Alert.alert("검색 실패", "검색 결과가 없습니다.");
        return;
      }

      const first = data.documents[0];

      const lat = Number(first.y);
      const lng = Number(first.x);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        Alert.alert("검색 오류", "좌표를 읽지 못했습니다.");
        return;
      }

      setSelectedPos({ lat, lng });
      setPlaceName(first.place_name || first.address_name || q);

      moveToPosition(lat, lng);
    } catch (error) {
      console.log(error);
      Alert.alert("검색 오류", "카카오 REST API 검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const addLocation = async () => {
    if (!selectedPos) {
      Alert.alert("위치 선택 필요", "먼저 지도에서 위치를 선택하거나 주소를 검색하세요.");
      return;
    }

    if (!placeName.trim()) {
      Alert.alert("방문지 이름 필요", "방문지 이름을 입력하세요.");
      return;
    }

    const newLoc = {
      name: placeName.trim(),
      address: keyword.trim(),
      lat: selectedPos.lat,
      lng: selectedPos.lng,
      status: "pending",
    };

    try {
      if (!API_BASE_URL) {
        throw new Error("API_BASE_URL 없음");
      }

      const res = await fetch(`${API_BASE_URL}/api/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newLoc),
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`저장 실패: ${res.status}`);
      }

      const savedLocation = JSON.parse(text);

      const nextLocations = [
        ...locations,
        {
          ...savedLocation,
          status: savedLocation.status || "pending",
          task: task.trim() || "점검",
        },
      ];

      onLocationsChange?.(nextLocations);

      setKeyword("");
      setPlaceName("");
      setTask("");
      setSelectedPos(null);

      Alert.alert("저장 완료", "방문지가 DB에 저장되었습니다.");
    } catch (error) {
      console.log(error);
      Alert.alert(
        "DB 저장 실패",
        "백엔드 실행 상태와 EXPO_PUBLIC_API_BASE_URL을 확인하세요."
      );
    }
  };

  const focusLocation = (loc) => {
    setSelectedLocation(loc);
    moveToPosition(Number(loc.lat), Number(loc.lng));
    onMarkerClick?.(loc);
  };

  const removeLocation = async (id) => {
    const nextLocations = locations.filter((loc) => loc.id !== id);
    onLocationsChange?.(nextLocations);

    if (selectedLocation?.id === id) {
      setSelectedLocation(null);
    }
  };

  const getDistance = (a, b) => {
    const dx = Number(a.lat) - Number(b.lat);
    const dy = Number(a.lng) - Number(b.lng);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const optimizeRoute = () => {
    if (locations.length < 2) {
      Alert.alert("정렬 불가", "방문지가 2개 이상 필요합니다.");
      return;
    }

    if (!currentPos) {
      Alert.alert("현재 위치 필요", "현재 위치를 먼저 불러와야 합니다.");
      return;
    }

    const remaining = [...locations];
    const optimized = [];

    let current = {
      lat: currentPos.latitude,
      lng: currentPos.longitude,
    };

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = getDistance(current, remaining[0]);

      for (let i = 1; i < remaining.length; i++) {
        const distance = getDistance(current, remaining[i]);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      const [nearest] = remaining.splice(nearestIndex, 1);
      optimized.push(nearest);
      current = nearest;
    }

    alertedTargetIds.current.clear();

    onLocationsChange?.(optimized);

    Alert.alert("정렬 완료", "현재 위치 기준으로 가까운 순서로 정렬했습니다.");
  };

  const handleMapPress = (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;

    setSelectedPos({
      lat: latitude,
      lng: longitude,
    });

    setPlaceName("");
  };

  const handleFieldAction = (action) => {
    if (!selectedLocation) return;

    setSelectedLocation(null);
    onMarkerClick?.(selectedLocation, action);
  };

  if (!KAKAO_REST_API_KEY) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>카카오 REST API 키 필요</Text>
        <Text style={styles.placeholderDesc}>
          mobile/.env 파일에 EXPO_PUBLIC_KAKAO_REST_API_KEY를 넣어야 주소검색이 가능합니다.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        onPress={handleMapPress}
        onPanDrag={() => {
          followModeRef.current = false;
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
      >
        {selectedPos && (
          <Marker
            coordinate={{
              latitude: selectedPos.lat,
              longitude: selectedPos.lng,
            }}
            title="선택한 위치"
            description="방문지로 추가할 수 있습니다."
            pinColor={Platform.OS === "android" ? "green" : undefined}
          />
        )}

        {mapLocations.map((loc, index) => {
          const locKey = loc.id ?? `${loc.name}-${loc.lat}-${loc.lng}`;
          const isPulsing = pulseTargetKey === locKey;

          return (
            <Marker
              key={`${loc.name || "loc"}-${loc.lat}-${loc.lng}-${index}`}
              coordinate={{
                latitude: Number(loc.lat),
                longitude: Number(loc.lng),
              }}
              title={`${index + 1}. ${loc.name}`}
              description={loc.task || "현장 확인"}
              onPress={() => focusLocation(loc)}
              zIndex={index + 1}
            >
              <View
                style={[
                  styles.numberMarker,
                  {
                    backgroundColor: getMarkerColorByStatus(
                      loc.status || "pending"
                    ),
                  },
                  isGuiding &&
                    index === currentTargetIndex &&
                    styles.currentTargetMarker,
                  isPulsing && styles.pulseMarker,
                ]}
              >
                <Text style={styles.numberMarkerText}>{index + 1}</Text>
              </View>
            </Marker>
          );
        })}

        {roadPath.length >= 2 && (
          <Polyline
            coordinates={roadPath.map((p) => ({
              latitude: Number(p.lat ?? p.latitude ?? p.y),
              longitude: Number(p.lng ?? p.longitude ?? p.x),
            }))}
            strokeWidth={5}
            strokeColor="rgba(18, 57, 91, 0.25)"
          />
        )}

        {activePath.length >= 2 && (
          <Polyline
            coordinates={activePath.map((p) => ({
              latitude: Number(p.lat ?? p.latitude ?? p.y),
              longitude: Number(p.lng ?? p.longitude ?? p.x),
            }))}
            strokeWidth={7}
            strokeColor="#12395B"
          />
        )}
      </MapView>

      {currentPos && (
        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={moveToCurrentLocation}
        >
          <Ionicons name="locate" size={24} color="#12395B" />
        </TouchableOpacity>
      )}

      {panelOpen && (
        <View style={styles.panel}>
          <TouchableOpacity
            style={styles.closePanelButton}
            onPress={() => setPanelOpen?.(false)}
          >
            <Text style={styles.closePanelButtonText}>접기</Text>
          </TouchableOpacity>

          <View style={styles.searchRow}>
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="주소/장소"
              placeholderTextColor="#8A98A8"
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={searchPlace}
            />

            <TouchableOpacity
              style={styles.searchButton}
              onPress={searchPlace}
              disabled={isSearching}
            >
              <Text style={styles.searchButtonText}>
                {isSearching ? "검색중" : "검색"}
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={placeName}
            onChangeText={setPlaceName}
            placeholder="방문지 이름"
            placeholderTextColor="#8A98A8"
            style={styles.input}
          />

          <Text style={styles.categoryTitle}>작업 카테고리</Text>

          <View style={styles.categoryRow}>
            {["점검", "공사", "안전", "환경", "민원"].map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.categoryButton,
                  task === item && styles.categoryButtonActive,
                ]}
                onPress={() => setTask(item)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    task === item && styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.addButton} onPress={addLocation}>
            <Text style={styles.addButtonText}>방문 추가</Text>
          </TouchableOpacity>

          <View style={styles.metaRow}>
            <Text style={styles.countText}>방문지 {locations.length}개</Text>

            <TouchableOpacity style={styles.sortButton} onPress={optimizeRoute}>
              <Text style={styles.sortButtonText}>정렬</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.locationList}>
            {locations.length === 0 ? (
              <Text style={styles.emptyText}>추가로 방문하세요.</Text>
            ) : (
              locations.map((loc, index) => (
                <View
                  key={`${loc.name || "loc"}-${loc.lat}-${loc.lng}-${index}`}
                  style={styles.locationItem}
                >
                  <TouchableOpacity
                    style={styles.locationMain}
                    onPress={() => focusLocation(loc)}
                  >
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: getMarkerColorByStatus(
                            loc.status || "pending"
                          ),
                        },
                      ]}
                    >
                      <Text style={styles.badgeText}>{index + 1}</Text>
                    </View>

                    <View style={styles.locationTextWrap}>
                      <Text style={styles.locationName} numberOfLines={1}>
                        {loc.name || "이름 없음"}
                      </Text>
                      <Text style={styles.locationTask} numberOfLines={1}>
                        {loc.task || "현장 확인"}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => removeLocation(loc.id)}>
                    <Text style={styles.deleteText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          {currentPos && (
            <Text style={styles.hintText}>
              {isGuiding
                ? `안내 중 · 현재 목적지: ${
                    currentTarget?.name || "마지막 구간"
                  }`
                : "안내 시작 전"}
            </Text>
          )}
        </View>
      )}

      <Modal
        visible={!!selectedLocation}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedLocation(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedLocation(null)}
        >
          <TouchableOpacity
            style={styles.bottomSheet}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.handle} />

            <View style={styles.sheetHead}>
              <View style={styles.pinBox}>
                <Text style={styles.pinEmoji}>📍</Text>
              </View>

              <View style={styles.sheetTextWrap}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {selectedLocation?.name || "이름 없음"}
                </Text>
                <Text style={styles.sheetTask} numberOfLines={1}>
                  {selectedLocation?.task || "현장 확인"}
                </Text>
              </View>
            </View>

            <Text style={styles.sheetLabel}>FIELD RECORD</Text>

            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleFieldAction("photo")}
              >
                <Text style={styles.actionEmoji}>📷</Text>
                <Text style={styles.actionText}>사진</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleFieldAction("memo")}
              >
                <Text style={styles.actionEmoji}>📝</Text>
                <Text style={styles.actionText}>메모</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleFieldAction("status")}
              >
                <Text style={styles.actionEmoji}>🔄</Text>
                <Text style={styles.actionText}>상태</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  panel: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  closePanelButton: {
    alignSelf: "flex-end",
    marginBottom: 8,
    backgroundColor: "#EAF1F7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  closePanelButtonText: {
    color: "#12395B",
    fontSize: 10,
    fontWeight: "900",
  },

  searchRow: { flexDirection: "row", gap: 8 },

  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D9E1EA",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 12,
    color: "#1F2D3D",
    backgroundColor: "#FFFFFF",
  },

  searchButton: {
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#12395B",
    alignItems: "center",
    justifyContent: "center",
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  input: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: "#D9E1EA",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 12,
    color: "#1F2D3D",
    backgroundColor: "#FFFFFF",
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
    borderColor: "#D9E1EA",
    backgroundColor: "#FFFFFF",
  },

  categoryButtonActive: {
    backgroundColor: "#12395B",
    borderColor: "#12395B",
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
    backgroundColor: "#1F9D55",
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
    justifyContent: "space-between",
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
    backgroundColor: "#12395B",
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
    justifyContent: "center",
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
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },

  bottomSheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
  },

  handle: {
    width: 34,
    height: 4,
    backgroundColor: "#D9E1EA",
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
    borderBottomColor: "#E6EDF3",
    marginBottom: 14,
  },

  pinBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EAF1F7",
    alignItems: "center",
    justifyContent: "center",
  },

  pinEmoji: { fontSize: 20 },

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
    backgroundColor: "#EAF1F7",
    borderWidth: 1,
    borderColor: "#D9E1EA",
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
    backgroundColor: "#DDE8D5",
    alignItems: "center",
    justifyContent: "center",
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
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },

  currentTargetMarker: {
    borderWidth: 4,
    borderColor: "#000000",
  },

  pulseMarker: {
    borderWidth: 3,
    borderColor: "#2563EB",

  },

  numberMarkerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  myLocationButton: {
    position: "absolute",
    right: 16,
    top: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});