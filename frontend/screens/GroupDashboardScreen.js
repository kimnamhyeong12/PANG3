import React, { useEffect, useMemo, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, shadow } from '../constants/design';
import { completionDayKey, koreaDayKey } from '../utils/completionDay';

const isComplete = (item) =>
  ['complete', 'completed', 'done'].includes(
    String(item.status ?? item.taskStatus ?? item.task_status ?? '').toLowerCase()
  );
const isWorking = (item) =>
  ['working', 'progress', 'in_progress'].includes(
    String(item.status ?? item.taskStatus ?? item.task_status ?? '').toLowerCase()
  );

export default function GroupDashboardScreen({ assignments = [], group }) {
  const [today, setToday] = useState(() => koreaDayKey());

  useEffect(() => {
    const updateToday = () => setToday(koreaDayKey());
    const timer = setInterval(updateToday, 60 * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateToday();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  const stats = useMemo(() => {
    const rows = Array.isArray(assignments) ? assignments : [];
    const month = today.slice(0, 7);
    const completed = rows.filter(isComplete);
    const members = new Map();

    rows.forEach((item) => {
      const id = String(item.assigneeUserId ?? 'unknown');
      const current = members.get(id) || {
        id,
        name: item.assigneeName || item.assigneeLoginId || '담당자 미지정',
        total: 0,
        working: 0,
        complete: 0,
      };
      current.total += 1;
      if (isWorking(item)) current.working += 1;
      if (isComplete(item)) current.complete += 1;
      members.set(id, current);
    });

    return {
      total: rows.length,
      working: rows.filter(isWorking).length,
      complete: completed.length,
      today: completed.filter((item) => completionDayKey(item) === today).length,
      month: completed.filter((item) => completionDayKey(item)?.startsWith(month)).length,
      members: Array.from(members.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    };
  }, [assignments, today]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>{group?.groupName || '그룹'} 누적 업무</Text>

      <View style={styles.summaryGrid}>
        <Stat label="전체 방문지" value={stats.total} />
        <Stat label="작업 중" value={stats.working} />
        <Stat label="누적 완료" value={stats.complete} />
        <Stat label="이번 달 완료" value={stats.month} />
        <Stat label="오늘 완료" value={stats.today} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>팀원별 누적 현황</Text>
        {stats.members.length === 0 ? (
          <Text style={styles.empty}>등록된 업무가 없습니다.</Text>
        ) : stats.members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberCount}>{member.total}곳 · 작업 중 {member.working}곳 · 완료 {member.complete}곳</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}건</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { padding: 14, paddingBottom: 36, gap: 14 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '900' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', flexGrow: 1, padding: 16, borderRadius: 16, backgroundColor: colors.surface, ...shadow },
  statLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  statValue: { color: colors.primary, fontSize: 22, fontWeight: '900', marginTop: 8 },
  card: { padding: 16, borderRadius: 18, backgroundColor: colors.surface, ...shadow },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 8 },
  empty: { color: colors.textSoft, fontSize: 12, paddingVertical: 16 },
  memberRow: { minHeight: 45, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  memberName: { color: colors.text, fontSize: 13, fontWeight: '800', flex: 1 },
  memberCount: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
});
