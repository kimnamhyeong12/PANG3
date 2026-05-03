import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';

export function BackButton({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.backButton} activeOpacity={0.8}>
      <Text style={styles.backText}>‹</Text>
    </TouchableOpacity>
  );
}

export function PrimaryButton({ title, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

export const styles = StyleSheet.create({
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF1F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 30, lineHeight: 32, color: '#12395B', fontWeight: '900' },
  primaryButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#12395B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#12395B',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 3,
  },
  disabledButton: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  primaryButtonText: { color: 'white', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
});
