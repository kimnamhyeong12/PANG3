import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadContext } from '../utils/bulkUpload';
import { importPhotos, photoItem } from '../utils/photoImport';
import { useScreenBackHandler } from '../utils/screenBack';

const MAX_PHOTOS = 20;

export default function PhotoUploadScreen({ visible, onClose, onHome, userId, groupId, onDataChanged, apiBaseUrl }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [refreshError, setRefreshError] = useState('');
  const lock = useRef(false);
  const refreshVersion = useRef(0);
  useEffect(() => () => { refreshVersion.current++; }, []);
  const selected = items.filter(item => item.selected && !item.error);
  const close = () => {
    if (lock.current) return;
    refreshVersion.current++;
    setItems([]); setResult(null); setRefreshError(''); onClose?.();
  };
  const home = () => {
    if (lock.current) return;
    close();
    onHome?.();
  };
  useScreenBackHandler(() => { close(); return true; }, visible);
  const pick = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('사진 접근 권한 필요', '선택할 사진에 대한 접근을 허용해 주세요.'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS,
        allowsEditing: false, exif: true, quality: 1,
      });
      if (picked.canceled) return;
      if ((picked.assets?.length || 0) > MAX_PHOTOS) Alert.alert('선택 장수 안내', `한 번에 ${MAX_PHOTOS}장까지 등록할 수 있어 처음 ${MAX_PHOTOS}장만 불러옵니다.`);
      refreshVersion.current++;
      setItems((picked.assets || []).slice(0, MAX_PHOTOS).map(photoItem));
      setResult(null); setRefreshError('');
    } catch (error) { Alert.alert('사진 선택 실패', error?.message || '사진을 읽을 수 없습니다.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const change = (id, values) => {
    if (lock.current || result) return;
    setItems(previous => previous.map(item => item.id === id ? { ...item, ...values } : item));
  };
  const buildForm = async (item, context) => {
    // Read GPS from the picker result before any encoding that can remove EXIF.
    const edge = 2400;
    const resize = Math.max(item.width || 0, item.height || 0) > edge
      ? [{ resize: item.width >= item.height ? { width: edge } : { height: edge } }] : [];
    const converted = await ImageManipulator.manipulateAsync(item.uri, resize, { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
    const file = new File(converted.uri);
    try {
      const body = new FormData();
      body.append('createdByUserId', String(context.createdByUserId));
      if (context.groupId != null) body.append('groupId', String(context.groupId));
      body.append('name', item.name.trim());
      body.append('lat', String(item.lat)); body.append('lng', String(item.lng));
      body.append('photo', file);
      return { body, cleanup: () => { if (file.exists) file.delete(); } };
    } catch (error) { if (file.exists) file.delete(); throw error; }
  };
  const upload = async () => {
    if (lock.current || result) return;
    let context;
    try {
      context = uploadContext(userId, groupId, apiBaseUrl);
      context.url = context.url.replace(/\/bulk$/, '/photos');
      if (!selected.length) throw new Error('GPS가 있는 사진을 선택해 주세요.');
      if (selected.some(item => !item.name.trim())) throw new Error('선택한 사진의 방문지 이름을 입력해 주세요.');
    } catch (error) { Alert.alert('등록 준비 확인', error.message); return; }
    lock.current = true; setBusy(true); setRefreshError('');
    setResult({ savedCount: 0, processedCount: 0, unknownCount: 0, pendingCount: selected.length, failures: [] });
    try {
      const outcome = await importPhotos({ items: selected, context, buildForm, onProgress: setResult });
      setResult(outcome);
    } catch (error) {
      setResult(null);
      Alert.alert('등록 실패', error?.message || '등록을 시작할 수 없습니다.');
    } finally {
      // Upload completion unlocks navigation independently of the list refresh.
      lock.current = false; setBusy(false);
      const version = ++refreshVersion.current;
      Promise.resolve().then(() => onDataChanged?.()).catch(() => {
        if (version === refreshVersion.current) setRefreshError('목록 새로고침에 실패했습니다. 지도 또는 목록을 다시 열어 주세요.');
      });
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>사진으로 방문지 등록</Text>
          {!!onHome && <TouchableOpacity disabled={busy} onPress={home}><Text style={[styles.link, { marginRight: 16 }]}>홈으로</Text></TouchableOpacity>}
          <TouchableOpacity disabled={busy} onPress={close}><Text style={styles.link}>닫기</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>사진을 선택하고 GPS 위치와 이름을 확인하세요. 선택한 사진마다 방문지를 만들고, 사진을 작업 전 기록에 연결합니다.</Text>
          <TouchableOpacity style={styles.button} disabled={busy} onPress={pick}>
            <Text style={styles.buttonText}>사진 선택 · 최대 {MAX_PHOTOS}장</Text>
          </TouchableOpacity>
          <Text style={styles.description}>현재 위치는 대신 사용하지 않습니다. EXIF GPS가 없는 사진은 등록할 수 없습니다. 카메라 위치 저장 설정이나 원본 사진을 확인해 주세요.</Text>
          {!!items.length && <Text style={styles.summary}>전체 {items.length}장 · GPS 없음/읽기 실패 {items.filter(item => item.error).length}장 · 등록 선택 {selected.length}장</Text>}
          {items.map(item => (
            <View key={item.id} style={styles.card}>
              <View style={styles.row}>
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                <View style={styles.details}>
                  <Text numberOfLines={2} style={styles.fileName}>{item.fileName}</Text>
                  <Text style={styles.description}>{item.error || `위도 ${item.lat.toFixed(6)}\n경도 ${item.lng.toFixed(6)}`}</Text>
                  <TouchableOpacity disabled={busy || !!result || !!item.error} onPress={() => change(item.id, { selected: !item.selected })}>
                    <Text style={styles.link}>{item.error ? '등록 제외' : item.selected ? '✓ 등록 선택됨' : '○ 등록에서 제외됨'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput style={styles.input} value={item.name} onChangeText={name => change(item.id, { name })}
                editable={!busy && !result && !item.error} maxLength={255} placeholder="방문지 이름" accessibilityLabel={`${item.fileName} 방문지 이름`} />
            </View>
          ))}
          {busy && <ActivityIndicator size="large" color="#2477F3" />}
          {!!items.length && <TouchableOpacity style={[styles.button, (!selected.length || busy || result) && styles.disabled]} disabled={!selected.length || busy || !!result} onPress={upload}>
            <Text style={styles.buttonText}>{busy ? '처리 중...' : `선택한 ${selected.length}장 방문지 등록`}</Text>
          </TouchableOpacity>}
          {result && <View style={styles.card}>
            <Text style={styles.summary}>등록 성공 {result.savedCount}장 · 실패 {result.failures.filter(entry => !entry.unknown).length}장</Text>
            <Text style={styles.description}>저장 여부 미확인 {result.unknownCount}장 · 미전송 {result.pendingCount}장</Text>
            {result.failures.map((entry, index) => <Text key={index} style={styles.error}>{entry.fileName}: {entry.unknown ? '저장 여부 확인 필요 · ' : ''}{entry.reason}</Text>)}
            {!!refreshError && <Text style={styles.error}>{refreshError}</Text>}
            {!busy && <Text style={styles.description}>이 선택 목록은 다시 전송할 수 없습니다. 미확인 항목은 목록에서 저장 여부를 확인하세요. 새 사진 선택으로 다음 등록을 시작할 수 있습니다.</Text>}
            {!busy && <TouchableOpacity style={styles.button} onPress={close}><Text style={styles.buttonText}>지도로 돌아가기</Text></TouchableOpacity>}
            {!busy && !!onHome && <TouchableOpacity style={styles.button} onPress={home}><Text style={styles.buttonText}>홈으로 돌아가기</Text></TouchableOpacity>}
          </View>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F9' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: '#FFFFFF' },
  title: { fontSize: 19, fontWeight: '700', color: '#10285B' },
  content: { padding: 16, paddingBottom: 32 },
  description: { color: '#5C6675', fontSize: 13, lineHeight: 20, marginVertical: 6 },
  summary: { color: '#10285B', fontWeight: '700', lineHeight: 22, marginVertical: 8 },
  button: { backgroundColor: '#2477F3', padding: 15, borderRadius: 10, alignItems: 'center', marginVertical: 10 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginVertical: 7 },
  row: { flexDirection: 'row', gap: 12 },
  thumbnail: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#E8ECF2' },
  details: { flex: 1 },
  fileName: { color: '#23344D', fontWeight: '600' },
  link: { color: '#2477F3', paddingVertical: 6 },
  input: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: '#DAE0E8', borderRadius: 8, color: '#23344D' },
  error: { color: '#A62B2B', fontSize: 13, lineHeight: 20, marginVertical: 4 },
});
