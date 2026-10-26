import ReportFilters from '../components/ReportFilters';
import ProjectReportLink from '../components/ProjectReportLink';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useScreenBackHandler } from '../utils/screenBack';
import { ScreenHeader } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';
import { groupReportsByPlace } from '../utils/reportPhotos';
import { canDownloadReport } from '../utils/reportAvailability';
import { cleanReportName } from '../utils/reportName';
import { currentMonthRange, selectRangeDate } from '../utils/calendar';
import { ReportDownloadFooter, ReportFileCard } from '../components/ReportFileCard';
import { downloadCountText, useReportDownloads } from '../utils/useReportDownloads';

const dongName = (value) => String(value || '').trim().split(/\s+/).pop().replace(/제(?=\d+동$)/, '') || '행정동 미확인';

export default function GroupReportsScreen({ group, user, selectedDong, onBack, onOpenReport, onOpenReports, onEditReport, onPreviewReport, isActive = true, embedded = false, personalArchive = false }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState('');
  const [dong, setDong] = useState('');
  const [startDate, setStartDate] = useState(() => personalArchive ? '' : currentMonthRange().start);
  const [endDate, setEndDate] = useState(() => personalArchive ? '' : currentMonthRange().end);
  const [dateSide, setDateSide] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [openFilter, setOpenFilter] = useState(null);
  // 폴더 안 카드 체크 (progressId). 폴더를 바꾸면 비운다
  const [checkedIds, setCheckedIds] = useState([]);
  useEffect(() => { setCheckedIds([]); }, [group.groupId]);
  const downloadable = useMemo(() => reports.filter(item => item.progressId && canDownloadReport(item)), [reports]);
  const files = useReportDownloads(user.userId, downloadable);
  useEffect(() => { setMember(''); setDong(''); setSelectedPlace(null); setOpenFilter(null); }, [group.groupId]);
  useEffect(() => { if (!isActive) { setOpenFilter(null); setDateSide(null); } }, [isActive]);
  useScreenBackHandler(() => {
    if (files.busy.current) return true; // 받는 동안은 그대로
    if (checkedIds.length) { setCheckedIds([]); return true; }
    if (dateSide) { setDateSide(null); return true; }
    if (openFilter) { setOpenFilter(null); return true; }
    if (selectedPlace) { setSelectedPlace(null); return true; }
    const defaults = personalArchive ? { start: '', end: '' } : currentMonthRange();
    if (member || dong || search || startDate !== defaults.start || endDate !== defaults.end) {
      setMember(''); setDong(''); setSearch('');
      setStartDate(defaults.start); setEndDate(defaults.end);
      return true;
    }
    return false;
  }, isActive);

  useEffect(() => {
    if (!isActive) return;
    setLoading(true); setError('');
    let active = true;
    groupApi(`/api/groups/${group.groupId}/reports?userId=${user.userId}`)
      .then((items) => { if (active) setReports(Array.isArray(items) ? items : []); })
      .catch(() => { if (active) setError('보고서를 불러오지 못했습니다. 돌아가서 다시 시도하세요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group.groupId, user.userId, isActive]);

  // 작업자 목록: 본인을 맨 위에 (목록이 길면 끝에 있던 본인이 스크롤 아래로 숨었음)
  const members = useMemo(() => {
    const ids = Array.from(new Set(reports.filter(item => !item.performedByDeparted && item.performedByUserId != null).map(item => String(item.performedByUserId))));
    const me = String(user.userId);
    return [...(ids.includes(me) ? [me] : []), ...ids.filter(id => id !== me),
      ...(reports.some(item => item.performedByDeparted) ? ['__departed__'] : [])];
  }, [reports, user.userId]);
  const dongs = useMemo(() => Array.from(new Set(reports.map((item) => item.adminDong).filter(Boolean))), [reports]);
  const visible = useMemo(() => reports.filter((item) => {
    const day = String(item.createdAt || '').slice(0, 10);
    return (!member || (member === '__departed__' ? item.performedByDeparted : !item.performedByDeparted && String(item.performedByUserId) === member))
      && (!dong || item.adminDong === dong)
      && (!startDate || day >= startDate)
      && (!endDate || day <= endDate);
  }), [reports, member, dong, startDate, endDate]);
  const selectedDongName = selectedDong
    ? dongName(selectedDong.properties?.adm_nm || selectedDong.properties?.name)
    : '';
  const places = useMemo(() => groupReportsByPlace(visible).filter((place) =>
    !search.trim() || place.name.includes(search.trim()) || place.items.some((item) => String(item.roadAddress || '').includes(search.trim())))
    .sort((a, b) => Number(b.items.some((item) => dongName(item.adminDong) === selectedDongName)) -
      Number(a.items.some((item) => dongName(item.adminDong) === selectedDongName))), [visible, search, selectedDongName]);
  const selected = places.find((place) => place.key === selectedPlace);
  const checkedItems = reports.filter(item => checkedIds.includes(item.progressId) && canDownloadReport(item));
  // 안드로이드는 그 자리에서 받는다. 그 밖의 기기는 기존 다운로드 화면
  const download = async (items) => {
    const saved = await files.download(items, {
      label: items.length === 1 ? cleanReportName(items[0].reportName) || '현장 보고서' : null,
      fallback: rows => rows.length === 1 || !onOpenReports ? onOpenReport?.(rows[0]) : onOpenReports(rows),
    });
    if (saved.length) setCheckedIds(prev => prev.filter(id => !saved.includes(id)));
  };
  const statusLabel = (value) => value === 'complete' ? '작업 후' : value === 'working' ? '작업 중' : '작업 전';

  const workerLabel = value => {
    if (value === '__departed__') return '탈퇴한 사용자';
    if (!value) return '전체';
    const report = reports.find(item => String(item.performedByUserId) === value);
    const name = report?.performedByName || '작업자';
    const sameName = new Set(reports.filter(item => item.performedByName === name && !item.performedByDeparted).map(item => item.performedByUserId));
    const label = sameName.size > 1 ? `${name} (${report?.performedByLoginId || value})` : name;
    return value === String(user.userId) ? `나 · ${label}` : label;
  };
  return <View style={[styles.container, embedded && { marginTop: 0 }]}>
    {!embedded && <ScreenHeader title={selected ? selected.name : personalArchive ? '보고서 보관함' : '그룹 보고서 전체보기'} onBack={selected ? () => setSelectedPlace(null) : onBack} />}
    <ScrollView contentContainerStyle={styles.body} removeClippedSubviews={false} keyboardShouldPersistTaps="handled">
      <ReportFilters key={group.groupId} search={search} onSearchChange={setSearch} worker={member} onWorkerChange={value=>{setMember(value);setSelectedPlace(null);}} workers={members.map(value=>({value,label:workerLabel(value)}))} dong={dong} onDongChange={value=>{setDong(value);setSelectedPlace(null);}} dongs={dongs} startDate={startDate} endDate={endDate} onDateChange={range=>{setStartDate(range.start);setEndDate(range.end);setSelectedPlace(null);}} showWorker={!personalArchive} showAllDates={personalArchive}/>
      {embedded && selected && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TouchableOpacity style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => setSelectedPlace(null)}><Ionicons name="arrow-back" size={22} color={colors.primary} /></TouchableOpacity><Text style={[styles.title, { flex: 1 }]}>{selected.name}</Text></View>}
      {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.empty}>{error}</Text> : selected ?
        <View style={styles.dongGroup}>
          {selected.items.map((item) => {
            const title = cleanReportName(item.reportName) || '현장 보고서';
            const ready = canDownloadReport(item);
            return <ReportFileCard key={item.progressId} title={title} checked={checkedIds.includes(item.progressId)} selectable={ready} busy={files.downloading}
              onToggle={() => setCheckedIds(prev => prev.includes(item.progressId) ? prev.filter(id => id !== item.progressId) : [...prev, item.progressId])}
              onPress={onPreviewReport ? () => onPreviewReport({ ...item, title }) : undefined} pressLabel={`${title} 미리보기`}
              // 수정은 현재 담당자만 (사용자 결정). 남이 한 건은 받기·미리보기만
              editLabel={Number(item.assigneeUserId) === Number(user.userId) ? '수정' : null} onEdit={() => onEditReport?.(item)}
              downloadable={ready} state={files.stateOf(item)}
              onDownload={() => download([item])}
              onOpenFolder={Platform.OS === 'android' ? files.openFolder : () => download([item])}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.meta}>{String(item.createdAt || '').slice(0, 16).replace('T', ' ')}</Text>
              {!!item.completedAt && <Text style={styles.meta}>조치 완료: {String(item.completedAt).replace('T', ' ').slice(0, 16)}</Text>}
              <Text style={styles.meta}>{statusLabel(item.progressStatus)} · {item.performedByName || '작업자 확인 불가'}{item.performedByDeparted ? ' (탈퇴한 사용자)' : ''}</Text>
              {!!item.projects?.length && <Text style={styles.meta}>프로젝트 · {item.projects.map(p=>p.name).join(', ')}</Text>}
              <Text style={styles.meta}>담당자: {item.assigneeName || '담당자 확인 불가'}{item.assigneeDeparted ? ' (탈퇴)' : ''}</Text>
              {!ready && <Text style={styles.meta}>작업 전 보고서는 다운로드할 수 없습니다.</Text>}
            </ReportFileCard>;
          })}
        </View> : places.length ? places.map((place) => <TouchableOpacity key={place.key} style={styles.card} onPress={() => setSelectedPlace(place.key)}>
          <TouchableOpacity accessibilityLabel={`${place.name} 보고서 전체 선택`} style={{padding:8}} onPress={()=>{const ids=place.items.filter(canDownloadReport).map(item=>item.progressId);setCheckedIds(old=>ids.every(id=>old.includes(id))?old.filter(id=>!ids.includes(id)):[...new Set([...old,...ids])]);}}><Ionicons name={place.items.filter(canDownloadReport).length>0 && place.items.filter(canDownloadReport).every(item=>checkedIds.includes(item.progressId))?'checkbox':'square-outline'} size={24} color={colors.primary}/></TouchableOpacity>
          <Ionicons name="folder-outline" size={22} color={colors.primary} />
          <View style={styles.cardBody}><Text style={styles.title}>{place.name}</Text><Text style={styles.meta}>{String(place.items[0]?.createdAt || '').slice(0, 10)}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>) : <Text style={styles.empty}>조건에 맞는 보고서가 없습니다.</Text>}
    </ScrollView>
    <ProjectReportLink userId={user.userId} groupId={group.groupId} personal={group.personal || group.personalWorkspace || group.workspaceType === 'PERSONAL'} progressIds={checkedItems.map(item=>item.progressId)} onLinked={project=>setReports(old=>old.map(item=>checkedIds.includes(item.progressId)?{...item,projects:[...(item.projects||[]).filter(p=>p.projectId!==project.projectId),{projectId:project.projectId,name:project.name}]}:item))} />
    {(selected || checkedItems.length > 0) && <ReportDownloadFooter toast={files.toast} onOpenFolder={files.openFolder} count={checkedItems.length}
      hint={downloadCountText(checkedItems, files.stateOf)} busy={files.downloading} onDownload={() => download(checkedItems)} />}

  </View>;
}

const styles = StyleSheet.create({
  filterPanel: { padding: 14, borderRadius: 16, backgroundColor: colors.surfaceMuted, gap: 10, zIndex: 20 },
  searchField: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, paddingHorizontal: 12, borderRadius: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: colors.text },
  allDates: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center' },
  filtersRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', zIndex: 20 },
  filterColumn: { flex: 1, minWidth: 0, gap: 7 },
  filterColumnOpen: { zIndex: 30 },
  filterButton: {  flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,  borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 0, justifyContent: 'center', minHeight: 40, },
  filterValue: { flex: 1, color: colors.text, fontSize: 12 },
  filterOptions: { position: 'absolute', top: '100%', marginTop: 6, left: 0, right: 0, zIndex: 40, elevation: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface, overflow: 'hidden' },
  filterOption: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, gap: 6 },
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0 }, body: {  paddingBottom: 24, padding: 20, gap: 0, },
  dongGroup: { gap: 10 }, dongGroupTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.surface, fontSize: 11 },
  dateButton: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  dateText: { fontSize: 11, color: colors.text },
  dateDash: { color: colors.textSoft }, card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,  backgroundColor: colors.surface,  borderColor: colors.line, paddingHorizontal: 0, paddingVertical: 14, borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 64, },
  cardBody: { flex: 1 }, title: { color: colors.text, fontWeight: '800', fontSize: 13 }, meta: { color: colors.textSoft, fontSize: 10, marginTop: 3 },
  empty: { color: colors.textSoft, textAlign: 'center', padding: 28 },
});
