import React, { useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './CustomAlert';
import { colors } from '../constants/design';
import licenses from '../constants/openSourceLicenses.json';

const PERMISSIONS = [
  { key: 'location', title: '위치', read: () => Location.getForegroundPermissionsAsync() },
  { key: 'camera', title: '카메라', read: () => ImagePicker.getCameraPermissionsAsync() },
  { key: 'photos', title: '사진', read: () => MediaLibrary.getPermissionsAsync(false, ['photo']) },
  { key: 'notifications', title: '알림', read: () => Notifications.getPermissionsAsync() },
];
export function permissionLabel(permission) {
  if (!permission) return '확인할 수 없음';
  if (permission.accessPrivileges === 'limited') return '선택한 사진만 허용';
  if (permission.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL) return '조용히 전달';
  if (permission.granted) return '허용됨';
  return permission.status === 'undetermined' ? '아직 요청하지 않음' : '허용 안 됨';
}

export default function AppInfoContent({ page, onLicenses }) {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [licenseQuery, setLicenseQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const filteredLicenses = licenses.filter(item => item.name.toLowerCase().includes(licenseQuery.trim().toLowerCase()));
  useEffect(() => {
    if (page === 'licenses' || Platform.OS === 'web') { setLoading(false); return undefined; }
    let active = true, revision = 0;
    const refresh = async () => {
      const current = ++revision;
      const result = await Promise.allSettled(PERMISSIONS.map((item, index) => item.read()));
      if (active && current === revision) { setPermissions(Object.fromEntries(result.map((item, index) => [PERMISSIONS[index].key, item.status === 'fulfilled' ? item.value : null]))); setLoading(false); }
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [page]);
  const openSettings = async () => {
    try { await Linking.openSettings(); } catch { showAlert('설정을 열 수 없어요', '휴대폰 설정에서 앱을 찾아 권한을 변경해 주세요.'); }
  };
  const storeUrl = Platform.OS === 'ios' ? Constants.expoConfig?.extra?.appStoreUrl : Constants.expoConfig?.extra?.playStoreUrl;
  const openStore = async () => {
    try { await Linking.openURL(storeUrl); } catch { showAlert('스토어 연결 실패', '잠시 후 다시 시도해 주세요.'); }
  };
  if (page === 'licenses') return <View style={styles.content}><Text style={styles.description}>이 앱에서 사용하는 JavaScript 패키지의 오픈소스 라이선스입니다. 항목을 누르면 고지 내용을 확인할 수 있어요.</Text><TextInput accessibilityLabel="오픈소스 검색" placeholder="패키지 이름 검색" placeholderTextColor={colors.textFaint} value={licenseQuery} onChangeText={value => { setLicenseQuery(value); setLimit(40); }} style={styles.search} /><Text style={styles.description}>{filteredLicenses.length}개 패키지</Text>{filteredLicenses.slice(0, limit).map(item => <View key={`${item.name}@${item.version}`} style={styles.section}><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expanded === `${item.name}@${item.version}` }} onPress={() => setExpanded(expanded === `${item.name}@${item.version}` ? null : `${item.name}@${item.version}`)} style={styles.row}><View style={styles.flex}><Text style={styles.name}>{item.name}</Text><Text style={styles.description}>{item.version} · {item.license}</Text></View><Ionicons name={expanded === `${item.name}@${item.version}` ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} /></TouchableOpacity>{expanded === `${item.name}@${item.version}` && <Text selectable style={styles.license}>{item.notice || '이 패키지의 배포 파일에서 라이선스를 확인해 주세요.'}</Text>}</View>)}{filteredLicenses.length > limit && <TouchableOpacity accessibilityRole="button" onPress={() => setLimit(limit + 40)} style={styles.row}><Text style={styles.status}>더 보기</Text></TouchableOpacity>}</View>;
  return <View style={styles.content}>
    <View style={styles.infoRow}><Ionicons name="information-circle-outline" size={23} color={colors.primary} /><Text style={styles.infoLabel}>앱 정보</Text><Text style={styles.version}>현재 버전 {Constants.nativeAppVersion || Constants.expoConfig?.version || '확인할 수 없음'}{Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''}</Text></View>
    <View style={styles.section}><Text style={styles.heading}>업데이트</Text>{storeUrl ? <TouchableOpacity accessibilityRole="button" onPress={openStore} style={styles.row}><Text style={styles.name}>스토어에서 업데이트 확인</Text><Ionicons name="open-outline" size={20} color={colors.primary} /></TouchableOpacity> : <Text style={styles.description}>스토어 배포를 준비하고 있어요. 현재는 전달받은 설치 파일로 앱을 이용해 주세요.</Text>}</View>
    <View style={styles.section}><Text style={styles.heading}>권한 설정</Text>{Platform.OS === 'web' ? <Text style={styles.description}>브라우저의 사이트 설정에서 권한을 관리해 주세요.</Text> : <>{PERMISSIONS.map((item, index) => <TouchableOpacity key={item.key} accessibilityRole="button" accessibilityLabel={`${item.title} 권한, ${loading ? '확인 중' : permissionLabel(permissions[item.key])}, 휴대폰 설정 열기`} onPress={openSettings} style={[styles.permission, index === PERMISSIONS.length - 1 && styles.lastPermission]}><View style={styles.flex}><Text style={styles.name}>{item.title}</Text><Text style={styles.status}>{loading ? '확인 중…' : permissionLabel(permissions[item.key])}</Text></View><Ionicons name="open-outline" size={18} color={colors.textSoft} /></TouchableOpacity>)}</>}</View>
    <TouchableOpacity accessibilityRole="button" onPress={onLicenses} style={styles.row}><Text style={styles.name}>오픈소스 라이선스</Text><Ionicons name="chevron-forward" size={18} color={colors.textSoft} /></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  lastPermission: { borderBottomWidth: 0 },
  search: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, color: colors.text },
  content: { gap: 20 }, infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.line }, infoLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }, version: { flexShrink: 1, color: colors.textSoft, fontSize: 12, textAlign: 'right', lineHeight: 20 }, heading: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }, description: { color: colors.textSoft, fontSize: 13, lineHeight: 21, marginTop: 4 }, section: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 18 }, row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, flex: { flex: 1 }, name: { fontSize: 14, color: colors.text, fontWeight: '700' }, permission: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line }, status: { color: colors.primaryDark, fontSize: 12, fontWeight: '600', marginTop: 6 }, license: { color: colors.textSoft, fontSize: 12, lineHeight: 19, paddingTop: 12 },
});
