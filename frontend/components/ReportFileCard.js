// 보고서 카드 한 장 (F7): 체크박스 · 본문(누르면 미리보기/작성) · 수정 · 받기 상태 버튼.
// 보고서 탭과 그룹 '건별 보고서'가 같이 쓴다.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './ui';
import { colors } from '../constants/design';

export function ReportFileCard({
  title, children, checked, selectable, busy, onToggle, onPress, pressLabel,
  editLabel, onEdit, downloadable, state = 'new', onDownload, onOpenFolder, style,
  badgeInContent = false, hideSavedFolder = false,
}) {
  return <View style={[styles.card, { borderColor: checked ? colors.text : colors.line }, style]}>
    {/* 체크박스는 처음부터. 받을 수 있는 것만 누를 수 있음 */}
    <TouchableOpacity style={styles.check} onPress={onToggle} disabled={!selectable || busy} accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked, disabled: !selectable }} accessibilityLabel={`${title} 받기 선택${selectable ? '' : ', 보고서 저장 후 선택 가능'}`}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={colors.text} style={!selectable && styles.disabled} />
    </TouchableOpacity>
    <TouchableOpacity style={styles.body} onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={pressLabel} activeOpacity={0.85}>
      {children}
      {downloadable && state === 'changed' && <Text style={[styles.badge, styles.badgeChanged]}>고쳐짐 · 다시 받기</Text>}
      {!badgeInContent && downloadable && state === 'saved' && <Text style={[styles.badge, styles.badgeSaved]}>받음</Text>}
    </TouchableOpacity>
    {!!editLabel && <TouchableOpacity style={styles.smallButton} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${title} ${editLabel}`}>
      <Text style={styles.smallButtonText}>{editLabel}</Text>
    </TouchableOpacity>}
    {downloadable && !hideSavedFolder && (state === 'saved'
      ? !hideSavedFolder && <TouchableOpacity style={[styles.iconButton, styles.folderButton]} onPress={onOpenFolder} disabled={busy} accessibilityRole="button" accessibilityLabel={`${title} 저장 폴더 열기`}>
          <Ionicons name="folder-open-outline" size={19} color={colors.textSoft} />
        </TouchableOpacity>
      : <TouchableOpacity style={[styles.iconButton, state === 'changed' ? styles.changedButton : styles.downloadButton, busy && styles.disabled]} onPress={onDownload} disabled={busy}
          accessibilityRole="button" accessibilityLabel={`${title} ${state === 'changed' ? '다시 받기' : '받기'}`}>
          <Ionicons name="download-outline" size={19} color="#FFFFFF" />
        </TouchableOpacity>)}
  </View>;
}

/** 받은 뒤 잠깐 뜨는 알림 + 고르면 나오는 아래 바 'N건 받기' */
export function ReportDownloadFooter({ toast, onOpenFolder, count, hint, busy, onDownload, alwaysVisible = false }) {
  return <>
    {toast ? <View style={styles.toast}>
      <Text style={styles.toastText} numberOfLines={2}>{toast.text}</Text>
      {!!onOpenFolder && <TouchableOpacity onPress={onOpenFolder} style={styles.toastAction}><Text style={styles.toastActionText}>폴더 열기</Text></TouchableOpacity>}
    </View> : null}
    {(alwaysVisible || count > 0) && <View style={styles.bottomBar}>
      {!!hint && <Text style={styles.bottomHint}>{hint}</Text>}
      <PrimaryButton title={busy ? '다운로드 중…' : `${count}건 보고서 다운로드`} onPress={onDownload} disabled={busy || !count} />
    </View>}
  </>;
}

const styles = StyleSheet.create({
  card: { minHeight: 82, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingRight: 8, backgroundColor: colors.surface },
  check: { width: 44, minHeight: 78, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minHeight: 78, justifyContent: 'center', paddingVertical: 10 },
  badge: { alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', fontSize: 10.5, fontWeight: '800' },
  badgeChanged: { backgroundColor: colors.warningSoft, color: colors.warningInk },
  badgeSaved: { backgroundColor: colors.successSoft, color: colors.successInk },
  smallButton: { minWidth: 48, minHeight: 36, paddingHorizontal: 10, marginLeft: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  smallButtonText: { color: colors.text, fontSize: 12.5, fontWeight: '800' },
  iconButton: { width: 44, minHeight: 36, marginLeft: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  downloadButton: { backgroundColor: colors.primary },
  changedButton: { backgroundColor: colors.warning },
  folderButton: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.5 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 96, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.text },
  toastText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  toastAction: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  toastActionText: { color: '#86B9FF', fontSize: 13, fontWeight: '900' },
  bottomBar: { padding: 12, paddingTop: 8, gap: 6, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  bottomHint: { color: colors.textSoft, fontSize: 11.5, fontWeight: '700', paddingHorizontal: 4 },
});
