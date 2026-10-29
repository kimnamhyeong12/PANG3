import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PixelRatio, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useBackSwipe } from '../utils/screenBack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { calendarCells, currentMonthRange, shiftMonth } from '../utils/calendar';

const WHEEL_ROW = 44;
// Android truncates interval * density before multiplying by the row index.
// Absolute pixel-rounded offsets avoid accumulated drift in the year column.
const wheelOffset = index => PixelRatio.roundToNearestPixel(index * WHEEL_ROW);
function PeriodWheel({ label, items, value, onChange }) {
  const scroll = useRef(null);
  const initialOffset = useRef({ x: 0, y: wheelOffset(Math.max(0, items.indexOf(value))) });
  const scrollY = useRef(new Animated.Value(initialOffset.current.y)).current;
  const positioned = useRef(false);
  const selectedIndex = useRef(Math.max(0, items.indexOf(value)));
  // Native snapping owns movement. JS only records which row is nearest the center.
  const recordSelection = offset => {
    const index = Math.max(0, Math.min(items.length - 1, Math.round(offset / WHEEL_ROW)));
    if (selectedIndex.current !== index) {
      selectedIndex.current = index;
      onChange(items[index]);
    }
  };
  const choose = index => {
    scroll.current?.scrollTo({ y: wheelOffset(index), animated: true });
    recordSelection(index * WHEEL_ROW);
  };
  return <View style={styles.wheelColumn}>
    <Text style={styles.wheelLabel}>{label}</Text>
    <View style={styles.wheelWindow}>
      <View pointerEvents="none" style={styles.wheelHighlight} />
      <Animated.ScrollView ref={scroll} style={styles.wheelScroll} contentOffset={initialOffset.current} contentContainerStyle={styles.wheelContent}
        showsVerticalScrollIndicator={false} snapToOffsets={items.map((_, index) => wheelOffset(index))} snapToAlignment="start" decelerationRate="fast" nestedScrollEnabled
        bounces={false} overScrollMode="never" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
        onContentSizeChange={() => { if (!positioned.current) { positioned.current = true; scroll.current?.scrollTo({ y: initialOffset.current.y, animated: false }); } }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: event => recordSelection(event.nativeEvent.contentOffset.y) })} scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={event => recordSelection(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={event => recordSelection(event.nativeEvent.contentOffset.y)}
        accessibilityLabel={`${label} 선택`} accessibilityRole="adjustable" accessibilityValue={{ min: items[0], max: items[items.length - 1], now: value, text: `${value}${label}` }}
        accessibilityActions={[{ name: 'increment', label: `다음 ${label}` }, { name: 'decrement', label: `이전 ${label}` }]}
        onAccessibilityAction={event => {
          const offset = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          const index = Math.max(0, Math.min(items.length - 1, items.indexOf(value) + offset));
          choose(index);
        }}>
        {items.map((item, index) => <TouchableOpacity key={item} accessibilityRole="button" accessibilityLabel={`${item}${label}`} accessibilityState={{ selected: item === value }} style={styles.wheelRow}
          onPress={() => choose(index)}>
          <Animated.Text style={[styles.wheelText, item === value && styles.wheelSelectedText, {
            transform: [{ scale: scrollY.interpolate({ inputRange: [(index - 2) * WHEEL_ROW, (index - 1) * WHEEL_ROW, index * WHEEL_ROW, (index + 1) * WHEEL_ROW, (index + 2) * WHEEL_ROW], outputRange: [0.64, 0.82, 1, 0.82, 0.64], extrapolate: 'clamp' }) }],
            opacity: scrollY.interpolate({ inputRange: [(index - 2) * WHEEL_ROW, index * WHEEL_ROW, (index + 2) * WHEEL_ROW], outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' }),
          }]}>{item}{label}</Animated.Text>
        </TouchableOpacity>)}
      </Animated.ScrollView>
    </View>
  </View>;
}

export default function ReportDatePicker({ visible, value, title, onSelect, onClose }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const [mode, setMode] = useState('days');
  const [draftYear, setDraftYear] = useState(Number(month.slice(0, 4)));
  const [draftMonth, setDraftMonth] = useState(Number(month.slice(5)));
  useEffect(() => { if (visible) { const initial = value.slice(0, 7) || currentMonthRange().start.slice(0, 7); setMonth(initial); setDraftYear(Number(initial.slice(0, 4))); setDraftMonth(Number(initial.slice(5))); setMode('days'); } }, [visible, value]);
  const year = Number(month.slice(0, 4));
  const firstYear = Math.min(1900, Number(value.slice(0, 4)) || year);
  const lastYear = Math.max(new Date().getFullYear() + 100, Number(value.slice(0, 4)) || year);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const openPeriod = () => { setDraftYear(year); setDraftMonth(Number(month.slice(5))); setMode('period'); };

  const goBack = () => mode === 'days' ? onClose() : setMode('days');
  const backSwipe = useBackSwipe(goBack, visible);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={goBack}>
    <View {...backSwipe} style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="달력 닫기" />
      <View style={styles.sheet}>
        <View style={styles.heading}><Text style={styles.title}>{title}</Text><TouchableOpacity onPress={onClose} style={styles.control} accessibilityLabel="닫기"><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity></View>
        {mode === 'period' ? <>
          <View style={styles.wheels}>
            <PeriodWheel label="년" items={years} value={draftYear} onChange={setDraftYear} />
            <PeriodWheel label="월" items={Array.from({ length: 12 }, (_, index) => index + 1)} value={draftMonth} onChange={setDraftMonth} />
          </View>
          <View style={styles.periodActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="년월 선택 취소" style={styles.periodCancel} onPress={() => setMode('days')}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="년월 선택 확인" style={styles.periodConfirm} onPress={() => { setMonth(`${draftYear}-${String(draftMonth).padStart(2, '0')}`); setMode('days'); }}><Text style={styles.confirmText}>확인</Text></TouchableOpacity>
          </View>
        </> : <>
          <View style={styles.monthToolbar}>
            <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.control} accessibilityLabel="이전 달"><Ionicons name="chevron-back" size={22} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={styles.monthControl} onPress={openPeriod} accessibilityRole="button" accessibilityLabel="연도와 월 선택"><Text style={styles.month}>{year}년 {Number(month.slice(5))}월</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} style={styles.control} accessibilityLabel="다음 달"><Ionicons name="chevron-forward" size={22} color={colors.primary} /></TouchableOpacity>
          </View>
          <View style={styles.grid}>{['월', '화', '수', '목', '금', '토', '일'].map(day => <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}</View>
          <View style={styles.grid}>{calendarCells(month).map((date, index) => <TouchableOpacity key={date || `blank-${index}`} disabled={!date} style={styles.cell} onPress={() => { onSelect(date); onClose(); }} accessibilityLabel={date || undefined}>
            <View style={[styles.day, date === value && styles.selected]}><Text style={[styles.dayText, date === value && styles.selectedText]}>{date ? Number(date.slice(-2)) : ''}</Text></View>
          </TouchableOpacity>)}</View>
        </>}

      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: 16, marginVertical: 16 }, wheelColumn: { flex: 1 },
  wheelLabel: { textAlign: 'center', color: colors.textSoft, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  wheelWindow: { height: WHEEL_ROW * 5, overflow: 'hidden' }, wheelScroll: { height: WHEEL_ROW * 5, flexGrow: 0 }, wheelContent: { paddingVertical: WHEEL_ROW * 2 },
  wheelHighlight: { position: 'absolute', left: 0, right: 0, top: WHEEL_ROW * 2, height: WHEEL_ROW, borderRadius: 12, backgroundColor: colors.primarySoft, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  wheelRow: { height: WHEEL_ROW, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }, wheelText: { fontSize: 22, lineHeight: WHEEL_ROW, height: WHEEL_ROW, includeFontPadding: false, textAlignVertical: 'center', textAlign: 'center', color: colors.textSoft, fontWeight: '800' }, wheelSelectedText: { color: colors.primary },
  periodActions: { flexDirection: 'row', gap: 12 }, periodCancel: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  periodConfirm: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: colors.textSoft, fontWeight: '700', fontSize: 14 }, confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, justifyContent: 'center',  backgroundColor: 'rgba(16,40,91,0.38)', padding: 20, },
  sheet: {   backgroundColor: colors.surface, borderRadius: 22, padding: 18, }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text }, month: { fontSize: 16, fontWeight: '800', color: colors.text, textDecorationLine: 'underline', }, control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthToolbar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 4 }, monthControl: { minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: colors.textSoft, fontSize: 12 }, day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary }, dayText: { color: colors.text, fontSize: 14 }, selectedText: { color: '#FFFFFF', fontWeight: '800' },
});
