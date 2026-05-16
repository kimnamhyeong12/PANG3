// 현재 위치 기반 방문지 관리 + 지도 + 경로 최적화 + 현장 액션 기능
// 외근 도우미 앱의 핵심 화면
import * as Task from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const DEFAULT_REGION = {
  latitude: 35.1045,
  longitude: 128.9666,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function KakaoMapWebView({
  tasks = [],
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
  // 페이지
  const [isSearching, setIsSearching] = useState(false);
  const goFirst = () => searchPlace(1);
  const goLast = () => searchPlace(totalPages);

  const goPrev = () => {
    if (page > 1) searchPlace(page - 1);
  };

  const goNext = () => {
    if (page < totalPages) searchPlace(page + 1);
  };
  const getPageNumbers = () => {
    const maxVisible = 5;

    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    const pages = [];

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };
  const [searchResults, setSearchResults] = useState([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 5;
  const [isEnd, setIsEnd] = useState(false);
  const mapLocations = useMemo(() => {
    return (tasks || []).filter(
      (task) => task && task.lat !== undefined && task.lng !== undefined
    );
  }, [tasks]);
  
  useEffect(() => {
    startCurrentLocation();
  }, []);

  const startCurrentLocation = async () => {
    try {
      const { status } = await Task.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("위치 권한 필요", "현재 위치를 사용하려면 위치 권한이 필요합니다.");
        return;
      }

      const current = await Task.getCurrentPositionAsync({
        accuracy: Task.Accuracy.High,
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

      await Task.watchPositionAsync(
        {
          accuracy: Task.Accuracy.High,
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
  const searchPlace = async (targetPage = 1) => {
    const q = keyword.trim();

    if (!q) return;

    try {
      setIsSearching(true);

      const url =
        `https://dapi.kakao.com/v2/local/search/keyword.json` +
        `?query=${encodeURIComponent(q)}&page=${targetPage}&size=15`;
      
      const res = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      });

      const data = await res.json();
      setSearchResults(data.documents);
      setPage(targetPage);
      const total = Math.ceil(data.meta.pageable_count / PAGE_SIZE);
      setTotalPages(total);
      setSearchModalVisible(true);
    } catch (error) {
      console.log(error);
    } finally {
      setIsSearching(false);
    }
  };
  const selectSearchResult = (place) => {
    const lat = Number(place.y);
    const lng = Number(place.x);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      Alert.alert("좌표 오류", "위치 좌표를 읽을 수 없습니다.");
      return;
    }

    setSelectedPos({ lat, lng });

    // 도로명 주소 이후 
    // ex) 부산 해운대구 좌동순환로 511 이마트 해운대점
    // 이마트 해운대점에 해당 하는 부분
    setPlaceName(
      place.place_name || place.address_name || "선택한 위치"
    );
    // 제일 처음 주소
    // ex) 부산 해운대구 좌동순환로 511 이마트 해운대점
    // 부산 해운대구 좌동순환로 511 에 해당하는 부분
    // address_name : 옛날 주소
    // road_address_name : 도로명 주소
    setKeyword(
      // place.address_name || place.road_address_name || ""
      place.road_address_name || ""
    );

    moveToPosition(lat, lng);

    setSearchModalVisible(false);
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

    const newTask = {
      detailAddress: placeName.trim(),
      roadAddress: keyword.trim(),
      lat: selectedPos.lat,
      lng: selectedPos.lng,
      status: "pending",
    };

    try {
      if (!API_BASE_URL) {
        throw new Error("API_BASE_URL 없음");
      }

      const res = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newLoc),
      });

      if (!res.ok) {
        throw new Error("저장 실패");
      }

      const nextLocations = [...tasks, newLoc];

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

  const focusLocation = (task) => {
    setSelectedLocation(task);

    moveToPosition(Number(task.lat), Number(task.lng));

    onMarkerClick?.(task);
  };

  const removeLocation = async (taskId) => {
    const nextLocations = tasks.filter((task) => task.taskId !== taskId);

    onLocationsChange?.(nextLocations);

    if (selectedLocation?.taskId === taskId) {
      setSelectedLocation(null);
    }

    /*
      백엔드에 DELETE API가 있으면 아래 주석을 풀면 됨.

      try {
        await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.log(error);
      }
    */
  };

  const getDistance = (a, b) => {
    const dx = Number(a.lat) - Number(b.lat);
    const dy = Number(a.lng) - Number(b.lng);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const optimizeRoute = () => {
    if (tasks.length < 2) {
      Alert.alert("정렬 불가", "방문지가 2개 이상 필요합니다.");
      return;
    }

    if (!currentPos) {
      Alert.alert("현재 위치 필요", "현재 위치를 먼저 불러와야 합니다.");
      return;
    }

    const remaining = [...tasks];
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

        {mapLocations.map((task, index) => (
          <Marker
            key={`${task.taskId}-${index}`}
            coordinate={{
              latitude: Number(task.lat),
              longitude: Number(task.lng),
            }}
            title={`${index + 1}. ${task.detailAddress}`}
            description={task.task || "현장 확인"}
            onPress={() => focusLocation(task)}
          />
        ))}

        {mapLocations.length >= 2 && (
          <Polyline
            coordinates={mapLocations.map((task) => ({
              latitude: Number(task.lat),
              longitude: Number(task.lng),
            }))}
            strokeWidth={4}
            strokeColor="#12395B"
          />
        )}
      </MapView>

      <View style={styles.panel}>
        <View style={styles.searchRow}>
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="장소 검색"
            style={styles.searchInput}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => 
              // setSearchModalVisible(true)
              {
                searchPlace(1);
                setPage(1);          
              }
            }
          >
            <Text style={styles.searchButtonText}>
              검색
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
          <Text style={styles.countText}>방문지 {tasks.length}개</Text>

          <TouchableOpacity style={styles.sortButton} onPress={optimizeRoute}>
            <Text style={styles.sortButtonText}>정렬</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.locationList}>
          
          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>추가로 방문하세요.</Text>
          ) : (
            tasks.map((task, index) => (
              <View key={`${task.taskId}-${index}`} style={styles.locationItem}>
                <TouchableOpacity
                  style={styles.locationMain}
                  onPress={() => focusLocation(task)}
                >
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{index + 1}</Text>
                  </View>

                  <View style={styles.locationTextWrap}>
                    <Text style={styles.locationName} numberOfLines={1}>
                      {task.detailAddress || "이름 없음"}
                    </Text>
                    <Text style={styles.locationTask} numberOfLines={1}>
                      {task.task || "현장 확인"}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => removeLocation(task.taskId)}>
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
                  {selectedLocation?.detailAddress || "이름 없음"}
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
      <Modal
        visible={searchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <View style={styles.searchModalBackdrop}>
          <View style={styles.searchModal}>
            <Text style={styles.searchModalTitle}>
              검색 결과
            </Text>

            <ScrollView>
              {searchResults.map((place, index) => (
                <TouchableOpacity
                  key={`${place.taskId || index}`}
                  style={styles.searchResultItem}
                  onPress={() => selectSearchResult(place)}
                >
                  <Text style={styles.searchResultName}>
                    {place.place_name || place.address_name}
                  </Text>

                  <Text style={styles.searchResultAddress}>
                    {place.road_address_name ||
                      place.address_name}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={styles.pagination}>
              {/* << */}
              <TouchableOpacity onPress={goFirst}>
                <Text style={styles.pageBtn}>{"<<"}</Text>
              </TouchableOpacity>

              {/* < */}
              <TouchableOpacity onPress={goPrev}>
                <Text style={styles.pageBtn}>{"<"}</Text>
              </TouchableOpacity>

              {/* 숫자 */}
              {getPageNumbers().map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => searchPlace(p)}
                >
                  <Text
                    style={[
                      styles.pageNumber,
                      p === page && styles.pageActive,
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* > */}
              <TouchableOpacity onPress={goNext}>
                <Text style={styles.pageBtn}>{">"}</Text>
              </TouchableOpacity>

              {/* >> */}
              <TouchableOpacity onPress={goLast}>
                <Text style={styles.pageBtn}>{">>"}</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSearchModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>
                닫기
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
    backgroundColor: "#12395B",
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
  searchModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  searchModal: {
    width: "88%",
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
  },

  searchModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
    color: "#12395B",
  },

  searchResultItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E6EDF3",
  },

  searchResultName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2D3D",
  },

  searchResultAddress: {
    marginTop: 4,
    fontSize: 12,
    color: "#718096",
  },

  closeButton: {
    marginTop: 14,
    backgroundColor: "#12395B",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },

  closeButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 10,
  },

  pageBtn: {
    fontSize: 14,
    fontWeight: "900",
    paddingHorizontal: 6,
  },

  pageNumber: {
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#333",
  },

  pageActive: {
    backgroundColor: "#12395B",
    color: "#fff",
    borderRadius: 6,
    overflow: "hidden",
  },
});