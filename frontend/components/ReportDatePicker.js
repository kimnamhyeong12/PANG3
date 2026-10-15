import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { calendarCells, currentMonthRange, shiftMonth } from '../utils/calendar';

export default function ReportDatePicker({ visible, value, title, onSelect, onClose }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  useEffect(() => { if (visible) setMonth(value.slice(0, 7) || currentMonthRange().start.slice(0, 7)); }, [visible, value]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="달력 닫기" />
      <View style={styles.sheet}>
        <View style={styles.heading}><Text style={styles.title}>{title}</Text><TouchableOpacity onPress={onClose} style={styles.control} accessibilityLabel="닫기"><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity></View>
        <View style={styles.heading}>
          <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.control} accessibilityLabel="이전 달"><Ionicons name="chevron-back" size={22} color={colors.primary} /></TouchableOpacity>
          <Text style={styles.month}>{month.replace('-', '년 ')}월</Text>
          <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} style={styles.control} accessibilityLabel="다음 달"><Ionicons name="chevron-forward" size={22} color={colors.primary} /></TouchableOpacity>
        </View>
        <View style={styles.grid}>{['월', '화', '수', '목', '금', '토', '일'].map(day => <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}</View>
        <View style={styles.grid}>{calendarCells(month).map((date, index) => <TouchableOpacity key={date || `blank-${index}`} disabled={!date} style={styles.cell} onPress={() => { onSelect(date); onClose(); }} accessibilityLabel={date || undefined}>
          <View style={[styles.day, date === value && styles.selected]}><Text style={[styles.dayText, date === value && styles.selectedText]}>{date ? Number(date.slice(-2)) : ''}</Text></View>
        </TouchableOpacity>)}</View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(16,40,91,0.38)' },
  sheet: { borderRadius: 18, padding: 16, backgroundColor: colors.surface }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text }, month: { fontSize: 16, fontWeight: '800', color: colors.text }, control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: colors.textSoft, fontSize: 12 }, day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary }, dayText: { color: colors.text, fontSize: 14 }, selectedText: { color: '#FFFFFF', fontWeight: '800' },
});
