
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const MAX_PREVIEW_ROWS = 10;
const CELL_WIDTH = 130;

export default function BulkUploadModal({ visible, onClose }) {
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  const [addressMode, setAddressMode] = useState('single');
  const [addressColumns, setAddressColumns] = useState([]);
  const [latColumn, setLatColumn] = useState(-1);
  const [lngColumn, setLngColumn] = useState(-1);
  const [separator, setSeparator] = useState(' ');

  const [hasApplied, setHasApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

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
        const address = addressColumns
          .map((columnIndex) => getCell(values, columnIndex))
          .filter((value) => value !== '')
          .join(separator);

        return {
          rowNumber,
          address,
          lat: getCell(values, latColumn),
          lng: getCell(values, lngColumn),
          original: [...values],
        };
      }),
    [dataRows, addressColumns, separator, latColumn, lngColumn]
  );

  // 주소가 있거나 위도와 경도가 모두 있는 행만 유효합니다.
  // 주소가 없고 좌표 쌍도 완성되지 않은 행은 내보내기 대상입니다.
  const invalidLocationRows = useMemo(
    () => convertedRows.filter((row) => !row.address && !(row.lat && row.lng)),
    [convertedRows]
  );

  // 컬럼 선택이나 원본 데이터가 바뀌면 변환 적용 상태를 해제합니다.
  useEffect(() => {
    setHasApplied(false);
  }, [convertedRows]);

  const exportInvalidLocationRows = async () => {
    if (!hasApplied) {
      Alert.alert('변환 적용 필요', '먼저 변환 적용 버튼을 눌러 주세요.');
      return;
    }
    if (invalidLocationRows.length === 0) {
      Alert.alert('내보낼 데이터 없음', '주소도 없고 위도·경도 쌍도 없는 행이 없습니다.');
      return;
    }

    try {
      setExporting(true);
      // 원본 컬럼의 내용과 순서를 유지하고, 추적용 원본 행 번호를 추가합니다.
      const header = hasHeader
        ? ['원본 행 번호', ...rawRows[0]]
        : ['원본 행 번호', ...columnLabels];
      const rows = [header, ...invalidLocationRows.map((row) => [row.rowNumber, ...row.original])];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 },
        ...Array.from({ length: columnCount }, () => ({ wch: 20 })),
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
    setFileName('');
    setRawRows([]);
    setHasHeader(true);
    setAddressMode('single');
    setAddressColumns([]);
    setLatColumn(-1);
    setLngColumn(-1);
    setSeparator(' ');
    setHasApplied(false);
  };

  const handleClose = () => {
    resetData();
    onClose?.();
  };

  // Excel 또는 CSV 파일을 기기에서 읽습니다.
  const pickFile = async () => {
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

      setFileName(file.name);
      setRawRows(rows);
      setHasHeader(true);
      setAddressMode('single');
      setAddressColumns(
        rows.some((row) => row.length > 0) ? [0] : []
      );
      setLatColumn(-1);
      setLngColumn(-1);
      setSeparator(' ');
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

    if (
      addressColumns.length === 0 &&
      latColumn === -1 &&
      lngColumn === -1
    ) {
      Alert.alert(
        '컬럼 선택 필요',
        '주소, 위도, 경도 중 적어도 하나를 선택해 주세요.'
      );
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
        {type === 'lat' ? '위도 컬럼' : '경도 컬럼'}
      </Text>

      <View style={styles.columnGrid}>
        <TouchableOpacity
          style={[
            styles.columnButton,
            selectedColumn === -1 && styles.columnButtonSelected,
          ]}
          onPress={() => selectCoordinateColumn(type, -1)}
        >
          <Text
            style={[
              styles.columnButtonText,
              selectedColumn === -1 &&
                styles.columnButtonTextSelected,
            ]}
          >
            {selectedColumn === -1 ? '✓ ' : ''}
            선택 안 함
          </Text>
        </TouchableOpacity>

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
          주소 없음: {convertedRows.filter((row) => !row.address).length}개
        </Text>
        <Text style={styles.countText}>
          위도 없음: {convertedRows.filter((row) => !row.lat).length}개
        </Text>
        <Text style={styles.countText}>
          경도 없음: {convertedRows.filter((row) => !row.lng).length}개
        </Text>
      </View>

      <Text style={styles.helperText}>
        등록 조건 미충족: {invalidLocationRows.length}개 (주소 없음 + 위도·경도 중 하나 이상 없음)
      </Text>
      <TouchableOpacity
        style={[styles.primaryButton, (!hasApplied || exporting || invalidLocationRows.length === 0) && { opacity: 0.5 }]}
        onPress={exportInvalidLocationRows}
        disabled={!hasApplied || exporting || invalidLocationRows.length === 0}
      >
        <Text style={styles.primaryButtonText}>
          {exporting ? '엑셀 생성 중...' : `등록 조건 미충족 ${invalidLocationRows.length}개 행 엑셀로 내보내기`}
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

            {['주소', '위도', '경도'].map((label) => (
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

                {[row.address, row.lat, row.lng].map((value, cellIndex) => (
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
        로컬 미리보기입니다. 서버나 데이터베이스에는 전송되지 않았습니다.
      </Text>
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

            <TouchableOpacity onPress={handleClose}>
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
              disabled={loading}
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
                    3. 주소 컬럼 설정
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
                      ? '주소로 사용할 컬럼 하나를 선택하세요.'
                      : '여러 컬럼을 선택한 뒤 결합 순서를 조정하세요.'}
                  </Text>

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

                {renderCoordinateSelector('lat', latColumn)}
                {renderCoordinateSelector('lng', lngColumn)}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleConvert}
                >
                  <Text style={styles.primaryButtonText}>
                    변환 적용
                  </Text>
                </TouchableOpacity>

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
