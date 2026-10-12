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

export function KakaoNavigationView(props) {
  return NativeNavigationView
    ? <NativeNavigationView {...props} />
    : <View {...props} />;
}
