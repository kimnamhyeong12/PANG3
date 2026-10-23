import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { ScreenHeader, PrimaryButton } from './ui';
import { colors } from '../constants/design';
import { useBackSwipe } from '../utils/screenBack';
import { apiFetch } from '../utils/auth';

const restKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';

export default function ReportLocationPicker({ latitude, longitude, address, buildMapHtml, saving, onCancel, onConfirm, title = '위치 바꾸기', confirmLabel = '이 위치로 변경' }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const alive = useRef(true);
  const [html] = useState(() => buildMapHtml(latitude, longitude, true));
  const [point, setPoint] = useState({ latitude: Number(latitude), longitude: Number(longitude) });
  const [selectedAddress, setSelectedAddress] = useState(address || '');
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const valid = Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
  const cancel = () => { if (!saving) onCancel(); };
  const swipe = useBackSwipe(cancel, !saving);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setError('지도 연결이 지연되고 있습니다. 닫은 뒤 다시 열어 주세요.'), 15000);
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => {
    if (!valid || !restKey) return;
    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${point.longitude}&y=${point.latitude}`, { headers: { Authorization: `KakaoAK ${restKey}` } });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!cancelled) setSelectedAddress(result.documents?.[0]?.road_address?.address_name || result.documents?.[0]?.address?.address_name || '주소 확인 불가');
      } catch { if (!cancelled) setSelectedAddress('주소 확인 불가'); }
      finally { if (!cancelled) setResolving(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [point.latitude, point.longitude, valid]);

  const locate = async () => {
    if (locating || saving || !ready) return;
    setLocating(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('내 위치를 사용하려면 위치 권한을 허용해 주세요.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (alive.current) mapRef.current?.injectJavaScript(`window.moveSelectionTo?.(${Number(result.coords.latitude)}, ${Number(result.coords.longitude)}); true;`);
    } catch (failure) { if (alive.current) setError(failure.message || '현재 위치를 확인하지 못했습니다.'); }
    finally { if (alive.current) setLocating(false); }
  };
  const confirm = async () => {
    if (saving || moving || resolving || locating || !ready || !valid) return;
    setError('');
    try { await onConfirm({ ...point, locationAddress: selectedAddress }); }
    catch (failure) { if (alive.current) setError(failure.message || '위치를 저장하지 못했습니다. 다시 시도해 주세요.'); }
  };
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
    <View {...swipe} style={styles.container}>
      <ScreenHeader title={title} onBack={cancel} />
      <View style={styles.mapArea}>
        <WebView ref={mapRef} source={{ html, baseUrl: 'https://localhost/' }} originWhitelist={['*']}
          style={styles.map} javaScriptEnabled domStorageEnabled scrollEnabled={false}
          pointerEvents={saving ? 'none' : 'auto'} overScrollMode="never"
          setBuiltInZoomControls={false} setDisplayZoomControls={false}
          onError={() => setError('지도를 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.')}
          onMessage={event => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'MAP_READY') {
                setReady(true); setError('');
                setPoint({ latitude: Number(data.latitude), longitude: Number(data.longitude) });
              }
              if (data.type === 'LOCATION_MOVING') setMoving(true);
              if (data.type === 'LOCATION_SELECTED' && !saving) {
                setMoving(false); setError('');
                setPoint({ latitude: Number(data.latitude), longitude: Number(data.longitude) });
              }
            } catch { /* Ignore messages that are not map events. */ }
          }} />
        {!ready && !error && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.primary} /></View>}
        <View pointerEvents="none" style={styles.hint}><Text style={styles.hintText}>지도를 움직여 가운데 핀에 위치를 맞춰 주세요</Text></View>
        <View style={styles.controls}>
          {[['add', -1, '지도 확대'], ['remove', 1, '지도 축소']].map(([icon, step, label]) =>
            <TouchableOpacity key={icon} accessibilityRole="button" accessibilityLabel={label} disabled={!ready || saving}
              style={styles.control} onPress={() => mapRef.current?.injectJavaScript(`window.zoomSelection?.(${step}); true;`)}>
              <Ionicons name={icon} size={24} color={colors.primary} />
            </TouchableOpacity>)}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="내 위치로 이동" disabled={!ready || saving || locating} style={styles.control} onPress={locate}>
            {locating ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="locate-outline" size={23} color={colors.primary} />}
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={styles.address} numberOfLines={2}>{moving ? '위치 이동 중…' : resolving ? '주소 확인 중…' : selectedAddress || '선택한 위치'}</Text>
        {valid && <Text style={styles.coordinates}>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton title={saving ? '위치 저장 중…' : confirmLabel} onPress={confirm} disabled={saving || !ready || !valid || moving || resolving || locating} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  mapArea: { flex: 1 }, map: { flex: 1, backgroundColor: '#E8F2FF' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F2FF' },
  hint: { position: 'absolute', top: 14, left: 16, right: 16, padding: 10, borderRadius: 10, backgroundColor: '#FFFFFFEE' },
  hintText: { color: colors.text, fontSize: 12, textAlign: 'center', fontWeight: '600' },
  controls: { position: 'absolute', right: 16, bottom: 20, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF', elevation: 4 },
  control: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  footer: { padding: 16, gap: 8, backgroundColor: '#FFFFFF' },
  address: { fontSize: 14, fontWeight: '700', color: colors.text },
  coordinates: { fontSize: 11, color: colors.textSoft }, error: { fontSize: 12, color: colors.danger },
});
