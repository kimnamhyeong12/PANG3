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
