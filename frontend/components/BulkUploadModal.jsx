import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, PrimaryButton, SecondaryButton, EmptyState } from './ui';
import { showAlert } from './CustomAlert';
import PlaceSearchOverlay from './PlaceSearchOverlay';
import ReportLocationPicker from './ReportLocationPicker';
import { colors, radius, spacing } from '../constants/design';
import { locationError, locationName, nameSettingsError, submitBulkRows, uploadContext } from '../utils/bulkUpload';
import { detectBulkImportSettings } from '../utils/bulkImportSettings';
import { getInteractiveMapHtml } from '../utils/reportLocationMap';
import { usablePhotoCoordinates } from '../utils/photoImport';
import { useScreenBackHandler } from '../utils/screenBack';

const PAGE_SIZE = 20;
const cell = (values, index) => index < 0 ? '' : String(values[index] ?? '').trim();
const rowProblem = row => [...new Set([
  row.coordinateError,
  locationError(row),
  locationError({ ...row, nameRequired: false }),
].filter(Boolean))].join(' / ');
const displayRowName = row => row.nameRequired ? String(row.name ?? '').trim() || '이름 없음' : locationName(row);
const readSheet = (book, name) => XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', blankrows: true, raw: false });

export default function BulkUploadModal({ visible, onClose, userId, groupId, onDataChanged, initialLocation, apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL }) {
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [settings, setSettings] = useState(() => detectBulkImportSettings([]));
  const [corrections, setCorrections] = useState({});
  const [excluded, setExcluded] = useState([]);
  const [screen, setScreen] = useState('preview');
  const [openField, setOpenField] = useState(null);
  const [dropdownLayout, setDropdownLayout] = useState(null);
  const selectorRefs = useRef({});
  const selectorSizes = useRef({});
  const [sections, setSections] = useState({ original: true });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [refreshError, setRefreshError] = useState('');
  const [edit, setEdit] = useState(null);
  const [editReturnScreen, setEditReturnScreen] = useState('preview');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const uploadLock = useRef(false);
  const workbook = useRef(null);
  const sheetStates = useRef(new Map());
  const generation = useRef(0);
  const announced = useRef(null);
  const busy = loading || exporting || uploading;
  const scope = `${apiBaseUrl}:${userId}:${groupId ?? 'personal'}`;
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current !== scope) { scopeRef.current = scope; generation.current++; resetData(); }
  }, [scope]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (!visible) { announced.current = null; setOpenField(null); } }, [visible]);

  const columnCount = useMemo(() => rawRows.reduce((max, row) => Math.max(max, row.length), 0), [rawRows]);
  const columnLabels = useMemo(() => Array.from({ length: columnCount }, (_, i) =>
    settings.hasHeader ? cell(rawRows[0] || [], i) || `${i + 1}열` : `${i + 1}열`), [rawRows, settings.hasHeader, columnCount]);
  const sample = index => cell(rawRows[settings.hasHeader ? 1 : 0] || [], index);
  const convertedRows = useMemo(() => rawRows.map((values, index) => {
    const rowNumber = index + 1;
    const roadAddress = settings.addressColumns.map(i => cell(values, i)).filter(Boolean).join(settings.separator);
    const correction = corrections[rowNumber] || {};
    const coordinatesCorrected = correction.lat != null && correction.lng != null;
    return { rowNumber, roadAddress, detailAddress: cell(values, settings.detailColumn),
      name: settings.nameMode === 'fixed' ? settings.fixedName.trim() : settings.nameMode === 'column' ? cell(values, settings.nameColumn) : '',
      nameRequired: settings.nameMode !== 'default', lat: cell(values, settings.latColumn), lng: cell(values, settings.lngColumn),
      coordinateError: !coordinatesCorrected && settings.latColumn >= 0 && settings.latColumn === settings.lngColumn ? '위도와 경도에 같은 항목이 선택됐어요.' : '',
      ...correction, original: [...values] };
  }).filter(row => !(settings.hasHeader && row.rowNumber === 1)), [rawRows, settings, corrections]);
  const settingsError = nameSettingsError(settings.nameMode, settings.fixedName, settings.nameColumn, columnCount);
  const validRows = useMemo(() => convertedRows.filter(row => !excluded.includes(row.rowNumber) && !rowProblem(row)), [convertedRows, excluded]);
  const invalidRows = useMemo(() => convertedRows.filter(row => !excluded.includes(row.rowNumber) && rowProblem(row)), [convertedRows, excluded]);
  const excludedRows = useMemo(() => convertedRows.filter(row => excluded.includes(row.rowNumber)), [convertedRows, excluded]);
  const errorRows = useMemo(() => {
    const byNumber = new Map(convertedRows.filter(row => rowProblem(row)).map(row =>
      [row.rowNumber, { ...row, reason: rowProblem(row) }]));
    const original = new Map(convertedRows.map(row => [row.rowNumber, row]));
    for (const failure of uploadResult?.failures || []) byNumber.set(failure.rowNumber, { ...original.get(failure.rowNumber), ...failure });
    return [...byNumber.values()].sort((a, b) => a.rowNumber - b.rowNumber);
  }, [convertedRows, uploadResult]);

  function resetData() {
    workbook.current = null; sheetStates.current.clear();
    setFileName(''); setSheetName(''); setSheetNames([]); setRawRows([]); setSettings(detectBulkImportSettings([]));
    setCorrections({}); setExcluded([]); setUploadResult(null); setRefreshError(''); setEdit(null); setSearchOpen(false); setMapOpen(false);
    setScreen('preview'); setOpenField(null); setSections({ original: true }); setLimit(PAGE_SIZE); announced.current = null;
  }
  const close = () => { if (!uploadLock.current && !loading && !exporting) onClose?.(); };
  const back = () => {
    if (uploadLock.current || loading || exporting) return;
    if (openField) { setOpenField(null); return; }
    if (searchOpen) { setSearchOpen(false); return; }
    if (mapOpen) { setMapOpen(false); return; }
    if (screen === 'edit') { setEdit(null); setScreen(editReturnScreen); return; }
    if (screen !== 'preview') { setScreen('preview'); setOpenField(null); setLimit(PAGE_SIZE); return; }
    close();
  };
  useScreenBackHandler(() => { back(); return true; }, visible);
  const updateSetting = (key, value) => { if (!busy && !uploadResult) setSettings(previous => ({ ...previous, [key]: value })); };
  const toggleSection = key => setSections(previous => ({ ...previous, [key]: !previous[key] }));
  const chooseSheet = name => {
    if (busy || uploadResult || !workbook.current || name === sheetName) return;
    const rows = readSheet(workbook.current, name);
    sheetStates.current.set(sheetName, { settings, corrections, excluded });
    const restored = sheetStates.current.get(name);
    setRawRows(rows); setSheetName(name); setSettings(restored?.settings || detectBulkImportSettings(rows));
    setCorrections(restored?.corrections || {}); setExcluded(restored?.excluded || []); setOpenField(null); setLimit(PAGE_SIZE);
  };
  const pickFile = async () => {
    if (uploadLock.current || busy) return;
    setLoading(true);
    const version = generation.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.length || version !== generation.current) return;
      const file = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const book = XLSX.read(base64, { type: 'base64' });
      const first = book.SheetNames[0];
      if (!first) throw new Error('파일에서 시트를 찾을 수 없습니다.');
      const rows = readSheet(book, first);
      if (!rows.length) throw new Error('파일에 읽을 데이터가 없습니다.');
      if (version !== generation.current) return;
      resetData(); workbook.current = book;
      setFileName(file.name); setSheetNames(book.SheetNames); setSheetName(first); setRawRows(rows); setSettings(detectBulkImportSettings(rows));
    } catch (error) { if (version === generation.current) showAlert('파일 읽기 실패', error?.message || '파일을 다시 선택해 주세요.'); }
    finally { setLoading(false); }
  };
  const exportErrors = async () => {
    if (uploadLock.current || busy || !errorRows.length) return;
    setExporting(true);
    try {
      // Keep original columns and row values, including after a manual correction.
      const header = ['원본 행 번호', ...Array.from({ length: columnCount }, (_, i) => settings.hasHeader ? rawRows[0]?.[i] ?? '' : columnLabels[i]), '오류 사유'];
      const rows = [header, ...errorRows.map(row => [row.rowNumber, ...Array.from({ length: columnCount }, (_, i) => row.original?.[i] ?? ''), row.reason])];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [{ wch: 14 }, ...Array.from({ length: columnCount }, () => ({ wch: 20 })), { wch: 50 }];
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, worksheet, '확인필요_제외목록');
      const base64 = XLSX.write(book, { bookType: 'xlsx', type: 'base64' });
      const safeName = (fileName.replace(/\.[^.]+$/, '') || '업로드').replace(/[\\/:*?"<>|]/g, '_');
      const uri = `${FileSystem.cacheDirectory}${safeName}_확인필요.xlsx`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 파일 공유 기능을 지원하지 않습니다.');
      await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: '오류 항목 엑셀 저장', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
    } catch (error) { showAlert('엑셀 내보내기 실패', error?.message || '파일을 만들지 못했습니다.'); }
    finally { setExporting(false); }
  };
  const upload = async () => {
    if (uploadLock.current || busy || uploadResult) return;
    let context;
    try {
      if (settingsError) throw new Error(settingsError);
      if (!validRows.length) throw new Error('등록할 수 있는 방문지가 없습니다. 확인 필요한 항목을 수정해 주세요.');
      context = uploadContext(userId, groupId, apiBaseUrl);
    } catch (error) { showAlert('등록 준비 확인', error.message); return; }
    uploadLock.current = true; setUploading(true); setRefreshError('');
    const version = generation.current;
    setUploadResult({ totalCount: validRows.length, processedCount: 0, savedCount: 0, failedCount: 0, failures: [], unknownCount: 0, pendingCount: validRows.length });
    try {
      const result = await submitBulkRows({ rows: validRows, context, onProgress: result => { if (version === generation.current) setUploadResult(result); } });
      if (version === generation.current) setUploadResult(result);
    } catch (error) {
      if (version === generation.current) setUploadResult({ totalCount: validRows.length, processedCount: 0, savedCount: 0, failedCount: 0,
        failures: validRows.map(row => ({ rowNumber: row.rowNumber, reason: '등록 결과 확인 필요' })), unknownCount: validRows.length, pendingCount: 0,
        requestError: error?.message || '등록 결과를 확인하지 못했습니다.' });
    } finally {
      uploadLock.current = false; setUploading(false);
      Promise.resolve().then(() => onDataChanged?.()).catch(() => {
        if (version === generation.current) setRefreshError('목록을 새로고침하지 못했습니다. 지도를 다시 열어 주세요.');
      });
    }
  };
  const confirmUpload = () => showAlert(`방문지 ${validRows.length}곳을 등록할까요?`,
    invalidRows.length + excludedRows.length ? `확인 필요·제외 ${invalidRows.length + excludedRows.length}곳은 이번에 등록하지 않습니다. 오류가 있는 행은 엑셀로 내보낼 수 있어요.` : '선택한 업무공간에 작업 전 상태로 추가합니다.',
    [{ text: '취소', style: 'cancel' }, { text: '등록', onPress: upload }]);
  useEffect(() => {
    if (!visible || uploading || !uploadResult || announced.current === uploadResult) return;
    announced.current = uploadResult;
    showAlert(`방문지 ${uploadResult.savedCount}곳을 추가했어요`, [
      uploadResult.failedCount ? `등록 실패 ${uploadResult.failedCount}곳` : '',
      uploadResult.unknownCount ? `저장 여부 미확인 ${uploadResult.unknownCount}곳 · 지도에서 먼저 확인해 주세요.` : '',
      uploadResult.pendingCount ? `미전송 ${uploadResult.pendingCount}곳` : '', uploadResult.requestError, refreshError,
    ].filter(Boolean).join('\n'), [
      { text: '지도 보기', onPress: close }, { text: '등록 내역 보기', onPress: () => { setScreen('result'); setLimit(PAGE_SIZE); } },
    ], { cancelable: true, onDismiss: close });
  }, [uploadResult, uploading, visible]);
  const openEdit = row => {
    setEditReturnScreen(screen === 'issues' ? 'issues' : 'preview');
    setEdit({ ...row, name: row.nameRequired ? String(row.name ?? '') : locationName(row), lat: String(row.lat ?? ''), lng: String(row.lng ?? '') });
    setScreen('edit');
  };
  const saveEdit = () => {
    const corrected = { ...edit, nameRequired: true, coordinateError: '' };
    const error = locationError(corrected);
    if (error) { showAlert('입력 확인', error); return; }
    setCorrections(previous => ({ ...previous, [edit.rowNumber]: { name: edit.name.trim(), nameRequired: true,
      roadAddress: edit.roadAddress, lat: edit.lat, lng: edit.lng, coordinateError: '' } }));
    setEdit(null); setScreen(editReturnScreen);
  };
  const chooseColumn = (key, index) => {
    if (key === 'addressColumns') {
      if (settings.addressMode === 'single') { updateSetting(key, index < 0 ? [] : [index]); setOpenField(null); }
      else updateSetting(key, index < 0 ? [] : settings.addressColumns.includes(index) ? settings.addressColumns.filter(i => i !== index) : [...settings.addressColumns, index]);
    } else { updateSetting(key, index); setOpenField(null); }
  };
  const changeAddressMode = mode => {
    if (busy || uploadResult) return;
    setSettings(previous => previous.addressMode === mode ? previous : mode === 'single' ? { ...previous, addressMode: mode,
      multipleAddressColumns: previous.addressColumns, addressColumns: previous.addressColumns.slice(0, 1) }
      : { ...previous, addressMode: mode, addressColumns: previous.multipleAddressColumns ?? previous.addressColumns });
  };
  const moveAddress = (index, direction) => {
    const next = [...settings.addressColumns], position = next.indexOf(index), target = position + direction;
    if (position < 0 || target < 0 || target >= next.length) return;
    [next[position], next[target]] = [next[target], next[position]]; updateSetting('addressColumns', next);
  };
  const columnOptions = (key, selected, none) => <View>
    {[-1, ...columnLabels.map((_, i) => i)].map(index => {
      const checked = index < 0 ? !selected.length : selected.includes(index);
      return <TouchableOpacity key={index} style={styles.option} accessibilityRole="button" accessibilityState={{ selected: checked }} onPress={() => chooseColumn(key, index)}>
        <View style={styles.flex}><Text style={[styles.optionTitle, checked && styles.primaryText]}>{index < 0 ? none : columnLabels[index]}</Text>
          {index >= 0 && <Text style={styles.sample}>예: {sample(index) || '(빈 값)'}</Text>}</View>
        <Ionicons name={checked ? 'checkmark' : 'ellipse-outline'} size={18} color={checked ? colors.primary : colors.textFaint} />
      </TouchableOpacity>;
    })}
  </View>;
  const segment = (options, value, onChange) => <View style={styles.segments}>{options.map(option => <TouchableOpacity key={String(option.value)}
    style={[styles.segment, value === option.value && styles.segmentActive]} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)}>
    <Text style={[styles.segmentText, value === option.value && styles.primaryText]}>{option.label}</Text></TouchableOpacity>)}</View>;
  const dropdownPosition = (x, y, width, height) => {
    const below = y + height + 4;
    const bottom = Math.max(insets.bottom, 12);
    const maxHeight = Math.min(300, Math.max(100, viewport.height - below - bottom));
    return { top: Math.max(insets.top, Math.min(below, viewport.height - maxHeight - bottom)),
      left: Math.max(0, Math.min(x, viewport.width - width)), width: Math.min(width, viewport.width), maxHeight };
  };
  const openSelector = (key, event) => {
    if (openField === key) { setOpenField(null); return; }
    const size = selectorSizes.current[key] || { width: viewport.width - spacing.page * 2, height: 46 };
    const press = event?.nativeEvent;
    const y = Number.isFinite(press?.pageY) ? press.pageY - (press.locationY || 0) : insets.top + 120;
    // Opening must not depend on asynchronous native measurement succeeding.
    setDropdownLayout(dropdownPosition(spacing.page, y, size.width, size.height));
    setOpenField(key);
    selectorRefs.current[key]?.measureInWindow?.((x, measuredY, width, height) => {
      if (width > 0 && height > 0) setDropdownLayout(dropdownPosition(x, measuredY, width, height));
    });
  };
  const dropdownPanels = {};
  const selector = (key, label, value, children, example) => {
    dropdownPanels[key] = children;
    return <View style={styles.setting}>
    <Text style={styles.settingTitle}>{label}</Text><View ref={node => { selectorRefs.current[key] = node; }} collapsable={false}
      onLayout={event => { selectorSizes.current[key] = event.nativeEvent.layout; }}><TouchableOpacity style={[styles.selected, openField === key && styles.selectedOpen]}
      accessibilityRole="button" accessibilityState={{ expanded: openField === key }} onPress={event => openSelector(key, event)}>
      <Text style={styles.selectedText}>{value}</Text><Ionicons name={openField === key ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
    </TouchableOpacity></View>
    {!!example && <Text style={styles.sample}>{example}</Text>}
  </View>;
  };
  const collapsible = (key, title, children) => <View style={[styles.section, key === 'original' && { paddingTop: 0 }]}>
    <TouchableOpacity style={[styles.sectionHeading, key === 'original' && { minHeight: 36 }]} accessibilityRole="button" accessibilityState={{ expanded: !!sections[key] }} onPress={() => toggleSection(key)}>
      <Text style={styles.sectionTitle}>{title}</Text><Ionicons name={sections[key] ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} />
    </TouchableOpacity>{sections[key] && children}
  </View>;
  const table = converted => {
    const labels = converted ? ['원본 행', '방문지 이름', '도로명주소', '상세주소', '위도', '경도', '오류 사유'] : ['원본 행', ...columnLabels];
    const source = converted ? convertedRows : rawRows.slice(settings.hasHeader ? 1 : 0);
    const previewLimit = converted ? limit : 5;
    return <><Text style={styles.help}>전체 {source.length}행 · 처음 {Math.min(source.length, previewLimit)}행 표시</Text>
      <ScrollView horizontal nestedScrollEnabled style={styles.tableScroll}><View>
        <View style={styles.tableRow}>{labels.map((label, i) => <View key={i} style={[styles.cell, i === 0 && styles.sourceRowCell, styles.tableHeader]}><Text style={styles.tableHeaderText}>{label}</Text></View>)}</View>
        {source.slice(0, previewLimit).map((row, index) => {
          const values = converted ? [row.rowNumber, displayRowName(row), row.roadAddress, row.detailAddress, row.lat, row.lng, rowProblem(row) || '오류 없음']
            : [index + (settings.hasHeader ? 2 : 1), ...Array.from({ length: columnCount }, (_, i) => row[i] ?? '')];
          return <View key={index} style={styles.tableRow}>{values.map((value, i) => <View key={i} style={[styles.cell, i === 0 && styles.sourceRowCell]}><Text style={styles.cellText}>{String(value === '' || value == null ? '—' : value)}</Text></View>)}</View>;
        })}
      </View></ScrollView>{converted && source.length > limit && <TouchableOpacity style={styles.textButton} onPress={() => setLimit(limit + PAGE_SIZE)}><Text style={styles.link}>다음 {PAGE_SIZE}행 더 보기</Text></TouchableOpacity>}</>;
  };
  const addressValue = settings.addressColumns.length ? settings.addressColumns.map(i => columnLabels[i]).join(' + ') : '도로명주소 선택 안 함';
  const title = { preview: '엑셀로 등록', settings: '파일 항목 연결', issues: '확인 필요한 방문지', edit: '정보 확인·수정', result: '등록 내역' }[screen];
  const shownRows = screen === 'issues' ? invalidRows : convertedRows.filter(row => !excluded.includes(row.rowNumber));
  const mapPoint = edit && usablePhotoCoordinates(Number(edit.lat), Number(edit.lng)) && edit.lat !== '' && edit.lng !== ''
    ? { lat: Number(edit.lat), lng: Number(edit.lng) } : initialLocation || { lat: 36.3, lng: 127.8 };
  return <Modal visible={visible} animationType="slide" onRequestClose={back}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screen}>
      <ScreenHeader title={title} onBack={back} />
      <ScrollView key={screen} scrollEnabled={!openField} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.help}>파일을 읽고 있어요.</Text></View>}
        {!fileName && !loading && <View style={styles.empty}><EmptyState icon="document-text-outline" title="파일 하나로 방문지를 한 번에" description={'파일에서 이름과 위치를 찾아드려요.\nExcel 또는 CSV 파일을 선택해 주세요.'} /></View>}
        {!!fileName && screen === 'preview' && <>
          <View style={styles.file}><Ionicons name="document-text-outline" size={22} color={colors.primary} /><View style={styles.flex}><Text style={styles.fileName}>{fileName}</Text><Text style={styles.sample}>{sheetName}</Text></View>
            <TouchableOpacity disabled={busy} onPress={pickFile} style={styles.textButton}><Text style={styles.link}>변경</Text></TouchableOpacity></View>
          <Text style={styles.headline}>방문지 {convertedRows.length}곳을 찾았어요</Text>
          <View style={styles.heading}>
            <Text style={[styles.help, styles.flex]}>등록 가능 {validRows.length}곳 · 확인 필요 {invalidRows.length}곳{excludedRows.length ? ` · 제외 ${excludedRows.length}곳` : ''}</Text>
            <TouchableOpacity disabled={busy || !!uploadResult} style={styles.textButton} onPress={() => { setScreen('settings'); setOpenField(null); setLimit(PAGE_SIZE); }}>
              <Text style={styles.link}>파일 항목 연결 변경</Text>
            </TouchableOpacity>
          </View>
          {!!invalidRows.length && <TouchableOpacity style={styles.warning} disabled={busy || !!uploadResult} onPress={() => { setScreen('issues'); setLimit(PAGE_SIZE); }}>
            <Ionicons name="alert-circle-outline" size={21} color={colors.warningInk} /><View style={styles.flex}><Text style={styles.warningTitle}>{invalidRows.length}곳의 정보를 확인해 주세요</Text><Text style={styles.warningText}>수정하거나 이번 등록에서 제외할 수 있어요.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.warningInk} /></TouchableOpacity>}
          {shownRows.slice(0, limit).map(row => <View key={row.rowNumber} style={styles.visit}><Text style={styles.rowNumber}>{row.rowNumber}</Text><View style={styles.flex}><Text style={styles.visitName}>{displayRowName(row)}</Text><Text style={styles.address}>{row.roadAddress || `위도 ${row.lat || '없음'} · 경도 ${row.lng || '없음'}`}</Text></View>
            <TouchableOpacity disabled={busy || !!uploadResult} onPress={() => openEdit(row)} style={styles.textButton}><Text style={rowProblem(row) ? styles.warningInk : styles.link}>{rowProblem(row) ? '확인 필요' : '수정'}</Text></TouchableOpacity></View>)}
          {shownRows.length > limit && <TouchableOpacity style={styles.textButton} onPress={() => setLimit(limit + PAGE_SIZE)}><Text style={styles.link}>방문지 더 보기</Text></TouchableOpacity>}
        </>}
        {!!fileName && screen === 'settings' && <View pointerEvents={busy || uploadResult ? 'none' : 'auto'}>
          {collapsible('original', '기존 데이터 미리보기', table(false))}
          <TouchableOpacity style={styles.checkRow} onPress={() => updateSetting('hasHeader', !settings.hasHeader)} accessibilityRole="checkbox" accessibilityState={{ checked: settings.hasHeader }}>
            <Ionicons name={settings.hasHeader ? 'checkbox' : 'square-outline'} size={21} color={colors.primary} />
            <Text style={[styles.help, styles.flex]}>첫 번째 행을 항목 제목으로 사용</Text>
          </TouchableOpacity>
          {sheetNames.length > 1 && selector('sheet', '가져올 시트', sheetName, sheetNames.map(name => <TouchableOpacity key={name} style={styles.option} onPress={() => chooseSheet(name)}><Text style={styles.selectedText}>{name}</Text>{name === sheetName && <Ionicons name="checkmark" size={18} color={colors.primary} />}</TouchableOpacity>))}
          {selector('address', '도로명주소 설정', addressValue, <>
            {segment([{ value: 'single', label: '한 항목 사용' }, { value: 'multiple', label: '여러 항목 합치기' }], settings.addressMode, changeAddressMode)}
            {columnOptions('addressColumns', settings.addressColumns, '도로명주소 선택 안 함')}
            {settings.addressMode === 'multiple' && <><Text style={styles.settingTitle}>주소 결합 순서</Text>{settings.addressColumns.map((index, position) => <View key={index} style={styles.orderRow}><Text style={styles.orderLabel}>{position + 1}. {columnLabels[index]}</Text><TouchableOpacity style={styles.iconButton} disabled={!position} onPress={() => moveAddress(index, -1)} accessibilityLabel={`${columnLabels[index]} 위로`}><Ionicons name="arrow-up" size={18} color={colors.primary} /></TouchableOpacity><TouchableOpacity style={styles.iconButton} disabled={position === settings.addressColumns.length - 1} onPress={() => moveAddress(index, 1)} accessibilityLabel={`${columnLabels[index]} 아래로`}><Ionicons name="arrow-down" size={18} color={colors.primary} /></TouchableOpacity></View>)}
              <Text style={styles.settingTitle}>주소 구분자</Text>{segment([{ value: ' ', label: '공백' }, { value: ', ', label: '쉼표' }, { value: '', label: '없음' }], settings.separator, value => updateSetting('separator', value))}<Text style={styles.help}>합친 주소: {settings.addressColumns.map(sample).filter(Boolean).join(settings.separator) || '선택 안 함'}</Text></>}
          </>, `예: ${settings.addressColumns.map(sample).filter(Boolean).join(settings.separator) || '주소를 가져오지 않아요.'}`)}
          {selector('detail', '상세주소 설정', columnLabels[settings.detailColumn] || '상세주소 선택 안 함', columnOptions('detailColumn', settings.detailColumn < 0 ? [] : [settings.detailColumn], '상세주소 선택 안 함'), `예: ${sample(settings.detailColumn) || '선택 안 함'}`)}
          {selector('name', '방문지 이름 설정', settings.nameMode === 'default' ? '자동으로 이름 정하기' : settings.nameMode === 'fixed' ? `직접 입력 · ${settings.fixedName || '이름 입력 필요'}` : `파일 항목 · ${columnLabels[settings.nameColumn] || '선택 필요'}`, <>
            {segment([{ value: 'default', label: '자동' }, { value: 'fixed', label: '직접 입력' }, { value: 'column', label: '파일 항목' }], settings.nameMode, value => updateSetting('nameMode', value))}
            {settings.nameMode === 'default' && <Text style={styles.help}>상세주소 → 도로명주소 → 방문지 원본행번호 순서로 이름을 정해요.</Text>}
            {settings.nameMode === 'fixed' && <><TextInput style={styles.input} value={settings.fixedName} onChangeText={value => updateSetting('fixedName', value)} placeholder="모든 방문지에 사용할 이름" maxLength={255} /><Text style={styles.sample}>모든 정상 항목에 같은 이름을 사용해요.</Text></>}
            {settings.nameMode === 'column' && columnOptions('nameColumn', settings.nameColumn < 0 ? [] : [settings.nameColumn], '항목 선택 안 함')}
          </>, settings.nameMode === 'column' ? `예: ${sample(settings.nameColumn) || '선택 필요'}` : '')}
          {selector('lat', '위도', columnLabels[settings.latColumn] || '위도 선택 안 함', columnOptions('latColumn', settings.latColumn < 0 ? [] : [settings.latColumn], '위도 선택 안 함'), `예: ${sample(settings.latColumn) || '선택 필요'}`)}
          {selector('lng', '경도', columnLabels[settings.lngColumn] || '경도 선택 안 함', columnOptions('lngColumn', settings.lngColumn < 0 ? [] : [settings.lngColumn], '경도 선택 안 함'), `예: ${sample(settings.lngColumn) || '선택 필요'}`)}
          {!!settingsError && <Text style={styles.warningInk}>{settingsError}</Text>}
          <View style={styles.section}><Text style={styles.sectionTitle}>적용 후 데이터 미리보기</Text>{table(true)}<SecondaryButton title={`오류 ${errorRows.length}곳 엑셀 내보내기`} disabled={!errorRows.length || busy} onPress={exportErrors} style={styles.spaced} /></View>
        </View>}
        {!!fileName && screen === 'issues' && <>
          <Text style={styles.help}>문제가 있는 항목만 수정해 주세요. 제외한 항목도 원본 정보는 남아 있어요.</Text>
          {!invalidRows.length && <EmptyState icon="checkmark-circle-outline" title="확인이 끝났어요" description="방문지 목록으로 돌아가 등록해 주세요." />}
          {invalidRows.slice(0, limit).map(row => <View key={row.rowNumber} style={styles.issue}><View style={styles.heading}><Text style={styles.visitName}>{displayRowName(row)}</Text><Text style={styles.sample}>원본 {row.rowNumber}행</Text></View><Text style={styles.address}>{row.roadAddress || '(주소 없음)'}</Text><Text style={styles.warningInk}>{rowProblem(row)}</Text><View style={styles.actions}><SecondaryButton title="정보 확인·수정" onPress={() => openEdit(row)} /><TouchableOpacity style={styles.textButton} onPress={() => setExcluded(previous => [...previous, row.rowNumber])}><Text style={styles.link}>이번 등록에서 제외</Text></TouchableOpacity></View></View>)}
          {invalidRows.length > limit && <TouchableOpacity style={styles.textButton} onPress={() => setLimit(limit + PAGE_SIZE)}><Text style={styles.link}>더 보기</Text></TouchableOpacity>}
        </>}
        {!!excludedRows.length && ['preview', 'issues'].includes(screen) && collapsible('excluded', `이번 등록에서 제외한 ${excludedRows.length}곳`, <>{excludedRows.slice(0, limit).map(row => <View key={row.rowNumber} style={styles.heading}><Text style={[styles.help, styles.flex]}>{displayRowName(row)}</Text><TouchableOpacity disabled={busy || !!uploadResult} style={styles.textButton} onPress={() => setExcluded(previous => previous.filter(number => number !== row.rowNumber))}><Text style={styles.link}>다시 포함</Text></TouchableOpacity></View>)}{excludedRows.length > limit && <TouchableOpacity style={styles.textButton} onPress={() => setLimit(limit + PAGE_SIZE)}><Text style={styles.link}>제외 항목 더 보기</Text></TouchableOpacity>}</>)}
        {screen === 'edit' && edit && <>
          <Text style={styles.sample}>원본 파일 {edit.rowNumber}행</Text><View style={styles.source}><Text style={styles.help}>{edit.original.map((value, i) => `${columnLabels[i]}: ${String(value || '(빈 값)')}`).join('\n')}</Text></View>
          <Text style={styles.label}>방문지 이름</Text><TextInput style={styles.input} value={edit.name} onChangeText={name => setEdit(previous => ({ ...previous, name }))} placeholder="방문지명을 입력해 주세요" maxLength={255} />
          <Text style={styles.label}>주소</Text><TextInput style={styles.input} value={edit.roadAddress} onChangeText={roadAddress => setEdit(previous => ({ ...previous, roadAddress }))} placeholder="주소를 입력해 주세요" />
          <View style={styles.actions}><SecondaryButton title="주소 검색" onPress={() => setSearchOpen(true)} /><SecondaryButton title="지도에서 지정" onPress={() => setMapOpen(true)} /></View>
          <View style={styles.actions}><View style={styles.flex}><Text style={styles.label}>위도</Text><TextInput style={styles.input} value={edit.lat} onChangeText={lat => setEdit(previous => ({ ...previous, lat }))} placeholder="예) 35.106" keyboardType="numbers-and-punctuation" /></View><View style={styles.flex}><Text style={styles.label}>경도</Text><TextInput style={styles.input} value={edit.lng} onChangeText={lng => setEdit(previous => ({ ...previous, lng }))} placeholder="예) 128.967" keyboardType="numbers-and-punctuation" /></View></View>
        </>}
        {screen === 'result' && uploadResult && <>
          <Text style={styles.headline}>{uploadResult.savedCount}곳을 추가했어요</Text><Text style={styles.help}>실패 {uploadResult.failedCount}곳 · 미확인 {uploadResult.unknownCount}곳 · 미전송 {uploadResult.pendingCount}곳</Text>
          {!!uploadResult.requestError && <Text style={styles.warningInk}>{uploadResult.requestError}</Text>}{!!refreshError && <Text style={styles.warningInk}>{refreshError}</Text>}
          <Text style={styles.help}>중복 등록을 피하려면 미확인 항목은 지도에서 먼저 확인해 주세요. 이 목록은 다시 전송하지 않습니다.</Text>
          {errorRows.slice(0, limit).map(row => <View key={row.rowNumber} style={styles.issue}><Text style={styles.visitName}>원본 {row.rowNumber}행 · {displayRowName(row)}</Text><Text style={styles.help}>{row.reason}</Text></View>)}
          {errorRows.length > limit && <TouchableOpacity style={styles.textButton} onPress={() => setLimit(limit + PAGE_SIZE)}><Text style={styles.link}>더 보기</Text></TouchableOpacity>}
          <SecondaryButton title={`오류 ${errorRows.length}곳 엑셀 내보내기`} disabled={!errorRows.length || busy} onPress={exportErrors} style={styles.spaced} />
          <SecondaryButton title="새 파일 등록" disabled={busy} onPress={resetData} style={styles.spaced} />
        </>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {uploading && <View style={styles.progress}><ActivityIndicator color={colors.primary} /><Text style={styles.help}>등록 중 · {uploadResult?.processedCount || 0}/{uploadResult?.totalCount || validRows.length}곳</Text></View>}
        {screen === 'settings' ? <PrimaryButton title="설정 완료" disabled={busy} onPress={() => { setScreen('preview'); setOpenField(null); setLimit(PAGE_SIZE); }} />
          : screen === 'edit' ? <PrimaryButton title="이 정보로 수정" onPress={saveEdit} />
          : screen === 'issues' ? <PrimaryButton title="방문지 목록으로 돌아가기" onPress={() => { setScreen('preview'); setLimit(PAGE_SIZE); }} />
          : uploadResult ? <PrimaryButton title={uploading ? '등록 중…' : screen === 'result' ? '지도 보기' : '등록 내역 보기'} disabled={busy} onPress={screen === 'result' ? close : () => setScreen('result')} />
          : !fileName ? <PrimaryButton title={loading ? '파일 읽는 중…' : '파일 선택'} icon="document-text-outline" disabled={busy} onPress={pickFile} />
          : <>{!!invalidRows.length && <Text style={styles.note}>확인 필요한 {invalidRows.length}곳은 이번 등록에서 제외돼요.</Text>}{!!settingsError && <Text style={styles.note}>{settingsError}</Text>}<PrimaryButton title={`${validRows.length}곳 등록`} disabled={busy || !!settingsError || !validRows.length} onPress={confirmUpload} /></>}
      </View>
      {openField && dropdownLayout && screen === 'settings' && <Modal transparent visible animationType="none" statusBarTranslucent
        presentationStyle="overFullScreen" onRequestClose={() => setOpenField(null)}>
        <View style={styles.dropdownOverlay} onTouchStart={event => {
          const { pageX, pageY } = event.nativeEvent;
          const { left, top, width, maxHeight } = dropdownLayout;
          if (pageX < left || pageX > left + width || pageY < top || pageY > top + maxHeight) {
            setOpenField(null);
          }
        }}>
          <View accessibilityViewIsModal style={[styles.dropdown, { top: dropdownLayout.top, left: dropdownLayout.left,
            width: dropdownLayout.width, height: dropdownLayout.maxHeight }]}>
            <ScrollView scrollEnabled nestedScrollEnabled keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator style={styles.dropdownScroll} contentContainerStyle={styles.dropdownContent}>
              {dropdownPanels[openField]}
            </ScrollView>
          </View>
        </View>
      </Modal>}
      {searchOpen && edit && <PlaceSearchOverlay userId={userId} history={false} initialQuery={edit.roadAddress || edit.name} center={initialLocation}
        onClose={() => setSearchOpen(false)} onPick={place => { setEdit(previous => ({ ...previous, roadAddress: place.road_address_name || place.address_name || place.place_name,
          lat: String(place.y), lng: String(place.x) })); setSearchOpen(false); }} />}
      {mapOpen && edit && <ReportLocationPicker title="위치 지정" confirmLabel="이 위치로 지정" latitude={mapPoint.lat} longitude={mapPoint.lng}
        address={edit.roadAddress} buildMapHtml={getInteractiveMapHtml} saving={false} onCancel={() => setMapOpen(false)} onConfirm={point => {
          setEdit(previous => ({ ...previous, lat: String(point.latitude), lng: String(point.longitude),
            roadAddress: point.locationAddress && point.locationAddress !== '주소 확인 불가' ? point.locationAddress : previous.roadAddress })); setMapOpen(false);
        }} />}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: spacing.page, paddingBottom: 24 }, flex: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 36 }, loading: { alignItems: 'center', padding: 24, gap: 10 }, help: { color: colors.textSoft, fontSize: 13, lineHeight: 21, marginVertical: 5 },
  headline: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 6 }, file: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceMuted, borderRadius: radius.medium, padding: 12, marginBottom: 20 },
  fileName: { color: colors.text, fontSize: 13, fontWeight: '700' }, sample: { color: colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, backgroundColor: colors.warningSoft, borderRadius: radius.medium, marginVertical: 14 },
  warningTitle: { color: colors.warningInk, fontSize: 13, fontWeight: '700' }, warningText: { color: colors.warningInk, fontSize: 12, lineHeight: 19, marginTop: 4 }, warningInk: { color: colors.warningInk, fontSize: 12, lineHeight: 19, marginVertical: 5 },
  visit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.line }, rowNumber: { color: colors.primary, fontSize: 12, minWidth: 22, paddingTop: 3 },
  visitName: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '700', flexShrink: 1 }, address: { color: colors.textSoft, fontSize: 12, lineHeight: 19, marginTop: 4 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 }, link: { color: colors.primary, fontWeight: '700', fontSize: 12 }, primaryText: { color: colors.primary },
  section: { paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line }, sectionHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  setting: { paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line }, settingTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginVertical: 8 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, padding: 11, borderWidth: 1, borderColor: colors.line, borderRadius: radius.small }, selectedOpen: { backgroundColor: colors.surfaceMuted, borderColor: colors.primary }, selectedText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
  dropdownOverlay: { flex: 1 }, dropdown: { position: 'absolute', zIndex: 1, backgroundColor: colors.surface, elevation: 8, shadowColor: colors.text, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, dropdownScroll: { flex: 1, width: '100%', borderRadius: 12 }, dropdownContent: { paddingHorizontal: 10, paddingVertical: 5 }, option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, optionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  segments: { flexDirection: 'row', gap: 5, marginVertical: 8 }, segment: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: colors.line, borderRadius: 9, padding: 7, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary }, segmentText: { color: colors.textSoft, fontSize: 12, textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, orderLabel: { flex: 1, color: colors.textSoft, fontSize: 12 }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tableScroll: { marginTop: 10 }, tableRow: { flexDirection: 'row' }, cell: { width: 130, padding: 9, borderBottomWidth: 1, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, sourceRowCell: { width: 50, paddingHorizontal: 4 }, tableHeader: { backgroundColor: colors.surfaceMuted }, tableHeaderText: { color: colors.text, fontSize: 12, fontWeight: '700' }, cellText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  issue: { paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, source: { padding: 12, backgroundColor: colors.surfaceMuted, borderRadius: radius.small, marginVertical: 16 },
  label: { color: colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 7 }, input: { color: colors.text, fontSize: 16, minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: radius.small, padding: 10 },
  footer: { paddingHorizontal: spacing.page, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, note: { color: colors.textSoft, fontSize: 12, lineHeight: 19, marginBottom: 10 }, progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }, spaced: { marginTop: 12 },
});
