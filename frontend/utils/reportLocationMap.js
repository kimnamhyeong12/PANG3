const KAKAO_JAVASCRIPT_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || '';

function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function getInteractiveMapHtml(latitude, longitude, selecting = false) {
  const valid = isValidCoordinate(
    latitude,
    longitude
  );

  const lat = valid
    ? Number(latitude)
    : 36.3;

  const lng = valid
    ? Number(longitude)
    : 127.8;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta
          name="viewport"
          content="
            width=device-width,
            initial-scale=1.0,
            maximum-scale=5.0,
            minimum-scale=1.0,
            user-scalable=yes
          "
        />

        <style>
          * {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
          }

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
            background: #E8F2FF;
          }
          .selected-pin-wrap {
            position: relative;
            width: 32px;
            height: 40px;
            overflow: visible;
            pointer-events: none;
            filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
          }
          .selected-location {
            position: absolute;
            top: 0;
            left: 1px;
            width: 30px;
            height: 30px;
            background: #E53935;
            border-radius: 50% 50% 50% 0;
            border: 4px solid #94A3B8;
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.95);
            box-sizing: border-box;
            transform: rotate(-45deg);
          }
          .selected-location::after {
            content: '';
            position: absolute;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #FFFFFF;
            left: 8px;
            top: 8px;
          }
        </style>

        <script
          type="text/javascript"
          src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JAVASCRIPT_KEY}&autoload=false"
        ></script>
      </head>

      <body>
        <div id="map"></div>

        <script>
          var map = null;
          var ready = false;
          var selectedPosition = null;
          var selectionMode = ${selecting ? 'true' : 'false'};
          var selectionDragStarted = false;
          var selectedOverlay = null;

          function postMessage(data) {
            if (!window.ReactNativeWebView) {
              return;
            }

            window.ReactNativeWebView.postMessage(
              JSON.stringify(data)
            );
          }

          function ensureSelectedOverlay() {
            if (!map || !selectedPosition || !window.kakao || !window.kakao.maps) {
              return;
            }

            if (!selectedOverlay) {
              var selectedElement = document.createElement('div');
              selectedElement.className = 'selected-pin-wrap';
              var selectedBody = document.createElement('div');
              selectedBody.className = 'selected-location';
              selectedElement.appendChild(selectedBody);

              selectedOverlay = new window.kakao.maps.CustomOverlay({
                position: selectedPosition,
                content: selectedElement,
                xAnchor: 0.5,
                yAnchor: 1.0,
                zIndex: 110
              });
            }

            selectedOverlay.setPosition(selectedPosition);
            selectedOverlay.setMap(map);
          }

          window.setSelectionMode = function(enabled) {
            var nextSelectionMode = !!enabled;

            if (nextSelectionMode && map) {
              selectionMode = true;
              selectionDragStarted = false;

              // 지도 직접 선택과 동일하게 기존 선택 좌표 하나만 기준으로 사용한다.
              // ON 할 때 좌표를 다시 계산하지 않고 기존 마커 좌표를 화면 중심으로 맞춘다.
              if (!selectedPosition) {
                selectedPosition = map.getCenter();
              }
              map.setCenter(selectedPosition);
              ensureSelectedOverlay();
              return;
            }

            // OFF에서는 현재 선택 좌표를 다시 계산하거나 이동시키지 않는다.
            // 마지막 위치에 동일한 마커를 그대로 고정한다.
            selectionMode = false;
            selectionDragStarted = false;
            ensureSelectedOverlay();
          };

          window.setExternalPosition = function(
            latitude,
            longitude
          ) {
            if (!ready || !map) {
              return;
            }

            var lat = Number(latitude);
            var lng = Number(longitude);

            if (
              !Number.isFinite(lat) ||
              !Number.isFinite(lng)
            ) {
              return;
            }

            // 위치 설정 중에는 dragend에서 정한 WebView 내부 selectedPosition이 단일 기준이다.
            // React state가 되돌아오면서 pan/setCenter를 다시 실행하면 미세한 왕복 이동이 생길 수 있으므로 무시한다.
            if (selectionMode) {
              return;
            }

            selectedPosition =
              new window.kakao.maps.LatLng(
                lat,
                lng
              );

            map.relayout();
            map.setCenter(selectedPosition);
            ensureSelectedOverlay();
          };

          window.zoomSelection = function(step) {
            if (!ready || !map) return;
            map.setLevel(Math.max(1, Math.min(14, map.getLevel() + Number(step))));
          };
          window.moveSelectionTo = function(latitude, longitude) {
            if (!ready || !map) return;
            selectedPosition = new window.kakao.maps.LatLng(Number(latitude), Number(longitude));
            map.setLevel(3);
            map.setCenter(selectedPosition);
            ensureSelectedOverlay();
            postMessage({ type: 'LOCATION_SELECTED', latitude: selectedPosition.getLat(), longitude: selectedPosition.getLng() });
          };

          function startMap() {
            if (
              !window.kakao ||
              !window.kakao.maps ||
              !window.kakao.maps.load
            ) {
              setTimeout(startMap, 100);
              return;
            }

            window.kakao.maps.load(function() {
              var initialPosition =
                new window.kakao.maps.LatLng(
                  ${lat},
                  ${lng}
                );

              var container =
                document.getElementById('map');

              map =
                new window.kakao.maps.Map(
                  container,
                  {
                    center: initialPosition,
                    level: 4
                  }
                );

              ready = true;
              selectedPosition = initialPosition;
              ensureSelectedOverlay();
              postMessage({ type: 'MAP_READY', latitude: selectedPosition.getLat(), longitude: selectedPosition.getLng() });

              setTimeout(function() {
                map.relayout();
                map.setCenter(selectedPosition);
                ensureSelectedOverlay();
              }, 300);

              window.kakao.maps.event.addListener(map, 'dragstart', function() {
                if (selectionMode) {
                  selectionDragStarted = true;
                  postMessage({ type: 'LOCATION_MOVING' });
                }
              });

              window.kakao.maps.event.addListener(map, 'center_changed', function() {
                if (!selectionMode || !selectionDragStarted) {
                  return;
                }
                selectedPosition = map.getCenter();
                ensureSelectedOverlay();
              });

              window.kakao.maps.event.addListener(map, 'dragend', function() {
                if (!selectionMode || !selectionDragStarted) {
                  selectionDragStarted = false;
                  return;
                }

                selectedPosition = map.getCenter();
                ensureSelectedOverlay();
                postMessage({
                  type: 'LOCATION_SELECTED',
                  latitude: selectedPosition.getLat(),
                  longitude: selectedPosition.getLng()
                });
                selectionDragStarted = false;
              });

              window.kakao.maps.event.addListener(map, 'zoom_changed', function() {
                if (selectionMode && selectedPosition) {
                  map.setCenter(selectedPosition);
                  ensureSelectedOverlay();
                }
              });
            });
          }

          startMap();
        </script>
      </body>
    </html>
  `;
}
