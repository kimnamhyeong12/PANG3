import { useEffect, useRef, useState } from "react";

let hasCenteredMapOnce = false;
let lastFocusedLocation = null;

export default function KakaoMap({
  onLocationClick,
  locations,
  setLocations,
}) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);

  const tempMarkerRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const watchIdRef = useRef(null);

  const geocoderRef = useRef(null);
  const overlaysRef = useRef([]);
  const polylineRef = useRef(null);
  const hasCenteredOnOptimize = useRef(false);

  const [keyword, setKeyword] = useState("");
  const [selectedPos, setSelectedPos] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [task, setTask] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);

  const focusLocation = (loc) => {
    lastFocusedLocation = loc;

    if (mapObj.current) {
      const pos = new window.kakao.maps.LatLng(loc.lat, loc.lng);
      mapObj.current.setCenter(pos);
    }

    setSelectedLocation(loc);
  };

  const clearRoute = () => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
  };

  const setTempMarker = (latlng) => {
    if (!mapObj.current) return;

    if (tempMarkerRef.current) {
      tempMarkerRef.current.setMap(null);
    }

    tempMarkerRef.current = new window.kakao.maps.Marker({
      map: mapObj.current,
      position: latlng,
    });

    mapObj.current.setCenter(latlng);

    setSelectedPos({
      lat: latlng.getLat(),
      lng: latlng.getLng(),
    });
  };

  const drawNumberMarker = (loc, index) => {
    const position = new window.kakao.maps.LatLng(loc.lat, loc.lng);

    const content = document.createElement("button");
    content.innerText = index + 1;
    content.style.width = "34px";
    content.style.height = "34px";
    content.style.borderRadius = "50%";
    content.style.background = "#12395B";
    content.style.color = "white";
    content.style.fontWeight = "900";
    content.style.fontSize = "13px";
    content.style.display = "flex";
    content.style.alignItems = "center";
    content.style.justifyContent = "center";
    content.style.border = "2px solid white";
    content.style.boxShadow = "0 4px 10px rgba(0,0,0,.25)";
    content.style.cursor = "pointer";

    content.onclick = () => {
      focusLocation(loc);
    };

    const overlay = new window.kakao.maps.CustomOverlay({
      map: mapObj.current,
      position,
      content,
      yAnchor: 1,
      zIndex: 100,
    });

    overlaysRef.current.push(overlay);
  };

  const redrawMarkers = (list) => {
    if (!mapObj.current) return;

    clearRoute();

    list.forEach((loc, index) => {
      drawNumberMarker(loc, index);
    });

    if (list.length >= 2) {
      const path = list.map(
        (loc) => new window.kakao.maps.LatLng(loc.lat, loc.lng)
      );

      polylineRef.current = new window.kakao.maps.Polyline({
        map: mapObj.current,
        path,
        strokeWeight: 4,
        strokeColor: "#12395B",
        strokeOpacity: 0.8,
      });
    }
  };

  const startCurrentLocationWatch = (map) => {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 기능을 지원하지 않습니다.");
      return;
    }

    const imageSrc =
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36">
          <circle cx="18" cy="18" r="15" fill="rgba(37,99,235,0.25)" />
          <circle cx="18" cy="18" r="8" fill="#2563EB" stroke="white" stroke-width="4" />
        </svg>
      `);

    const imageSize = new window.kakao.maps.Size(36, 36);
    const imageOption = {
      offset: new window.kakao.maps.Point(18, 18),
    };

    const markerImage = new window.kakao.maps.MarkerImage(
      imageSrc,
      imageSize,
      imageOption
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setCurrentPos({ lat, lng });

        const myPos = new window.kakao.maps.LatLng(lat, lng);

        if (!currentMarkerRef.current) {
          currentMarkerRef.current = new window.kakao.maps.Marker({
            map,
            position: myPos,
            image: markerImage,
            zIndex: 9999,
          });
        } else {
          currentMarkerRef.current.setPosition(myPos);
          currentMarkerRef.current.setMap(map);
        }

        if (!hasCenteredMapOnce && !lastFocusedLocation) {
          map.setCenter(myPos);
          hasCenteredMapOnce = true;
        }
      },
      (error) => {
        console.log(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  };

  useEffect(() => {
    if (!window.kakao || !window.kakao.maps) return;

    window.kakao.maps.load(() => {
      const initialCenter = lastFocusedLocation
        ? new window.kakao.maps.LatLng(
            lastFocusedLocation.lat,
            lastFocusedLocation.lng
          )
        : new window.kakao.maps.LatLng(35.1045, 128.9666);

      const map = new window.kakao.maps.Map(mapRef.current, {
        center: initialCenter,
        level: 5,
      });

      mapObj.current = map;
      geocoderRef.current = new window.kakao.maps.services.Geocoder();

      startCurrentLocationWatch(map);

      setTimeout(() => {
        redrawMarkers(locations);
      }, 300);

      window.kakao.maps.event.addListener(map, "click", (mouseEvent) => {
        setTempMarker(mouseEvent.latLng);
      });
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      if (currentMarkerRef.current) {
        currentMarkerRef.current.setMap(null);
        currentMarkerRef.current = null;
      }

      if (tempMarkerRef.current) {
        tempMarkerRef.current.setMap(null);
        tempMarkerRef.current = null;
      }

      clearRoute();
    };
  }, []);

  useEffect(() => {
    redrawMarkers(locations);
  }, [locations]);

  const searchPlace = () => {
    if (!keyword.trim()) {
      alert("주소나 장소명을 입력하세요.");
      return;
    }

    const geocoder = geocoderRef.current;
    const places = new window.kakao.maps.services.Places();

    geocoder.addressSearch(keyword, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const latlng = new window.kakao.maps.LatLng(result[0].y, result[0].x);
        setTempMarker(latlng);
        setPlaceName(keyword);
        return;
      }

      places.keywordSearch(keyword, (data, placeStatus) => {
        if (placeStatus === window.kakao.maps.services.Status.OK) {
          const latlng = new window.kakao.maps.LatLng(data[0].y, data[0].x);
          setTempMarker(latlng);
          setPlaceName(data[0].place_name);
        } else {
          alert("검색 결과가 없습니다.");
        }
      });
    });
  };

  const addLocation = async () => {

    if (!selectedPos) {
      alert("먼저 지도에서 위치를 선택하거나 주소를 검색하세요.");
      return;
    }

    if (!placeName.trim()) {
      alert("방문지 이름을 입력하세요.");
      return;
    }

    const newLoc = {
      id: Date.now(),
      name: placeName,
      task: task || "현장 확인",
      address: keyword,
      lat: selectedPos.lat,
      lng: selectedPos.lng,
      status: "pending",
    };

    try {

      const res = await fetch(
        "http://localhost:8081/api/locations",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body: JSON.stringify(newLoc)
        }
      );

      if(!res.ok){
        throw new Error("저장 실패");
      }

      // 기존 프론트 리스트 반영
      setLocations([...locations,newLoc]);

      setPlaceName("");
      setTask("");
      setKeyword("");
      setSelectedPos(null);

      if(tempMarkerRef.current){
        tempMarkerRef.current.setMap(null);
        tempMarkerRef.current = null;
      }

      alert("DB 저장 완료");

    } catch(e){
      console.error(e);
      alert("DB 저장 실패");
    }

  };

  const getDistance = (a, b) => {
    const dx = a.lat - b.lat;
    const dy = a.lng - b.lng;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const optimizeRoute = () => {
    if (locations.length < 2) {
      alert("방문지가 2개 이상 필요합니다.");
      return;
    }

    if (!currentPos) {
      alert("현재 위치를 먼저 불러와야 합니다.");
      return;
    }

    const remaining = [...locations];
    const optimized = [];
    let current = currentPos;

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

    setLocations(optimized);

    if (!hasCenteredOnOptimize.current && mapObj.current) {
      const myPos = new window.kakao.maps.LatLng(currentPos.lat, currentPos.lng);
      mapObj.current.setCenter(myPos);
      hasCenteredOnOptimize.current = true;
    }

    alert("현재 위치 기준 노선 최적화 완료");
  };

  const removeLocation = (id) => {
    setLocations(locations.filter((loc) => loc.id !== id));

    if (lastFocusedLocation?.id === id) {
      lastFocusedLocation = null;
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 right-4 z-10 bg-white rounded-2xl shadow-lg p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="주소/장소"
            className="flex-1 px-3 py-2 rounded-lg border text-xs"
          />

          <button
            onClick={searchPlace}
            className="px-3 py-2 rounded-lg bg-[#12395B] text-white text-xs font-bold"
          >
            검색
          </button>
        </div>

        <input
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          placeholder="방문지 이름"
          className="w-full px-3 py-2 rounded-lg border text-xs"
        />

        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="꼭 해야할 일"
          className="w-full px-3 py-2 rounded-lg border text-xs"
        />

        <button
          onClick={addLocation}
          className="w-full py-2.5 rounded-lg bg-[#1F9D55] text-white text-xs font-black"
        >
          방문 추가
        </button>

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] font-black text-[#607086]">
            방문지 {locations.length}개
          </p>

          <button
            onClick={optimizeRoute}
            className="px-3 py-1.5 rounded-full text-white text-[10px] font-bold bg-[#12395B]"
          >
            정렬
          </button>
        </div>

        <div className="max-h-28 overflow-y-auto space-y-1">
          {locations.length === 0 && (
            <p className="text-[10px] text-[#718096]">추가로 방문하세요.</p>
          )}

          {locations.map((loc, i) => (
            <div key={loc.id} className="flex items-center gap-2">
              <button
                onClick={() => focusLocation(loc)}
                className="flex-1 flex items-center gap-2 text-left"
              >
                <div className="w-5 h-5 rounded-full bg-[#12395B] text-white text-[8px] font-black flex items-center justify-center">
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#1F2D3D] truncate">
                    {loc.name}
                  </p>
                  <p className="text-[9px] text-[#718096] truncate">
                    {loc.task}
                  </p>
                </div>
              </button>

              <button
                onClick={() => removeLocation(loc.id)}
                className="text-[10px] text-red-500 font-bold px-1"
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        {currentPos && (
          <p className="text-[9px] text-[#718096]">
            현재 위치 기준 최적화 가능
          </p>
        )}
      </div>

      {selectedLocation && (
        <div
          className="absolute inset-0 bg-black/30 z-20 flex items-end"
          onClick={() => setSelectedLocation(null)}
        >
          <div
            className="w-full bg-white rounded-t-3xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-[#D9E1EA] rounded-full mx-auto mb-4" />

            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#E6EDF3]">
              <div className="w-10 h-10 rounded-xl bg-[#EAF1F7] flex items-center justify-center text-lg">
                📍
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-black text-[#1F2D3D] text-sm truncate">
                  {selectedLocation.name}
                </p>
                <p className="text-[10px] text-[#718096] truncate">
                  {selectedLocation.task}
                </p>
              </div>
            </div>

            <p className="text-[10px] font-black tracking-[0.16em] text-[#607086] mb-3">
              FIELD RECORD
            </p>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => onLocationClick?.(selectedLocation, "photo")}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-[#EAF1F7] border border-[#D9E1EA]"
              >
                <span className="text-2xl">📷</span>
                <span className="text-xs font-black text-[#12395B]">사진</span>
              </button>

              <button
                onClick={() => onLocationClick?.(selectedLocation, "memo")}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-[#EAF1F7] border border-[#D9E1EA]"
              >
                <span className="text-2xl">📝</span>
                <span className="text-xs font-black text-[#12395B]">메모</span>
              </button>

              <button
                onClick={() => onLocationClick?.(selectedLocation, "status")}
                className="flex flex-col items-center gap-2 py-4 rounded-xl bg-[#EAF1F7] border border-[#D9E1EA]"
              >
                <span className="text-2xl">🔄</span>
                <span className="text-xs font-black text-[#12395B]">상태</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}