import React, { useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { useBackSwipe } from '../utils/screenBack';

export default function ReportPhotoPicker({ visible, onClose, onCamera, onLibrary }) {
  const pendingAction = useRef(null);
  const closing = useRef(false);
  const flushAction = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };
  // Dismiss this dialog before opening the native camera or photo picker.
  useEffect(() => {
    if (visible) { closing.current = false; return; }
    if (Platform.OS === 'ios') return;
    const timer = setTimeout(flushAction, 250);
    return () => clearTimeout(timer);
  }, [visible]);
  const choose = action => {
    if (closing.current) return;
    closing.current = true;
    pendingAction.current = action;
    onClose();
  };
  const swipe = useBackSwipe(onClose, visible);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={flushAction}>
    <View style={styles.backdrop} {...swipe}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="사진 추가 닫기" />
      <View style={styles.dialog} accessibilityViewIsModal>
        <View style={styles.heading}>
          <Text style={styles.title}>사진 추가</Text>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기">
            <Ionicons name="close" size={21} color={colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.option} onPress={() => choose(onCamera)} accessibilityRole="button">
          <Ionicons name="camera-outline" size={24} color={colors.text} />
          <Text style={styles.optionText} numberOfLines={1} adjustsFontSizeToFit>사진 촬영</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => choose(onLibrary)} accessibilityRole="button">
          <Ionicons name="images-outline" size={24} color={colors.text} />
          <Text style={styles.optionText} numberOfLines={1} adjustsFontSizeToFit>앨범 선택</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#10213D66' },
  dialog: { width: '100%', maxWidth: 360, padding: 12, borderRadius: 20, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, marginBottom: 4 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 16, minHeight: 60 },
  optionText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
});
