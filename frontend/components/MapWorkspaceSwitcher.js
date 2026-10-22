import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

const personal = group => Boolean(group?.personalWorkspace || group?.personal || group?.workspaceType === 'PERSONAL');
const label = group => personal(group) || !group ? '개인 업무공간' : group.groupName;

export default function MapWorkspaceSwitcher({ userId, activeGroup, onSelect, dropdown = false }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const trigger = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [switching, setSwitching] = useState(false);
  const busy = useRef(false);
  const openSelector = () => {
    if (!dropdown) { setOpen(true); return; }
    trigger.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ left: Math.max(12, Math.min(x, window.width - 252)), top: y + height + 4 });
      setOpen(true);
    });
  };
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
    <TouchableOpacity ref={trigger} collapsable={false} style={[styles.badge, dropdown && styles.dropdownBadge]} onPress={openSelector} disabled={!onSelect || !userId}
      accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`사용 중인 그룹: ${label(activeGroup)}. 그룹 전환`}>
      <Ionicons name={personal(activeGroup) || !activeGroup ? 'person-outline' : 'people-outline'} size={dropdown ? 17 : 12} color={colors.text} />
      <Text style={[styles.name, dropdown && styles.dropdownName]} numberOfLines={1}>{label(activeGroup)}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={dropdown ? colors.text : colors.textSoft} />
    </TouchableOpacity>
    <Modal visible={open} transparent statusBarTranslucent={dropdown} animationType="fade" onRequestClose={() => { if (!busy.current) setOpen(false); }}>
      <View style={dropdown ? styles.dropdownBackdrop : styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="그룹 전환 닫기" onPress={() => { if (!busy.current) setOpen(false); }} />
        <View style={dropdown ? [styles.dropdown, anchor, { width: Math.min(240, window.width - 24), maxHeight: Math.max(80, Math.min(320, window.height - (anchor?.top || 0) - insets.bottom - 12)) }] : [styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {!dropdown && <View style={styles.heading}><Text style={styles.title}>그룹 전환</Text><TouchableOpacity disabled={switching} onPress={() => setOpen(false)} accessibilityLabel="닫기" style={styles.close}><Ionicons name="close" size={22} color={colors.text} /></TouchableOpacity></View>}
          {loading ? <ActivityIndicator style={{ padding: 20 }} color={colors.primary} /> : <ScrollView>
            {groups.map(group => {
              const selected = String(group.groupId) === String(activeGroup?.groupId);
              return <TouchableOpacity key={group.groupId} disabled={switching} onPress={() => select(group)} style={[styles.row, dropdown && styles.dropdownRow, dropdown && selected && styles.selectedRow]}
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
  dropdownBadge: { maxWidth: '60%', flexShrink: 1, minHeight: 36, paddingHorizontal: 8, gap: 5, borderRadius: 9, borderWidth: 1, borderColor: colors.text, backgroundColor: colors.surface },
  dropdownName: { fontSize: 11, fontWeight: '800' },
  dropdownBackdrop: { flex: 1 },
  dropdown: { position: 'absolute', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 4, elevation: 8, shadowColor: colors.text, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  dropdownRow: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 0, borderRadius: 8 },
  selectedRow: { backgroundColor: colors.primarySoft },
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
