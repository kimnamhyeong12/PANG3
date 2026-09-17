import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import KakaoMapWebView from '../components/KakaoMapWebView';
import { showAlert } from '../components/CustomAlert';
import { groupApi } from '../utils/groupApi';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const CATEGORIES = [
  { key: 'tree', label: '가로수', icon: 'leaf-outline' },
  { key: 'manhole', label: '맨홀뚜껑', icon: 'disc-outline' },
  { key: 'bus', label: '버스정류장', icon: 'bus-outline' },
];

const OFFSETS = [
  [0.0002, 0.0001],
  [0.0012, 0.0011],
  [-0.001, 0.00135],
  [0.00115, -0.00115],
];

const getDongName = (name = '') => String(name).trim().split(/\s+/).pop() || '행정동';

const getRegionParts = (boundary, workSido) => {
  const fullName = String(boundary?.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const properties = boundary?.properties || {};
  return {
    sido: properties.sido_nm || parts[0] || workSido,
    sigungu: properties.sgg_nm || (parts.length >= 3 ? parts[parts.length - 2] : ''),
    adminDong: properties.adm_nm
      ? getDongName(properties.adm_nm)
      : getDongName(fullName),
  };
};

const createMockItems = (boundary, category, workSido) => {
  if (!boundary || !category) return [];
  const categoryInfo = CATEGORIES.find((item) => item.key === category);
  const region = getRegionParts(boundary, workSido);
  const baseLat = Number(boundary.latitude);
  const baseLng = Number(boundary.longitude);

  return OFFSETS.slice(0, 3).map(([latOffset, lngOffset], index) => ({
    id: `public-${category}-${region.adminDong}-${index + 1}`,
    detailAddress: `${region.adminDong} ${categoryInfo?.label || '공공시설'} ${index + 1}`,
    roadAddress: `${region.sido} ${region.sigungu} ${region.adminDong} 공공시설 ${index + 1}`
      .replace(/\s+/g, ' ')
      .trim(),
    lat: baseLat + latOffset,
    lng: baseLng + lngOffset,
    task: categoryInfo?.label || '',
    status: 'pending',
    markerColor: '#2477F3',
    ...region,
  }));
};

export default function PublicDataMapMode({
  user,
  activeGroup,
  onBack,
  onDataChanged,
}) {
  const workSido = user?.workSido || '부산광역시';
  const [boundaries, setBoundaries] = useState(null);
  const [boundaryLoading, setBoundaryLoading] = useState(true);
  const [boundaryError, setBoundaryError] = useState('');
  const [renderedBoundaryCount, setRenderedBoundaryCount] = useState(null);
  const [selectedBoundary, setSelectedBoundary] = useState(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [members, setMembers] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);
  const isLeader = activeGroup?.role === 'LEADER' ||
    members.some((member) => Number(member.userId) === Number(user?.userId) && member.role === 'LEADER');
  const assignableMembers = isLeader
    ? members
    : members.filter((member) => Number(member.userId) === Number(user?.userId));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBoundaryLoading(true);
        setBoundaryError('');
        const response = await fetch(
          `${API_BASE_URL}/api/sgis/boundaries/by-sido?sido=${encodeURIComponent(workSido)}`
        );
        const text = await response.text();
        if (!response.ok) throw new Error(text || 'SGIS 행정동 경계 조회 실패');
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed?.features) || parsed.features.length === 0) {
          throw new Error(`${workSido} 행정동 경계 데이터가 비어 있습니다.`);
        }
        if (!cancelled) {
          setRenderedBoundaryCount(null);
          setBoundaries(parsed);
        }
      } catch (error) {
        if (!cancelled) {
          setBoundaryError(error.message || '행정동 경계를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setBoundaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workSido]);

  useEffect(() => {
    let cancelled = false;
    if (!activeGroup?.groupId || !user?.userId) return undefined;
    groupApi(`/api/groups/${activeGroup.groupId}/members?userId=${user.userId}`)
      .then((data) => {
        if (!cancelled) setMembers(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!cancelled) showAlert('팀원 조회 실패', error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeGroup?.groupId, user?.userId]);

  useEffect(() => {
    setCategory('');
    setSelectedIds([]);
    setAssigneeId('');
    setCategoryMenuOpen(false);
  }, [selectedBoundary?.name]);

  useEffect(() => {
    setSelectedIds([]);
  }, [category]);

  const publicItems = useMemo(
    () => createMockItems(selectedBoundary, category, workSido),
    [selectedBoundary, category, workSido]
  );

  const mapItems = useMemo(
    () => publicItems.map((item) => ({
      ...item,
      markerColor: selectedIds.includes(item.id) ? '#0F9D82' : '#2477F3',
    })),
    [publicItems, selectedIds]
  );

  const toggleItem = (item) => {
    setSelectedIds((previous) =>
      previous.includes(item.id)
        ? previous.filter((id) => id !== item.id)
        : [...previous, item.id]
    );
  };

  const assignSelectedItems = async () => {
    if (!activeGroup?.groupId) {
      showAlert('그룹 선택 필요', '공공업무를 등록할 그룹을 먼저 선택하세요.');
      return;
    }
    if (!selectedIds.length) {
      showAlert('시설 선택 필요', '지도나 목록에서 시설을 선택하세요.');
      return;
    }
    if (!assigneeId) {
      showAlert('담당자 선택 필요', '업무를 배정할 팀원을 선택하세요.');
      return;
    }

    try {
      setSaving(true);
      const selected = publicItems.filter((item) => selectedIds.includes(item.id));

      for (const item of selected) {
        const createResponse = await fetch(`${API_BASE_URL}/api/locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            detailAddress: item.detailAddress,
            roadAddress: item.roadAddress,
            lat: item.lat,
            lng: item.lng,
            taskCategory: item.task,
            status: 'pending',
            sido: item.sido,
            sigungu: item.sigungu,
            adminDong: item.adminDong,
            createdByUserId: user.userId,
            groupId: activeGroup.groupId,
          }),
        });
        const createText = await createResponse.text();
        if (!createResponse.ok) throw new Error(createText || '공공업무 등록 실패');
        const saved = JSON.parse(createText);
        const taskId = saved.id ?? saved.taskId ?? saved.task_id;

        if (isLeader) {
          await groupApi(`/api/groups/${activeGroup.groupId}/assignments/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({
              leaderUserId: user.userId,
              assigneeUserId: Number(assigneeId),
            }),
          });
        }
      }

      const assignee = members.find((member) => String(member.userId) === assigneeId);
      showAlert(
        '공공업무 배정 완료',
        `${getDongName(selectedBoundary?.name)} ${selected.length}건을 ${assignee?.name || assignee?.loginId || '담당자'}에게 배정했습니다.`
      );
      setSelectedIds([]);
      setAssigneeId('');
      onDataChanged?.();
    } catch (error) {
      showAlert('공공업무 배정 실패', error.message || '등록 중 문제가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const categoryInfo = CATEGORIES.find((item) => item.key === category);
  const dongName = getDongName(selectedBoundary?.name);

  return (
    <View style={styles.container}>
      <KakaoMapWebView
        locations={mapItems}
        boundaries={boundaries}
        panelOpen={false}
        setPanelOpen={() => {}}
        directMarkerPress
        onBoundaryClick={setSelectedBoundary}
        onBoundaryReady={setRenderedBoundaryCount}
        onMarkerClick={toggleItem}
        onLocationsChange={() => {}}
      />

      <View style={styles.topOverlay}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="chevron-back" size={21} color="#10285B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selector}
            activeOpacity={0.9}
            onPress={() => {
              if (!selectedBoundary) {
                showAlert('행정동 선택', '지도에서 행정동 경계를 먼저 누르세요.');
                return;
              }
              setCategoryMenuOpen((value) => !value);
            }}
          >
            <Ionicons
              name={categoryInfo?.icon || 'layers-outline'}
              size={18}
              color="#2477F3"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectorText} numberOfLines={1}>
                {!selectedBoundary
                  ? '행정동을 먼저 선택해주세요'
                  : categoryInfo?.label || '공공데이터 카테고리를 선택해주세요'}
              </Text>
              {selectedBoundary ? (
                <Text style={styles.selectorSub}>{workSido} · {dongName}</Text>
              ) : null}
            </View>
            <Ionicons
              name={categoryMenuOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#10285B"
            />
          </TouchableOpacity>
        </View>

        {categoryMenuOpen ? (
          <View style={styles.categoryMenu}>
            {CATEGORIES.map((item, index) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.categoryRow, index === CATEGORIES.length - 1 && styles.categoryLast]}
                onPress={() => {
                  setCategory(item.key);
                  setCategoryMenuOpen(false);
                }}
              >
                <View style={styles.categoryIcon}>
                  <Ionicons name={item.icon} size={19} color="#2477F3" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryTitle}>{item.label}</Text>
                  <Text style={styles.categoryDesc}>{dongName}의 {item.label}만 지도에 표시</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color="#8A98A8" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {boundaryLoading || (boundaries && renderedBoundaryCount === null) ? (
          <View style={styles.notice}>
            <ActivityIndicator size="small" color="#2477F3" />
            <Text style={styles.noticeText}>{workSido} 행정동 경계를 지도에 표시하는 중...</Text>
          </View>
        ) : boundaryError || renderedBoundaryCount === 0 ? (
          <View style={[styles.notice, styles.errorNotice]}>
            <Ionicons name="alert-circle-outline" size={16} color="#C43D4B" />
            <Text style={styles.errorText}>{boundaryError || '행정동 경계를 지도에 표시하지 못했습니다.'}</Text>
          </View>
        ) : !selectedBoundary ? (
          <View style={styles.notice}>
            <Ionicons name="map-outline" size={16} color="#2477F3" />
            <Text style={styles.noticeText}>{renderedBoundaryCount}개 행정동 · 경계를 누르면 확대됩니다.</Text>
          </View>
        ) : null}
      </View>

      {selectedBoundary && category ? (
        <View style={styles.bottomSheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{dongName} · {categoryInfo?.label}</Text>
              <Text style={styles.sheetSub}>시설 {publicItems.length}건 · 선택 {selectedIds.length}건</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedIds(
                selectedIds.length === publicItems.length
                  ? []
                  : publicItems.map((item) => item.id)
              )}
            >
              <Text style={styles.selectAll}>
                {selectedIds.length === publicItems.length ? '전체 해제' : '전체 선택'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.itemList} nestedScrollEnabled>
            {publicItems.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <TouchableOpacity key={item.id} style={styles.itemRow} onPress={() => toggleItem(item)}>
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.detailAddress}</Text>
                    <Text style={styles.itemAddress} numberOfLines={1}>{item.roadAddress}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.memberLabel}>담당자 선택</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
            {assignableMembers.map((member) => {
              const active = assigneeId === String(member.userId);
              return (
                <TouchableOpacity
                  key={member.userId}
                  style={[styles.memberChip, active && styles.memberChipActive]}
                  onPress={() => setAssigneeId(String(member.userId))}
                >
                  <Text style={[styles.memberText, active && styles.memberTextActive]}>
                    {member.name || member.loginId}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.assignButton, (!selectedIds.length || !assigneeId || saving) && styles.disabledButton]}
            disabled={!selectedIds.length || !assigneeId || saving}
            onPress={assignSelectedItems}
          >
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />}
            <Text style={styles.assignText}>{saving ? '등록 중...' : `선택한 ${selectedIds.length}건 업무로 배정`}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF5FC' },
  topOverlay: { position: 'absolute', top: 12, left: 14, right: 14, gap: 8 },
  topRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#10285B', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  selector: { flex: 1, minHeight: 48, borderRadius: 15, paddingHorizontal: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#10285B', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  selectorText: { color: '#10285B', fontSize: 13, fontWeight: '800' },
  selectorSub: { color: '#718096', fontSize: 9, fontWeight: '600', marginTop: 2 },
  categoryMenu: { marginLeft: 50, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, shadowColor: '#10285B', shadowOpacity: 0.14, shadowRadius: 10, elevation: 6 },
  categoryRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#E4EBF3' },
  categoryLast: { borderBottomWidth: 0 },
  categoryIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { color: '#10285B', fontSize: 12, fontWeight: '900' },
  categoryDesc: { color: '#718096', fontSize: 9, marginTop: 3 },
  notice: { alignSelf: 'center', minHeight: 34, borderRadius: 17, paddingHorizontal: 13, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', gap: 7, shadowColor: '#10285B', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  noticeText: { color: '#50627A', fontSize: 10, fontWeight: '700' },
  errorNotice: { borderWidth: 1, borderColor: '#F3CDD2' },
  errorText: { color: '#C43D4B', fontSize: 10, fontWeight: '700', flexShrink: 1 },
  bottomSheet: { position: 'absolute', left: 10, right: 10, bottom: 10, maxHeight: '52%', borderRadius: 22, padding: 15, paddingTop: 8, backgroundColor: '#FFFFFF', shadowColor: '#10285B', shadowOpacity: 0.2, shadowRadius: 14, elevation: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D9E2EC', alignSelf: 'center', marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  sheetTitle: { color: '#10285B', fontSize: 16, fontWeight: '900' },
  sheetSub: { color: '#718096', fontSize: 9, marginTop: 3 },
  selectAll: { color: '#2477F3', fontSize: 10, fontWeight: '900' },
  itemList: { maxHeight: 152 },
  itemRow: { minHeight: 49, borderTopWidth: 1, borderTopColor: '#E4EBF3', flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#A8B6C8', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#2477F3', borderColor: '#2477F3' },
  itemName: { color: '#10285B', fontSize: 11, fontWeight: '800' },
  itemAddress: { color: '#718096', fontSize: 8.5, marginTop: 2 },
  memberLabel: { color: '#10285B', fontSize: 11, fontWeight: '900', marginTop: 8 },
  memberRow: { gap: 6, paddingVertical: 7 },
  memberChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#EEF3F8' },
  memberChipActive: { backgroundColor: '#2477F3' },
  memberText: { color: '#50627A', fontSize: 10, fontWeight: '800' },
  memberTextActive: { color: '#FFFFFF' },
  assignButton: { minHeight: 44, borderRadius: 13, backgroundColor: '#2477F3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  disabledButton: { backgroundColor: '#A9B7C8' },
  assignText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
