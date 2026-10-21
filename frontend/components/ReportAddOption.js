import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './CustomAlert';
import { colors, radius } from '../constants/design';
import { addSavedProgressToReport, fetchTaskProjectContext } from '../utils/projectApi';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// 작업 기록 화면의 "보고서에도 담기" 카드 (B②). 업무가 프로젝트에 속하고 초안 보고서가 있을 때만 보인다.
// onChange(target|null): 저장 후 담을 보고서 { reportId, title } — 체크 해제/작업완료 아님이면 null
export default function ReportAddOption({ user, taskId, status, onChange }) {
  const [drafts, setDrafts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!taskId || !user?.userId) return undefined;
    let alive = true;
    fetchTaskProjectContext(taskId, user.userId)
      .then((context) => {
        if (!alive) return;
        const list = context?.projectId && Array.isArray(context.draftReports) ? context.draftReports : [];
        setDrafts(list);
        setSelectedId(list[0]?.reportId ?? null);
        setChecked(list.length === 1);
      })
      .catch(() => { if (alive) setDrafts([]); }); // 부가 기능: 실패하면 카드만 숨긴다
    return () => { alive = false; };
  }, [taskId, user?.userId]);

  const complete = status === 'complete';
  const selected = drafts.find((report) => sameId(report.reportId, selectedId)) || null;

  useEffect(() => {
    onChange?.(checked && complete && selected ? { reportId: selected.reportId, title: selected.title } : null);
  }, [checked, complete, selected?.reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) return null;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.row}
        disabled={!complete}
        onPress={() => setChecked((value) => !value)}
        activeOpacity={0.75}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: checked && complete, disabled: !complete }}
      >
        <Ionicons
          name={checked && complete ? 'checkbox' : 'square-outline'}
          size={22}
          color={complete ? colors.primary : colors.textFaint}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, !complete && styles.muted]}>보고서에도 담기</Text>
          <Text style={styles.meta} numberOfLines={1}>{`${selected.title} (초안 · ${selected.itemCount ?? 0}건)`}</Text>
          {!complete ? <Text style={styles.note}>작업완료일 때 담을 수 있어요</Text> : null}
        </View>
      </TouchableOpacity>
      {drafts.length > 1 && complete ? (
        <TouchableOpacity style={styles.change} onPress={() => setPicking(true)}>
          <Text style={styles.changeText}>다른 보고서 고르기 ›</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>담을 보고서</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {drafts.map((report) => (
                <TouchableOpacity
                  key={String(report.reportId)}
                  style={styles.option}
                  onPress={() => { setSelectedId(report.reportId); setChecked(true); setPicking(false); }}
                >
                  <Text style={[styles.optionText, sameId(report.reportId, selectedId) && styles.optionSelected]} numberOfLines={1}>
                    {`${report.title} (${report.itemCount ?? 0}건)`}
                  </Text>
                  {sameId(report.reportId, selectedId) ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// 저장 성공 뒤에만 호출. 저장 결과에는 영향을 주지 않고, 실패 시 안내만 띄운다.
export function addToReportAfterSave(target, userId, progressId) {
  if (!target?.reportId || !progressId) return Promise.resolve();
  return addSavedProgressToReport(target.reportId, userId, progressId).then((result) => {
    if (!result.ok) showAlert('보고서에 담지 못했어요', `작업 기록은 저장되었습니다.\n${result.message}`);
  });
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: radius.medium, backgroundColor: colors.surfaceMuted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { color: colors.text, fontSize: 14, fontWeight: '900' },
  muted: { color: colors.textFaint },
  meta: { color: colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 3 },
  note: { color: colors.warningInk, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  change: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', marginTop: 4 },
  changeText: { color: colors.primary, fontSize: 12.5, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,40,91,0.35)' },
  sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, backgroundColor: colors.surface },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 46, borderBottomWidth: 1, borderBottomColor: colors.line },
  optionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  optionSelected: { color: colors.primary, fontWeight: '900' },
});
