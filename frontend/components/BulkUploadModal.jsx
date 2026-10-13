
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { coordinateColumnsError, locationError, locationName, nameSettingsError, submitBulkRows, uploadContext } from '../utils/bulkUpload';

import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const MAX_PREVIEW_ROWS = 10;
const CELL_WIDTH = 130;

export default function BulkUploadModal({ visible, onClose, userId, groupId, onDataChanged, apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL }) {
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  const [addressMode, setAddressMode] = useState('single');
  const [addressColumns, setAddressColumns] = useState([]);
  const [detailColumn, setDetailColumn] = useState(-1);
  const [latColumn, setLatColumn] = useState(-1);
  const [lngColumn, setLngColumn] = useState(-1);
  const [separator, setSeparator] = useState(' ');
  const [nameMode, setNameMode] = useState('default');
  const [fixedName, setFixedName] = useState('');
  const [nameColumn, setNameColumn] = useState(-1);

  const [hasApplied, setHasApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [refreshError, setRefreshError] = useState('');
  const uploadLock = useRef(false);

  // 파일 전체에서 가장 많은 컬럼 수를 구합니다.
  const columnCount = useMemo(
    () =>
      rawRows.reduce(
        (max, row) => Math.max(max, row.length),
        0
      ),
    [rawRows]
  );

  // 헤더 여부에 따라 컬럼 이름을 구성합니다.
  const columnLabels = useMemo(
    () =>
      Array.from({ length: columnCount }, (_, index) => {
        if (hasHeader && rawRows.length > 0) {
          const value = String(rawRows[0][index] ?? '').trim();
          return value || `컬럼 ${index + 1}`;
        }

        return `컬럼 ${index + 1}`;
      }),
    [rawRows, columnCount, hasHeader]
  );

  // 헤더로 지정한 첫 행만 제외합니다.
  // 그 외의 빈 행과 중복 행은 제거하지 않습니다.
  const dataRows = useMemo(
    () =>
      rawRows
        .map((values, index) => ({
          rowNumber: index + 1,
          values,
        }))
        .filter(
          (row) => !(hasHeader && row.rowNumber === 1)
        ),
    [rawRows, hasHeader]
  );

  const getCell = (values, columnIndex) => {
    if (columnIndex < 0) return '';
    return String(values[columnIndex] ?? '').trim();
  };

  // 현재 설정을 기준으로 변환 결과를 계산합니다.
  // 설정이 변경되면 결과도 자동으로 다시 계산됩니다.
  const convertedRows = useMemo(
    () =>
      dataRows.map(({ rowNumber, values }) => {
        const roadAddress = addressColumns
          .map((columnIndex) => getCell(values, columnIndex))
          .filter((value) => value !== '')
          .join(separator);

        return {
          rowNumber,
          name: nameMode === 'fixed' ? fixedName.trim() : nameMode === 'column' ? getCell(values, nameColumn) : '',
          nameRequired: nameMode === 'column',
          roadAddress,
          detailAddress: getCell(values, detailColumn),
          lat: getCell(values, latColumn),
          lng: getCell(values, lngColumn),
          original: [...values],
        };
      }),
    [dataRows, addressColumns, separator, detailColumn, latColumn, lngColumn, nameMode, fixedName, nameColumn]
  );

  // 주소 유무와 관계없이 유효한 위도·경도 쌍이 필수입니다.
  // 좌표가 비거나 잘못된 행은 오류 엑셀 내보내기 대상입니다.
  const invalidLocationRows = useMemo(
    () => convertedRows.filter((row) => locationError(row)).map((row) => ({ ...row, reason: locationError(row) })),
    [convertedRows]
  );

  const coordinateSelectionError = coordinateColumnsError(latColumn, lngColumn, columnCount);
  const nameSelectionError = nameSettingsError(nameMode, fixedName, nameColumn, columnCount);
  const settingsError = coordinateSelectionError || nameSelectionError;

  const validRows = useMemo(() => convertedRows.filter((row) => !locationError(row)), [convertedRows]);
  const errorRows = useMemo(() => {
    const byNumber = new Map(invalidLocationRows.map((row) => [row.rowNumber, row]));
    const originals = new Map(convertedRows.map((row) => [row.rowNumber, row]));
    for (const failure of uploadResult?.failures || []) {
      byNumber.set(failure.rowNumber, { ...originals.get(failure.rowNumber), ...failure });
    }
    return [...byNumber.values()].sort((a, b) => a.rowNumber - b.rowNumber);
  }, [convertedRows, invalidLocationRows, uploadResult]);

  const handleUpload = async () => {
    if (uploadLock.current || uploading || loading || exporting || uploadResult) return;
    if (settingsError) {
      Alert.alert('설정 확인 필요', settingsError);
      return;
    }
    if (!hasApplied || !validRows.length) {
      Alert.alert('등록 불가', '변환 적용 후 정상 행이 있는지 확인해 주세요.');
      return;
    }
    let context;
    try { context = uploadContext(userId, groupId, apiBaseUrl); }
    catch (error) { Alert.alert('등록 불가', error.message); return; }
    uploadLock.current = true;
    setUploading(true);
    setRefreshError('');
    setUploadResult({ totalCount: validRows.length, processedCount: 0, savedCount: 0,
      failedCount: 0, failures: [], unknownCount: 0, pendingCount: validRows.length });
    try {
      const result = await submitBulkRows({ rows: validRows, context, onProgress: setUploadResult });
      setUploadResult(result);
    } catch (error) {
      setUploadResult({ totalCount: validRows.length, processedCount: 0, savedCount: 0,
        failedCount: 0, failures: [], unknownCount: 0, pendingCount: validRows.length,
        requestError: error?.message || '등록 중 오류가 발생했습니다.' });
    } finally {
      // Refresh also after an ambiguous response: the server may already have saved rows.
      try { await onDataChanged?.(); }
      catch { setRefreshError('등록 결과는 유지됩니다. 목록 새로고침에 실패했으므로 목록을 다시 열어 주세요.'); }
      setUploading(false);
      uploadLock.current = false;
    }
  };

  // 컬럼 선택이나 원본 데이터가 바뀌면 변환 적용 상태를 해제합니다.
  useEffect(() => {
    setHasApplied(false);
  }, [convertedRows]);

  const exportInvalidLocationRows = async () => {
    if (!hasApplied) {
      Alert.alert('변환 적용 필요', '먼저 변환 적용 버튼을 눌러 주세요.');
      return;
    }
    if (errorRows.length === 0) {
      Alert.alert('내보낼 데이터 없음', '내보낼 검증 오류 또는 등록 오류가 없습니다.');
      return;
    }

    try {
      setExporting(true);
      // 원본 컬럼의 내용과 순서를 유지하고, 추적용 원본 행 번호를 추가합니다.
      const header = hasHeader
        ? ['원본 행 번호', ...Array.from({ length: columnCount }, (_, index) => rawRows[0][index] ?? ''), '오류 사유']
        : ['원본 행 번호', ...columnLabels, '오류 사유'];
      const rows = [header, ...errorRows.map((row) => [row.rowNumber, ...Array.from({ length: columnCount }, (_, index) => row.original?.[index] ?? ''), row.reason])];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 },
        ...Array.from({ length: columnCount }, () => ({ wch: 20 })),
        { wch: 50 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '위치정보_미충족');
      const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const safeName = (fileName.replace(/\.[^.]+$/, '') || '업로드')
        .replace(/[\\/:*?"<>|]/g, '_');
      const fileUri = `${FileSystem.cacheDirectory}${safeName}_위치정보미충족.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('파일 공유 불가', '이 기기에서는 파일 공유 기능을 지원하지 않습니다.');
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: '위치정보 미충족 행 엑셀 저장',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (error) {
      console.error('위치정보 미충족 행 엑셀 내보내기 실패:', error);
      Alert.alert('엑셀 내보내기 실패', error?.message || '파일 생성 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const resetData = () => {
    setUploadResult(null);
    setRefreshError('');
    setFileName('');
    setRawRows([]);
    setHasHeader(true);
    setAddressMode('single');
    setAddressColumns([]);
    setDetailColumn(-1);
    setLatColumn(-1);
    setLngColumn(-1);
    setSeparator(' ');
    setNameMode('default');
    setFixedName('');
    setNameColumn(-1);
    setHasApplied(false);
  };

  const handleClose = () => {
    if (uploadLock.current || loading || exporting) return;
    resetData();
    onClose?.();
  };

  // Excel 또는 CSV 파일을 기기에서 읽습니다.
  const pickFile = async () => {
    if (uploadLock.current || loading || exporting) return;
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setLoading(true);
      setHasApplied(false);

      const file = result.assets[0];

      const base64 = await FileSystem.readAsStringAsync(
        file.uri,
        {
          encoding: FileSystem.EncodingType.Base64,
        }
      );

      const workbook = XLSX.read(base64, {
        type: 'base64',
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('파일에서 시트를 찾을 수 없습니다.');
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: true,
        raw: false,
      });

      if (rows.length === 0) {
        throw new Error('파일에 읽을 데이터가 없습니다.');
      }

      setUploadResult(null);
      setRefreshError('');
      setFileName(file.name);
      setRawRows(rows);
      setHasHeader(true);
      setAddressMode('single');
      setAddressColumns(
        rows.some((row) => row.length > 0) ? [0] : []
      );
      setDetailColumn(-1);
    setLatColumn(-1);
      setLngColumn(-1);
      setSeparator(' ');
      setNameMode('default');
      setFixedName('');
      setNameColumn(-1);
    } catch (error) {
      console.error('파일 읽기 오류:', error);

      Alert.alert(
        '파일 읽기 실패',
        error?.message || '파일을 읽는 중 오류가 발생했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleHeader = () => {
    setHasHeader((previous) => !previous);
  };

  const changeAddressMode = (mode) => {
    setAddressMode(mode);

    if (mode === 'single') {
      setAddressColumns((previous) =>
        previous.length > 0 ? [previous[0]] : []
      );
    }
  };

  const toggleAddressColumn = (index) => {
    setAddressColumns((previous) => {
      if (addressMode === 'single') {
        return [index];
      }

      if (previous.includes(index)) {
        return previous.filter((column) => column !== index);
      }

      return [...previous, index];
    });
  };

  // 선택한 주소 컬럼의 결합 순서를 변경합니다.
  const moveAddressColumn = (index, direction) => {
    setAddressColumns((previous) => {
      const currentPosition = previous.indexOf(index);
      const targetPosition = currentPosition + direction;

      if (
        currentPosition < 0 ||
        targetPosition < 0 ||
        targetPosition >= previous.length
      ) {
        return previous;
      }

      const next = [...previous];

      [next[currentPosition], next[targetPosition]] = [
        next[targetPosition],
        next[currentPosition],
      ];

      return next;
    });
  };

  const selectCoordinateColumn = (type, index) => {
    if (type === 'lat') {
      setLatColumn(index);
    } else {
      setLngColumn(index);
    }
  };

  const handleConvert = () => {
    if (rawRows.length === 0) {
      Alert.alert(
        '안내',
        '먼저 Excel 또는 CSV 파일을 선택해 주세요.'
      );
      return;
    }

    if (settingsError) {
      Alert.alert('설정 확인 필요', settingsError);
      return;
    }

    setHasApplied(true);

    Alert.alert(
      '변환 적용 완료',
      `${convertedRows.length}개 행을 로컬 데이터로 변환했습니다.\n하단 미리보기에서 결과를 확인해 주세요.\n서버나 데이터베이스에는 저장하지 않았습니다.`
    );
  };

  // 컬럼 선택 버튼
  const renderColumnButton = (
    index,
    selected,
    onPress,
    prefix = ''
  ) => (
    <TouchableOpacity
      key={`${prefix}-${index}`}
      style={[
        styles.columnButton,
        selected && styles.columnButtonSelected,
      ]}
      onPress={onPress}
    >
      <Text
        numberOfLines={2}
        style={[
          styles.columnButtonText,
          selected && styles.columnButtonTextSelected,
        ]}
      >
        {selected ? '✓ ' : ''}
        {columnLabels[index]}
        {'\n'}
        {index + 1}열
      </Text>
    </TouchableOpacity>
  );

  const renderColumnGrid = (
    selectedColumns,
    onSelect,
    prefix
  ) => (
    <View style={styles.columnGrid}>
      {columnLabels.map((_, index) =>
        renderColumnButton(
          index,
          selectedColumns.includes(index),
          () => onSelect(index),
          prefix
        )
      )}
    </View>
  );

  const renderCoordinateSelector = (type, selectedColumn) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {type === 'lat' ? '위도 컬럼 (필수)' : '경도 컬럼 (필수)'}
      </Text>

      <Text style={styles.helperText}>
        {selectedColumn === -1 ? '아직 선택하지 않았습니다. 사용할 컬럼을 선택해 주세요.' : `${columnLabels[selectedColumn]} 선택됨`}
      </Text>
      <View style={styles.columnGrid}>
        {columnLabels.map((_, index) =>
          renderColumnButton(
            index,
            selectedColumn === index,
            () => selectCoordinateColumn(type, index),
            type
          )
        )}
      </View>
    </View>
  );

  // 원본 데이터 미리보기: 헤더 설정과 관계없이 원본 행을 표시합니다.
  const renderOriginalPreview = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        1. 기존 데이터 미리보기
      </Text>

      <Text style={styles.helperText}>
        파일에서 읽은 원본 데이터입니다. 전체 {rawRows.length}개 행 ·{' '}
        {columnCount}개 컬럼
      </Text>

      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={styles.tableScroll}
      >
        <View>
          <View style={styles.tableRow}>
            <View style={[styles.rowNumberCell, styles.tableHeaderCell]}>
              <Text style={styles.tableHeaderText}>행</Text>
            </View>

            {columnLabels.map((label, index) => (
              <View
                key={`original-header-${index}`}
                style={[styles.tableCell, styles.tableHeaderCell]}
              >
                <Text style={styles.tableHeaderText} numberOfLines={2}>
                  {label}
                </Text>
                <Text style={styles.tableHeaderSubText}>
                  {index + 1}열
                </Text>
              </View>
            ))}
          </View>

          {rawRows.slice(0, MAX_PREVIEW_ROWS).map((row, rowIndex) => (
            <View
              key={`original-row-${rowIndex}`}
              style={styles.tableRow}
            >
              <View style={styles.rowNumberCell}>
                <Text style={styles.tableText}>{rowIndex + 1}</Text>
              </View>

              {columnLabels.map((_, columnIndex) => (
                <View
                  key={`original-${rowIndex}-${columnIndex}`}
                  style={styles.tableCell}
                >
                  <Text style={styles.tableText} numberOfLines={3}>
                    {String(row[columnIndex] ?? '')}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {rawRows.length > MAX_PREVIEW_ROWS && (
        <Text style={styles.helperText}>
          원본 데이터 중 처음 {MAX_PREVIEW_ROWS}개 행만 표시합니다.
        </Text>
      )}
    </View>
  );

  // 변환된 데이터 미리보기
  const renderConvertedPreview = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        4. 적용 후 데이터 미리보기
      </Text>

      <Text style={styles.helperText}>
        총 {convertedRows.length}개 행
        {hasApplied ? ' · 변환 적용됨' : ' · 설정 변경 시 결과가 갱신됩니다'}
      </Text>

      <View style={styles.countBox}>
        <Text style={styles.countText}>
          주소 없음: {convertedRows.filter((row) => !row.roadAddress && !row.detailAddress).length}개
        </Text>
        <Text style={styles.countText}>
          위도 없음: {convertedRows.filter((row) => !row.lat).length}개
        </Text>
        <Text style={styles.countText}>
          경도 없음: {convertedRows.filter((row) => !row.lng).length}개
        </Text>
      </View>

      <Text style={styles.helperText}>
        등록 조건 미충족: {invalidLocationRows.length}개 · 정상: {validRows.length}개 (좌표·이름 포함 검증)
      </Text>
      <TouchableOpacity
        style={[styles.primaryButton, (!hasApplied || exporting || uploading || loading || errorRows.length === 0) && { opacity: 0.5 }]}
        onPress={exportInvalidLocationRows}
        disabled={!hasApplied || exporting || uploading || loading || errorRows.length === 0}
      >
        <Text style={styles.primaryButtonText}>
          {exporting ? '엑셀 생성 중...' : `오류 ${errorRows.length}개 행 엑셀로 내보내기`}
        </Text>
      </TouchableOpacity>

      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={styles.tableScroll}
      >
        <View>
          <View style={styles.tableRow}>
            <View style={[styles.rowNumberCell, styles.tableHeaderCell]}>
              <Text style={styles.tableHeaderText}>행</Text>
            </View>

            {['이름', '도로명주소', '상세주소', '위도', '경도'].map((label) => (
              <View
                key={`converted-header-${label}`}
                style={[styles.tableCell, styles.tableHeaderCell]}
              >
                <Text style={styles.tableHeaderText}>{label}</Text>
              </View>
            ))}
          </View>

          {convertedRows
            .slice(0, MAX_PREVIEW_ROWS)
            .map((row, index) => (
              <View
                key={`converted-row-${index}`}
                style={styles.tableRow}
              >
                <View style={styles.rowNumberCell}>
                  <Text style={styles.tableText}>
                    {row.rowNumber}
                  </Text>
                </View>

                {[locationName(row), row.roadAddress, row.detailAddress, row.lat, row.lng].map((value, cellIndex) => (
                  <View
                    key={`converted-${index}-${cellIndex}`}
                    style={styles.tableCell}
                  >
                    <Text style={styles.tableText} numberOfLines={3}>
                      {value || '(빈 값)'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
        </View>
      </ScrollView>

      {convertedRows.length > MAX_PREVIEW_ROWS && (
        <Text style={styles.helperText}>
          변환 결과 중 처음 {MAX_PREVIEW_ROWS}개 행만 표시합니다.
        </Text>
      )}

      <Text style={styles.localNotice}>
        위도·경도 컬럼을 모두 선택해야 합니다. 좌표가 모두 있고 숫자·범위 검사를 통과한 행만 서버에 저장됩니다.
      </Text>
      <TouchableOpacity
        style={[styles.primaryButton, (!!settingsError || !hasApplied || !validRows.length || uploading || loading || exporting || uploadResult) && { opacity: 0.5 }]}
        disabled={!!settingsError || !hasApplied || !validRows.length || uploading || loading || exporting || !!uploadResult}
        onPress={handleUpload}
      >
        {uploading && <ActivityIndicator color="#FFFFFF" />}
        <Text style={styles.primaryButtonText}>{uploading ? '서버 등록 중...' : `정상 ${validRows.length}개 행 등록`}</Text>
      </TouchableOpacity>
      {uploadResult && (
        <View style={styles.countBox}>
          <Text style={styles.countText}>
            응답 확인 {uploadResult.processedCount}/{uploadResult.totalCount}행 · {Math.floor(uploadResult.processedCount / uploadResult.totalCount * 100)}%
          </Text>
          <Text style={styles.countText}>저장 성공 {uploadResult.savedCount} · 저장 실패 {uploadResult.failedCount} · 검증 제외 {invalidLocationRows.length}</Text>
          <Text style={styles.countText}>저장 여부 미확인 {uploadResult.unknownCount} · 미전송 {uploadResult.pendingCount}</Text>
          {!!uploadResult.requestError && <Text style={styles.helperText}>{uploadResult.requestError}</Text>}
          {!!refreshError && <Text style={styles.helperText}>{refreshError}</Text>}
          {(uploadResult.failures || []).slice(0, MAX_PREVIEW_ROWS).map((failure) => (
            <Text key={failure.rowNumber} style={styles.helperText}>{failure.rowNumber}행: {failure.reason}</Text>
          ))}
          {uploadResult.failures?.length > MAX_PREVIEW_ROWS && <Text style={styles.helperText}>전체 오류는 엑셀 내보내기로 확인하세요.</Text>}
          {!uploading && <Text style={styles.helperText}>이 변환 데이터는 전송을 다시 실행할 수 없습니다. 미확인 행은 목록에서 저장 여부를 확인한 뒤 처리하세요. 새 파일을 선택하면 새로운 등록을 시작합니다.</Text>}
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Excel / CSV 일괄 등록</Text>

            <TouchableOpacity disabled={uploading || loading || exporting} onPress={handleClose}>
              <Text style={styles.closeText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={pickFile}
              disabled={loading || uploading || exporting}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Excel / CSV 파일 선택
                </Text>
              )}
            </TouchableOpacity>

            {!!fileName && (
              <Text style={styles.fileName}>
                선택 파일: {fileName}
              </Text>
            )}

            {rawRows.length > 0 && (
              <>
                <View pointerEvents={uploading || uploadResult ? 'none' : 'auto'}>
                {/* 최상단: 기존 원본 데이터 */}
                {renderOriginalPreview()}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    2. 파일 설정
                  </Text>

                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={toggleHeader}
                  >
                    <Text style={styles.optionText}>
                      {hasHeader ? '✓' : '○'} 첫 번째 행을 헤더로 사용
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.helperText}>
                    데이터 행 {dataRows.length}개 · 컬럼 {columnCount}개
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    3. 도로명주소 컬럼 설정
                  </Text>

                  <View style={styles.modeRow}>
                    <TouchableOpacity
                      style={[
                        styles.modeButton,
                        addressMode === 'single' && styles.modeButtonActive,
                      ]}
                      onPress={() => changeAddressMode('single')}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          addressMode === 'single' &&
                            styles.modeButtonTextActive,
                        ]}
                      >
                        단일 선택
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.modeButton,
                        addressMode === 'multiple' && styles.modeButtonActive,
                      ]}
                      onPress={() => changeAddressMode('multiple')}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          addressMode === 'multiple' &&
                            styles.modeButtonTextActive,
                        ]}
                      >
                        다중 선택
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.helperText}>
                    {addressMode === 'single'
                      ? 'road_address에 저장할 컬럼을 선택하세요.'
                      : 'road_address로 합칠 컬럼을 선택하고 결합 순서를 조정하세요.'}
                  </Text>

                  <TouchableOpacity style={styles.optionButton} onPress={() => setAddressColumns([])}>
                    <Text style={styles.optionText}>{addressColumns.length === 0 ? '✓ ' : ''}도로명주소 선택 안 함</Text>
                  </TouchableOpacity>
                  {renderColumnGrid(
                    addressColumns,
                    toggleAddressColumn,
                    'address'
                  )}

                  {addressMode === 'multiple' && (
                    <>
                      <Text style={styles.subTitle}>주소 결합 순서</Text>

                      {addressColumns.map((columnIndex, position) => (
                        <View
                          key={`order-${columnIndex}`}
                          style={styles.orderRow}
                        >
                          <Text style={styles.orderText}>
                            {position + 1}. {columnLabels[columnIndex]}
                          </Text>

                          <View style={styles.orderActions}>
                            <TouchableOpacity
                              style={styles.smallButton}
                              disabled={position === 0}
                              onPress={() =>
                                moveAddressColumn(columnIndex, -1)
                              }
                            >
                              <Text style={styles.smallButtonText}>↑</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.smallButton}
                              disabled={
                                position === addressColumns.length - 1
                              }
                              onPress={() =>
                                moveAddressColumn(columnIndex, 1)
                              }
                            >
                              <Text style={styles.smallButtonText}>↓</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}

                      <Text style={styles.subTitle}>주소 구분자</Text>

                      <View style={styles.modeRow}>
                        {[
                          { label: '공백', value: ' ' },
                          { label: '쉼표', value: ', ' },
                          { label: '없음', value: '' },
                        ].map((option) => (
                          <TouchableOpacity
                            key={option.label}
                            style={[
                              styles.separatorButton,
                              separator === option.value &&
                                styles.modeButtonActive,
                            ]}
                            onPress={() => setSeparator(option.value)}
                          >
                            <Text
                              style={[
                                styles.modeButtonText,
                                separator === option.value &&
                                  styles.modeButtonTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>상세주소 컬럼</Text>
                  <Text style={styles.helperText}>detail_address에 저장할 컬럼입니다. 도로명주소를 자동 복사하지 않습니다.</Text>
                  <TouchableOpacity style={styles.optionButton} onPress={() => setDetailColumn(-1)}>
                    <Text style={styles.optionText}>{detailColumn === -1 ? '✓ ' : ''}상세주소 선택 안 함</Text>
                  </TouchableOpacity>
                  {renderColumnGrid(detailColumn === -1 ? [] : [detailColumn], setDetailColumn, 'detail')}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>방문지 이름 설정</Text>
                  <View style={styles.modeRow}>
                    {[
                      { value: 'default', label: '자동' },
                      { value: 'fixed', label: '직접 입력' },
                      { value: 'column', label: '컬럼 선택' },
                    ].map((option) => (
                      <TouchableOpacity key={option.value}
                        style={[styles.modeButton, nameMode === option.value && styles.modeButtonActive]}
                        onPress={() => setNameMode(option.value)}>
                        <Text style={[styles.modeButtonText, nameMode === option.value && styles.modeButtonTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.helperText}>지정한 이름이 상세주소 대신 방문지 이름으로 저장됩니다. 도로명주소는 유지됩니다.</Text>
                  {nameMode === 'default' && <Text style={styles.helperText}>상세주소 → 도로명주소 → 방문지 원본행번호 순으로 이름을 정합니다.</Text>}
                  {nameMode === 'fixed' && (
                    <>
                      <TextInput style={styles.nameInput} value={fixedName} onChangeText={setFixedName}
                        placeholder="예: 점검 대상" maxLength={255} accessibilityLabel="모든 행에 사용할 방문지 이름" />
                      <Text style={styles.helperText}>입력한 이름을 모든 정상 행에 동일하게 사용합니다.</Text>
                    </>
                  )}
                  {nameMode === 'column' && (
                    <>
                      <Text style={styles.helperText}>각 행의 이름으로 사용할 컬럼을 선택하세요. 이름이 빈 행은 등록에서 제외됩니다.</Text>
                      {renderColumnGrid(nameColumn === -1 ? [] : [nameColumn], setNameColumn, 'name')}
                    </>
                  )}
                </View>

                {renderCoordinateSelector('lat', latColumn)}
                {renderCoordinateSelector('lng', lngColumn)}

                {!!settingsError && <Text style={styles.helperText}>{settingsError}</Text>}
                <TouchableOpacity
                  style={[styles.primaryButton, !!settingsError && { opacity: 0.5 }]}
                  disabled={!!settingsError}
                  onPress={handleConvert}
                >
                  <Text style={styles.primaryButtonText}>
                    변환 적용
                  </Text>
                </TouchableOpacity>

                </View>
                {/* 최하단: 현재 설정을 반영한 변환 결과 */}
                {renderConvertedPreview()}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  nameInput: {
    borderWidth: 1,
    borderColor: '#D5D9E0',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    color: '#222222',
    backgroundColor: '#FFFFFF',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: 12,
  },
  modalContainer: {
    maxHeight: '95%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CCCCCC',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222222',
  },
  closeText: {
    color: '#555555',
    fontSize: 14,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    padding: 14,
    paddingBottom: 28,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 9,
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
    marginTop: 12,
    marginBottom: 7,
  },
  primaryButton: {
    backgroundColor: '#2368D8',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  fileName: {
    marginTop: 8,
    color: '#444444',
    fontSize: 12,
  },
  optionButton: {
    padding: 10,
    backgroundColor: '#F3F5F8',
    borderRadius: 8,
  },
  optionText: {
    color: '#333333',
    fontSize: 13,
  },
  helperText: {
    color: '#666666',
    fontSize: 12,
    marginTop: 5,
    lineHeight: 17,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 7,
    marginVertical: 7,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D5D9E0',
    borderRadius: 7,
  },
  modeButtonActive: {
    backgroundColor: '#E7F0FF',
    borderColor: '#2368D8',
  },
  modeButtonText: {
    color: '#444444',
    fontSize: 12,
  },
  modeButtonTextActive: {
    color: '#1758BD',
    fontWeight: '700',
  },
  columnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },
  columnButton: {
    width: '31%',
    minHeight: 48,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D5D9E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnButtonSelected: {
    backgroundColor: '#E7F0FF',
    borderColor: '#2368D8',
  },
  columnButtonText: {
    color: '#333333',
    fontSize: 11,
    textAlign: 'center',
  },
  columnButtonTextSelected: {
    color: '#1758BD',
    fontWeight: '600',
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDDDDD',
  },
  orderText: {
    flex: 1,
    color: '#333333',
    fontSize: 12,
  },
  orderActions: {
    flexDirection: 'row',
    gap: 5,
  },
  smallButton: {
    minWidth: 32,
    paddingVertical: 5,
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 5,
  },
  smallButtonText: {
    color: '#333333',
    fontSize: 15,
  },
  separatorButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#D5D9E0',
    borderRadius: 7,
  },
  tableScroll: {
    marginTop: 10,
    maxHeight: 330,
    borderWidth: 1,
    borderColor: '#E0E3E8',
    borderRadius: 7,
  },
  tableRow: {
    flexDirection: 'row',
  },
  rowNumberCell: {
    width: 44,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE1E7',
    backgroundColor: '#F8F9FB',
  },
  tableCell: {
    width: CELL_WIDTH,
    minHeight: 42,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE1E7',
  },
  tableHeaderCell: {
    backgroundColor: '#EAF0F8',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#243247',
  },
  tableHeaderSubText: {
    marginTop: 3,
    fontSize: 10,
    color: '#66758A',
  },
  tableText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#333333',
  },
  countBox: {
    marginTop: 8,
    padding: 9,
    borderRadius: 7,
    backgroundColor: '#F3F5F8',
    gap: 4,
  },
  countText: {
    fontSize: 12,
    color: '#444444',
  },
  localNotice: {
    marginTop: 12,
    color: '#2368D8',
    fontSize: 11,
    lineHeight: 17,
  },
});
