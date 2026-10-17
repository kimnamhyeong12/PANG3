import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../constants/design';
import { maneuverDistance } from '../utils/maneuverGuide';

function ManeuverArrow({ name, small = false }) {
  const left = name === 'return-up-back-outline';
  const right = name === 'return-up-forward-outline';
  if (!left && !right) return <Ionicons name={name || 'navigate-outline'} size={small ? 22 : 38} color="#FFFFFF" />;
  return <Svg width={small ? 22 : 38} height={small ? 28 : 44} viewBox="0 0 32 40">
    <Path d={left ? 'M24 37V16Q24 10 18 10H5M12 3L5 10L12 17' : 'M8 37V16Q8 10 14 10H27M20 3L27 10L20 17'}
      fill="none" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export default function ManeuverGuideCard({ guide }) {
  const step = guide?.primary, next = guide?.secondary;
  return <View><View style={[styles.card, styles.cardJoined]} accessibilityLabel={step ? `${maneuverDistance(step.distance)} 앞 ${step.label}, ${step.road}` : '길안내 확인 중'}>
    <View style={styles.icon}><ManeuverArrow name={step?.icon} /></View>
    <View style={styles.main}>
      <Text style={styles.title} numberOfLines={1}>{step ? <Text style={styles.distance}>{maneuverDistance(step.distance)}</Text> : '길안내 확인 중…'}</Text>
    </View>
    </View>
    {next && <View style={styles.next} accessibilityLabel={`그다음 ${maneuverDistance(next.distance)} 앞 ${next.label}`}>
      <ManeuverArrow name={next.icon} small /><Text style={styles.nextDistance}>{maneuverDistance(next.distance)}</Text>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.primary, borderRadius: 14, elevation: 2 },
  cardJoined: { borderBottomLeftRadius: 0, elevation: 0 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 }, title: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  distance: { fontSize: 27, fontWeight: '900' },
  next: { alignSelf: 'flex-start', flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: colors.text, alignItems: 'center', gap: 7 },
  nextDistance: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
