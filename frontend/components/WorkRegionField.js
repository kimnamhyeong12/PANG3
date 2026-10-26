import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { REGIONS, DISTRICTS_BY_REGION, childDistricts, selectWorkRegion } from '../utils/workRegion';

const labels = { sido: '시·도', sigungu: '시·군·구', gu: '구' };
export default function WorkRegionField({ value, onChange, disabled = false, required = false, showOptional = true, label = '근무지역' }) {
  const [picker, setPicker] = useState(null);
  const children = childDistricts(value);
  const options = picker === 'sido' ? REGIONS : picker === 'sigungu'
    ? DISTRICTS_BY_REGION[value.sido] || [] : children;
  const levels = children.length ? ['sido', 'sigungu', 'gu'] : ['sido', 'sigungu'];
  return <View style={styles.root}>
    <View style={styles.heading}><Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : showOptional ? ' (선택)' : ''}</Text>
      {!required && !!value.sido && <TouchableOpacity disabled={disabled} onPress={() => onChange({ sido: '', sigungu: '', gu: '' })} accessibilityLabel="근무지역 선택 해제"><Text style={styles.clear}>선택 해제</Text></TouchableOpacity>}
    </View>
    {levels.map(level => {
      const inactive = disabled || (level !== 'sido' && !value.sido);
      return <TouchableOpacity key={level} disabled={inactive} style={[styles.field, inactive && styles.inactive]}
        accessibilityRole="button" accessibilityLabel={`${labels[level]} 선택`} onPress={() => setPicker(level)}>
        <View style={styles.icon}><Ionicons name={level === 'sido' ? 'location' : 'navigate'} size={20} color={colors.primary} /></View>
        <View style={styles.text}><Text style={styles.small}>{labels[level]}</Text><Text style={styles.value}>{value[level] || '선택해주세요'}</Text></View>
        <Ionicons name="chevron-down" size={19} color={colors.textSoft} />
      </TouchableOpacity>;
    })}
    <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
      <View style={styles.backdrop}><TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
        <View style={styles.sheet}><Text style={styles.title}>{labels[picker]} 선택</Text>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {options.map(option => <TouchableOpacity key={option} style={styles.option} onPress={() => {
              if (!disabled) onChange(selectWorkRegion(value, picker, option));
              setPicker(null);
            }}><Text style={[styles.optionText, value[picker] === option && styles.selected]}>{option}</Text>
              {value[picker] === option ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 9, marginBottom: 8 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, clear: { fontSize: 12, color: colors.textSoft, paddingVertical: 6 }, label: { color: colors.text, fontSize: 14, fontWeight: '700' }, required: { color: colors.danger },
  field: { minHeight: 54, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11 },
  inactive: { opacity: 0.5 }, icon: { width: 26, height: 34, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 }, small: { color: colors.textSoft, fontSize: 11 }, value: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,40,91,0.38)' },
  sheet: { maxHeight: '70%', backgroundColor: colors.surface,  padding: 18, borderRadius: 16, shadowOpacity: 0, elevation: 0, }, title: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  option: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 },
  optionText: { color: colors.textSoft, fontSize: 12 }, selected: { color: colors.primary, fontWeight: '900' },
});
