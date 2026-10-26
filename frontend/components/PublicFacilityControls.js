import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';

export default function PublicFacilityControls({
  regionLabel, categoryLabel, expanded, onRegionPress, onCategoryPress, onClose,
  onBack, onLayout, onCategoryLayout,
}) {
  return <View style={styles.row} onLayout={onLayout}>
    {onBack && <TouchableOpacity style={[styles.control, styles.back]} accessibilityLabel="뒤로가기" onPress={onBack}>
      <Ionicons name="arrow-back" size={22} color={colors.primary} />
    </TouchableOpacity>}
    <TouchableOpacity style={[styles.control, styles.region]} accessibilityRole="button"
      accessibilityLabel="공공시설물 조회 지역 선택" onPress={onRegionPress}>
      <Ionicons name="map-outline" size={13} color={colors.primary} />
      <Text style={styles.regionText} numberOfLines={1}>{regionLabel || '행정동'}</Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.control, styles.category]} onLayout={onCategoryLayout}
      accessibilityRole="button" accessibilityLabel="공공시설물 카테고리 선택"
      accessibilityState={{ expanded }} onPress={onCategoryPress}>
      <Text style={[styles.categoryText, !categoryLabel && styles.placeholder]} numberOfLines={1}>
        {categoryLabel || '카테고리 선택'}
      </Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={23} color={colors.primary} />
    </TouchableOpacity>
    <TouchableOpacity style={[styles.control, styles.close]} accessibilityRole="button"
      accessibilityLabel="공공시설물 조회 닫기" onPress={onClose} hitSlop={6}>
      <Ionicons name="close" size={18} color={colors.primary} />
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  control: {
    height: 52, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  region: { minWidth: 78, maxWidth: 112, paddingHorizontal: 8 },
  regionText: { flexShrink: 1, fontSize: 10, fontWeight: '900', color: colors.text },
  category: { flex: 1, minWidth: 0 },
  categoryText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text },
  placeholder: { color: '#9AA6B2' },
  close: { width: 52, paddingHorizontal: 0 },
  back: { width: 44, paddingHorizontal: 0 },
});
