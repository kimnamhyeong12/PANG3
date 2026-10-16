import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import PlaceSearchOverlay from './PlaceSearchOverlay';
import KakaoMapWebView from './KakaoMapWebView';
import { placeLocation } from '../utils/placeSearch';
import { ScreenHeader, PrimaryButton } from './ui';
import { colors } from '../constants/design';

export default function WorkplaceField({ value, onChange, userId, disabled = false, required = false }) {
  const [open, setOpen] = useState(false); const [candidate, setCandidate] = useState(null);
  return <View style={{ marginVertical: 12 }}>
    <Text style={{ fontSize: 13, fontWeight: '700', color: '#10285B', marginBottom: 8 }}>근무지 주소{required ? <Text style={{ color: colors.danger }}> *</Text> : null}</Text>
    <TouchableOpacity style={s.field} disabled={disabled} onPress={() => { setCandidate(null); setOpen(true); }} accessibilityLabel="근무지 주소 검색 및 변경"><Ionicons name="home-outline" size={22} color="#2477F3" /><View style={{ flex: 1 }}><Text style={{ color: '#10285B', fontSize: 13 }}>{value?.workplaceAddress || '주소를 검색해 근무지를 등록하세요'}</Text><Text style={{ color: '#7C8794', fontSize: 11, marginTop: 4 }}>복귀 안내에 사용할 위치입니다.</Text></View><Ionicons name="chevron-forward" size={20} color="#7C8794" /></TouchableOpacity>
    <Modal visible={open} animationType="slide" onRequestClose={() => candidate ? setCandidate(null) : setOpen(false)}>
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.surface }}>
        {!candidate ? <PlaceSearchOverlay history={false} userId={userId} onClose={() => setOpen(false)} onPick={place => setCandidate(placeLocation(place))} /> : <>
          <ScreenHeader title="근무지 위치 확인" onBack={() => setCandidate(null)} />
          <View style={{ flex: 1 }}><KakaoMapWebView locations={[]} displayOnlyLocations={[]} panelOpen={false} searchedPlace={candidate} focusCoordinates={[candidate]} /></View>
          <View style={{ padding: 20 }}><Text style={{ color: '#10285B', fontWeight: '700', fontSize: 16 }}>{candidate.detailAddress}</Text><Text style={{ color: '#7C8794', marginVertical: 8 }}>{candidate.roadAddress}</Text><TouchableOpacity style={s.confirm} onPress={() => { onChange({ workplaceAddress: candidate.roadAddress || candidate.detailAddress, workplaceLat: candidate.lat, workplaceLng: candidate.lng }); setOpen(false); }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>이 위치를 근무지로 등록</Text></TouchableOpacity></View>
        </>}
      </SafeAreaView>
    </Modal>
  </View>;
}
const s = StyleSheet.create({ field: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 64, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: colors.surfaceMuted }, header: { padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }, confirm: { backgroundColor: '#2477F3', borderRadius: 12, padding: 16, alignItems: 'center' } });
