import { showAlert } from '../components/CustomAlert';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui';
import { ReportDownloadFooter, ReportFileCard } from '../components/ReportFileCard';
import MapWorkspaceSwitcher from '../components/MapWorkspaceSwitcher';
import { colors, workStatus } from '../constants/design';
import { useScreenBackHandler } from '../utils/screenBack';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { canDownloadReport } from '../utils/reportAvailability';
import { cleanReportName } from '../utils/reportName';
import { downloadCountText, useReportDownloads } from '../utils/useReportDownloads';

const getStatusLabel = (status) => {
  if (status === 'complete') return '작업 후';
  if (status === 'working') return '작업 중';
  return '작업 전';
};

const getWorkDateKey = (item) => {
  const value = item?.workDate ?? item?.work_date ?? item?.createdAt ?? item?.created_at;
  return value ? String(value).slice(0, 10) : '';
};

const formatShortDate = (value) => {
  const key = value ? String(value).slice(0, 10) : '';
  const parts = key.split('-');
  if (parts.length !== 3) return '';
  return `${Number(parts[1])}월 ${Number(parts[2])}일`;
};

const getTaskId = (loc) =>
  loc?.id ??
  loc?.taskId ??
  loc?.task_id ??
  null;
const EMPTY_LOCATIONS = [];
const titleOf = (loc) => cleanReportName(loc.reportName) || loc.detailAddress || loc.roadAddress || '이름 없음';

export default function ReportListScreen({
  locations = EMPTY_LOCATIONS,
  loading = false,
  selectedDong,
  user,
  activeGroup,
  onSelectGroup,
  groupAssignments = [],
  onBack,
  onSelectLocation,
  onPreviewReport,
  onCreateReport,
  selectedIds: selection,
  onSelectionChange,
}) {
  const [localSelectedIds, setLocalSelectedIds] = useState([]);
  const [savedReports, setSavedReports] = useState({});
  const [checkingReports, setCheckingReports] = useState(false);
  const [reportReload, setReportReload] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    setCheckingReports(true);
    setSavedReports({});
    const candidates = locations.filter(loc => getTaskId(loc) != null && ['working', 'complete'].includes(loc.status));
    const results = {};
    let cursor = 0;
    const worker = async () => {
      while (active && cursor < candidates.length) {
        const loc = candidates[cursor++];
        const id = getTaskId(loc);
        try {
          const response = await apiFetch(`${API_BASE_URL}/api/task-progress/task/${id}`);
          if (!response.ok) throw new Error('보고서 확인 실패');
          const text = await response.text();
          const report = text.trim() ? JSON.parse(text) : null;
          results[id] = { ...report, downloadable: !!report?.progressId && canDownloadReport(report) };
        } catch (_) { results[id] = { downloadable: false, error: true }; }
      }
    };
    Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker)).then(() => {
      if (active) { setSavedReports(results); setCheckingReports(false); }
    });
    return () => { active = false; };
  }, [locations, user?.userId, reportReload]);
  // F7: 받을 수 있는 보고서마다 이 폰에서 받은 기록과 비교 (DownloadScreen 과 같은 기록)
  const downloadableReports = useMemo(() => Object.values(savedReports).filter(report => report?.downloadable), [savedReports]);
  const files = useReportDownloads(user?.userId, downloadableReports);
  const selectedIds = selection ?? localSelectedIds;
  const setSelectedIds = (next) => {
    if (onSelectionChange) onSelectionChange(typeof next === 'function' ? next(selectedIds) : next);
    else setLocalSelectedIds(next);
  };
  useScreenBackHandler(() => {
    if (files.busy.current) return true; // 받는 동안 선택이 꼬이지 않게 뒤로가기는 막는다
    if (!selectedIds.length) return false;
    setSelectedIds([]);
    return true;
  }, selectedIds.length > 0 || files.downloading);

  const isReportable = (loc) =>
    getTaskId(loc) != null && ['working', 'complete'].includes(loc.status) && !!savedReports[getTaskId(loc)]?.downloadable;

  const toggleSelect = (loc) => {
    if (!isReportable(loc)) {
      showAlert(
        '선택 불가',
        getTaskId(loc) == null ? '방문지 정보를 확인할 수 없습니다.' : '보고서를 저장한 뒤 다운로드 대상으로 선택해 주세요.'
      );
      return;
    }

    const id = getTaskId(loc);

    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : [...prev, id]
    );
  };

  const selectedLocations = locations.filter((loc) =>
    isReportable(loc) && selectedIds.includes(getTaskId(loc))
  );
  const reportOf = loc => savedReports[getTaskId(loc)];

  // 안드로이드는 이 화면에서 바로 받는다. iOS 는 공유 시트가 필요해 기존 다운로드 화면으로 보낸다.
  const download = async (locs) => {
    const saved = await files.download(locs.map(reportOf), {
      label: locs.length === 1 ? titleOf(locs[0]) : null,
      fallback: () => onCreateReport?.(locs.map(loc => ({ ...loc, progressId: reportOf(loc).progressId }))),
    });
    const savedTasks = locs.filter(loc => saved.includes(reportOf(loc).progressId)).map(getTaskId);
    if (savedTasks.length) setSelectedIds(prev => prev.filter(id => !savedTasks.includes(id)));
  };

  const handleDownloadSelected = () => {
    if (selectedLocations.length === 0) {
      showAlert('선택 필요', '받을 보고서를 선택하세요.');
      return;
    }
    download(selectedLocations);
  };

  const keyword = query.trim().toLowerCase();
  const matches = (loc) => {
    if (!keyword) return true;
    const report = reportOf(loc) || {};
    return [titleOf(loc), loc.detailAddress, loc.roadAddress, loc.adminDong, report.reportName, report.mainComment, report.fieldMemo]
      .filter(Boolean).some(value => String(value).toLowerCase().includes(keyword));
  };
  const visible = locations.map((loc, index) => ({ loc, index })).filter(({ loc }) => matches(loc));
  const todo = visible.filter(({ loc }) => loc.status !== 'complete');
  const done = visible.filter(({ loc }) => loc.status === 'complete');

  const renderCard = ({ loc, index }) => {
    const taskId = getTaskId(loc);
    const reportable = isReportable(loc);
    const checked = reportable && selectedIds.includes(taskId);
    const tone = workStatus(loc.status);
    const finished = loc.status === 'complete';
    const title = titleOf(loc);
    // 저장된 보고서가 있으면 카드 누르기 = 미리보기, 없으면 작성
    const preview = reportable && !!onPreviewReport;
    return <ReportFileCard key={taskId ?? index} title={title} checked={checked} selectable={reportable} busy={files.downloading}
      style={{ backgroundColor: finished ? colors.surface : tone.background, borderColor: checked ? colors.primary : finished ? colors.line : 'transparent' }}
      onToggle={() => toggleSelect(loc)}
      onPress={() => preview ? onPreviewReport({ ...reportOf(loc), title }) : onSelectLocation?.(loc)}
      pressLabel={preview ? `${title} 미리보기` : `${title} 보고서 ${finished ? '수정' : '작성'}`}
      editLabel={finished ? '수정' : '작성'} onEdit={() => onSelectLocation?.(loc)}
      downloadable={reportable} state={reportable ? files.stateOf(reportOf(loc)) : 'new'}
      onDownload={() => download([loc])}
      onOpenFolder={Platform.OS === 'android' ? files.openFolder : () => download([loc])}>
      <View style={styles.cardRow}>
        <View style={[styles.number, { backgroundColor: tone.color }]}><Text style={styles.numberText}>{loc.markerNumber || index + 1}</Text></View>
        <View style={styles.cardInfo}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.meta}>
            {!!formatShortDate(getWorkDateKey(loc)) && <Text style={styles.date}>{formatShortDate(getWorkDateKey(loc))}</Text>}
            <Text style={[styles.state, { color: tone.ink }]}>{getStatusLabel(loc.status)}</Text>
          </View>
          {['working', 'complete'].includes(loc.status) && !reportable && <Text style={styles.date}>
            {checkingReports ? '저장된 보고서 확인 중…' : savedReports[taskId]?.error ? '보고서 확인 실패' : '보고서 저장 후 다운로드 가능'}
          </Text>}
        </View>
      </View>
    </ReportFileCard>;
  };

  const section = (label, rows) => rows.length ? <View style={styles.section} key={label}>
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{label}</Text><Text style={styles.sectionCount}>{rows.length}건</Text></View>
    {rows.map(renderCard)}
  </View> : null;

  return (
    <View style={styles.container}>
      {/* 이 탭은 내 작업 결과만 보인다 */}
      <ScreenHeader root={!selectedIds.length} title="보고서 작성(개인)" onBack={onBack}
        right={Object.values(savedReports).some(report => report.error) ? <TouchableOpacity accessibilityLabel="보고서 상태 다시 확인" onPress={() => setReportReload(value => value + 1)}><Text style={{ color: colors.primary }}>다시 확인</Text></TouchableOpacity> : null} />
      {/* 그룹 바꾸기 (D37): 제목 줄에선 그룹 이름이 잘려 제목 아래 한 줄로. 받는 동안은 잠금 */}
      <View style={[styles.groupRow, files.downloading && styles.disabled]} pointerEvents={files.downloading ? 'none' : 'auto'}>
        <MapWorkspaceSwitcher userId={user?.userId} activeGroup={activeGroup} onSelect={onSelectGroup} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator size="large" color="#2477F3" />
            <Text style={styles.emptyTitle}>방문지를 불러오는 중입니다</Text>
          </View>
        ) : locations.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name="document-text-outline"
              size={36}
              color="#8B9891"
            />

            <Text style={styles.emptyTitle}>
              등록된 방문지가 없습니다
            </Text>

            <Text style={styles.emptyDesc}>
              지도에서 방문지를 먼저 추가해주세요.
            </Text>
          </View>
        ) : <>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.primary} />
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="주소 · 보고서 이름 · 메모 검색"
              placeholderTextColor={colors.textFaint} returnKeyType="search" accessibilityLabel="보고서 검색" />
            {!!query && <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="검색 지우기"><Ionicons name="close-circle" size={18} color={colors.textFaint} /></TouchableOpacity>}
          </View>
          {section('쓸 것', todo)}
          {section('끝난 것', done)}
          {!todo.length && !done.length && <Text style={styles.emptyDesc}>{`'${query.trim()}'에 맞는 보고서가 없습니다.`}</Text>}
        </>}
      </ScrollView>

      <ReportDownloadFooter toast={files.toast} onOpenFolder={files.openFolder} count={selectedLocations.length}
        hint={downloadCountText(selectedLocations.map(reportOf), files.stateOf)} busy={files.downloading} onDownload={handleDownloadSelected} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  groupRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 4 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
  emptyBox: { padding: 28, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 16 },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '800', color: colors.text },
  emptyDesc: { marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.textSoft, textAlign: 'center' },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: colors.text },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  sectionCount: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  cardInfo: { flex: 1 }, itemTitle: { fontSize: 14, lineHeight: 21, fontWeight: '800', color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 3 },
  date: { color: colors.textSoft, fontSize: 12 }, state: { fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
