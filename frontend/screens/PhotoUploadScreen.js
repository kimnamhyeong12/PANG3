import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, KeyboardAvoidingView, Modal, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, PrimaryButton, EmptyState } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import ReportLocationPicker from '../components/ReportLocationPicker';
import { colors, radius, spacing } from '../constants/design';
import { apiFetch } from '../utils/auth';
import { uploadContext } from '../utils/bulkUpload';
import { importPhotos, photoCoordinates, usablePhotoCoordinates } from '../utils/photoImport';
import { resolvePhotoMetadata } from '../utils/photoMetadata';
import { requestPhotoPermissions } from '../utils/photoPermissions';
import { mergeRegistrationPhotos, registrationProblem, photoAddress, suggestedPhotoName } from '../utils/photoRegistration';
import { getInteractiveMapHtml } from '../utils/reportLocationMap';
import { useScreenBackHandler } from '../utils/screenBack';
import { readDraft, writeDraft, clearDraft, preservePhoto } from '../utils/reportDraft';

const MAX_PHOTOS = 20;
const ANDROID_EXPO_GO = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
const restKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';

export default function PhotoUploadScreen({ visible, onClose, userId, groupId, onDataChanged, onRegistered, initialLocation, apiBaseUrl }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [refreshError, setRefreshError] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  const restoredKey = useRef(null);
  const announcedOutcome = useRef(null);
  const [draftReady, setDraftReady] = useState(false);
  const key = `pang3:photoRegistration:${apiBaseUrl}:${userId}:${groupId ?? 'personal'}`;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const snapshot = useRef(null);
  snapshot.current = { photos: items, result, phase };
  const busy = phase !== 'idle';
  const editing = items.find(item => item.id === editingId);
  const registrationItems = items.filter(item => usablePhotoCoordinates(item.lat, item.lng));
  const problem = registrationProblem(registrationItems);
  useEffect(() => {
    generation.current++; restoredKey.current = null; setDraftReady(false);
    setItems([]); setResult(null); setEditingId(null); setRefreshError('');
    return () => { generation.current++; };
  }, [key]);
  const flushDraft = async () => {
    if (restoredKey.current !== key) return true;
    try { await writeDraft(key, snapshot.current); return true; }
    catch { return false; }
  };
  useEffect(() => {
    if (!visible || !draftReady || restoredKey.current !== key) return;
    const timer = setTimeout(() => { flushDraft(); }, 350);
    return () => clearTimeout(timer);
  }, [items, result, phase, visible, draftReady, key]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') flushDraft(); });
    return () => subscription.remove();
  }, [key]);
  const close = async () => {
    if (lock.current) return;
    lock.current = true;
    const saved = await flushDraft();
    lock.current = false;
    if (!saved) { showAlert('작성 내용 보관 실패', '내용을 보관하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
    setEditingId(null); onClose?.();
  };
  const back = () => {
    if (lock.current) return;
    if (editingId) { setEditingId(null); return; }
    close();
  };
  useScreenBackHandler(() => { back(); return true; }, visible);
  const change = (id, values) => {
    if (lock.current || result) return;
    setItems(previous => previous.map(item => item.id === id ? { ...item, ...values } : item));
  };
  const pick = async (fresh = false) => {
    if (lock.current || !draftReady) return;
    const previous = fresh ? [] : itemsRef.current;
    if (previous.length >= MAX_PHOTOS) { Alert.alert('사진 선택', `한 번에 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`); return; }
    lock.current = true; setPhase('picking');
    const version = generation.current;
    try {
      // Android may redact GPS while copying the picker URI. Obtain permission
      // before opening the picker, rather than after receiving the cached copy.
      let permission = null;
      if (Platform.OS === 'android') {
        permission = await requestPhotoPermissions({ platform: Platform.OS, version: Platform.Version,
          expoGo: ANDROID_EXPO_GO, picker: ImagePicker, library: MediaLibrary, android: PermissionsAndroid });
      }
      // Same native gallery as the report form; resolve GPS before editing or encoding.
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - previous.length,
        allowsEditing: false, exif: true, quality: 1, legacy: Platform.OS === 'android',
      });
      if (version !== generation.current || picked.canceled) return;
      setPhase('reading');
      const assets = (picked.assets || []).slice(0, MAX_PHOTOS - previous.length);
      // Only request original-library access if the selected photo needs GPS lookup.
      if (!permission && assets.some(asset => !photoCoordinates(asset.exif) && asset.assetId)) {
        permission = await requestPhotoPermissions({ platform: Platform.OS, version: Platform.Version,
          expoGo: ANDROID_EXPO_GO, picker: ImagePicker, library: MediaLibrary, android: PermissionsAndroid });
      }
      const incoming = await Promise.all(assets.map(async (asset, index) => {
        const item = await resolvePhotoMetadata(asset, index, { platform: Platform.OS, expoGo: ANDROID_EXPO_GO,
          permissionError: permission?.metadataError,
          readAssetInfo: id => MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: true }),
        });
        let address = '';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try { address = await photoAddress(item.lat, item.lng, { fetchImpl: apiFetch, key: restKey, signal: controller.signal }); }
        catch { /* Valid GPS is still usable if the address service is unavailable. */ }
        finally { clearTimeout(timer); }
        const sourceId = asset.assetId ? `asset:${asset.assetId}` : `uri:${asset.uri}`;
        return { ...item, uri: preservePhoto(key, item.uri), sourceId, id: sourceId, name: '', address, task: '', selected: true };
      }));
      if (version !== generation.current) return;
      setItems(mergeRegistrationPhotos(previous, incoming, MAX_PHOTOS));
      if (fresh) { setResult(null); setRefreshError(''); }
    } catch (error) {
      if (version === generation.current) Alert.alert('사진 선택 실패', error?.message || '사진을 다시 선택해 주세요.');
    } finally { lock.current = false; setPhase('idle'); }
  };
  const buildForm = async (item, context) => {
    const edge = 2400;
    const resize = Math.max(item.width || 0, item.height || 0) > edge
      ? [{ resize: item.width >= item.height ? { width: edge } : { height: edge } }] : [];
    const converted = await ImageManipulator.manipulateAsync(item.uri, resize, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
    const file = new File(converted.uri);
    try {
      const body = new FormData();
      body.append('createdByUserId', String(context.createdByUserId));
      if (context.groupId != null) body.append('groupId', String(context.groupId));
      body.append('name', item.name.trim());
      body.append('roadAddress', item.address || ''); body.append('task', item.task || '');
      body.append('lat', String(item.lat)); body.append('lng', String(item.lng));
      body.append('photo', file);
      return { body, cleanup: () => { if (file.exists) file.delete(); } };
    } catch (error) { if (file.exists) file.delete(); throw error; }
  };
  const upload = async () => {
    if (lock.current || result) return;
    let context;
    try {
      if (problem) throw new Error(problem === 'location-required' ? '사진 위치를 확인하지 못했습니다.' : problem);
      context = uploadContext(userId, groupId, apiBaseUrl);
      context.url = context.url.replace(/\/bulk$/, '/photos');
    } catch (error) { Alert.alert('등록 준비 확인', error.message); return; }
    lock.current = true; setPhase('uploading'); setRefreshError('');
    setResult({ savedCount: 0, processedCount: 0, unknownCount: 0, pendingCount: registrationItems.length, failures: [], locations: [] });
    const version = generation.current;
    try {
      // Persist the locked submission before the first POST. Reopening a draft
      // must never allow a possibly committed request to be submitted twice.
      await writeDraft(key, { photos: items, result: { savedCount: 0, processedCount: 0, unknownCount: 0,
        pendingCount: registrationItems.length, failures: [], locations: [] }, phase: 'uploading' });
      const outcome = await importPhotos({ items: registrationItems, context, buildForm, onProgress: value => {
        if (version === generation.current) setResult(value);
      } });
      if (version === generation.current) setResult(outcome);
    } catch (error) {
      if (version === generation.current) { setResult(null); Alert.alert('등록 실패', error?.message || '등록을 시작할 수 없습니다.'); }
    } finally {
      lock.current = false; setPhase('idle');
      Promise.resolve().then(() => onDataChanged?.()).catch(() => {
        if (version === generation.current) setRefreshError('목록을 새로고침하지 못했습니다. 지도를 다시 열어 주세요.');
      });
    }
  };
  const finish = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      await clearDraft(key);
      restoredKey.current = null; setDraftReady(false);
      onRegistered?.(result?.locations || []);
      setItems([]); setResult(null); onClose?.();
    } catch { showAlert('작성 내용 정리 실패', '잠시 후 다시 시도해 주세요.'); }
    finally { lock.current = false; }
  };
  const startNew = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      await clearDraft(key);
      setItems([]); setResult(null); setRefreshError('');
      itemsRef.current = []; snapshot.current = { photos: [], result: null, phase: 'idle' };
      announcedOutcome.current = null;
    } catch { showAlert('작성 내용 정리 실패', '잠시 후 다시 시도해 주세요.'); }
    finally { lock.current = false; }
  };
  useEffect(() => {
    if (!visible || busy || !draftReady || !result || announcedOutcome.current === result) return;
    announcedOutcome.current = result;
    const failed = result.failures.filter(entry => !entry.unknown).length;
    const complete = !failed && !result.unknownCount && !result.pendingCount;
    const message = complete ? '' : [
      `실패 ${failed}곳 · 저장 여부 미확인 ${result.unknownCount}곳 · 미전송 ${result.pendingCount}곳`,
      ...result.failures.map(entry => `${entry.fileName}: ${entry.reason}`),
      result.unknownCount ? '중복 등록을 피하려면 지도에서 저장 여부를 먼저 확인해 주세요.' : '',
    ].filter(Boolean).join('\n');
    showAlert(complete ? `방문지 ${result.savedCount}곳을 추가했어요` : `${result.savedCount}곳 등록 · 확인이 필요해요`,
      [message, refreshError].filter(Boolean).join('\n'), [
        { text: '지도 보기', onPress: finish },
        { text: '새 사진 등록', onPress: startNew },
      ], { cancelable: true, onDismiss: finish });
  }, [visible, busy, draftReady, result]);
  const point = editing && usablePhotoCoordinates(editing.lat, editing.lng) ? editing
    : initialLocation && usablePhotoCoordinates(initialLocation.lat, initialLocation.lng) ? initialLocation : { lat: 36.3, lng: 127.8 };
  return <Modal visible={visible} animationType="slide" onRequestClose={back} onShow={async () => {
    if (restoredKey.current === key) return;
    const version = generation.current;
    try {
      const draft = await readDraft(key);
      if (version !== generation.current) return;
      setItems(draft?.photos || []);
      const outcome = draft?.result || null;
      if (outcome && draft.phase === 'uploading' && outcome.pendingCount > 0) {
        outcome.failures = [...outcome.failures, { fileName: '등록 중이던 사진', reason: '등록 결과는 지도에서 확인해 주세요.', unknown: true }];
        outcome.unknownCount += outcome.pendingCount; outcome.pendingCount = 0;
      }
      setResult(outcome); restoredKey.current = key; setDraftReady(true);
    } catch { showAlert('작성 내용 불러오기 실패', '임시 저장 내용을 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.'); }
  }}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="사진으로 등록" onBack={back} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {busy && phase !== 'picking' && <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.primary} />
          <Text style={styles.description}>{phase === 'reading' ? '사진의 촬영 위치와 주소를 확인하고 있어요.' : `방문지 등록 중 · ${result?.savedCount || 0}/${registrationItems.length}곳`}</Text></View>}
        <View pointerEvents={result ? 'none' : 'auto'}>
          {!!items.length && <View style={styles.heading}><Text style={styles.section}>방문지 {registrationItems.length}곳</Text><TouchableOpacity onPress={() => pick()} disabled={busy || !draftReady} style={styles.textButton} accessibilityRole="button"><Text style={styles.link}>사진 추가</Text></TouchableOpacity></View>}
          {!items.length && phase !== 'reading' && <EmptyState icon="images-outline" title="등록할 사진을 선택해 주세요" description={`최대 ${MAX_PHOTOS}장까지 선택할 수 있어요.`} />}
          {items.map(item => {
            const located = usablePhotoCoordinates(item.lat, item.lng);
            if (!located) return <View key={item.id} style={styles.photoRow}>
              <View style={styles.row}>
                <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                <Text style={[styles.details, styles.warningText]}>위치정보 없음 · 등록 불가</Text>
                <TouchableOpacity disabled={busy} onPress={() => setItems(previous => previous.filter(photo => photo.id !== item.id))}
                  style={styles.remove} hitSlop={6} accessibilityLabel={`${item.fileName} 제외`} accessibilityRole="button">
                  <Ionicons name="close" size={20} color={colors.textSoft} />
                </TouchableOpacity>
              </View>
            </View>;
            return <View key={item.id} style={styles.photoRow}>
              <View style={styles.row}><Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                <View style={styles.details}>
                  <View style={styles.itemHeading}>
                    <Text style={styles.label}>방문지 이름</Text>
                    <TouchableOpacity disabled={busy} onPress={() => setItems(previous => previous.filter(photo => photo.id !== item.id))} style={styles.remove} hitSlop={6} accessibilityLabel={`${item.fileName} 제외`} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textSoft} /></TouchableOpacity>
                  </View>
                  <TextInput style={styles.input} value={item.name} onChangeText={name => change(item.id, { name })} editable={!busy} maxLength={255}
                    placeholder="방문지명을 입력해 주세요" placeholderTextColor={colors.textFaint} accessibilityLabel={`${item.fileName} 방문지 이름`} />
                  {located && <TouchableOpacity disabled={busy} onPress={() => setEditingId(item.id)} style={styles.locationButton}>
                    <Text style={styles.locationText}>{item.coordinateSource === 'manual' ? '직접 지정한 위치 · 확인·변경' : '촬영 위치 확인됨 · 확인·변경'}</Text>
                  </TouchableOpacity>}
                </View>
              </View>
              <View style={styles.chips}>{['점검', '공사', '안전', '환경', '민원'].map(task => <TouchableOpacity key={task} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: item.task === task }}
                onPress={() => change(item.id, { task: item.task === task ? '' : task })} style={[styles.chip, item.task === task && styles.chipSelected]}><Text style={[styles.chipText, item.task === task && styles.link]}>{task}</Text></TouchableOpacity>)}</View>
            </View>;
          })}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {items.length ? <PrimaryButton title={phase === 'uploading' ? '등록 중…' : `방문지 ${registrationItems.length}곳 등록`} disabled={busy || !!problem || !!result} onPress={upload} />
          : <PrimaryButton title="사진 선택" icon="images-outline" disabled={busy || !draftReady} onPress={() => pick()} />}
      </View>
      {editing && <ReportLocationPicker key={editing.id} latitude={point.lat} longitude={point.lng} address={editing.address} title="위치 지정" confirmLabel="이 위치로 지정"
        buildMapHtml={getInteractiveMapHtml} saving={false} onCancel={() => setEditingId(null)} onConfirm={position => {
          const address = position.locationAddress === '주소 확인 불가' ? '' : position.locationAddress;
          change(editing.id, { lat: position.latitude, lng: position.longitude, address,
            name: editing.name.trim() || suggestedPhotoName(address, items.filter(item => item.id !== editing.id)), coordinateSource: 'manual', error: '' });
          setEditingId(null);
        }} />}
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.page, paddingBottom: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, section: { fontSize: 16, fontWeight: '900', color: colors.text },
  description: { color: colors.textSoft, fontSize: 13, lineHeight: 20, marginVertical: 8 }, loading: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  photoRow: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumbnail: { width: 64, height: 76, borderRadius: radius.small, backgroundColor: colors.surfaceMuted }, details: { flex: 1 },
  itemHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 18, marginBottom: 8 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.textSoft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.small, paddingHorizontal: 8, paddingVertical: 8, color: colors.text, fontSize: 14, lineHeight: 20, minHeight: 38 },
  remove: { width: 24, height: 18, alignItems: 'center', justifyContent: 'center' },
  locationButton: { minHeight: 20, marginTop: 6, justifyContent: 'center' }, locationText: { color: colors.primary, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  textButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 }, link: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.warningSoft, paddingHorizontal: 10, borderRadius: radius.small, marginTop: 8 },
  warningText: { flex: 1, minWidth: 0, color: colors.warningInk, fontSize: 11 },
  warningAction: { minHeight: 36, justifyContent: 'center' }, warningLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { flex: 1, minWidth: 0, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, chipText: { color: colors.textSoft, fontSize: 13, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.page, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});
