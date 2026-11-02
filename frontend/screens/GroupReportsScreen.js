import useLiveRevision from '../utils/useLiveRevision';
import ReportFilters from '../components/ReportFilters';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useScreenBackHandler } from '../utils/screenBack';
import { ScreenHeader } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';
import { canDownloadReport } from '../utils/reportAvailability';
import { cleanReportName } from '../utils/reportName';
import { emptyProjectFilters, filterProjectRecords, projectFilterOptions, recordDay } from '../utils/projectWorkflow';
import { ReportDownloadFooter, ReportFileCard } from '../components/ReportFileCard';
import { useReportDownloads } from '../utils/useReportDownloads';

export default function GroupReportsScreen({ group, user, onBack, onOpenReport, onOpenReports, onEditReport, onPreviewReport, isActive = true, embedded = false, personalArchive = false }) {
  const liveRevision = useLiveRevision(['reports', 'tasks']);
  const [reports, setReports] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [filters, setFilters] = useState(emptyProjectFilters);
  const downloadable = useMemo(() => reports.filter(item => item.progressId && canDownloadReport(item)), [reports]);
  const files = useReportDownloads(user.userId, downloadable);
  useEffect(() => { setFilters(emptyProjectFilters()); }, [group.groupId]);
  useScreenBackHandler(() => {
    if (files.busy.current) return true;
    if (Object.values(filters).some(Boolean)) { setFilters(emptyProjectFilters()); return true; }
    return false;
  }, isActive);
  useEffect(() => {
    if (!isActive) return;
    let active = true; setLoading(true); setError('');
    groupApi(`/api/groups/${group.groupId}/reports?userId=${user.userId}`)
      .then(items => { if (active) setReports(Array.isArray(items) ? items : []); })
      .catch(e => { if (active) setError(e.message || '보고서를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group.groupId, user.userId, isActive, liveRevision]);
  const visible = useMemo(() => filterProjectRecords(reports, filters), [reports, filters]);
  const options = projectFilterOptions(reports);
  const download = items => files.download(items, {
    label: items.length === 1 ? cleanReportName(items[0].reportName) || items[0].detailAddress || '현장 보고서' : null,
    fallback: rows => rows.length === 1 || !onOpenReports ? onOpenReport?.(rows[0]) : onOpenReports(rows),
  });
  return <View style={styles.container}>
    {!embedded && <ScreenHeader title={personalArchive ? '보고서 보관함' : '건별 보고서'} onBack={onBack}/>}
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <ReportFilters key={`${group.groupId}:${isActive}`} {...options} workerLabel="담당자" showWorker={!personalArchive}
        search={filters.search} onSearchChange={search => setFilters(value => ({ ...value, search }))}
        worker={filters.worker} onWorkerChange={worker => setFilters(value => ({ ...value, worker }))}
        dong={filters.dong} onDongChange={dong => setFilters(value => ({ ...value, dong }))}
        startDate={filters.start} endDate={filters.end} onDateChange={range => setFilters(value => ({ ...value, ...range }))}/>
      {loading ? <ActivityIndicator color={colors.primary}/> : error ? <Text style={styles.empty}>{error}</Text> : visible.map(item => {
        const title = cleanReportName(item.reportName) || item.detailAddress || item.roadAddress || '현장 보고서';
        const ready = canDownloadReport(item);
        return <ReportFileCard key={item.progressId} title={title} showSelection={false} style={{ paddingLeft: 14 }} busy={files.downloading}
          onPress={onPreviewReport ? () => onPreviewReport({ ...item, title }) : undefined} pressLabel={`${title} 미리보기`}
          editLabel={Number(item.assigneeUserId) === Number(user.userId) ? '수정' : null} onEdit={() => onEditReport?.(item)}
          downloadable={ready} state={files.stateOf(item)} onDownload={() => download([item])}
          onOpenFolder={Platform.OS === 'android' ? files.openFolder : () => download([item])}>
          <Text style={styles.title}>{title}</Text>
          {!!item.roadAddress && item.roadAddress !== title && <Text style={styles.meta}>{item.roadAddress}</Text>}
          <Text style={styles.meta}>{item.assigneeName || '담당자 확인 불가'} · {recordDay(item.createdAt)}</Text>
        </ReportFileCard>;
      })}
      {!loading && !error && !visible.length && <Text style={styles.empty}>조건에 맞는 보고서가 없습니다.</Text>}
    </ScrollView>
    <ReportDownloadFooter toast={files.toast} onOpenFolder={files.openFolder} count={0}/>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 12, paddingBottom: 30 },
  title: { color: colors.text, fontWeight: '800', fontSize: 16, lineHeight: 23 },
  meta: { color: colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 4 },
  empty: { color: colors.textSoft, paddingVertical: 24, textAlign: 'center' },
});
