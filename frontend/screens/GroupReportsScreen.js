import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';
import { groupReportsByPlace } from '../utils/reportPhotos';
import { canDownloadReport } from '../utils/reportAvailability';

const dongName = (value) => String(value || '').trim().split(/\s+/).pop().replace(/제(?=\d+동$)/, '') || '행정동 미확인';

export default function GroupReportsScreen({ group, user, selectedDong, onBack, onOpenReport, onEditReport, isActive = true }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState('');
  const [dong, setDong] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isActive || !selectedPlace) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setSelectedPlace(null); return true; });
    return () => subscription.remove();
  }, [isActive, selectedPlace]);

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

  const members = useMemo(() => Array.from(new Set(reports.map((item) => item.performedByName).filter(Boolean))), [reports]);
  const dongs = useMemo(() => Array.from(new Set(reports.map((item) => item.adminDong).filter(Boolean))), [reports]);
  const visible = useMemo(() => reports.filter((item) => {
    const day = String(item.createdAt || '').slice(0, 10);
    return (!member || item.performedByName === member)
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

  const filterRow = (values, selected, setSelected) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {['전체', ...values].map((value) => {
        const actual = value === '전체' ? '' : value;
        return <TouchableOpacity key={value} style={[styles.chip, selected === actual && styles.selected]} onPress={() => setSelected(actual)}>
          <Text style={[styles.chipText, selected === actual && styles.selectedText]}>{value}</Text>
        </TouchableOpacity>;
      })}
    </ScrollView>
  );

  return <View style={styles.container}>
    <ScreenHeader title={selected ? selected.name : '그룹 보고서 모아보기'} onBack={selected ? () => setSelectedPlace(null) : onBack} />
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.label}>작업자</Text>{filterRow(members, member, setMember)}
      <Text style={styles.label}>행정동</Text>{filterRow(dongs, dong, setDong)}
      <TextInput style={styles.dateInput} value={search} onChangeText={setSearch} placeholder="방문지명 또는 주소 검색" />
      <View style={styles.dateRow}>
        <TextInput style={styles.dateInput} value={startDate} onChangeText={setStartDate} placeholder="시작일 YYYY-MM-DD" />
        <Text style={styles.dateDash}>~</Text>
        <TextInput style={styles.dateInput} value={endDate} onChangeText={setEndDate} placeholder="종료일 YYYY-MM-DD" />
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.empty}>{error}</Text> : selected ?
        <View style={styles.dongGroup}>
          <Text style={styles.dongGroupTitle}>보고서 총 {selected.items.length}건</Text>
          {selected.items.map((item) => <View key={item.progressId} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.title}>{String(item.createdAt || '').slice(0, 16).replace('T', ' ')}</Text>
              <Text style={styles.meta}>{statusLabel(item.progressStatus)} · {item.performedByName || '작업자 확인 불가'}</Text>
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
          <View style={styles.cardBody}><Text style={styles.title}>{place.name}</Text><Text style={styles.meta}>보고서 총 {place.items.length}건 · 최근 {String(place.items[0]?.createdAt || '').slice(0, 10)}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>) : <Text style={styles.empty}>조건에 맞는 보고서가 없습니다.</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, body: { padding: 18, paddingBottom: 36, gap: 12 },
  dongGroup: { gap: 8 }, dongGroupTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' }, chips: { gap: 8, paddingBottom: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textSoft, fontSize: 11 },
  selectedText: { color: '#fff', fontWeight: '800' }, dateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.surface, fontSize: 11 },
  dateDash: { color: colors.textSoft }, card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cardBody: { flex: 1 }, title: { color: colors.text, fontWeight: '800', fontSize: 13 }, meta: { color: colors.textSoft, fontSize: 10, marginTop: 5 },
  empty: { color: colors.textSoft, textAlign: 'center', padding: 28 },
});
