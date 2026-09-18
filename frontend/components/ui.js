import React from 'react';
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../constants/design';

export function BackButton({ onPress }) {
  return <TouchableOpacity onPress={onPress} style={styles.backButton} activeOpacity={0.72}><Ionicons name="arrow-back" size={25} color={colors.primaryDark} /></TouchableOpacity>;
}

export function ScreenHeader({ title, subtitle, onBack, right, compact = false }) {
  return <View style={[styles.headerWrap, compact && styles.headerWrapCompact]}><View style={styles.header}>{onBack ? <BackButton onPress={onBack} /> : null}<View style={styles.headerText}><Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={styles.headerSubtitle} numberOfLines={2}>{subtitle}</Text> : null}</View>{right || null}</View></View>;
}

export function CardTitle({ icon, title, suffix, actionLabel, onAction, tone = 'blue' }) {
  const teal = tone === 'teal';
  return <View style={styles.cardTitleRow}><View style={[styles.cardTitleIcon, teal && styles.cardTitleIconTeal]}><Ionicons name={icon} size={20} color="#FFFFFF" /></View><Text style={styles.cardTitle}>{title}</Text>{suffix ? <Text style={styles.cardSuffix}>{suffix}</Text> : null}<View style={{ flex: 1 }} />{actionLabel ? <TouchableOpacity style={styles.outlineAction} onPress={onAction} activeOpacity={0.72}><Ionicons name="add" size={18} color={colors.primary} /><Text style={styles.outlineActionText}>{actionLabel}</Text></TouchableOpacity> : null}</View>;
}

export function PrimaryButton({ title, onPress, disabled, icon, style, tone = 'blue' }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.82} style={[styles.primaryButton, tone === 'teal' && styles.tealButton, disabled && styles.disabledButton, style]}>{icon ? <Ionicons name={icon} size={19} color="#FFFFFF" /> : null}<Text style={styles.primaryButtonText}>{title}</Text></TouchableOpacity>;
}

export function SecondaryButton({ title, onPress, disabled, icon, style }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.78} style={[styles.secondaryButton, disabled && styles.secondaryDisabled, style]}>{icon ? <Ionicons name={icon} size={18} color={colors.primary} /> : null}<Text style={styles.secondaryButtonText}>{title}</Text></TouchableOpacity>;
}

export function SectionTitle({ title, actionLabel, onAction }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text>{actionLabel ? <TouchableOpacity onPress={onAction} activeOpacity={0.7}><Text style={styles.sectionAction}>{actionLabel}</Text></TouchableOpacity> : null}</View>;
}

export function EmptyState({ icon = 'file-tray-outline', title, description }) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name={icon} size={25} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text>{description ? <Text style={styles.emptyDescription}>{description}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: '#F7FBFF', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 12, paddingBottom: 10 }, headerWrapCompact: { paddingBottom: 7 },
  backButton: { width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' }, header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 5 }, headerText: { flex: 1 }, headerTitle: { color: colors.text, fontSize: 23, fontWeight: '900', letterSpacing: -0.7 }, headerSubtitle: { color: colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 3, fontWeight: '600' },
  primaryButton: { minHeight: 46, paddingHorizontal: 15, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', ...shadow }, tealButton: { backgroundColor: colors.teal }, disabledButton: { backgroundColor: '#B9C8D9', shadowOpacity: 0, elevation: 0 }, primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1.3, borderColor: '#BFD6F5', backgroundColor: colors.surface, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, secondaryDisabled: { opacity: 0.45 }, secondaryButtonText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 }, sectionAction: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  cardTitleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }, cardTitleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, cardTitleIconTeal: { backgroundColor: colors.teal, shadowColor: colors.teal }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, cardSuffix: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  outlineAction: { minHeight: 36, borderRadius: 11, borderWidth: 1.3, borderColor: '#B8D3F5', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFFFF' }, outlineActionText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  emptyState: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 18, alignItems: 'center', ...shadow }, emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 9 }, emptyDescription: { color: colors.textSoft, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 4 },
});
