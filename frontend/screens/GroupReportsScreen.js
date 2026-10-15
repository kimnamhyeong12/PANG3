import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useScreenBackHandler } from '../utils/screenBack';
import { ScreenHeader } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';
import { groupReportsByPlace } from '../utils/reportPhotos';
import { canDownloadReport } from '../utils/reportAvailability';
import ReportDatePicker from '../components/ReportDatePicker';
import { currentMonthRange, selectRangeDate } from '../utils/calendar';

const dongName = (value) => String(value || '').trim().split(/\s+/).pop().replace(/제(?=\d+동$)/, '') || '행정동 미확인';

export default function GroupReportsScreen({ group, user, selectedDong, onBack, onOpenReport, onEditReport, isActive = true, embedded = false, personalArchive = false }) {
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
  useEffect(() => { setMember(''); setDong(''); setSelectedPlace(null); setOpenFilter(null); }, [group.groupId]);
  useEffect(() => { if (!isActive) { setOpenFilter(null); setDateSide(null); } }, [isActive]);
  useScreenBackHandler(() => { if (!selectedPlace) return false; setSelectedPlace(null); return true; }, isActive && !!selectedPlace);

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

  const members = useMemo(() => [...Array.from(new Set(reports.filter(item => !item.performedByDeparted && item.performedByUserId != null).map(item => String(item.performedByUserId)))),
    ...(reports.some(item => item.performedByDeparted) ? ['__departed__'] : [])], [reports]);
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
  const statusLabel = (value) => value === 'complete' ? '작업 후' : value === 'working' ? '작업 중' : '작업 전';

  const workerLabel = value => {
    if (value === '__departed__') return '탈퇴한 사용자';
    if (!value) return '전체';
    const report = reports.find(item => String(item.performedByUserId) === value);
    const name = report?.performedByName || '작업자';
    const sameName = new Set(reports.filter(item => item.performedByName === name && !item.performedByDeparted).map(item => item.performedByUserId));
    return sameName.size > 1 ? `${name} (${report?.performedByLoginId || value})` : name;
  };
  const filterField = (key, label, values, selected, setSelected) => (
    <View style={[styles.filterColumn, openFilter === key && styles.filterColumnOpen]}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.filterButton} onPress={() => setOpenFilter(openFilter === key ? null : key)} accessibilityRole="button" accessibilityLabel={`${label} 선택`} accessibilityState={{ expanded: openFilter === key }}>
        <Text style={styles.filterValue} numberOfLines={1}>{key === 'member' ? workerLabel(selected) : selected || '전체'}</Text>
        <Ionicons name={openFilter === key ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textSoft} />
      </TouchableOpacity>
      {openFilter === key && <View style={styles.filterOptions}>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
          {['', ...values].map(value => <TouchableOpacity key={value || '__all__'} style={styles.filterOption} onPress={() => { setSelected(value); setSelectedPlace(null); setOpenFilter(null); }}>
            <Text style={[styles.filterValue, selected === value && { color: colors.primary, fontWeight: '800' }]}>{key === 'member' ? workerLabel(value) : value || '전체'}</Text>
            {selected === value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
          </TouchableOpacity>)}
        </ScrollView>
      </View>}
    </View>
  );
  return <View style={[styles.container, embedded && { marginTop: 0 }]}>
    {!embedded && <ScreenHeader title={selected ? selected.name : personalArchive ? '보고서 보관함' : '그룹 보고서 전체보기'} onBack={selected ? () => setSelectedPlace(null) : onBack} />}
    <ScrollView contentContainerStyle={styles.body} removeClippedSubviews={false} keyboardShouldPersistTaps="handled">
      <View style={styles.filtersRow}>{!personalArchive && filterField('member', '작업자', members, member, setMember)}{filterField('dong', '행정동', dongs, dong, setDong)}</View>

      <Text style={styles.label}>방문지 검색</Text>
      <TextInput style={styles.dateInput} value={search} onChangeText={setSearch} placeholder="방문지명 또는 주소" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={styles.label}>보고서 작성 기간</Text>{personalArchive && <TouchableOpacity style={{ minHeight: 36, justifyContent: 'center' }} onPress={() => { setStartDate(''); setEndDate(''); setSelectedPlace(null); }}><Text style={{ color: colors.primary, fontSize: 12 }}>전체 기간</Text></TouchableOpacity>}</View>
      <View style={styles.dateRow}>
        {['start', 'end'].map((side, index) => <React.Fragment key={side}>
          {index > 0 && <Text style={styles.dateDash}>~</Text>}
          <TouchableOpacity style={styles.dateButton} onPress={() => { setOpenFilter(null); setDateSide(side); }} accessibilityLabel={side === 'start' ? '시작일' : '종료일'}>
            <Text style={styles.dateText}>{side === 'start' ? startDate || '시작일' : endDate || '종료일'}</Text>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </React.Fragment>)}
      </View>
      {embedded && selected && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TouchableOpacity style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => setSelectedPlace(null)}><Ionicons name="arrow-back" size={22} color={colors.primary} /></TouchableOpacity><Text style={[styles.title, { flex: 1 }]}>{selected.name}</Text></View>}
      {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.empty}>{error}</Text> : selected ?
        <View style={styles.dongGroup}>
          {selected.items.map((item) => <View key={item.progressId} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.title}>{String(item.createdAt || '').slice(0, 16).replace('T', ' ')}</Text>
              <Text style={styles.meta}>{statusLabel(item.progressStatus)} · {item.performedByName || '작업자 확인 불가'}{item.performedByDeparted ? ' (탈퇴한 사용자)' : ''}</Text>
              <Text style={styles.meta}>담당자: {item.assigneeName || '담당자 확인 불가'}{item.assigneeDeparted ? ' (탈퇴)' : ''}</Text>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
                <TouchableOpacity disabled={!canDownloadReport(item)} onPress={() => {
                  if (canDownloadReport(item)) onOpenReport(item);
                }} style={{ paddingVertical: 8 }}><Text style={{ color: canDownloadReport(item) ? colors.primary : colors.textSoft }}>HWPX 파일 열기</Text></TouchableOpacity>
                {Number(item.assigneeUserId) === Number(user.userId) && <TouchableOpacity onPress={() => onEditReport?.(item)} style={{ paddingVertical: 8 }}><Text style={{ color: colors.primary }}>보고서 수정</Text></TouchableOpacity>}
              </View>
              {!canDownloadReport(item) && <Text style={styles.meta}>작업 전 보고서는 다운로드할 수 없습니다.</Text>}
            </View>
          </View>)}
        </View> : places.length ? places.map((place) => <TouchableOpacity key={place.key} style={styles.card} onPress={() => setSelectedPlace(place.key)}>
          <Ionicons name="folder-outline" size={22} color={colors.primary} />
          <View style={styles.cardBody}><Text style={styles.title}>{place.name}</Text><Text style={styles.meta}>{String(place.items[0]?.createdAt || '').slice(0, 10)}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>) : <Text style={styles.empty}>조건에 맞는 보고서가 없습니다.</Text>}
    </ScrollView>
    <ReportDatePicker visible={!!dateSide} value={(dateSide === 'end' ? endDate : startDate) || currentMonthRange().start} title={dateSide === 'end' ? '종료일' : '시작일'} onClose={() => setDateSide(null)} onSelect={value => {
      const range = selectRangeDate(startDate, endDate, dateSide, value);
      setStartDate(range.start); setEndDate(range.end); setSelectedPlace(null);
    }} />
  </View>;
}

const styles = StyleSheet.create({
  filtersRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', zIndex: 20 },
  filterColumn: { flex: 1, minWidth: 0, gap: 7 },
  filterColumnOpen: { zIndex: 30 },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  filterValue: { flex: 1, color: colors.text, fontSize: 12 },
  filterOptions: { position: 'absolute', top: '100%', marginTop: 6, left: 0, right: 0, zIndex: 40, elevation: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface, overflow: 'hidden' },
  filterOption: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, gap: 6 },
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0 }, body: { padding: 14, paddingBottom: 24, gap: 7 },
  dongGroup: { gap: 8 }, dongGroupTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.surface, fontSize: 11 },
  dateButton: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  dateText: { fontSize: 11, color: colors.text },
  dateDash: { color: colors.textSoft }, card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cardBody: { flex: 1 }, title: { color: colors.text, fontWeight: '800', fontSize: 13 }, meta: { color: colors.textSoft, fontSize: 10, marginTop: 3 },
  empty: { color: colors.textSoft, textAlign: 'center', padding: 28 },
});
