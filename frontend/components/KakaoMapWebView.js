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

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const DEFAULT_REGION = {
  latitude: 35.1045,
  longitude: 128.9666,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function KakaoMapWebView({
  locations = [],
  roadPath = [],
  panelOpen = true,
  setPanelOpen,
  routeSegments = [],
  currentSegmentIndex = 0,
  onMarkerClick,
  onLocationsChange,
}) {
  const mapRef = useRef(null);

  const [keyword, setKeyword] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [task, setTask] = useState("");
  const [selectedPos, setSelectedPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const mapLocations = useMemo(() => {
    return (locations || []).filter(
      (loc) => loc && loc.lat !== undefined && loc.lng !== undefined
    );
  }, [locations]);

  useEffect(() => {
    startCurrentLocation();
  }, []);

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
          setCurrentPos({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
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

      console.log("방문지 저장 응답 상태:", res.status);
      console.log("방문지 저장 응답 내용:", text);

      if (!res.ok) {
        throw new Error(`저장 실패: ${res.status}`);
      }

      const savedLocation = JSON.parse(text);

      const nextLocations = [
        ...locations,
        {
          ...savedLocation,
          task: task.trim() || "현장 확인",
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

  const getMarkerColorByStatus = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (
      normalized === "complete" ||
      normalized === "done" ||
      normalized === "처리완료"
    ) {
      return "green";
    }

    if (
      normalized === "progress" ||
      normalized === "in_progress" ||
      normalized === "processing" ||
      normalized === "처리중"
    ) {
      return "yellow";
    }

    return "red";
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

  const getDist = (a, b) =>
    Math.abs(Number(a.lat ?? a.latitude ?? a.y) - Number(b.lat)) +
    Math.abs(Number(a.lng ?? a.longitude ?? a.x) - Number(b.lng));

  const startLoc = mapLocations[currentSegmentIndex];
  const endLoc = mapLocations[currentSegmentIndex + 1];

  let activePath = roadPath;

  if (startLoc && endLoc && roadPath.length >= 2) {
    const startIdx = roadPath.reduce(
      (best, p, i) => (getDist(p, startLoc) < getDist(roadPath[best], startLoc) ? i : best),
      0
    );

    const endIdx = roadPath.reduce(
      (best, p, i) => (getDist(p, endLoc) < getDist(roadPath[best], endLoc) ? i : best),
      0
    );

    activePath =
      startIdx <= endIdx
        ? roadPath.slice(startIdx, endIdx + 1)
        : roadPath.slice(endIdx, startIdx + 1);
  }
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {currentPos && (
          <Marker
            coordinate={currentPos}
            title="현재 위치"
            description="내 현재 위치"
            pinColor={Platform.OS === "android" ? "blue" : undefined}
          />
        )}

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

        {mapLocations.map((loc, index) => (
          <Marker
            key={`${loc.name || 'loc'}-${loc.lat}-${loc.lng}-${index}`}
            coordinate={{
              latitude: Number(loc.lat),
              longitude: Number(loc.lng),
            }}
            title={`${index + 1}. ${loc.name}`}
            description={loc.task || "현장 확인"}
            pinColor={getMarkerColorByStatus(loc.status)}
            onPress={() => focusLocation(loc)}
            zIndex={index + 1}
          >
            <View
              style={[
                styles.numberMarker,
                loc.priority && styles.priorityNumberMarker,
              ]}
            >
              <Text style={styles.numberMarkerText}>
                {index + 1}
              </Text>
            </View>
          </Marker>
        ))}

        {/* 전체 경로 연하게 */}
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

        {/* 현재 구간 진하게 */}
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

          <TextInput
            value={task}
            onChangeText={setTask}
            placeholder="꼭 해야할 일"
            placeholderTextColor="#8A98A8"
            style={styles.input}
          />

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
                <View key={`${loc.name || 'loc'}-${loc.lat}-${loc.lng}-${index}`} style={styles.locationItem}>
                  <TouchableOpacity
                    style={styles.locationMain}
                    onPress={() => focusLocation(loc)}
                  >
                    <View style={styles.badge}>
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
            <Text style={styles.hintText}>현재 위치 기준 최적화 가능</Text>
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
            onPress={() => { }}
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

const getBadgeColorByStatus = (status) => {
  const normalized = String(status || "").toLowerCase();

  if (
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "처리완료"
  ) {
    return "#1F9D55";
  }

  if (
    normalized === "progress" ||
    normalized === "in_progress" ||
    normalized === "processing" ||
    normalized === "처리중"
  ) {
    return "#F39C12";
  }

  return "#E74C3C";
};

const styles = StyleSheet.create({
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

  searchRow: {
    flexDirection: "row",
    gap: 8,
  },

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
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
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
    backgroundColor: "#12395B",
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

  priorityNumberMarker: {
    backgroundColor: "#F39C12",
  },

  numberMarkerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#12395B",
    alignItems: "center",
    justifyContent: "center",
  },
});