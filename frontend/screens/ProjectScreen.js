import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, PrimaryButton, ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { colors, radius, shadow, spacing } from '../constants/design';
import {
  addReportItems,
  addedCount,
  addedIds,
  fetchProject,
  fetchProjectItems,
  fetchProjectReports,
  fetchProjects,
  removeReportItem,
  skippedMessage,
} from '../utils/projectApi';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const dateText = (value) => (value ? String(value).slice(0, 10) : '');

// ---------- 그룹 작업공간 "프로젝트" 탭 내용 (B①) ----------
export function GroupProjectList({ user, group, onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;
    try {
      const data = await fetchProjects(group.groupId, user.userId);
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      showAlert('프로젝트 조회 실패', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [group?.groupId, user?.userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.listBody}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {projects.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="프로젝트가 없어요" description="프로젝트는 PC 웹에서 리더가 만들 수 있어요." />
      ) : projects.map((project) => (
        <TouchableOpacity
          key={project.projectId}
          style={styles.projectCard}
          activeOpacity={0.8}
          onPress={() => onOpenProject?.(project)}
        >
          <View style={styles.projectIcon}><Ionicons name="folder-outline" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
            <Text style={styles.projectMeta}>완료 {project.completedCount ?? 0}건</Text>
            <Text style={styles.projectDraft} numberOfLines={1}>
              {[project.finalReportCount ? `✅ 확정 보고서 ${project.finalReportCount}개` : null,
                project.latestDraft ? `📄 ${project.latestDraft.title} · 작성 중` : null].filter(Boolean).join('  ') || '보고서 없음'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ---------- 프로젝트 항목 + 담기 (B③) ----------
const FILTERS = [
  { key: 'year', label: '연도' },
  { key: 'adminDong', label: '행정동' },
  { key: 'authorId', label: '작업자' },
  { key: 'category', label: '업무유형' },
];

export default function ProjectScreen({ user, projectId, initialProject, onBack, onOpenReport }) {
  const [project, setProject] = useState(initialProject || null);
  const [data, setData] = useState(null);
  const [reportCounts, setReportCounts] = useState({});
  const [finals, setFinals] = useState([]); // 앱에서는 확정 보고서만 보고 받는다 (D30)
  const [filters, setFilters] = useState({});
  const [mineOnly, setMineOnly] = useState(null); // null = 프로젝트 권한 확인 전
  const [targetId, setTargetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [picker, setPicker] = useState(null); // 'report' | filter key
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const userId = user?.userId;
  const isLeader = Boolean(project?.isLeader);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!projectId || !userId) return;
    let alive = true;
    fetchProject(projectId, userId)
      .then((value) => {
        if (!alive) return;
        setProject(value);
        setMineOnly(!value?.isLeader); // D20: 멤버 기본 ON, 리더 기본 OFF
      })
      .catch((error) => {
        if (!alive) return;
        setMineOnly(true);
        showAlert('프로젝트 조회 실패', error.message);
      });
    return () => { alive = false; };
  }, [projectId, userId]);

  const loadReports = useCallback(async () => {
    try {
      const list = await fetchProjectReports(projectId, userId);
      if (!mounted.current) return;
      const counts = {};
      (Array.isArray(list) ? list : []).forEach((report) => { counts[report.reportId] = report.itemCount ?? 0; });
      setReportCounts(counts);
      // 같은 보고서의 여러 확정 버전 중 가장 최신만
      const latest = new Map();
      (Array.isArray(list) ? list : []).filter((report) => report.status === 'FINAL').forEach((report) => {
        const root = String(report.rootReportId ?? report.reportId);
        if (!latest.has(root) || (report.version ?? 1) > (latest.get(root).version ?? 1)) latest.set(root, report);
      });
      setFinals([...latest.values()]);
    } catch {
      // 건수 표시는 보조 정보라 실패해도 화면은 그대로 쓴다
    }
  }, [projectId, userId]);

  const loadItems = useCallback(async () => {
    if (mineOnly === null) return;
    try {
      setLoading(true);
      const query = { ...filters, authorId: mineOnly ? userId : filters.authorId };
      const result = await fetchProjectItems(projectId, userId, query);
      if (!mounted.current) return;
      setData(result);
      const drafts = result?.draftReports || [];
      setTargetId((current) => (drafts.some((report) => sameId(report.reportId, current)) ? current : drafts[0]?.reportId ?? null));
    } catch (error) {
      if (mounted.current) showAlert('항목 조회 실패', error.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId, userId, filters, mineOnly]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { if (projectId && userId) loadReports(); }, [loadReports]);

  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const drafts = data?.draftReports || [];
  const target = drafts.find((report) => sameId(report.reportId, targetId)) || null;
  const inTarget = (item) => Boolean(target) && (item.inReportIds || []).some((id) => sameId(id, target.reportId));
  const addable = items.filter((item) => !inTarget(item));

  const markItems = (ids, reportId, added) => {
    const set = new Set(ids.map(String));
    setData((current) => current && ({
      ...current,
      items: current.items.map((item) => {
        if (!set.has(String(item.progressId))) return item;
        const others = (item.inReportIds || []).filter((id) => !sameId(id, reportId));
        return { ...item, inReportIds: added ? [...others, reportId] : others };
      }),
    }));
    setReportCounts((current) => ({ ...current, [reportId]: Math.max(0, (current[reportId] ?? 0) + (added ? ids.length : -ids.length)) }));
  };

  const showToast = (value) => {
    clearTimeout(toastTimer.current);
    setToast(value);
    toastTimer.current = setTimeout(() => setToast(null), value.undoIds ? 4000 : 2500);
  };

  const addItems = async (progressIds) => {
    if (!target || inFlight.current || progressIds.length === 0) return;
    inFlight.current = true; // 연속 탭 무시 (setState 반영 전 두 번째 탭 방지)
    const report = target;
    try {
      setAdding(true);
      const result = await addReportItems(report.reportId, userId, progressIds);
      if (!mounted.current) return;
      const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
      const skippedSet = new Set(skipped.map((row) => String(row.progressId)));
      const ids = addedIds(result).length ? addedIds(result) : progressIds.filter((id) => !skippedSet.has(String(id)));
      // 이미 담김으로 건너뛴 것도 화면에는 담김으로 표시
      const already = skipped.filter((row) => row.reason === 'ALREADY_IN_REPORT').map((row) => row.progressId);
      if (ids.length) markItems(ids, report.reportId, true);
      if (already.length) {
        const set = new Set(already.map(String));
        setData((current) => current && ({
          ...current,
          items: current.items.map((item) => (set.has(String(item.progressId)) && !(item.inReportIds || []).some((id) => sameId(id, report.reportId))
            ? { ...item, inReportIds: [...(item.inReportIds || []), report.reportId] } : item)),
        }));
      }
      if (addedCount(result) > 0 || ids.length > 0) {
        showToast({ text: `${report.title}에 담았어요`, reportId: report.reportId, undoIds: isLeader ? ids : null });
      }
      if (skipped.length) showAlert('일부 항목을 담지 못했어요', skippedMessage(skipped));
    } catch (error) {
      if (mounted.current) showAlert('담기 실패', error.message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setAdding(false);
    }
  };

  const undo = async () => {
    const current = toast;
    if (!current?.undoIds?.length || inFlight.current) return;
    inFlight.current = true;
    clearTimeout(toastTimer.current);
    setToast(null);
    const removed = [];
    try {
      for (const id of current.undoIds) {
        await removeReportItem(current.reportId, id, userId);
        removed.push(id);
      }
    } catch (error) {
      if (mounted.current) showAlert('되돌리기 실패', error.message);
    } finally {
      inFlight.current = false;
      if (mounted.current && removed.length) markItems(removed, current.reportId, false);
    }
  };

  const addAll = () => {
    if (!target || addable.length === 0) return;
    showAlert('모두 담기', `보이는 ${addable.length}건을 "${target.title}"에 담을까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '담기', onPress: () => addItems(addable.map((item) => item.progressId)) },
    ]);
  };

  const filterOptions = (key) => {
    const source = data?.filters || {};
    if (key === 'year') return (source.years || []).map((value) => ({ value, label: `${value}년` }));
    if (key === 'adminDong') return (source.adminDongs || []).map((value) => ({ value, label: value }));
    if (key === 'category') return (source.categories || []).map((value) => ({ value, label: value }));
    if (key === 'authorId') return (source.authors || []).map((author) => ({ value: author.userId, label: author.name || `사용자 ${author.userId}` }));
    return [];
  };

  const filterLabel = (key) => {
    const value = filters[key];
    if (key === 'authorId' && mineOnly) return '작업자';
    if (value == null || value === '') return FILTERS.find((row) => row.key === key).label;
    return filterOptions(key).find((option) => sameId(option.value, value))?.label || String(value);
  };

  const choose = (key, value) => {
    setPicker(null);
    if (key === 'report') { setTargetId(value); return; }
    if (key === 'authorId' && value != null) setMineOnly(false);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const pickerOptions = picker === 'report'
    ? drafts.map((report) => ({ value: report.reportId, label: report.title }))
    : picker ? [{ value: null, label: '전체' }, ...filterOptions(picker)] : [];
  const pickerSelected = picker === 'report' ? targetId : picker ? filters[picker] ?? null : null;

  const renderItem = ({ item }) => {
    const done = inTarget(item);
    const mine = sameId(item.authorId, userId);
    return (
      <View style={styles.itemCard}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemAddress} numberOfLines={2}>{item.address || '주소 없음'}</Text>
            {mine ? <View style={styles.mineBadge}><Text style={styles.mineBadgeText}>내 기록</Text></View> : null}
          </View>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {[dateText(item.completedAt), item.authorName].filter(Boolean).join(' · ')}
          </Text>
          {item.category || item.adminDong ? (
            <Text style={styles.itemSub} numberOfLines={1}>{[item.adminDong, item.category].filter(Boolean).join(' · ')}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.addButton, done && styles.addedButton, (!target || adding) && !done && styles.disabled]}
          disabled={done || !target || adding}
          onPress={() => addItems([item.progressId])}
          activeOpacity={0.8}
        >
          <Text style={[styles.addButtonText, done && styles.addedButtonText]}>{done ? '담김 ✓' : '+ 담기'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const header = (
    <View style={styles.headerBlock}>
      {target ? (
        <View style={styles.banner}>
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerText} numberOfLines={1}>
              {`담는 중: ${target.title} · ${reportCounts[target.reportId] ?? 0}건`}
            </Text>
            <Text style={styles.bannerHint}>작성 중인 보고서예요. 리더가 확정하면 아래 '확정 보고서'에서 보고 받을 수 있어요.</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.banner, styles.bannerEmpty]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textSoft} />
          <Text style={styles.bannerEmptyText}>담을 초안 보고서가 없어요. 보고서는 PC 웹에서 리더가 만들 수 있어요.</Text>
        </View>
      )}
      {finals.length > 0 ? (
        <View style={styles.finals}>
          <Text style={styles.finalsTitle}>확정 보고서</Text>
          {finals.map((report) => (
            <TouchableOpacity key={report.reportId} style={styles.finalRow} activeOpacity={0.8} onPress={() => onOpenReport?.(report)}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.finalText} numberOfLines={1}>
                {`${report.title}${(report.version ?? 1) > 1 ? ` (v${report.version})` : ''} · ${report.itemCount ?? 0}건`}
              </Text>
              <Text style={styles.bannerLink}>보기 · 받기 ›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {drafts.length > 1 ? (
        <TouchableOpacity style={styles.reportSelect} onPress={() => setPicker('report')} activeOpacity={0.8}>
          <Text style={styles.reportSelectText}>담을 보고서 바꾸기 ({drafts.length}개)</Text>
          <Ionicons name="chevron-down" size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, mineOnly && styles.chipActive]}
          onPress={() => {
            setMineOnly((value) => !value);
            setFilters((current) => ({ ...current, authorId: null }));
          }}
        >
          <Text style={[styles.chipText, mineOnly && styles.chipTextActive]}>내 작업만</Text>
        </TouchableOpacity>
        {FILTERS.map(({ key }) => {
          const active = filters[key] != null && filters[key] !== '' && !(key === 'authorId' && mineOnly);
          return (
            <TouchableOpacity key={key} style={[styles.chip, active && styles.chipActive]} onPress={() => setPicker(key)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{filterLabel(key)}</Text>
              <Ionicons name="chevron-down" size={13} color={active ? '#FFFFFF' : colors.textSoft} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {target && addable.length > 0 ? (
        <PrimaryButton title={`보이는 ${addable.length}건 모두 담기`} icon="add-circle-outline" onPress={addAll} disabled={adding} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={project?.name || '프로젝트'}
        subtitle={project ? `완료 ${project.completedCount ?? 0}건` : undefined}
        onBack={onBack}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.progressId)}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={loading
          ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          : <EmptyState icon="checkmark-done-outline" title="완료된 기록이 없어요" description={mineOnly ? '"내 작업만"을 끄면 팀 기록도 볼 수 있어요.' : '필터를 바꿔 보세요.'} />}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { loadItems(); loadReports(); }} />}
        contentContainerStyle={styles.listBody}
      />

      {toast ? (
        <View style={styles.toast} pointerEvents="box-none">
          <Text style={styles.toastText} numberOfLines={2}>{toast.text}</Text>
          {toast.undoIds?.length ? (
            <TouchableOpacity onPress={undo} style={styles.toastAction}><Text style={styles.toastActionText}>되돌리기</Text></TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {picker === 'report' ? '담을 보고서' : FILTERS.find((row) => row.key === picker)?.label}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {pickerOptions.map((option) => {
                const selected = option.value == null ? pickerSelected == null : sameId(option.value, pickerSelected);
                return (
                  <TouchableOpacity key={String(option.value)} style={styles.option} onPress={() => choose(picker, option.value)}>
                    <Text style={[styles.optionText, selected && styles.optionSelected]} numberOfLines={1}>{option.label}</Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
              {pickerOptions.length === 0 ? <Text style={styles.optionEmpty}>선택할 항목이 없어요</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
  listBody: { gap: 10, padding: spacing.page, paddingTop: 4, paddingBottom: 96 },
  projectCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.card, borderRadius: radius.medium, backgroundColor: colors.surfaceMuted },
  projectIcon: { width: 40, height: 40, borderRadius: radius.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  projectName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  projectMeta: { color: colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 },
  projectDraft: { color: colors.primaryDark, fontSize: 12, fontWeight: '700', marginTop: 4 },
  headerBlock: { gap: 10, marginBottom: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: radius.medium, backgroundColor: colors.primarySoft },
  bannerText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  bannerLink: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  bannerHint: { color: colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 2, lineHeight: 15 },
  finals: { gap: 6 },
  finalsTitle: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 4 },
  finalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  finalText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  bannerEmpty: { backgroundColor: colors.surfaceMuted },
  bannerEmptyText: { flex: 1, color: colors.textSoft, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  reportSelect: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 32 },
  reportSelectText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  chips: { gap: 6, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSoft, fontSize: 12.5, fontWeight: '800' },
  chipTextActive: { color: '#FFFFFF' },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  itemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  itemAddress: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  mineBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.tealSoft },
  mineBadgeText: { color: colors.tealDark, fontSize: 10.5, fontWeight: '900' },
  itemMeta: { color: colors.textSoft, fontSize: 12, fontWeight: '600', marginTop: 4 },
  itemSub: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  addButton: { minWidth: 72, minHeight: 38, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: radius.small, backgroundColor: colors.primary },
  addButtonText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  addedButton: { backgroundColor: colors.successSoft },
  addedButtonText: { color: colors.successInk },
  disabled: { opacity: 0.45 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.medium, backgroundColor: colors.text, ...shadow },
  toastText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  toastAction: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  toastActionText: { color: '#86B9FF', fontSize: 13, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,40,91,0.35)' },
  sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, backgroundColor: colors.surface },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 46, borderBottomWidth: 1, borderBottomColor: colors.line },
  optionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  optionSelected: { color: colors.primary, fontWeight: '900' },
  optionEmpty: { color: colors.textSoft, fontSize: 13, paddingVertical: 16, textAlign: 'center' },
});
