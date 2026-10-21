import { apiFetch, downloadProtectedFile } from '../utils/auth';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { saveReportToDownloads, openReportDownloadsFolder, reportDownloadExists } from '../modules/kakao-navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, SecondaryButton } from '../components/ui';
import { API_BASE_URL } from '../utils/api';
import { canDownloadReport } from '../utils/reportAvailability';
import { prepareIndividualReport } from '../utils/reportFiles';
import { colors } from '../constants/design';
import { cleanReportName } from '../utils/reportName';
import { useScreenBackHandler } from '../utils/screenBack';

const savedActionLabel = Platform.OS === 'android' ? '저장 폴더 열기' : '파일 보기';
const fileActionLabel = file => file.downloaded ? savedActionLabel : file.hasPreviousDownload ? '새 버전 다운로드' : '다운로드';

export default function DownloadScreen({ onBack, downloadInfo }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const ids = files.filter(file => file.progressId && canDownloadReport(file)).map(file => file.progressId);
  const pendingIds = files.filter(file => file.progressId && canDownloadReport(file) && !file.downloaded).map(file => file.progressId);
  const [preparing, setPreparing] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const containerRef = useRef(null);
  const menuButtons = useRef(new Map());
  const menuFile = menuId === null ? null : files.find(file => file.progressId === menuId);
  useScreenBackHandler(() => { setMenuId(null); return true; }, !!menuFile);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const savedKey = id => `pang3:report-download:${API_BASE_URL}:${downloadInfo?.userId}:${id}`;
  const toggleFileMenu = id => {
    if (menuId === id) { setMenuId(null); return; }
    menuButtons.current.get(id)?.measureInWindow((x, y, width, height) => {
      containerRef.current?.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
        if (!mounted.current) return;
        const below = y - rootY + height + 4;
        setMenuAnchor({ left: Math.max(8, Math.min(x - rootX + width - 156, rootWidth - 164)),
          top: below + 44 <= rootHeight - 8 ? below : Math.max(8, y - rootY - 48) });
        setMenuId(id);
      });
    });
  };
  const restoreDownload = async report => {
    try {
      const saved = JSON.parse(await AsyncStorage.getItem(savedKey(report.progressId)) || 'null');
      if (!saved) return null;
      if (!report.revision || saved.revision !== report.revision || saved.name !== (cleanReportName(report.reportName) || report.detailAddress || report.roadAddress || '방문지')) return { hasPreviousDownload: true };
      const exists = Platform.OS === 'android' ? saved.savedUri && await reportDownloadExists(saved.savedUri) !== false : saved.uri && new File(saved.uri).exists;
      return exists ? saved : null;
    } catch { return null; }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMenuId(null);
    const targets = downloadInfo?.locations || [...new Set(downloadInfo?.progressIds || [downloadInfo?.progressId].filter(Boolean))].map(progressId => ({ progressId }));
    Promise.all(targets.map(async target => {
      try {
        const path = target.progressId ? `/api/task-progress/${target.progressId}?userId=${downloadInfo.userId}` : `/api/task-progress/task/${target.id ?? target.taskId}`;
        const response = await apiFetch(`${API_BASE_URL}${path}`);
        if (!response.ok) throw new Error('보고서를 불러오지 못했습니다.');
        const text = await response.text();
        const report = text.trim() ? JSON.parse(text) : null;
        if (!report?.progressId) throw new Error('저장된 보고서가 없습니다.');
        if (!canDownloadReport(report)) throw new Error('보고서를 저장한 뒤 다운로드해 주세요.');
        const downloaded = await restoreDownload(report);
        return { ...report, name: cleanReportName(report.reportName) || report.detailAddress || target.detailAddress || report.roadAddress || '방문지', uri: null, ...downloaded, error: '' };
      } catch (failure) { return { progressId: target.progressId, loadError: true, taskId: target.id ?? target.taskId, name: target.detailAddress || target.roadAddress || '방문지', error: failure.message }; }
    })).then(rows => { if (active) { filesRef.current = rows; setFiles(rows); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [downloadInfo, reload]);
  const canOpen = !!downloadInfo?.userId && !loading && ids.length > 0;
  const update = (id, values) => {
    const next = filesRef.current.map(file => file.progressId === id ? { ...file, ...values } : file);
    filesRef.current = next;
    if (mounted.current) setFiles(next);
  };
  const prepare = async id => {
    const cached = filesRef.current.find(file => file.progressId === id);
    if (cached?.uri && new File(cached.uri).exists) return cached;
    if (mounted.current) setActiveId(id);
    const file = await prepareIndividualReport({ progressId: id, userId: downloadInfo.userId,
      baseUrl: API_BASE_URL, fetchReport: apiFetch, download: downloadProtectedFile });
    update(id, { ...file, error: '' });
    return file;
  };
  const share = async file => {
    if (!mounted.current) return;
    if (!await Sharing.isAvailableAsync()) throw new Error('이 기기에서 파일 공유를 사용할 수 없습니다.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: `${file.name} 보고서 받기` });
  };
  const rememberDownload = async (file, savedUri = null) => {
    const previous = filesRef.current.find(row => row.progressId === file.progressId);
    const record = { name: file.name, filename: file.filename, uri: file.uri, savedUri,
      revision: file.revision || previous?.revision, downloaded: true, saved: Platform.OS === 'android' };
    update(file.progressId, { ...record, error: '' });
    try { await AsyncStorage.setItem(savedKey(file.progressId), JSON.stringify(record)); }
    catch { /* The current screen still retains the completed download. */ }
  };
  const openDownloaded = async id => {
    if (busy.current) return;
    const file = filesRef.current.find(row => row.progressId === id);
    if (!file?.downloaded) return;
    busy.current = true; setOpeningId(id); update(id, { error: '', notice: '' });
    try {
      if (Platform.OS === 'android') {
        const opened = await openReportDownloadsFolder();
        if (!opened) update(id, { notice: '내 파일에서 Download → 외근도우미 → 다운로드 폴더를 확인해 주세요.' });
      }
      else {
        if (!file.uri || !new File(file.uri).exists) throw new Error('REPORT_FILE_MISSING');
        await share(file);
      }
    } catch (failure) {
      if (failure.message?.includes('REPORT_FILE_MISSING')) {
        update(id, { downloaded: false, saved: false, savedUri: null, uri: null, error: '파일이 이동되었거나 삭제되었습니다. 다시 다운로드해 주세요.' });
        try { await AsyncStorage.removeItem(savedKey(id)); } catch { }
      } else update(id, { error: failure.message || '파일을 열지 못했습니다.' });
    } finally { busy.current = false; if (mounted.current) setOpeningId(null); }
  };
  const getFile = async (id, { redownload = false } = {}) => {
    if (busy.current || !canOpen) return;
    if (!redownload && filesRef.current.find(file => file.progressId === id)?.downloaded) return openDownloaded(id);
    busy.current = true; setPreparing(true); setError('');
    try {
      const file = await prepare(id);
      if (Platform.OS === 'android') {
        const savedUri = await saveReportToDownloads(file.uri, file.filename);
        await rememberDownload(file, savedUri);
      } else { await rememberDownload(file); await share(file); }
    }
    catch (failure) { update(id, { error: failure.message || '파일을 받지 못했습니다.' }); }
    finally { busy.current = false; if (mounted.current) { setPreparing(false); setActiveId(null); } }
  };
  const prepareAll = async () => {
    if (busy.current || !canOpen) return;
    if (!pendingIds.length) return;
    if (pendingIds.length === 1) return getFile(pendingIds[0]);
    busy.current = true; setPreparing(true); setError('');
    let failures = 0;
    try {
      for (const id of pendingIds) {
        if (!mounted.current) break;
        try {
          const file = await prepare(id);
          if (Platform.OS === 'android') { const savedUri = await saveReportToDownloads(file.uri, file.filename); await rememberDownload(file, savedUri); }
          else { await rememberDownload(file); await share(file); }
        }
        catch (failure) { failures++; update(id, { error: failure.message || '파일을 만들지 못했습니다.' }); }
      }
      if (mounted.current && failures) setError(`${failures}개 파일을 준비하지 못했습니다. 해당 파일을 다시 받아 주세요.`);
    } finally { busy.current = false; if (mounted.current) { setPreparing(false); setActiveId(null); } }
  };
  return <View ref={containerRef} collapsable={false} onLayout={() => setMenuId(null)} style={styles.container}><ScreenHeader title="보고서 다운로드" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => setMenuId(null)}>
      <View style={styles.readyCard}>
        <Ionicons name="document-text-outline" size={30} color={colors.primary} />
        <Text style={styles.readyTitle}>{loading ? '보고서를 불러오고 있어요' : preparing ? '보고서를 준비하고 있어요' : files.some(file => file.loadError) ? '보고서를 확인해 주세요' : ids.length && !pendingIds.length ? '다운로드가 완료됐어요' : ids.length ? '보고서를 다운로드하세요' : '다운로드할 보고서가 없어요'}</Text>
        <Text style={styles.readyDescription}>{ids.length && !pendingIds.length ? `오른쪽 ${savedActionLabel} 버튼으로 받은 보고서를 확인하세요.` : '선택한 방문지의 보고서를 각각 다운로드할 수 있어요.'}{pendingIds.length > 1 ? '\n전체 다운로드는 아직 받지 않은 파일만 저장해요.' : ''}</Text>
      </View>
      <View style={styles.heading}><Text style={styles.listHeading}>{loading ? '불러오는 중…' : `보고서 ${files.length}개`}</Text>
        {ids.length > 1 && pendingIds.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="아직 받지 않은 보고서 전체 다운로드" disabled={preparing || openingId !== null || !canOpen} onPress={prepareAll} style={styles.downloadButton}>
          <Ionicons name="download-outline" size={16} color={colors.primary} /><Text style={styles.downloadText}>{preparing ? '다운로드 중…' : '전체 다운로드'}</Text>
        </TouchableOpacity>}
      </View>
      {!loading && files.some(file => file.loadError) && <SecondaryButton title="다시 불러오기" onPress={() => setReload(value => value + 1)} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {files.map(file => <View key={file.progressId || `task-${file.taskId}`} style={styles.fileRow}>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName}>{file.name}</Text>
          {!file.loadError && <Text style={styles.fileState}>{file.progressStatus === 'complete' ? '작업 후' : '작업 중'} · {String(file.createdAt || '').slice(0, 10)}</Text>}
          {!!file.error && <Text style={styles.error}>{file.error}</Text>}
          {file.downloaded && <View style={styles.savedState}><Ionicons name="checkmark-circle" size={14} color="#168653" /><Text style={styles.savedText}>{file.saved ? '다운로드 완료' : '파일 준비 완료'}</Text></View>}
          {!file.downloaded && file.hasPreviousDownload && <Text style={styles.fileState}>보고서가 수정됐어요. 새 버전을 받아 주세요.</Text>}
          {file.saved && <Text style={styles.fileState}>Download/외근도우미/다운로드</Text>}
          {!!file.notice && <Text style={styles.fileState}>{file.notice}</Text>}
        </View>
        <View style={styles.fileActions}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${file.name} ${fileActionLabel(file)}`}
          disabled={preparing || openingId !== null || !canOpen || !file.progressId || !canDownloadReport(file)} onPress={() => getFile(file.progressId)}
          style={[styles.downloadButton, (preparing || openingId !== null || !canOpen || !file.progressId || !canDownloadReport(file)) && { opacity: 0.4 }]}>
          <Ionicons name={file.downloaded ? (Platform.OS === 'android' ? 'folder-open-outline' : 'open-outline') : 'download-outline'} size={17} color={colors.primary} />
          <Text style={styles.downloadText}>{openingId === file.progressId ? '여는 중…' : activeId === file.progressId ? '준비 중…' : fileActionLabel(file)}</Text>
        </TouchableOpacity>
        {file.downloaded && <View collapsable={false} ref={node => { if (node) menuButtons.current.set(file.progressId, node); else menuButtons.current.delete(file.progressId); }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${file.name} 추가 메뉴`} accessibilityState={{ expanded: menuId === file.progressId }} style={styles.moreButton}
          disabled={preparing || openingId !== null} onPress={() => toggleFileMenu(file.progressId)}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSoft} />
        </TouchableOpacity></View>}
        </View>
      </View>)}
    </ScrollView>
    {!!menuFile && menuAnchor && <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
        <Pressable accessibilityLabel="보고서 메뉴 닫기" onPress={() => setMenuId(null)} style={StyleSheet.absoluteFill} />
        <View style={[styles.menuCard, menuAnchor]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="보고서 다시 다운로드" style={styles.menuItem} onPress={() => {
            const id = menuId; setMenuId(null); getFile(id, { redownload: true });
          }}>
            <Ionicons name="download-outline" size={16} color={colors.primary} /><Text style={styles.menuItemText}>다시 다운로드</Text>
          </TouchableOpacity>
        </View>
      </View>}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 32, gap: 14 },
  readyCard: { padding: 18, gap: 10, borderRadius: 16, backgroundColor: colors.primarySoft },
  readyTitle: { color: colors.text, fontSize: 21, fontWeight: '800' },
  readyDescription: { color: colors.textSoft, fontSize: 12, lineHeight: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listHeading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  fileInfo: { flex: 1 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreButton: { width: 32, minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  menuCard: { position: 'absolute', width: 156, borderRadius: 9, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, elevation: 6, shadowColor: '#10285B', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  menuItem: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  menuItemText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  fileName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  fileState: { color: colors.textSoft, fontSize: 11, marginTop: 5 },
  savedState: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  savedText: { color: '#168653', fontSize: 11, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  downloadButton: { minHeight: 40, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.primarySoft, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  downloadText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
});
