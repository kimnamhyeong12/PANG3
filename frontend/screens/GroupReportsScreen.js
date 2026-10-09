import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

export default function GroupReportsScreen({ group, user, onBack, onOpenReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState('');
  const [dong, setDong] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    let active = true;
    groupApi(`/api/groups/${group.groupId}/reports?userId=${user.userId}`)
      .then((items) => { if (active) setReports(Array.isArray(items) ? items : []); })
      .catch((error) => showAlert('보고서 조회 실패', error.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group.groupId, user.userId]);

  const members = useMemo(() => Array.from(new Set(reports.map((item) => item.performedByName).filter(Boolean))), [reports]);
  const dongs = useMemo(() => Array.from(new Set(reports.map((item) => item.adminDong).filter(Boolean))), [reports]);
  const visible = useMemo(() => reports.filter((item) => {
    const day = String(item.createdAt || '').slice(0, 10);
    return (!member || item.performedByName === member)
      && (!dong || item.adminDong === dong)
      && (!startDate || day >= startDate)
      && (!endDate || day <= endDate);
  }), [reports, member, dong, startDate, endDate]);

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
    <ScreenHeader title="그룹 보고서" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.label}>작업자</Text>{filterRow(members, member, setMember)}
      <Text style={styles.label}>행정동</Text>{filterRow(dongs, dong, setDong)}
      <View style={styles.dateRow}>
        <TextInput style={styles.dateInput} value={startDate} onChangeText={setStartDate} placeholder="시작일 YYYY-MM-DD" />
        <Text style={styles.dateDash}>~</Text>
        <TextInput style={styles.dateInput} value={endDate} onChangeText={setEndDate} placeholder="종료일 YYYY-MM-DD" />
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : visible.length ? visible.map((item) =>
        <TouchableOpacity key={item.progressId} style={styles.card} onPress={() => onOpenReport(item)}>
          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
          <View style={styles.cardBody}>
            <Text style={styles.title}>{item.detailAddress || item.roadAddress || `방문지 ${item.taskId}`}</Text>
            <Text style={styles.meta}>{item.performedByName} · {item.adminDong || '행정동 미확인'} · {String(item.createdAt || '').slice(0, 10)}</Text>
          </View>
          <Ionicons name="download-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      ) : <Text style={styles.empty}>조건에 맞는 보고서가 없습니다.</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, body: { padding: 18, paddingBottom: 36, gap: 12 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' }, chips: { gap: 8, paddingBottom: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.textSoft, fontSize: 11 },
  selectedText: { color: '#fff', fontWeight: '800' }, dateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.surface, fontSize: 11 },
  dateDash: { color: colors.textSoft }, card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cardBody: { flex: 1 }, title: { color: colors.text, fontWeight: '800', fontSize: 13 }, meta: { color: colors.textSoft, fontSize: 10, marginTop: 5 },
  empty: { color: colors.textSoft, textAlign: 'center', padding: 28 },
});
