import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { searchPlaces, isRegisteredPlace } from '../utils/placeSearch';

export function HighlightedPlace({ text = '', query = '' }) {
  if (!query.trim()) return <Text>{text}</Text>;
  const parts = []; let cursor = 0; let index;
  while ((index = text.toLowerCase().indexOf(query.trim().toLowerCase(), cursor)) !== -1) {
    parts.push(<Text key={`plain${cursor}`}>{text.slice(cursor, index)}</Text>);
    parts.push(<Text key={`match${index}`} style={{ color: '#168DE2' }}>{text.slice(index, index + query.trim().length)}</Text>);
    cursor = index + query.trim().length;
  }
  parts.push(<Text key="end">{text.slice(cursor)}</Text>);
  return <Text>{parts}</Text>;
}
export function PlaceRow({ place, query, onPress, onAdd, registered }) {
  return <View style={s.row}>
    <TouchableOpacity style={s.rowMain} onPress={onPress} accessibilityLabel={`${place.place_name}, ${place.road_address_name || place.address_name}`}>
      <Ionicons name="location-outline" size={22} color="#8B98A5" />
      <View style={{ flex: 1 }}><Text style={s.name}><HighlightedPlace text={place.place_name || place.address_name} query={query} /></Text>
        <Text style={s.address}>{place.road_address_name || place.address_name}</Text>
        {place.distanceValue != null && <Text style={s.address}>{place.distanceValue < 1000 ? `${Math.round(place.distanceValue)}m` : `${(place.distanceValue / 1000).toFixed(1)}km`}</Text>}
      </View>
    </TouchableOpacity>
    {onAdd && <TouchableOpacity style={[s.add, registered && { backgroundColor: '#EDF1F5' }]} disabled={registered} onPress={onAdd} accessibilityLabel={registered ? '이미 추가된 방문지' : `${place.place_name} 방문지 추가`}>
      <Ionicons name={registered ? 'checkmark' : 'add-circle-outline'} color={registered ? '#607080' : '#2477F3'} size={22} />
      <Text style={{ color: registered ? '#607080' : '#2477F3', fontSize: 12, fontWeight: '700' }}>{registered ? '추가됨' : '추가'}</Text>
    </TouchableOpacity>}
  </View>;
}
export default function PlaceSearchOverlay({ userId, center, onClose, onResults, onPick, onAdd, locations = [], history = true, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery); const [results, setResults] = useState([]);
  const [recent, setRecent] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [completedQuery, setCompletedQuery] = useState(null);
  const sequence = useRef(0); const controller = useRef(null); const mounted = useRef(true); const recentRef = useRef([]);
  const storageKey = `pang3:place-search:${userId || 'guest'}`;
  const debounce = useRef(null);
  useEffect(() => {
    mounted.current = true;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { Keyboard.dismiss(); onClose(); return true; });
    if (history) AsyncStorage.getItem(storageKey).then(raw => { if (mounted.current) { try { const rows = JSON.parse(raw || '[]'); recentRef.current = Array.isArray(rows) ? rows.slice(0, 20) : []; setRecent(recentRef.current); } catch {} } }).catch(() => {});
    return () => { mounted.current = false; controller.current?.abort(); sequence.current++; back.remove(); };
  }, [storageKey]);
  const saveRecent = next => { recentRef.current = next; setRecent(next); if (history) AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {}); };
  const remember = (text, place) => {
    if (!history) return;
    const id = place ? `place:${place.id || `${place.x}:${place.y}:${place.place_name}`}` : `query:${text}`;
    saveRecent([{ id, query: text, place, date: new Date().toISOString() }, ...recentRef.current.filter(item => item.id !== id)].slice(0, 20));
  };
  const run = async (text, submit = false) => {
    if (submit) clearTimeout(debounce.current);
    const q = text.trim(); const request = ++sequence.current; controller.current?.abort();
    if (!q || (!submit && q.length < 2)) { setResults([]); setError(''); setLoading(false); return; }
    const abort = new AbortController(); controller.current = abort; setLoading(true); setError(''); setResults([]);
    try {
      const rows = await searchPlaces(q, { center, signal: abort.signal, limit: submit ? 30 : 7 });
      if (!mounted.current || request !== sequence.current) return;
      setResults(rows); setCompletedQuery(q);
      if (submit && onResults && rows.length) { remember(q); Keyboard.dismiss(); onResults(rows, q); }
    } catch (err) { if (mounted.current && request === sequence.current && !abort.signal.aborted) setError(err.message); }
    finally { if (mounted.current && request === sequence.current) setLoading(false); }
  };
  useEffect(() => { debounce.current = setTimeout(() => run(query), 300); return () => clearTimeout(debounce.current); }, [query]);
  const changeQuery = text => {
    if (text === query) return;
    sequence.current++; controller.current?.abort(); setResults([]); setError(''); setCompletedQuery(null); setLoading(false); setQuery(text);
  };
  const pick = (place, add) => {
    remember(query.trim() || place.place_name, place);
    if (!add && !onPick) { changeQuery(place.place_name || place.address_name); return; }
    Keyboard.dismiss(); (add ? onAdd : onPick)?.(place);
  };
  return <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => { Keyboard.dismiss(); onClose(); }} style={s.icon} accessibilityLabel="검색 닫기"><Ionicons name="chevron-back" size={26} /></TouchableOpacity>
      <TextInput style={[s.input, { flex: 1 }]} value={query} onChangeText={changeQuery} multiline={false} placeholder="주소 또는 방문지 검색" placeholderTextColor="#9AA6B2" autoFocus returnKeyType="search" onSubmitEditing={() => run(query, true)} />
      {!!query && <TouchableOpacity onPress={() => changeQuery('')} style={s.icon} accessibilityLabel="검색어 지우기"><Ionicons name="close-circle" size={20} color="#9AA6B2" /></TouchableOpacity>}
      <TouchableOpacity onPress={() => run(query, true)} style={s.icon} accessibilityLabel="지도에서 검색 결과 보기"><Ionicons name="search" size={24} color="#2477F3" /></TouchableOpacity>
    </View>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      {!query.trim() && history && <>
        <View style={s.recentHeader}><Text style={s.title}>최근 검색</Text><TouchableOpacity onPress={() => saveRecent([])} accessibilityLabel="최근 검색 전체 삭제"><Text style={s.address}>전체 삭제</Text></TouchableOpacity></View>
        {!recent.length && <Text style={s.empty}>최근 검색 기록이 없습니다.</Text>}
        {recent.map(item => <View style={s.row} key={item.id}><TouchableOpacity style={s.rowMain} onPress={() => { if (item.place) { if (onPick) { remember(item.query, item.place); Keyboard.dismiss(); onPick(item.place); } else changeQuery(item.place.place_name || item.query); } else changeQuery(item.query); }}><Ionicons name={item.place ? 'location-outline' : 'time-outline'} size={20} color="#8B98A5" /><View style={{ flex: 1 }}><Text style={s.name}>{item.place?.place_name || item.query}</Text>{item.place && <Text style={s.address}>{item.place.road_address_name || item.place.address_name}</Text>}</View></TouchableOpacity><TouchableOpacity style={s.icon} onPress={() => saveRecent(recentRef.current.filter(row => row.id !== item.id))} accessibilityLabel={`${item.query} 기록 삭제`}><Ionicons name="close" size={20} color="#8B98A5" /></TouchableOpacity></View>)}
      </>}
      {loading && <ActivityIndicator style={{ margin: 20 }} color="#2477F3" />}
      {!!error && <Text style={s.empty}>{error}</Text>}
      {!loading && !error && completedQuery === query.trim() && !results.length && <Text style={s.empty}>검색 결과가 없습니다.</Text>}
      {query.trim().length === 1 && completedQuery !== query.trim() && <Text style={s.empty}>두 글자 이상 입력해 주세요. 검색 버튼으로 바로 검색할 수도 있습니다.</Text>}
      {results.map(place => <PlaceRow key={`${place.id}:${place.x}:${place.y}`} place={place} query={query} onPress={() => pick(place, false)} onAdd={onAdd ? () => pick(place, true) : null} registered={isRegisteredPlace(place, locations)} />)}
    </ScrollView>
    </SafeAreaView>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', zIndex: 100, elevation: 30 }, header: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 2, borderBottomWidth: 1, borderColor: '#E9EDF2' }, icon: { padding: 8, minHeight: 44, justifyContent: 'center' }, input: { height: 48, color: '#101820', fontSize: 17, paddingLeft: 6 }, row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#E9EDF2', paddingHorizontal: 14, minHeight: 84 }, rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 }, name: { color: '#101820', fontSize: 16, fontWeight: '600' }, address: { color: '#7C8794', fontSize: 12, marginTop: 4 }, add: { alignItems: 'center', justifyContent: 'center', minWidth: 52, minHeight: 52, marginLeft: 8, borderRadius: 12, backgroundColor: '#EAF4FF' }, recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }, title: { color: '#101820', fontWeight: '700', fontSize: 18 }, empty: { padding: 24, color: '#7C8794', textAlign: 'center' } });
