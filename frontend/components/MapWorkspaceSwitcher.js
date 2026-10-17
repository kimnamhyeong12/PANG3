import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

const personal = group => Boolean(group?.personalWorkspace || group?.personal || group?.workspaceType === 'PERSONAL');
const label = group => personal(group) || !group ? '개인 업무공간' : group.groupName;

export default function MapWorkspaceSwitcher({ userId, activeGroup, onSelect }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [switching, setSwitching] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!open || !userId) return;
    let current = true;
    setGroups([]); setError(''); setLoading(true);
    groupApi(`/api/groups/user/${userId}`).then(rows => {
      if (current) setGroups(Array.isArray(rows) ? rows : []);
    }).catch(failure => { if (current) setError(failure.message || '그룹을 불러오지 못했습니다.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, userId, reload]);
  const select = async group => {
    if (busy.current) return;
    if (String(group.groupId) === String(activeGroup?.groupId)) { setOpen(false); return; }
    busy.current = true; setSwitching(true); setError('');
    try { await onSelect(group); setOpen(false); }
    catch (failure) { setError(failure.message || '그룹을 전환하지 못했습니다.'); }
    finally { busy.current = false; setSwitching(false); }
  };
  return <>
    <TouchableOpacity style={styles.badge} onPress={() => setOpen(true)} disabled={!onSelect || !userId}
      accessibilityRole="button" accessibilityLabel={`사용 중인 그룹: ${label(activeGroup)}. 그룹 전환`}>
      <Ionicons name={personal(activeGroup) || !activeGroup ? 'person-outline' : 'people-outline'} size={12} color={colors.text} />
      <Text style={styles.name} numberOfLines={1}>{label(activeGroup)}</Text>
      <Ionicons name="chevron-down" size={12} color={colors.textSoft} />
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy.current) setOpen(false); }}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="그룹 전환 닫기" onPress={() => { if (!busy.current) setOpen(false); }} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.heading}><Text style={styles.title}>그룹 전환</Text><TouchableOpacity disabled={switching} onPress={() => setOpen(false)} accessibilityLabel="닫기" style={styles.close}><Ionicons name="close" size={22} color={colors.text} /></TouchableOpacity></View>
          {loading ? <ActivityIndicator style={{ padding: 20 }} color={colors.primary} /> : <ScrollView>
            {groups.map(group => {
              const selected = String(group.groupId) === String(activeGroup?.groupId);
              return <TouchableOpacity key={group.groupId} disabled={switching} onPress={() => select(group)} style={styles.row}
                accessibilityRole="button" accessibilityState={{ selected, disabled: switching }}>
                <Ionicons name={personal(group) ? 'person-outline' : 'people-outline'} size={20} color={colors.text} />
                <Text style={[styles.rowText, selected && { color: colors.primary }]}>{label(group)}</Text>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>;
            })}
            {!error && !groups.length && <Text style={styles.notice}>전환할 그룹이 없습니다.</Text>}
          </ScrollView>}
          {!!error && <Text style={styles.notice}>{error}</Text>}
          {!!error && !switching && <TouchableOpacity style={styles.close} onPress={() => setReload(value => value + 1)}><Text style={{ color: colors.primary }}>다시 불러오기</Text></TouchableOpacity>}
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#FFFFFFF2', maxWidth: '75%' },
  name: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10213D66' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, maxHeight: '65%' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  notice: { color: colors.textSoft, paddingVertical: 16, fontSize: 12 },
});
