import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../constants/design';
import { useBackSwipe } from '../utils/screenBack';

export function BackButton({ onPress, root = false }) {
  return <TouchableOpacity onPress={onPress} style={styles.backButton} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="뒤로가기"><Ionicons name="arrow-back" size={root ? 27 : 22} color={colors.primaryDark} /></TouchableOpacity>;
}

export function ScreenHeader({ title, subtitle, onBack, right, compact = false, root = false }) {
  const insets = useSafeAreaInsets();
  const swipeHandlers = useBackSwipe(onBack, !!onBack && !root);
  return <View {...swipeHandlers} style={[styles.headerWrap, { paddingTop: insets.top + 1 }, compact && styles.headerWrapCompact]}><View style={[styles.header, root && styles.rootHeader]}>{onBack && !root ? <BackButton onPress={onBack} /> : null}<View style={styles.headerText}><Text style={[styles.headerTitle, root && styles.rootTitle]} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={styles.headerSubtitle} numberOfLines={2}>{subtitle}</Text> : null}</View>{right || null}</View></View>;
}

export function CardTitle({ icon, title, suffix, actionLabel, actionIcon = 'add', onAction, tone = 'blue' }) {
  const teal = tone === 'teal';
  return <View style={styles.cardTitleRow}><View style={[styles.cardTitleIcon, teal && styles.cardTitleIconTeal]}><Ionicons name={icon} size={20} color={colors.primary} /></View><Text style={styles.cardTitle}>{title}</Text>{suffix ? <Text style={styles.cardSuffix}>{suffix}</Text> : null}<View style={{ flex: 1 }} />{actionLabel ? <TouchableOpacity style={styles.outlineAction} onPress={onAction} activeOpacity={0.72}><Ionicons name={actionIcon} size={18} color={colors.primary} /><Text style={styles.outlineActionText}>{actionLabel}</Text></TouchableOpacity> : null}</View>;
}

export function PrimaryButton({ title, onPress, disabled, icon, style, tone = 'blue' }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.82} style={[styles.primaryButton, tone === 'teal' && styles.tealButton, disabled && styles.disabledButton, style]}>{icon ? <Ionicons name={icon} size={19} color="#FFFFFF" /> : null}<Text style={styles.primaryButtonText}>{title}</Text></TouchableOpacity>;
}

export function SecondaryButton({ title, onPress, disabled, icon, style }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.78} style={[styles.secondaryButton, disabled && styles.secondaryDisabled, style]}>{icon ? <Ionicons name={icon} size={18} color={colors.primary} /> : null}<Text style={styles.secondaryButtonText}>{title}</Text></TouchableOpacity>;
}

export function SectionTitle({ title, actionLabel, onAction }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text>{actionLabel ? <TouchableOpacity onPress={onAction} activeOpacity={0.7} style={styles.sectionActionButton} accessibilityRole="button"><Text style={styles.sectionAction}>{actionLabel}</Text></TouchableOpacity> : null}</View>;
}

export function EmptyState({ icon = 'file-tray-outline', title, description }) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name={icon} size={25} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text>{description ? <Text style={styles.emptyDescription}>{description}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  headerWrap: { flexShrink: 0, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 1, paddingBottom: 10 }, headerWrapCompact: { paddingBottom: 7 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, header: { height: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 0 }, headerText: { flex: 1 }, headerTitle: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.8 }, headerSubtitle: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 3, fontWeight: '600' },
  rootHeader: { height: 48, minHeight: 48 }, rootTitle: { fontSize: 24, letterSpacing: -0.8 },
  primaryButton: {  paddingHorizontal: 15,  backgroundColor: colors.primary, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', ...shadow, minHeight: 48, borderRadius: 14, shadowOpacity: 0, elevation: 0, }, tealButton: { backgroundColor: colors.teal }, disabledButton: { backgroundColor: '#B9C8D9', shadowOpacity: 0, elevation: 0 }, primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', },
  secondaryButton: {  paddingHorizontal: 13, borderRadius: 14,   backgroundColor: colors.surface, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderColor: colors.line, borderWidth: 1, minHeight: 44, }, secondaryDisabled: { opacity: 0.45 }, secondaryButtonText: { color: colors.primary,  fontWeight: '900', fontSize: 13, },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 }, sectionActionButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 }, sectionAction: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  cardTitleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }, cardTitleIcon: { width: 34, height: 34, borderRadius: 10,  alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary,  shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, backgroundColor: colors.primarySoft, shadowOpacity: 0, elevation: 0, }, cardTitleIconTeal: { backgroundColor: colors.teal, shadowColor: colors.teal }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, cardSuffix: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  outlineAction: { minHeight: 36, borderRadius: 11, borderWidth: 1.3, borderColor: '#B8D3F5', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFFFF' }, outlineActionText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  emptyState: {   borderColor: colors.line, borderRadius: 18, padding: 18, alignItems: 'center', ...shadow, borderWidth: 0, backgroundColor: colors.surfaceMuted, shadowOpacity: 0, elevation: 0, }, emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 9 }, emptyDescription: { color: colors.textSoft,   textAlign: 'center', marginTop: 4, fontSize: 12, lineHeight: 19, },
});
