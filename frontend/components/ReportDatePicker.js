import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { calendarCells, currentMonthRange, shiftMonth } from '../utils/calendar';

export default function ReportDatePicker({ visible, value, title, onSelect, onClose }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const [mode, setMode] = useState('days');
  const [yearPage, setYearPage] = useState(Number(month.slice(0, 4)));
  useEffect(() => { if (visible) { const initial = value.slice(0, 7) || currentMonthRange().start.slice(0, 7); setMonth(initial); setYearPage(Number(initial.slice(0, 4))); setMode('days'); } }, [visible, value]);
  const year = Number(month.slice(0, 4));
  const changePage = offset => { if (mode === 'years') setYearPage(previous => previous + offset * 12); else setMonth(shiftMonth(month, offset)); };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => mode === 'days' ? onClose() : setMode('days')}>
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="달력 닫기" />
      <View style={styles.sheet}>
        <View style={styles.heading}><Text style={styles.title}>{title}</Text><TouchableOpacity onPress={onClose} style={styles.control} accessibilityLabel="닫기"><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity></View>
        <View style={styles.monthToolbar}>
          <TouchableOpacity onPress={() => changePage(-1)} style={styles.control} accessibilityLabel={mode === 'years' ? '이전 연도' : '이전 달'} disabled={mode === 'months'}><Ionicons name="chevron-back" size={22} color={mode === 'months' ? colors.line : colors.primary} /></TouchableOpacity>
          <TouchableOpacity style={styles.monthControl} onPress={() => { setYearPage(year); setMode(mode === 'years' ? 'months' : 'years'); }} accessibilityLabel="연도와 월 선택"><Text style={styles.month}>{mode === 'years' ? `${yearPage}–${yearPage + 11}년` : `${year}년 ${Number(month.slice(5))}월`}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => changePage(1)} style={styles.control} accessibilityLabel={mode === 'years' ? '다음 연도' : '다음 달'} disabled={mode === 'months'}><Ionicons name="chevron-forward" size={22} color={mode === 'months' ? colors.line : colors.primary} /></TouchableOpacity>
        </View>
        {mode === 'years' ? <View style={styles.grid}>{Array.from({ length: 12 }, (_, index) => yearPage + index).map(item => <TouchableOpacity key={item} style={[styles.periodCell, item === year && styles.periodSelected]} onPress={() => { setMonth(`${item}-${month.slice(5)}`); setMode('months'); }} accessibilityLabel={`${item}년`}><Text style={styles.dayText}>{item}년</Text></TouchableOpacity>)}</View> : mode === 'months' ? <>
          <TouchableOpacity style={styles.yearBack} onPress={() => { setYearPage(year); setMode('years'); }}><Text style={styles.month}>{year}년 변경</Text></TouchableOpacity>
          <View style={styles.grid}>{Array.from({ length: 12 }, (_, index) => index + 1).map(item => <TouchableOpacity key={item} style={[styles.periodCell, item === Number(month.slice(5)) && styles.periodSelected]} onPress={() => { setMonth(`${year}-${String(item).padStart(2, '0')}`); setMode('days'); }} accessibilityLabel={`${item}월`}><Text style={styles.dayText}>{item}월</Text></TouchableOpacity>)}</View>
        </> : <>
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
  overlay: { flex: 1, justifyContent: 'center',  backgroundColor: 'rgba(16,40,91,0.38)', padding: 20, },
  sheet: {   backgroundColor: colors.surface, borderRadius: 22, padding: 18, }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text }, month: { fontSize: 16, fontWeight: '800', color: colors.text, textDecorationLine: 'underline', }, control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthToolbar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 4 }, monthControl: { minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center' }, periodCell: { width: '33.3333%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, periodSelected: { backgroundColor: colors.primarySoft }, yearBack: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: colors.textSoft, fontSize: 12 }, day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary }, dayText: { color: colors.text, fontSize: 14 }, selectedText: { color: '#FFFFFF', fontWeight: '800' },
});
