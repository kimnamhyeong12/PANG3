import { getInteractiveMapHtml } from '../utils/reportLocationMap';
import ProtectedImage from '../components/ProtectedImage';
import { apiFetch as fetch } from '../utils/auth';
import { showAlert } from '../components/CustomAlert';
import React, { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { apiFetch as expoFetch } from '../utils/auth';

import {
  View,
  Text,
  TextInput,
  BackHandler,
  ActivityIndicator,
  AppState,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  } from 'react-native';

import { emptyPhotos, restorePhotos, photoManifest, isLocalPhoto, statusFromRecords } from '../utils/reportPhotos';
import { draftKey, readDraft, writeDraft, clearDraft, preservePhoto, beginPhotoPick, pendingPhotoPick, endPhotoPick } from '../utils/reportDraft';
import { useScreenBackHandler } from '../utils/screenBack';
import { colors } from '../constants/design';
import { cleanReportName } from '../utils/reportName';

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';

import {
  PrimaryButton,
  ScreenHeader,
} from '../components/ui';

import VoiceTextInput from '../components/VoiceTextInput';
import PhotoMarkupEditor from '../components/PhotoMarkupEditor';
import ReportLocationPicker from '../components/ReportLocationPicker';
import ReportPhotoPicker from '../components/ReportPhotoPicker';

import {
  API_BASE_URL,
  resolveApiUrl,
} from '../utils/api';

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';

const createEmptyPhotos = emptyPhotos;

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


const normalizeComments = (form) => {
  const comments = [form.fieldMemo, form.mainComment,
    ...(form.photos || []).filter(photo => photo.comment?.trim()).map(photo => `${photo.label}: ${photo.comment.trim()}`)]
    .map(value => String(value || '').trim()).filter(Boolean);
  return { ...form, reportName: cleanReportName(form.reportName), fieldMemo: [...new Set(comments)].join('\n'), mainComment: '',
    photos: (form.photos || []).map(photo => ({ ...photo, comment: '' })) };
};

export default function FieldActionScreen({
  user,
  location,
  actionType,
  onBack,
  onSave,
  onPositionChanged,
  workspaceKey,
  registerNavigationGuard,
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
  const [locationAddress, setLocationAddress] = useState(location?.roadAddress || '');
  const [editingLocation, setEditingLocation] = useState(false);
  const [positionSaving, setPositionSaving] = useState(false);
  const positionSavingRef = useRef(false);
  const locationEditSnapshotRef = useRef(null);

  const defaultReportName = cleanReportName(location?.reportName) || (location?.detailAddress || location?.roadAddress || '현장 보고서').slice(0, 120);
  const [reportName, setReportName] = useState(defaultReportName);
  const [editingReportName, setEditingReportName] = useState(false);
  const [completedAt, setCompletedAt] = useState(location?.completedAt || '');
  const [photos, setPhotos] =
    useState(createEmptyPhotos());
  const [photoPickerIndex, setPhotoPickerIndex] = useState(null);

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

  const taskId = location?.id ?? location?.taskId ?? location?.task_id;
  const [progressId, setProgressId] = useState(location?.reportProgressId || null);
  const [revision, setRevision] = useState(null);
  const [recordedAt, setRecordedAt] = useState('');
  const [mainComment, setMainComment] = useState('');
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadError, setLoadError] = useState('');
  const readyRef = useRef(false);
  const savedRef = useRef(false);
  const savingRef = useRef(false);
  const key = draftKey(user?.userId, workspaceKey, taskId,
    location?.reportProgressId || 'latest');
  const snapshot = { status, latitude, longitude, locationAddress, photos, fieldMemo,
    markedMapUri, progressId, revision, recordedAt, photoEditor, mainComment, reportName, completedAt };
  const currentFormRef = useRef(snapshot);
  currentFormRef.current = snapshot;
  const initialFormRef = useRef('');
  const editSnapshot = (form) => JSON.stringify({ status: form.status, latitude: form.latitude,
    longitude: form.longitude, locationAddress: form.locationAddress, photos: form.photos,
    fieldMemo: form.fieldMemo, markedMapUri: form.markedMapUri, progressId: form.progressId,
    revision: form.revision, recordedAt: form.recordedAt, mainComment: form.mainComment || '', reportName: form.reportName || defaultReportName });

  const recoverPhotoPick = async (form) => {
    const pending = await pendingPhotoPick(key);
    if (!pending) return form;
    const result = await ImagePicker.getPendingResultAsync();
    if (result?.assets?.[0]?.uri && !result.canceled) {
      const recovered = { ...form, photoEditor: { visible: true, isNew: true, index: pending.index,
        uri: preservePhoto(key, result.assets[0].uri) } };
      await writeDraft(key, recovered);
      await endPhotoPick(key);
      return recovered;
    }
    await endPhotoPick(key);
    return form;
  };

  const flushDraft = async () => {
    if (!readyRef.current || savedRef.current) return true;
    try {
      await writeDraft(key, currentFormRef.current);
      return true;
    } catch {
      return false;
    }
  };

  const leaveGuard = async () => {
    if (savingRef.current || positionSavingRef.current) {
      showAlert('저장 중', '보고서 저장이 끝난 뒤 이동해 주세요.');
      return false;
    }
    if (!readyRef.current || savedRef.current || editSnapshot(currentFormRef.current) === initialFormRef.current && !currentFormRef.current.photoEditor?.visible) return true;
    if (await flushDraft()) return !savingRef.current;
    showAlert('작성 내용 보관 실패', '내용을 보호하기 위해 이 화면에 머물렀습니다. 보고서 저장 후 이동해 주세요.');
    return false;
  };
  const guardRef = useRef(leaveGuard);
  guardRef.current = leaveGuard;
  useEffect(() => registerNavigationGuard?.(() => guardRef.current()), [registerNavigationGuard]);
  const cancelLocationEdit = () => {
    if (positionSavingRef.current) return;
    const previous = locationEditSnapshotRef.current;
    if (previous) {
      setLatitude(previous.latitude); setLongitude(previous.longitude);
      setLocationAddress(previous.locationAddress); setMarkedMapUri(previous.markedMapUri);
    }
    locationEditSnapshotRef.current = null;
    setLocationMoving(false); setEditingLocation(false);
    setMapInteracting(false);
  };
  useScreenBackHandler(() => {
    if (!editingLocation) return false;
    cancelLocationEdit();
    return true;
  }, editingLocation);
  const requestBack = () => onBack?.();
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { requestBack(); return true; });
    return () => subscription.remove();
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const endpoint = location?.reportProgressId
          ? `/api/task-progress/${location.reportProgressId}?userId=${user.userId}`
          : `/api/task-progress/task/${taskId}`;
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!response.ok) throw new Error('보고서 조회 실패');
        const text = await response.text();
        const data = text.trim() ? JSON.parse(text) : null;
        const local = await readDraft(key);
        if (!active) return;
        const base = normalizeComments({ status: location?.reportProgressId ? data?.progressStatus || 'pending' : location?.status || data?.progressStatus || 'pending',
          latitude: String(data?.latitude ?? location?.latitude ?? location?.lat ?? ''),
          longitude: String(data?.longitude ?? location?.longitude ?? location?.lng ?? ''),
          locationAddress: data?.locationAddress || location?.roadAddress || '',
          photos: restorePhotos(data?.fieldPhotos, resolveApiUrl), fieldMemo: data?.fieldMemo || '',
          mainComment: data?.mainComment || '',
          reportName: data?.reportName || defaultReportName, completedAt: data?.completedAt || location?.completedAt || '',
          markedMapUri: null, progressId: data?.progressId || null, revision: data?.revision ?? null, recordedAt: data?.createdAt || '',
          photoEditor: { visible: false, uri: null, index: null } });
        initialFormRef.current = editSnapshot(base);
        const form = normalizeComments(await recoverPhotoPick(local || base));
        if (!active) return;
        setStatus(form.status);
        setLatitude(form.latitude); setLongitude(form.longitude); setLocationAddress(form.locationAddress);
        setPhotos(form.photos); setFieldMemo(form.fieldMemo); setMarkedMapUri(form.markedMapUri);
        setMainComment(form.mainComment || '');
        setReportName(form.reportName || defaultReportName); setCompletedAt(form.completedAt || '');
        setProgressId(form.progressId); setRevision(form.revision); setRecordedAt(form.recordedAt || '');
        setPhotoEditor(form.photoEditor || base.photoEditor);
        readyRef.current = true;
      } catch {
        // An offline draft is still recoverable; never silently replace saved data with an empty form.
        try {
          let local = await readDraft(key);
          if (!active) return;
          if (!local) throw new Error();
          local = normalizeComments(await recoverPhotoPick(local));
          if (!active) return;
          setStatus(local.status);
          setLatitude(local.latitude); setLongitude(local.longitude); setLocationAddress(local.locationAddress);
          setPhotos(local.photos); setFieldMemo(local.fieldMemo); setMarkedMapUri(local.markedMapUri);
          setMainComment(local.mainComment || '');
          setReportName(local.reportName || defaultReportName); setCompletedAt(local.completedAt || location?.completedAt || '');
          setProgressId(local.progressId); setRevision(local.revision); setRecordedAt(local.recordedAt || '');
          setPhotoEditor(local.photoEditor || { visible: false, uri: null, index: null });
          readyRef.current = true;
        } catch { if (active) setLoadError('저장된 내용을 불러오지 못했습니다. 돌아가서 다시 시도해 주세요.'); }
      } finally { if (active) setLoadingReport(false); }
    })();
    return () => { active = false; };
  }, [key]);

  useEffect(() => {
    if (!readyRef.current || savedRef.current || savingRef.current) return;
    if (editSnapshot(snapshot) === initialFormRef.current && !photoEditor.visible) return;
    const timer = setTimeout(flushDraft, 350);
    return () => clearTimeout(timer);
  }, [JSON.stringify(snapshot), loadingReport]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => { if (next !== 'active') flushDraft(); });
    return () => subscription.remove();
  }, [key]);

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
        if (positionSavingRef.current) return;
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
        window.setSelectionMode(false);
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
    if (loadingReport || !KAKAO_REST_API_KEY || !isValidCoordinate(latitude, longitude)) return undefined;
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
  }, [latitude, longitude, loadingReport]);

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

    await launchPhotoPick(index, () => ImagePicker.launchCameraAsync({ quality: 0.7 }));
  };

  const pickPhotoFromLibrary = index => launchPhotoPick(index, () => ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, quality: 0.7,
  }));

  const launchPhotoPick = async (index, launch) => {
    try {
      await beginPhotoPick(key, index, currentFormRef.current);
      const result = await launch();
      if (!result.canceled && result.assets?.[0]?.uri) {
        const rawEditor = { visible: true, uri: result.assets[0].uri, isNew: true, index };
        setPhotoEditor(rawEditor);
        const editor = { ...rawEditor, uri: preservePhoto(key, rawEditor.uri) };
        setPhotoEditor(editor);
        await writeDraft(key, { ...currentFormRef.current, photoEditor: editor });
      }
      await endPhotoPick(key);
    } catch {
      showAlert('사진 보관 실패', '사진을 안전하게 보관하지 못했습니다. 저장 공간과 사진 접근 권한을 확인해 주세요.');
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
    setPhotoPickerIndex(index);
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
    const nextPhotos = photos.map(
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
      );
    setPhotos(nextPhotos);
    setStatus(previous => statusFromRecords(previous, nextPhotos));
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
        quality: 0.7,
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
      setMarkedMapUri(preservePhoto(key, editedUri));
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

    const nextPhotos = photos.map(
        (photo, index) =>
          index ===
          photoEditor.index
            ? {
                ...photo,
                uri: preservePhoto(key, editedUri),
                path: editedUri === photo.uri ? photo.path : null,
              }
            : photo
      );
    setPhotos(nextPhotos);
    setStatus(previous => statusFromRecords(previous, nextPhotos));

    closePhotoEditor();
  };

  /*
   * 보고서 저장
   */
  const toggleLocation = () => {
    if (savingRef.current || positionSavingRef.current || loadingReport || loadError) return;
    if (!editingLocation) {
      locationEditSnapshotRef.current = { latitude, longitude, locationAddress, markedMapUri };
      setEditingLocation(true);
    }
  };
  const saveLocationPosition = async (selected) => {
    if (savingRef.current || positionSavingRef.current) return;
    const selectedLatitude = String(selected.latitude);
    const selectedLongitude = String(selected.longitude);
    const selectedAddress = selected.locationAddress || '';
    if (!isValidCoordinate(selectedLatitude, selectedLongitude)) throw new Error('올바른 위치를 선택해 주세요.');
    positionSavingRef.current = true; setPositionSaving(true);
    try {
      const form = new FormData();
      form.append('latitude', selectedLatitude); form.append('longitude', selectedLongitude);
      form.append('locationAddress', selectedAddress);
      if (progressId) { form.append('progressId', String(progressId)); form.append('expectedRevision', revision || ''); }
      try {
        mapRef.current?.injectJavaScript(`window.setExternalPosition?.(${Number(selectedLatitude)}, ${Number(selectedLongitude)}); true;`);
        await new Promise(resolve => setTimeout(resolve, 400));
        const uri = await captureRef(mapWrapperRef, { format: 'jpg', quality: 0.7 });
        form.append('mapImage', new File(uri));
      } catch (captureError) { console.log('Position map capture failed:', captureError?.message); }
      const response = await expoFetch(`${API_BASE_URL}/api/task-progress/task/${taskId}/location`, {
        method: 'PATCH', body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '위치를 저장하지 못했습니다.');
      const patch = { latitude: selectedLatitude, longitude: selectedLongitude, locationAddress: selectedAddress, markedMapUri: null,
        revision: result.revision ?? revision };
      setLatitude(selectedLatitude); setLongitude(selectedLongitude); setLocationAddress(selectedAddress);
      setRevision(patch.revision); setMarkedMapUri(null);
      currentFormRef.current = { ...currentFormRef.current, ...patch };
      if (initialFormRef.current) initialFormRef.current = editSnapshot({ ...JSON.parse(initialFormRef.current), ...patch });
      try { await writeDraft(key, currentFormRef.current); }
      catch (draftError) { console.log('Position draft backup failed:', draftError?.message); }
      setLocationMoving(false); setEditingLocation(false);
      locationEditSnapshotRef.current = null;
      onPositionChanged?.(result);
    } catch (error) {
      applyCoordinateToMap();
      throw error;
    } finally { positionSavingRef.current = false; setPositionSaving(false); }
  };

  const handleSave = async () => {
    if (savingRef.current || positionSavingRef.current || loadingReport || loadError) return;
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

      if (!reportName.trim()) { showAlert('보고서 이름', '보고서 이름을 입력해 주세요.'); return; }
      savingRef.current = true;
      setSaving(true);
      await flushDraft();

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
            quality: 0.7,
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
      form.append('reportName', reportName.trim());
      if (progressId) form.append('progressId', String(progressId));
      if (progressId && revision != null) form.append('expectedRevision', String(revision));
      form.append('photoSlots', JSON.stringify(photoManifest(photos)));

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
        mainComment || ''
      );

      form.append(
        'fieldMemo',
        fieldMemo || ''
      );

      form.append(
        'progressStatus',
        status || 'pending'
      );

      const uploadPhotos = photos.filter((photo) => photo.uri && isLocalPhoto(photo.uri));

      form.append(
        'photoComments',
        JSON.stringify(
          uploadPhotos.map(
            (photo) => `${photo.label}|${photo.comment || ''}`
          )
        )
      );

      const appendImage = async (name, uri) => {
        const image = await ImageManipulator.manipulateAsync(uri, [], {
          compress: 0.7, format: ImageManipulator.SaveFormat.JPEG,
        });
        form.append(name, new File(image.uri));
      };
      for (const photo of uploadPhotos) await appendImage('fieldPhotos', photo.uri);
      if (mapImageUri) await appendImage('mapImage', mapImageUri);

      const res =
        await expoFetch(
          `${API_BASE_URL}/api/task-progress`,
          {
            method: 'POST',
            body: form,
          }
        );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.message || '저장하지 못했습니다. 작성 내용은 임시 보관됩니다.');
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

      setPhotos(restorePhotos(savedReport.fieldPhotos, resolveApiUrl));
      setProgressId(savedReport.progressId);
      setRevision(savedReport.revision);
      setReportName(cleanReportName(savedReport.reportName) || reportName.trim());
      setCompletedAt(savedReport.completedAt || '');
      savedRef.current = true;
      try { await clearDraft(key); } catch (error) { console.warn('보고서 임시 자료 정리 실패', error); }
      onSave?.({
        ...savedReport,
        taskId,
        id: savedReport?.id ?? taskId,
        progressStatus:
          status ||
          savedReport?.progressStatus ||
          'pending',
        status:
          savedReport.taskStatus || status ||
          savedReport?.progressStatus ||
          'pending',
        latitude: Number(latitude),
        longitude: Number(longitude),
        lat: Number(latitude),
        lng: Number(longitude),
        locationAddress: locationAddress || '',
      });

      showAlert(
        '보고서가 저장되었습니다.'
      );
    } catch (error) {
      console.log(error);

      showAlert('저장 실패', error.message || '보고서 저장 중 문제가 발생했습니다. 작성 내용은 유지됩니다.');
    } finally {
      savingRef.current = false;
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
      {loadingReport ? <ActivityIndicator style={{ padding: 16 }} /> : null}
      {loadError ? <Text style={{ color: '#DC2626', padding: 16 }}>{loadError}</Text> : null}


      <ScrollView
        pointerEvents={loadingReport || loadError || saving ? 'none' : 'auto'}
        contentContainerStyle={
          styles.body
        }
        keyboardShouldPersistTaps="handled"
        scrollEnabled={
          !mapInteracting
        }
      >
        <View style={styles.reportTitleRow}>
          {editingReportName ? <TextInput autoFocus value={reportName} onChangeText={setReportName} maxLength={120}
            accessibilityLabel="보고서 제목 수정" placeholder="보고서 제목" style={styles.reportTitleInput}
            onBlur={() => { setReportName(value => value.trim() || defaultReportName); setEditingReportName(false); }}
            onSubmitEditing={() => { setReportName(value => value.trim() || defaultReportName); setEditingReportName(false); }} returnKeyType="done" /> :
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="보고서 제목 수정" onPress={() => setEditingReportName(true)} style={styles.reportTitleButton}>
              <Text style={styles.reportTitleText} numberOfLines={1}>{reportName || defaultReportName}</Text><Ionicons name="pencil-outline" size={18} color={colors.primary} />
            </TouchableOpacity>}
        </View>
        {/* 1. 작업 위치 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>위치도</Text>

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
                      window.setSelectionMode(false);
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



          {markedMapUri ? (
            <ProtectedImage source={{ uri: markedMapUri }} style={styles.mapPreviewImage} />
          ) : null}

          <View style={styles.locationActionRow}>
            <TouchableOpacity
              style={[
                styles.photoSmallButton,
                editingLocation && styles.locationSettingActive,
              ]}
              disabled={saving || positionSaving || loadingReport || !!loadError}
              onPress={toggleLocation}
            >
              <Ionicons name="location-outline" size={16} color="#FFFFFF" /><Text style={styles.photoSmallButtonText}>위치 바꾸기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoSmallButton}
              onPress={openMapEditor}
            >
              <Ionicons name="create-outline" size={16} color="#FFFFFF" /><Text style={styles.photoSmallButtonText}>{markedMapUri ? '위치도 수정하기' : '위치도 표시하기'}</Text>
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>현장 사진</Text>
          <View style={styles.photoStageRow}>{photos.map((item, index) => <View key={item.type} style={styles.photoStageCell}>
            <View style={styles.photoStageHeading}><Text style={styles.photoStageLabel}>{item.label}</Text>
              {item.uri && <Ionicons name="checkmark-circle" size={14} color="#326F64" />}</View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.label} 사진 ${item.uri ? '편집' : '선택'}`}
              onPress={() => item.uri ? editExistingPhoto(index) : selectPhoto(index)} style={styles.photoStageImage}>
              {item.uri ? <ProtectedImage source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} /> :
                <><Ionicons name="add" size={27} color="#8293AA" /><Text style={styles.photoStageEmpty}>사진 선택</Text></>}
            </TouchableOpacity>
            {item.uri && <View style={styles.photoStageActions}>
              <TouchableOpacity accessibilityLabel={`${item.label} 사진 변경`} onPress={() => retakePhoto(index)} style={styles.photoStageAction}><Ionicons name="camera-outline" size={18} color={colors.primary} /></TouchableOpacity>
              <TouchableOpacity accessibilityLabel={`${item.label} 사진 삭제`} onPress={() => deletePhoto(index)} style={styles.photoStageAction}><Ionicons name="trash-outline" size={17} color={colors.danger} /></TouchableOpacity>
            </View>}
          </View>)}</View>
        </View>

        {/* 3. 현장 메모 */}
        <View style={styles.card}>
          <Text
            style={
              styles.cardTitle
            }
          >
            메모
          </Text>

          <VoiceTextInput
            value={fieldMemo}

            onChangeText={
              text => { setFieldMemo(text); setStatus(previous => statusFromRecords(previous, photos, text)); }
            }

            placeholder="메모를 입력하세요"

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
              disabled={saving}
              onPress={() => setStatus('pending')}
            >
              <Text style={[styles.statusText, status === 'pending' && styles.statusTextActive]}>
                작업 전
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statusBtn, status === 'working' && styles.statusActive]}
              disabled={saving}
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

      </ScrollView>

      {!loadingReport && !loadError && <View style={styles.saveBar}>
        <PrimaryButton title={saving ? '저장 중...' : '보고서 저장'} onPress={handleSave} disabled={saving} />
      </View>}

      {editingLocation && <ReportLocationPicker latitude={latitude} longitude={longitude} address={locationAddress}
        buildMapHtml={getInteractiveMapHtml} saving={positionSaving} onCancel={cancelLocationEdit} onConfirm={saveLocationPosition} />}

      <ReportPhotoPicker visible={photoPickerIndex !== null} onClose={() => setPhotoPickerIndex(null)}
        onCamera={() => takePhoto(photoPickerIndex)}
        onLibrary={() => pickPhotoFromLibrary(photoPickerIndex)} />
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
    saveBar: { padding: 12, backgroundColor: '#FFFFFF' },
    photoTabs: { flexDirection: 'row', gap: 6, marginBottom: 16 },
    photoTab: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F8FF' },
    photoTabActive: { backgroundColor: '#2477F3' },
    photoTabText: { color: '#607195', fontSize: 12, fontWeight: '800' },
    photoTabTextActive: { color: '#FFFFFF' },
    container: {
      flex: 1,

      marginTop: 0, backgroundColor: '#FFFFFF', },

    body: {padding: 20, paddingTop: 4, gap: 20, paddingBottom: 24, },

    card: {
      backgroundColor:
        'white',







      borderColor:
        '#DCE7F5', padding: 0, borderWidth: 0, borderRadius: 0, },

    cardTitle: {


      fontWeight: '900',

      color: '#10285B', fontSize: 16, marginBottom: 12, },

    typeText: {
      color: '#2477F3',

      fontSize: 15,

      fontWeight: '900',
    },

    mapWrapper: {


      borderRadius: 14,

      overflow: 'hidden',



      borderColor:
        '#DCE7F5',

      backgroundColor:
        '#E8F2FF',

      marginBottom: 8, height: 160, borderWidth: 0, },

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

    reportTitleRow: { width: '100%', borderWidth: 1, borderColor: '#CCD9EB', borderRadius: 10, backgroundColor: '#F8FAFD', overflow: 'hidden' },
    reportTitleButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
    reportTitleText: { flex: 1, fontSize: 17, fontWeight: '800', color: '#10285B' },
    reportTitleInput: { minHeight: 46, fontSize: 17, fontWeight: '800', color: '#10285B', paddingVertical: 10, paddingHorizontal: 12 },
    photoStageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    photoStageCell: { flex: 1, minWidth: 0 },
    photoStageHeading: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 7 },
    photoStageLabel: { color: '#10285B', fontWeight: '700', fontSize: 12 },
    photoStageImage: { width: '100%', aspectRatio: 0.9, borderRadius: 9, overflow: 'hidden', backgroundColor: '#F1F5FA', alignItems: 'center', justifyContent: 'center' },
    photoStageEmpty: { fontSize: 10, color: '#607195', marginTop: 3 },
    photoStageActions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
    photoStageAction: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    photoSlot: {
      paddingTop: 4,

      paddingBottom: 14,
    },

    photoSlotDivider: {


      borderBottomColor:
        '#EEF3F9', borderBottomWidth: 0, marginBottom: 0, },

    photoStageTitle: {


      fontWeight: '900',

      color: '#10285B',

      marginBottom: 8, fontSize: 14, },

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
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,

      backgroundColor:
        '#2477F3',



      paddingVertical: 9,

      alignItems: 'center', minHeight: 44, borderRadius: 12, },

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
