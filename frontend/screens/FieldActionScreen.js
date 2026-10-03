import { showAlert } from '../components/CustomAlert';
import React, { useEffect, useRef, useState } from 'react';

import {
  View,
  Text,
  TextInput,
  BackHandler,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';

import {
  PrimaryButton,
  ScreenHeader,
} from '../components/ui';

import VoiceTextInput from '../components/VoiceTextInput';
import PhotoMarkupEditor from '../components/PhotoMarkupEditor';

import {
  API_BASE_URL,
  resolveApiUrl,
} from '../utils/api';

const KAKAO_JAVASCRIPT_KEY =
  process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || '';
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';

const PHOTO_TYPES = [
  {
    key: 'before',
    label: '작업 전',
  },
  {
    key: 'during',
    label: '작업 중',
  },
  {
    key: 'after',
    label: '작업 후',
  },
];

const createEmptyPhotos = () =>
  PHOTO_TYPES.map((type) => ({
    type: type.key,
    label: type.label,
    uri: null,
    comment: '',
  }));

function getAiRecommendation(memo) {
  const text = (memo || '').toLowerCase();

  if (
    text.includes('배수') ||
    text.includes('토사') ||
    text.includes('침수') ||
    text.includes('악취')
  ) {
    return {
      category: '배수시설 관리',
      risk: '높음',
      riskColor: '#DC2626',
      report:
        '배수구 내 토사 적체로 인해 배수 불량 및 침수 위험이 우려되어 정비 요청이 필요함.',
    };
  }

  if (
    text.includes('파손') ||
    text.includes('균열') ||
    text.includes('전선') ||
    text.includes('부식')
  ) {
    return {
      category: '시설물 안전',
      risk: '높음',
      riskColor: '#DC2626',
      report:
        '시설물 파손 또는 균열이 확인되어 안전조치 및 보수 요청이 필요함.',
    };
  }

  return {
    category: '일반 점검',
    risk: '보통',
    riskColor: '#F39C12',
    report:
      '현장 점검 결과 특이사항을 기록하고 추후 필요 시 재확인함.',
  };
}

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

function getInteractiveMapHtml(latitude, longitude) {
  const valid = isValidCoordinate(
    latitude,
    longitude
  );

  const lat = valid
    ? Number(latitude)
    : 35.104578;

  const lng = valid
    ? Number(longitude)
    : 128.975;

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
          #pointer {
            display: none;
            position: fixed;
            left: 50%;
            top: 50%;
            width: 32px;
            height: 40px;
            transform: translate(-50%, -40px);
            filter: drop-shadow(0 2px 3px rgba(0,0,0,.3));
            pointer-events: none;
            z-index: 10;
          }
          #pointer .pin-body {
            position: relative;
            width: 30px;
            height: 30px;
            background: #E53935;
            border-radius: 50% 50% 50% 0;
            border: 4px solid #94A3B8;
            box-shadow: 0 0 0 1px rgba(255,255,255,.95);
            transform: rotate(-45deg);
          }
          #pointer .pin-body::after {
            content: '';
            position: absolute;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #fff;
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
        <div id="pointer"><div class="pin-body"></div></div>

        <script>
          var map = null;
          var ready = false;
          var selectedPosition = null;
          var selectionMode = false;

          function postMessage(data) {
            if (!window.ReactNativeWebView) {
              return;
            }

            window.ReactNativeWebView.postMessage(
              JSON.stringify(data)
            );
          }

          window.setSelectionMode = function(enabled) {
            selectionMode = !!enabled;
            var pointer = document.getElementById('pointer');
            if (pointer) {
              pointer.style.display = selectionMode ? 'block' : 'none';
            }
            if (selectionMode && map) {
              selectedPosition = map.getCenter();
              postMessage({
                type: 'LOCATION_SELECTED',
                latitude: selectedPosition.getLat(),
                longitude: selectedPosition.getLng()
              });
            }
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

            var position =
              new window.kakao.maps.LatLng(
                lat,
                lng
              );

            selectedPosition = position;
            map.relayout();
            map.panTo(position);
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

              setTimeout(function() {
                map.relayout();
                map.setCenter(
                  selectedPosition
                );
              }, 300);

              window.kakao.maps.event.addListener(map, 'dragend', function() {
                if (!selectionMode) {
                  return;
                }
                selectedPosition = map.getCenter();
                postMessage({
                  type: 'LOCATION_SELECTED',
                  latitude: selectedPosition.getLat(),
                  longitude: selectedPosition.getLng()
                });
              });

              window.kakao.maps.event.addListener(map, 'zoom_changed', function() {
                if (selectionMode && selectedPosition) {
                  map.setCenter(selectedPosition);
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

export default function FieldActionScreen({
  user,
  location,
  actionType,
  onBack,
  onSave,
}) {
  const mapRef = useRef(null);
  const mapWrapperRef = useRef(null);
  const lastMapCoordinateRef = useRef('');

  const [
    mapInteracting,
    setMapInteracting,
  ] = useState(false);

  const [locationMoving, setLocationMoving] =
    useState(false);

  const [status, setStatus] =
    useState(
      location?.status || 'pending'
    );

  const [latitude, setLatitude] =
    useState(
      location?.latitude !== null &&
        location?.latitude !== undefined
        ? String(location.latitude)
        : location?.lat !== null &&
          location?.lat !== undefined
        ? String(location.lat)
        : ''
    );

  const [longitude, setLongitude] =
    useState(
      location?.longitude !== null &&
        location?.longitude !== undefined
        ? String(location.longitude)
        : location?.lng !== null &&
          location?.lng !== undefined
        ? String(location.lng)
        : ''
    );
  const [locationAddress, setLocationAddress] = useState(location?.roadAddress || location?.detailAddress || '');
  const [editingLocation, setEditingLocation] = useState(false);

  const [photos, setPhotos] =
    useState(createEmptyPhotos());

  const [
    fieldMemo,
    setFieldMemo,
  ] = useState('');

  const [
    aiRefinedContent,
    setAiRefinedContent,
  ] = useState('');

  const [
    reportDownloadUrl,
    setReportDownloadUrl,
  ] = useState(null);

  const [saving, setSaving] =
    useState(false);

  const [
    photoEditor,
    setPhotoEditor,
  ] = useState({
    visible: false,
    uri: null,
    index: null,
  });

  // 위치도(지도)에 빨간 박스·화살표로 라벨을 표시하는 마킹 에디터 상태.
  // markedMapUri가 있으면 보고서에는 이 마킹된 이미지를 사용한다.
  const [
    mapEditor,
    setMapEditor,
  ] = useState({
    visible: false,
    uri: null,
  });

  const [
    markedMapUri,
    setMarkedMapUri,
  ] = useState(null);

  const formSnapshot = JSON.stringify({ status, latitude, longitude, photos, fieldMemo, markedMapUri });
  const initialFormRef = useRef(formSnapshot);
  const currentFormRef = useRef(formSnapshot);
  currentFormRef.current = formSnapshot;

  const requestBack = () => {
    if (saving) {
      showAlert('저장 중', '보고서 저장이 끝난 뒤 다시 시도하세요.');
      return;
    }
    if (currentFormRef.current === initialFormRef.current) {
      onBack?.();
      return;
    }
    showAlert('작성 중인 보고서', '저장하지 않은 변경 내용이 있습니다. 나가면 변경 내용이 사라집니다.', [
      { text: '계속 작성', style: 'cancel' },
      { text: '저장하지 않고 나가기', style: 'destructive', onPress: onBack },
    ]);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestBack();
      return true;
    });
    return () => subscription.remove();
  });

  const taskId =
    location?.id ??
    location?.taskId ??
    location?.task_id;

  /*
   * 기존 저장 보고서 불러오기
   */
  useEffect(() => {
    const loadSavedReport =
      async () => {
        if (
          !taskId ||
          !API_BASE_URL
        ) {
          return;
        }

        try {
          console.log(
            '보고서 불러오기 taskId:',
            taskId
          );

          const res =
            await fetch(
              `${API_BASE_URL}/api/task-progress/task/${taskId}`
            );

          if (!res.ok) {
            console.log(
              '보고서 불러오기 실패 status:',
              res.status
            );
            return;
          }

          /*
           * 응답이 비어있는 경우
           * JSON parse 오류 방지
           */
          const responseText =
            await res.text();

          if (
            !responseText ||
            !responseText.trim()
          ) {
            return;
          }

          let data;

          try {
            data =
              JSON.parse(responseText);
          } catch (error) {
            console.log(
              '보고서 응답 JSON 변환 실패:',
              error
            );
            return;
          }

          if (!data || currentFormRef.current !== initialFormRef.current) {
            return;
          }

          console.log(
            '저장된 보고서 불러오기 성공:',
            data
          );

          if (
            data.latitude !== null &&
            data.latitude !== undefined
          ) {
            setLatitude(
              String(data.latitude)
            );
          }

          if (
            data.longitude !== null &&
            data.longitude !== undefined
          ) {
            setLongitude(
              String(data.longitude)
            );
          }
          if (data.locationAddress) setLocationAddress(data.locationAddress);

          const savedPhotos =
            data.fieldPhotos || [];

          const loadedPhotos = PHOTO_TYPES.map(
              (type, index) => {
                const savedPhoto =
                  savedPhotos[index];

                return {
                  type: type.key,
                  label: type.label,

                  uri: savedPhoto
                    ? resolveApiUrl(
                        savedPhoto.uri ||
                          savedPhoto.path
                      ) ||
                      savedPhoto.uri ||
                      savedPhoto.path
                    : null,

                  comment:
                    savedPhoto?.comment ||
                    '',
                };
              }
            );
          setPhotos(loadedPhotos);

          setFieldMemo(
            data.fieldMemo || ''
          );

          setAiRefinedContent(
            data.aiRefinedContent || ''
          );

          setReportDownloadUrl(
            data.reportDownloadUrl
              ? resolveApiUrl(
                  data.reportDownloadUrl
                )
              : null
          );

          const currentLocationStatus = location?.status;
          const loadedStatus = currentLocationStatus === 'working' || currentLocationStatus === 'complete'
              ? currentLocationStatus
              : data.progressStatus || currentLocationStatus || 'pending';
          setStatus(loadedStatus);
          initialFormRef.current = JSON.stringify({
            status: loadedStatus,
            latitude: data.latitude == null ? latitude : String(data.latitude),
            longitude: data.longitude == null ? longitude : String(data.longitude),
            photos: loadedPhotos,
            fieldMemo: data.fieldMemo || '',
            markedMapUri: null,
          });
        } catch (error) {
          console.log(
            '저장된 보고서 불러오기 실패:',
            error
          );
        }
      };

    loadSavedReport();
  }, [taskId]);

  const rec =
    getAiRecommendation(
      fieldMemo
    );

  /*
   * 지도에서 위치 선택
   */
  const handleMapMessage = (
    event
  ) => {
    try {
      const data =
        JSON.parse(
          event.nativeEvent.data
        );

      if (
        data.type ===
        'LOCATION_SELECTED'
      ) {
        lastMapCoordinateRef.current = `${Number(data.latitude).toFixed(6)}:${Number(data.longitude).toFixed(6)}`;
        if (editingLocation) setMarkedMapUri(null);
        setLatitude(
          String(data.latitude)
        );

        setLongitude(
          String(data.longitude)
        );
      }
    } catch (error) {
      console.log(
        '지도 메시지 오류:',
        error
      );
    }
  };

  /*
   * 위도/경도 직접 수정
   */
  const applyCoordinateToMap =
    () => {
      if (
        !isValidCoordinate(
          latitude,
          longitude
        )
      ) {
        return;
      }

      if (!mapRef.current) {
        return;
      }

      const lat =
        Number(latitude);

      const lng =
        Number(longitude);

      mapRef.current.injectJavaScript(`
        if (
          window.setExternalPosition
        ) {
          window.setExternalPosition(
            ${lat},
            ${lng}
          );
        }

        true;
      `);
    };

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.injectJavaScript(`
      if (window.setSelectionMode) {
        window.setSelectionMode(${editingLocation ? 'true' : 'false'});
      }
      true;
    `);
  }, [editingLocation]);

  useEffect(() => {
    if (!isValidCoordinate(latitude, longitude)) return undefined;
    const key = `${Number(latitude).toFixed(6)}:${Number(longitude).toFixed(6)}`;
    if (lastMapCoordinateRef.current === key) return undefined;
    const timer = setTimeout(() => {
      lastMapCoordinateRef.current = key;
      applyCoordinateToMap();
    }, 150);
    return () => clearTimeout(timer);
  }, [latitude, longitude]);

  useEffect(() => {
    if (!KAKAO_REST_API_KEY || !isValidCoordinate(latitude, longitude)) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${encodeURIComponent(longitude)}&y=${encodeURIComponent(latitude)}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
        if (!response.ok) throw new Error('주소 조회 실패');
        const data = await response.json();
        if (!cancelled) setLocationAddress(data.documents?.[0]?.road_address?.address_name || data.documents?.[0]?.address?.address_name || '주소 확인 불가');
      } catch {
        if (!cancelled) setLocationAddress('주소 확인 불가');
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [latitude, longitude]);

  const handleMapTouchStart =
    () => {
      setMapInteracting(true);
      if (editingLocation) {
        setLocationMoving(true);
      }
    };

  const handleMapTouchEnd =
    () => {
      setLocationMoving(false);
      setTimeout(() => {
        setMapInteracting(false);
      }, 100);
    };

  /*
   * 카메라 촬영
   */
  const takePhoto = async (
    index
  ) => {
    const permission =
      await ImagePicker
        .requestCameraPermissionsAsync();

    if (!permission.granted) {
      showAlert(
        '카메라 권한이 필요합니다.'
      );
      return;
    }

    const result =
      await ImagePicker
        .launchCameraAsync({
          quality: 0.7,
        });

    if (!result.canceled) {
      setPhotoEditor({
        visible: true,
        uri:
          result.assets[0].uri,
        index,
      });
    }
  };

  /*
   * 앨범에서 사진 선택
   */
  const pickPhotoFromLibrary =
    async (index) => {
      const permission =
        await ImagePicker
          .requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showAlert(
          '사진 접근 권한이 필요합니다.'
        );
        return;
      }

      const result =
        await ImagePicker
          .launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection:
              false,
            quality: 0.7,
          });

      if (!result.canceled) {
        setPhotoEditor({
          visible: true,
          uri:
            result.assets[0].uri,
          index,
        });
      }
    };

  /*
   * 사진 선택 버튼
   *
   * 촬영 또는 앨범 선택
   */
  const selectPhoto = (
    index
  ) => {
    showAlert(
      '사진 선택',
      '사진을 가져올 방법을 선택해주세요.',
      [
        {
          text: '사진 촬영',
          onPress: () =>
            takePhoto(index),
        },
        {
          text: '앨범 선택',
          onPress: () =>
            pickPhotoFromLibrary(
              index
            ),
        },
        {
          text: '취소',
          style: 'cancel',
        },
      ]
    );
  };

  /*
   * 기존 사진 변경
   */
  const retakePhoto = (
    index
  ) => {
    selectPhoto(index);
  };

  const deletePhoto = (
    index
  ) => {
    setPhotos((prev) =>
      prev.map(
        (
          photo,
          photoIndex
        ) =>
          photoIndex === index
            ? {
                ...photo,
                uri: null,
              }
            : photo
      )
    );
  };

  const updatePhotoComment = (
    index,
    text
  ) => {
    setPhotos((prev) =>
      prev.map(
        (
          photo,
          photoIndex
        ) =>
          photoIndex === index
            ? {
                ...photo,
                comment: text,
              }
            : photo
      )
    );
  };

  const editExistingPhoto = (
    index
  ) => {
    const photo =
      photos[index];

    if (!photo?.uri) {
      return;
    }

    setPhotoEditor({
      visible: true,
      uri: photo.uri,
      index,
    });
  };

  /*
   * 위치도(지도) 마킹 편집 열기
   * - 지금 보이는 지도 화면을 캡처한 뒤, 그 위에 빨간 박스/화살표로
   *   라벨을 그릴 수 있도록 PhotoMarkupEditor를 재사용해서 연다.
   */
  const openMapEditor = async () => {
    try {
      mapRef.current?.injectJavaScript(
        'if (window.map) { window.map.relayout(); } true;'
      );

      await new Promise((resolve) => setTimeout(resolve, 400));

      const capturedUri = await captureRef(mapWrapperRef, {
        format: 'jpg',
        quality: 0.9,
      });

      setMapEditor({
        visible: true,
        uri: capturedUri,
      });
    } catch (captureError) {
      console.log('지도 캡처 실패:', captureError?.message);
      showAlert('지도 캡처에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const closeMapEditor = () => {
    setMapEditor({
      visible: false,
      uri: null,
    });
  };

  const completeMapEdit = (editedUri) => {
    if (editedUri) {
      setMarkedMapUri(editedUri);
    }
    closeMapEditor();
  };

  const closePhotoEditor =
    () => {
      setPhotoEditor({
        visible: false,
        uri: null,
        index: null,
      });
    };

  const completePhotoEdit = (
    editedUri
  ) => {
    if (
      !editedUri ||
      photoEditor.index ===
        null
    ) {
      closePhotoEditor();
      return;
    }

    setPhotos((prev) =>
      prev.map(
        (photo, index) =>
          index ===
          photoEditor.index
            ? {
                ...photo,
                uri: editedUri,
              }
            : photo
      )
    );

    closePhotoEditor();
  };

  /*
   * 보고서 저장
   */
  const handleSave = async () => {
    try {
      if (!taskId) {
        showAlert(
          '방문지 ID를 찾을 수 없습니다.'
        );
        return;
      }

      if (!API_BASE_URL) {
        showAlert(
          'EXPO_PUBLIC_API_BASE_URL을 설정하세요.'
        );
        return;
      }

      if (
        !isValidCoordinate(
          latitude,
          longitude
        )
      ) {
        showAlert(
          '위도와 경도를 확인해주세요.'
        );
        return;
      }

      setSaving(true);

      console.log('보고서 저장 좌표:', latitude, longitude);

      // 위치도에 빨간 표시로 마킹해둔 이미지가 있으면 그걸 그대로 쓰고,
      // 없으면 지도를 확대/이동해 둔 상태 그대로 캡처해서 사용한다.
      let mapImageUri = markedMapUri;

      if (!mapImageUri) {
        try {
          // WebView(지도)가 화면에 완전히 그려진 뒤에 캡처해야
          // 빈 화면이 캡처되는 걸 막을 수 있어서, 캡처 직전에
          // 한 번 다시 그리게 하고 살짝 기다린다.
          mapRef.current?.injectJavaScript(
            'if (window.map) { window.map.relayout(); } true;'
          );

          await new Promise((resolve) => setTimeout(resolve, 400));

          mapImageUri = await captureRef(mapWrapperRef, {
            format: 'jpg',
            quality: 0.8,
          });
        } catch (captureError) {
          console.log('지도 캡처 실패:', captureError?.message);
        }
      }

      const form =
        new FormData();

      form.append(
        'taskId',
        String(taskId)
      );
      if (user?.userId) form.append('userId', String(user.userId));

      form.append(
        'latitude',
        String(latitude || '')
      );

      form.append(
        'longitude',
        String(longitude || '')
      );
      form.append('locationAddress', locationAddress || '');

      form.append(
        'mainComment',
        ''
      );

      form.append(
        'fieldMemo',
        fieldMemo || ''
      );

      form.append(
        'progressStatus',
        status || 'pending'
      );

      const isLocalUri = (
        uri
      ) =>
        uri &&
        (
          uri.startsWith(
            'file://'
          ) ||
          uri.startsWith(
            'content://'
          )
        );

      // 실제로 업로드되는 사진만 골라서, 코멘트 배열과 파일 배열의 순서를
      // 1:1로 맞춘다 (전/중/후 라벨이 엉뚱한 사진에 붙는 것을 방지).
      const uploadPhotos = photos.filter(
        (photo) => photo.uri && isLocalUri(photo.uri)
      );

      form.append(
        'photoComments',
        JSON.stringify(
          uploadPhotos.map(
            (photo) => `${photo.label}|${photo.comment || ''}`
          )
        )
      );

      for (const photo of uploadPhotos) {
        const photoResponse = await fetch(photo.uri);
        const photoBlob = await photoResponse.blob();
        const fileName = photo.type === 'before' ? 'before.jpg' : photo.type === 'during' ? 'during.jpg' : 'after.jpg';
        form.append('fieldPhotos', photoBlob, fileName);
      }

      if (mapImageUri) {
        const mapResponse = await fetch(mapImageUri);
        const mapBlob = await mapResponse.blob();
        form.append('mapImage', mapBlob, 'map.jpg');
      }

      const res =
        await fetch(
          `${API_BASE_URL}/api/task-progress`,
          {
            method: 'POST',
            body: form,
          }
        );

      if (!res.ok) {
        throw new Error(
          `보고서 저장 실패: ${res.status}`
        );
      }

      const savedReport =
        await res.json();

      setAiRefinedContent(
        savedReport
          .aiRefinedContent ||
          ''
      );

      setReportDownloadUrl(
        savedReport
          .reportDownloadUrl
          ? resolveApiUrl(
              savedReport
                .reportDownloadUrl
            )
          : null
      );

      if (
        savedReport.fieldPhotos
      ) {
        const savedPhotos =
          savedReport.fieldPhotos;

        setPhotos(
          PHOTO_TYPES.map(
            (type, index) => {
              const savedPhoto =
                savedPhotos[index];

              return {
                type:
                  type.key,

                label:
                  type.label,

                uri: savedPhoto
                  ? resolveApiUrl(
                      savedPhoto.uri ||
                        savedPhoto.path
                    ) ||
                    savedPhoto.uri ||
                    savedPhoto.path
                  : null,

                comment:
                  savedPhoto
                    ?.comment ||
                  photos[index]
                    ?.comment ||
                  '',
              };
            }
          )
        );
      }

      initialFormRef.current = currentFormRef.current;
      onSave?.({
        ...savedReport,
        taskId,
        id: savedReport?.id ?? taskId,
        progressStatus:
          status ||
          savedReport?.progressStatus ||
          'pending',
        status:
          status ||
          savedReport?.progressStatus ||
          'pending',
        latitude: Number(latitude),
        longitude: Number(longitude),
        lat: Number(latitude),
        lng: Number(longitude),
        locationAddress: locationAddress || '',
      });

      showAlert(
        '보고서가 저장되었고 AI 분석이 완료되었습니다.'
      );
    } catch (error) {
      console.log(error);

      showAlert(
        '보고서 저장 중 문제가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const [
    initialMapHtml,
  ] = useState(() =>
    getInteractiveMapHtml(
      latitude,
      longitude
    )
  );

  return (
    <View
      style={
        styles.container
      }
    >
      <ScreenHeader title="보고서 양식 작성" onBack={requestBack} />

      <ScrollView
        contentContainerStyle={
          styles.body
        }
        keyboardShouldPersistTaps="handled"
        scrollEnabled={
          !mapInteracting
        }
      >
        {/* 1. 작업 위치 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>작업 위치</Text>

          <View
            ref={mapWrapperRef}
            collapsable={false}
            pointerEvents="auto"
            style={styles.mapWrapper}
          >
            <WebView
              ref={mapRef}
              originWhitelist={['*']}
              source={{
                html: initialMapHtml,
                baseUrl: 'https://localhost/',
              }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              nestedScrollEnabled
              scrollEnabled
              onTouchStart={handleMapTouchStart}
              onTouchMove={handleMapTouchStart}
              onTouchEnd={handleMapTouchEnd}
              onTouchCancel={handleMapTouchEnd}
              onMessage={handleMapMessage}
              onLoadEnd={() => {
                setTimeout(() => {
                  applyCoordinateToMap();
                  mapRef.current?.injectJavaScript(`
                    if (window.setSelectionMode) {
                      window.setSelectionMode(${editingLocation ? 'true' : 'false'});
                    }
                    true;
                  `);
                }, 500);
              }}
              overScrollMode="never"
              setBuiltInZoomControls={false}
              setDisplayZoomControls={false}
            />
          </View>

          <Text style={styles.locationMoveStatus}>
            {locationMoving
              ? '옮기는 중...'
              : editingLocation
                ? '위치 이동 가능 · 지도를 움직여 조정하세요'
                : '마커 고정됨'}
          </Text>

          {markedMapUri ? (
            <Image source={{ uri: markedMapUri }} style={styles.mapPreviewImage} />
          ) : null}

          <View style={styles.locationActionRow}>
            <TouchableOpacity
              style={[
                styles.photoSmallButton,
                editingLocation && styles.locationSettingActive,
              ]}
              onPress={() => {
                setLocationMoving(false);
                setEditingLocation((value) => !value);
              }}
            >
              <Text style={styles.photoSmallButtonText}>위치 설정</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoSmallButton}
              onPress={openMapEditor}
            >
              <Text style={styles.photoSmallButtonText}>위치도 편집</Text>
            </TouchableOpacity>
          </View>

          {markedMapUri ? (
            <TouchableOpacity
              style={styles.clearMapMarkupButton}
              onPress={() => setMarkedMapUri(null)}
            >
              <Text style={styles.clearMapMarkupText}>표시 지우기</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 2. 현장 사진 */}
        <View style={styles.card}>
          <Text
            style={
              styles.cardTitle
            }
          >
            현장 사진
          </Text>

          {photos.map(
            (
              item,
              index
            ) => (
              <View
                key={item.type}

                style={[
                  styles.photoSlot,

                  index !==
                    photos.length -
                      1 &&
                    styles.photoSlotDivider,
                ]}
              >
                <Text
                  style={
                    styles.photoStageTitle
                  }
                >
                  {item.label}
                </Text>

                {item.uri ? (
                  <>
                    <Image
                      source={{
                        uri:
                          item.uri,
                      }}

                      style={
                        styles.photo
                      }
                    />

                    <View
                      style={
                        styles.photoButtonRow
                      }
                    >
                      <TouchableOpacity
                        style={
                          styles.photoSmallButton
                        }

                        onPress={() =>
                          editExistingPhoto(
                            index
                          )
                        }
                      >
                        <Text
                          style={
                            styles.photoSmallButtonText
                          }
                        >
                          사진 편집
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={
                          styles.photoSmallButton
                        }

                        onPress={() =>
                          retakePhoto(
                            index
                          )
                        }
                      >
                        <Text
                          style={
                            styles.photoSmallButtonText
                          }
                        >
                          사진 변경
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.photoSmallButton,
                          styles.deleteButton,
                        ]}

                        onPress={() =>
                          deletePhoto(
                            index
                          )
                        }
                      >
                        <Text
                          style={
                            styles.photoSmallButtonText
                          }
                        >
                          삭제
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <TouchableOpacity
                    style={
                      styles.emptyPhotoSlot
                    }

                    onPress={() =>
                      selectPhoto(
                        index
                      )
                    }
                  >
                    <Text
                      style={
                        styles.emptyPhotoPlus
                      }
                    >
                      ＋
                    </Text>

                    <Text
                      style={
                        styles.emptyPhotoText
                      }
                    >
                      {item.label}{' '}
                      사진 선택
                    </Text>
                  </TouchableOpacity>
                )}

                <VoiceTextInput
                  value={
                    item.comment
                  }

                  onChangeText={(
                    text
                  ) =>
                    updatePhotoComment(
                      index,
                      text
                    )
                  }

                  placeholder={`${item.label} 사진 메모`}

                  inputStyle={
                    styles.photoMemo
                  }
                />
              </View>
            )
          )}
        </View>

        {/* 3. 현장 메모 */}
        <View style={styles.card}>
          <Text
            style={
              styles.cardTitle
            }
          >
            현장 메모
          </Text>

          <VoiceTextInput
            value={fieldMemo}

            onChangeText={
              setFieldMemo
            }

            placeholder="예: 담당자 확인 필요, 추가 점검 예정, 민원인 요청사항 등"

            inputStyle={
              styles.memo
            }
          />
        </View>

        {/* 4. 상태 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>상태</Text>

          <Text style={styles.stateSectionLabel}>업무 유형</Text>
          <Text style={styles.typeText}>
            {actionType === 'report'
              ? '보고서 작성'
              : actionType === 'photo'
              ? '사진 기록'
              : actionType === 'memo'
              ? '메모 작성'
              : '상태 변경'}
          </Text>

          <View style={styles.stateDivider} />
          <Text style={styles.stateSectionLabel}>처리 상태</Text>

          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[styles.statusBtn, status === 'pending' && styles.statusActive]}
              onPress={() => setStatus('pending')}
            >
              <Text style={[styles.statusText, status === 'pending' && styles.statusTextActive]}>
                작업 전
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statusBtn, status === 'working' && styles.statusActive]}
              onPress={() => setStatus('working')}
            >
              <Text style={[styles.statusText, status === 'working' && styles.statusTextActive]}>
                작업 중
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statusBtn, status === 'complete' && styles.statusActive]}
              onPress={() => setStatus('complete')}
            >
              <Text style={[styles.statusText, status === 'complete' && styles.statusTextActive]}>
                작업 후
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <PrimaryButton
          title={
            saving
              ? '저장 중...'
              : '보고서 저장'
          }

          onPress={
            handleSave
          }
          disabled={saving}
        />
      </ScrollView>

      <PhotoMarkupEditor
        visible={
          photoEditor.visible
        }

        uri={
          photoEditor.uri
        }

        onCancel={
          closePhotoEditor
        }

        onComplete={
          completePhotoEdit
        }
      />

      <PhotoMarkupEditor
        visible={mapEditor.visible}
        uri={mapEditor.uri}
        onCancel={closeMapEditor}
        onComplete={completeMapEdit}
      />
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F4F8FF',
      transform: [{ translateY: -15 }],
    },

    body: {
      padding: 14,
      gap: 10,
      paddingBottom: 58,
    },

    card: {
      backgroundColor:
        'white',

      borderRadius: 16,

      padding: 14,

      borderWidth: 1,

      borderColor:
        '#DCE7F5',
    },

    cardTitle: {
      fontSize: 12.5,

      fontWeight: '900',

      color: '#10285B',

      marginBottom: 8,
    },

    typeText: {
      color: '#2477F3',

      fontSize: 15,

      fontWeight: '900',
    },

    mapWrapper: {
      height: 220,

      borderRadius: 14,

      overflow: 'hidden',

      borderWidth: 1,

      borderColor:
        '#DCE7F5',

      backgroundColor:
        '#E8F2FF',

      marginBottom: 8,
    },

    map: {
      flex: 1,

      backgroundColor:
        '#E8F2FF',
    },

    mapGuide: {
      fontSize: 10,

      color: '#607195',

      marginBottom: 14,

      lineHeight: 16,
    },

    inputLabel: {
      fontSize: 10.5,

      fontWeight: '800',

      color: '#10285B',

      marginBottom: 6,
    },

    input: {
      borderWidth: 1,

      borderColor:
        '#DCE7F5',

      borderRadius: 12,

      padding: 10,

      fontSize: 13,

      marginBottom: 8,

      color: '#10285B',

      backgroundColor:
        '#FFFFFF',
    },

    photoSlot: {
      paddingTop: 4,

      paddingBottom: 14,
    },

    photoSlotDivider: {
      borderBottomWidth: 1,

      borderBottomColor:
        '#EEF3F9',

      marginBottom: 14,
    },

    photoStageTitle: {
      fontSize: 14,

      fontWeight: '900',

      color: '#10285B',

      marginBottom: 8,
    },

    emptyPhotoSlot: {
      height: 126,

      borderRadius: 14,

      backgroundColor:
        '#F6F9FD',

      borderWidth: 1,

      borderColor:
        '#DCE7F5',

      borderStyle: 'dashed',

      alignItems: 'center',

      justifyContent:
        'center',

      marginBottom: 10,
    },

    emptyPhotoPlus: {
      fontSize: 28,

      color: '#2477F3',

      fontWeight: '900',

      marginBottom: 4,
    },

    emptyPhotoText: {
      fontSize: 12,

      color: '#607195',

      fontWeight: '900',
    },

    photo: {
      height: 158,

      borderRadius: 14,

      marginBottom: 8,

      backgroundColor:
        '#E8F2FF',
    },

    photoButtonRow: {
      flexDirection: 'row',

      gap: 8,

      marginBottom: 8,
    },

    // 위치도 편집 버튼을 위/아래 텍스트와 겹치지 않게, 정확히 중간에
    // 오도록 위아래 여백을 동일하게 준다.
    mapEditButtonSpacing: {
      marginBottom: 14,
    },

    locationActionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },

    locationMoveStatus: {
      marginTop: 8,
      color: '#607195',
      fontSize: 12,
      fontWeight: '800',
    },

    locationSettingActive: {
      backgroundColor: '#10285B',
    },

    mapPreviewImage: {
      width: '100%',
      height: 180,
      borderRadius: 14,
      marginBottom: 10,
      backgroundColor: '#E8F2FF',
    },

    clearMapMarkupButton: {
      alignSelf: 'flex-end',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },

    clearMapMarkupText: {
      color: '#607195',
      fontSize: 11,
      fontWeight: '800',
    },

    stateSectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: '#607195',
      marginBottom: 6,
    },

    stateDivider: {
      height: 1,
      backgroundColor: '#EEF3F9',
      marginVertical: 14,
    },

    photoSmallButton: {
      flex: 1,

      backgroundColor:
        '#2477F3',

      borderRadius: 10,

      paddingVertical: 9,

      alignItems: 'center',
    },

    deleteButton: {
      backgroundColor:
        '#E74C3C',
    },

    photoSmallButtonText: {
      color: 'white',

      fontSize: 11,

      fontWeight: '900',
    },

    photoMemo: {
      minHeight: 70,

      borderRadius: 12,

      borderWidth: 1,

      borderColor:
        '#DCE7F5',

      padding: 10,

      textAlignVertical:
        'top',

      fontSize: 12,
    },

    memo: {
      minHeight: 96,

      borderRadius: 14,

      borderWidth: 1,

      borderColor:
        '#DCE7F5',

      padding: 12,

      textAlignVertical:
        'top',

      fontSize: 13,
    },

    statusRow: {
      flexDirection: 'row',

      gap: 8,
    },

    statusBtn: {
      flex: 1,

      borderRadius: 12,

      borderWidth: 1,

      borderColor:
        '#DCE7F5',

      paddingVertical: 11,

      alignItems: 'center',
    },

    statusActive: {
      backgroundColor:
        '#2477F3',

      borderColor:
        '#2477F3',
    },

    statusText: {
      fontSize: 11,

      fontWeight: '900',

      color: '#607195',
    },

    statusTextActive: {
      color: 'white',
    },

    guideText: {
      fontSize: 10,

      color: '#607195',

      marginTop: 2,
    },

    aiCard: {
      backgroundColor:
        '#FFF7ED',

      borderColor:
        '#FED7AA',

      borderWidth: 1,

      borderRadius: 18,

      padding: 16,
    },

    aiEyebrow: {
      fontSize: 10,

      fontWeight: '900',

      color: '#C2410C',

      letterSpacing: 1.4,
    },

    aiTitle: {
      fontSize: 15,

      fontWeight: '900',

      color: '#10285B',

      marginTop: 6,
    },

    risk: {
      fontSize: 12,

      fontWeight: '900',

      marginTop: 8,
    },

    aiReport: {
      fontSize: 11,

      lineHeight: 18,

      color: '#607195',

      marginTop: 8,
    },
  });
