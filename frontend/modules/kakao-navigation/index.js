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
  return Boolean(NativeNavigationView);
}

export function wasRouteTaskRemoved() { return nativeModule?.wasRouteTaskRemoved?.() || false; }
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
