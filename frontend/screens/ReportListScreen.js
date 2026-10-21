import { showAlert } from '../components/CustomAlert';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import { colors, workStatus } from '../constants/design';
import { useScreenBackHandler } from '../utils/screenBack';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { canDownloadReport } from '../utils/reportAvailability';
import { cleanReportName } from '../utils/reportName';

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

export default function ReportListScreen({
  locations = EMPTY_LOCATIONS,
  loading = false,
  selectedDong,
  user,
  activeGroup,
  groupAssignments = [],
  onBack,
  onSelectLocation,
  onCreateReport,
  selectedIds: selection,
  onSelectionChange,
}) {
  const [localSelectedIds, setLocalSelectedIds] = useState([]);
  const [savedReports, setSavedReports] = useState({});
  const [checkingReports, setCheckingReports] = useState(false);
  const [reportReload, setReportReload] = useState(0);
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
  const selectedIds = selection ?? localSelectedIds;
  const setSelectedIds = (next) => {
    if (onSelectionChange) onSelectionChange(typeof next === 'function' ? next(selectedIds) : next);
    else setLocalSelectedIds(next);
  };
  useScreenBackHandler(() => {
    if (!selectedIds.length) return false;
    setSelectedIds([]);
    return true;
  }, selectedIds.length > 0);

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

  const handleCreateReport = () => {
    if (selectedLocations.length === 0) {
      showAlert(
        '선택 필요',
        '보고서에 포함할 방문지를 선택하세요.'
      );
      return;
    }

    onCreateReport?.(selectedLocations.map(loc => ({ ...loc, progressId: savedReports[getTaskId(loc)].progressId })));
  };

  return (
    <View style={styles.container}>
      <ScreenHeader root={!selectedIds.length} title="보고서 작성" onBack={onBack}
        right={Object.values(savedReports).some(report => report.error) ? <TouchableOpacity accessibilityLabel="보고서 상태 다시 확인" onPress={() => setReportReload(value => value + 1)}><Text style={{ color: colors.primary }}>다시 확인</Text></TouchableOpacity> : null} />

      <ScrollView
        contentContainerStyle={styles.body}
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
        ) : (
          locations.map((loc, index) => {
            const taskId = getTaskId(loc);
            const reportable = isReportable(loc);
            const checked = reportable && selectedIds.includes(taskId);
            const tone = workStatus(loc.status);
            return <View key={taskId ?? index}>
              {index > 0 && <View style={styles.separator} />}
              <View style={[styles.reportCard, { backgroundColor: tone.background, borderColor: checked ? colors.text : 'transparent' }]}>
                <TouchableOpacity style={styles.selectCard} onPress={() => onSelectLocation?.(loc)}
                  accessibilityRole="button" accessibilityLabel={`${loc.detailAddress || loc.roadAddress || '방문지'} 보고서 양식 열기`} activeOpacity={0.85}>
                  <View style={[styles.number, { backgroundColor: tone.color }]}><Text style={styles.numberText}>{loc.markerNumber || index + 1}</Text></View>
                  <View style={styles.cardInfo}>
                      <Text style={styles.itemTitle} numberOfLines={2}>{cleanReportName(loc.reportName) || loc.detailAddress || loc.roadAddress || '이름 없음'}</Text>
                    <View style={styles.meta}>
                      {!!formatShortDate(getWorkDateKey(loc)) && <Text style={styles.date}>{formatShortDate(getWorkDateKey(loc))}</Text>}
                      <Text style={[styles.state, { color: tone.ink }]}>{getStatusLabel(loc.status)}</Text>
                    </View>
                    {['working', 'complete'].includes(loc.status) && !reportable && <Text style={styles.date}>
                      {checkingReports ? '저장된 보고서 확인 중…' : savedReports[taskId]?.error ? '보고서 확인 실패' : '보고서 저장 후 다운로드 가능'}
                    </Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.edit} onPress={() => toggleSelect(loc)} disabled={!reportable} accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: !reportable }} accessibilityLabel={`${loc.detailAddress || '방문지'} 보고서 생성 대상 선택${reportable ? '' : ', 보고서 저장 후 선택 가능'}`}>
                  <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={25} color={reportable ? colors.primary : colors.textFaint} />
                </TouchableOpacity>
              </View>
            </View>;
          })
        )}
      </ScrollView>

      <View style={styles.bottomBar}>


        <PrimaryButton
          title={`${selectedLocations.length}건 보고서 만들기`}
          onPress={handleCreateReport}
          disabled={
            selectedLocations.length === 0
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  emptyBox: { padding: 28, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 16 },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '800', color: colors.text },
  emptyDesc: { marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.textSoft },
  reportCard: { minHeight: 82, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  selectCard: { flex: 1, minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  number: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cardInfo: { flex: 1 }, itemTitle: { fontSize: 14, lineHeight: 22, fontWeight: '800', color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 4 },
  date: { color: colors.textSoft, fontSize: 12 }, state: { fontSize: 12, fontWeight: '700' },
  edit: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, backgroundColor: colors.line, marginVertical: 10 },
  bottomBar: { padding: 12, backgroundColor: colors.surface },
});
