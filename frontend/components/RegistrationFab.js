import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';

export default function RegistrationFab({ open, onToggle, onClose, items, bottom = 24 }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  const { height: windowHeight } = useWindowDimensions();
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    if (open) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0, duration: open ? 300 : 180,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !open) setMounted(false); });
    return () => animation.stop();
  }, [open, progress]);
  return <View pointerEvents="box-none" onLayout={event => setContainerHeight(event.nativeEvent.layout.height)} style={[StyleSheet.absoluteFill, { zIndex: 70 }]}>
    {mounted && <>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: '#10285B26', opacity: progress }]}>
        <Pressable accessibilityLabel="등록 메뉴 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View pointerEvents={open ? 'box-none' : 'none'} style={[styles.stack, { bottom: bottom + 68,
        maxHeight: Math.max(56, (containerHeight || windowHeight) - bottom - 92) }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.stackContent}>
          {items.map((item, index) => {
            const start = (items.length - 1 - index) * (0.4 / Math.max(1, items.length - 1));
            const itemProgress = progress.interpolate({ inputRange: [start, start + 0.6], outputRange: [0, 1], extrapolate: 'clamp' });
            return <Animated.View key={item.label} style={{ opacity: itemProgress,
              transform: [{ translateY: itemProgress.interpolate({ inputRange: [0, 1], outputRange: [20 + (items.length - 1 - index) * 8, 0] }) },
                { scale: itemProgress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
              <Pressable accessibilityRole="button" accessibilityLabel={item.label} android_ripple={{ color: colors.primarySoft }}
                style={styles.item} onPress={() => { onClose(); item.onPress(); }}>
                <View style={styles.itemIcon}><Ionicons name={item.icon} size={21} color={colors.primary} /></View>
                <Text style={styles.label}>{item.label}</Text>
              </Pressable>
            </Animated.View>;
          })}
        </ScrollView>
      </View>
    </>}
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={open ? '등록 메뉴 닫기' : '방문지 등록 메뉴 열기'} accessibilityState={{ expanded: open }} style={[styles.fab, { bottom }]}>
      <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}><Ionicons name="add" size={32} color="#FFFFFF" /></Animated.View>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 22, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 1, shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  stack: { position: 'absolute', right: 18, width: 190, maxWidth: '80%', zIndex: 2 },
  stackContent: { padding: 4, gap: 8 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#FFFFFF', elevation: 3, shadowColor: '#10285B', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, overflow: 'hidden' },
  itemIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  label: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.text },
});
