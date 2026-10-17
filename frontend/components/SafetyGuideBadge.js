import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';

export default function SafetyGuideBadge({ notice }) {
  if (!notice) return null;
  const isEnforcement = notice.kind === 'camera' || notice.kind === 'section';
  const icon = notice.kind === 'school' ? 'school' : 'warning';
  return <View pointerEvents="none" style={[styles.card, notice.overSpeed && styles.overSpeed]}
    accessibilityLabel={`${notice.label}${notice.speedLimit ? `, 제한속도 ${notice.speedLimit}킬로미터` : ''}, ${notice.distance}미터 앞`}>
    {notice.speedLimit ? <View style={styles.speedSign}><Text style={styles.speed}>{notice.speedLimit}</Text></View> : null}
    {!isEnforcement && <View style={styles.labelRow}><Ionicons name={icon} size={15} color={colors.text} /><Text style={styles.label}>{notice.label}</Text></View>}
    <Text style={styles.distance}>{notice.distance >= 1000 ? `${(notice.distance / 1000).toFixed(1)}km` : `${notice.distance}m`}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: 94, alignItems: 'center', gap: 3 },
  overSpeed: {},
  speedSign: { width: 62, height: 62, borderRadius: 31, borderWidth: 5, borderColor: colors.danger, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  speed: { color: colors.text, fontSize: 27, fontWeight: '900' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4 },
  label: { color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'center', textShadowColor: '#FFFFFF', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  distance: { color: colors.text, fontSize: 18, fontWeight: '900', textShadowColor: '#FFFFFF', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
});
