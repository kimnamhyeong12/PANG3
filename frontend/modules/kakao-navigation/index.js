import React from 'react';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, View } from 'react-native';

const nativeModule = Platform.OS === 'android'
  ? requireOptionalNativeModule('KakaoNavigation')
  : null;

const NativeNavigationView = nativeModule
  ? requireNativeViewManager('KakaoNavigation')
  : null;

export function isKakaoNavigationAvailable() {
  return Boolean(NativeNavigationView && nativeModule?.previewRoute);
}

export async function readFacilityOriginalPhoto(uri) {
  if (!nativeModule?.readFacilityOriginalPhoto) throw new Error('원본 사진 선택 기능이 포함된 개발용 앱으로 업데이트해 주세요.');
  try {
    return await nativeModule.readFacilityOriginalPhoto(uri);
  } catch (failure) {
    const notices = [
      '선택한 파일에서 촬영 위치를 확인하지 못했습니다. 위치정보가 있는 JPG·PNG 원본 사진을 선택해 주세요.',
      '선택한 원본 사진을 읽지 못했습니다. 파일이 휴대폰에 저장되어 있는지 확인해 주세요.',
      '사진 한 장은 최대 15MB까지 첨부할 수 있습니다.',
      '휴대폰 파일 선택창에서 원본 사진을 선택해 주세요.',
    ];
    const message = String(failure?.message || '');
    throw new Error(notices.find(notice => message.includes(notice)) || '사진을 불러오지 못했습니다. 원본 사진을 다시 선택해 주세요.');
  }
}

const NativeWalkingMap = nativeModule?.isWalkingMapAvailable
  ? requireNativeViewManager('KakaoNavigation', 'KakaoWalkingMap') : null;
export const isWalkingMapAvailable = () => Boolean(NativeWalkingMap);
export function KakaoWalkingMapView(props) { return NativeWalkingMap ? <NativeWalkingMap {...props} /> : null; }

export async function saveReportToDownloads(uri, filename) {
  if (!nativeModule?.saveReportToDownloads) throw new Error('다운로드 폴더 저장 기능이 포함된 Android 앱으로 업데이트해 주세요.');
  return nativeModule.saveReportToDownloads(uri, filename);
}

export async function openReportDownloadsFolder() {
  if (!nativeModule?.openReportDownloadsFolder) return false;
  return nativeModule.openReportDownloadsFolder();
}

export async function reportDownloadExists(uri) {
  return nativeModule?.reportDownloadExists ? nativeModule.reportDownloadExists(uri) : null;
}

export async function openReportFile(uri) {
  if (nativeModule?.openReportFile && await nativeModule.openReportFile(uri)) return;
  await openReportDownloadsFolder();
  if (nativeModule?.openReportFile) throw new Error('HWPX 파일을 열 수 있는 앱이 없어 다운로드 폴더를 열었어요.');
}

export async function previewSdkRoute(request) {
  if (!nativeModule?.previewRoute) throw new Error('SDK 경로 미리보기가 포함된 Android 앱으로 업데이트해 주세요.');
  return nativeModule.previewRoute(request);
}
export function isSdkPreviewAvailable(id) { return Boolean(id && nativeModule?.isPreviewAvailable?.(id)); }
export function discardSdkPreview(id) { if (id) nativeModule?.discardPreview?.(id); }

export function wasRouteTaskRemoved() { return nativeModule?.wasRouteTaskRemoved?.() || false; }
export function wasRouteSessionEnded() { return nativeModule?.wasRouteSessionEnded?.() || false; }
export function endRouteSession() { nativeModule?.endRouteSession?.(); }
export function beginRouteSession() { nativeModule?.beginRouteSession?.(); }
export function showNativeRouteNotification(title, body) {
  if (!nativeModule?.showRouteNotification) return false;
  nativeModule.showRouteNotification(title, body);
  return true;
}
export function stopNativeRouteNotification() { nativeModule?.stopRouteNotification?.(); }

export function KakaoNavigationView(props) {
  return NativeNavigationView
    ? <NativeNavigationView {...props} />
    : <View {...props} />;
}
