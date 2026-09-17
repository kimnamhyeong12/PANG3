import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../constants/design';

export function BackButton({ onPress }) {
  return <TouchableOpacity onPress={onPress} style={styles.backButton} activeOpacity={0.75}><Ionicons name="chevron-back" size={22} color={colors.text} /></TouchableOpacity>;
}

export function ScreenHeader({ title, subtitle, onBack, right }) {
  return (
    <View style={styles.header}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right || null}
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, icon, style }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.82} style={[styles.primaryButton, disabled && styles.disabledButton, style]}>
      {icon ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
      <Text style={styles.primaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, onPress, disabled, icon, style }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.78} style={[styles.secondaryButton, disabled && styles.secondaryDisabled, style]}>
      {icon ? <Ionicons name={icon} size={17} color={colors.primary} /> : null}
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SectionTitle({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? <TouchableOpacity onPress={onAction} activeOpacity={0.7}><Text style={styles.sectionAction}>{actionLabel}</Text></TouchableOpacity> : null}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, description }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerText: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  headerSubtitle: { color: colors.textSoft, fontSize: 11, marginTop: 3 },
  primaryButton: { minHeight: 52, paddingHorizontal: 18, borderRadius: radius.medium, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', ...shadow },
  disabledButton: { backgroundColor: '#BAC6C0', shadowOpacity: 0, elevation: 0 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  secondaryDisabled: { opacity: 0.45 },
  secondaryButtonText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionAction: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  emptyState: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.large, padding: 24, alignItems: 'center' },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 12 },
  emptyDescription: { color: colors.textSoft, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5 },
});
