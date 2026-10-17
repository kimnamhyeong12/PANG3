import { apiFetch, downloadProtectedFile } from '../utils/auth';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { saveReportToDownloads, openReportDownloadsFolder } from '../modules/kakao-navigation';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { API_BASE_URL } from '../utils/api';
import { canDownloadReport } from '../utils/reportAvailability';
import { prepareIndividualReport } from '../utils/reportFiles';
import { colors, radius } from '../constants/design';

export default function DownloadScreen({ onBack, downloadInfo }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const ids = files.filter(file => file.progressId && canDownloadReport(file)).map(file => file.progressId);
  const [preparing, setPreparing] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [folderNotice, setFolderNotice] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const targets = downloadInfo?.locations || [...new Set(downloadInfo?.progressIds || [downloadInfo?.progressId].filter(Boolean))].map(progressId => ({ progressId }));
    Promise.all(targets.map(async target => {
      try {
        const path = target.progressId ? `/api/task-progress/${target.progressId}?userId=${downloadInfo.userId}` : `/api/task-progress/task/${target.id ?? target.taskId}`;
        const response = await apiFetch(`${API_BASE_URL}${path}`);
        if (!response.ok) throw new Error('보고서를 불러오지 못했습니다.');
        const text = await response.text();
        const report = text.trim() ? JSON.parse(text) : null;
        if (!report?.progressId) throw new Error('저장된 보고서가 없습니다.');
        return { ...report, name: report.detailAddress || target.detailAddress || report.roadAddress || '방문지', uri: null, error: '' };
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
    if (cached?.uri) return cached;
    if (mounted.current) setActiveId(id);
    const file = await prepareIndividualReport({ progressId: id, userId: downloadInfo.userId,
      baseUrl: API_BASE_URL, fetchReport: apiFetch, download: downloadProtectedFile });
    update(id, { ...file, error: '' });
    return file;
  };
  const share = async file => {
    if (!mounted.current) return;
    if (!await Sharing.isAvailableAsync()) throw new Error('이 기기에서 파일 공유를 사용할 수 없습니다.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: `${file.name} 보고서 받기` });
  };
  const openSavedFolder = async () => {
    try {
      const opened = await openReportDownloadsFolder();
      if (mounted.current) setFolderNotice(opened ? '' : '내 파일에서 Download/외근도우미/다운로드 폴더를 열어 주세요.');
    } catch (_) {
      if (mounted.current) setFolderNotice('파일은 저장됐습니다. 내 파일에서 Download/외근도우미/다운로드 폴더를 열어 주세요.');
    }
  };
  const getFile = async id => {
    if (busy.current || !canOpen) return;
    busy.current = true; setPreparing(true); setError('');
    try {
      const file = await prepare(id);
      if (Platform.OS === 'android') {
        await saveReportToDownloads(file.uri, file.filename);
        update(id, { saved: true });
        await openSavedFolder();
      } else await share(file);
    }
    catch (failure) { update(id, { error: failure.message || '파일을 받지 못했습니다.' }); }
    finally { busy.current = false; if (mounted.current) { setPreparing(false); setActiveId(null); } }
  };
  const prepareAll = async () => {
    if (busy.current || !canOpen) return;
    if (ids.length === 1) return getFile(ids[0]);
    busy.current = true; setPreparing(true); setError('');
    let failures = 0;
    let savedCount = 0;
    try {
      for (const id of ids) {
        if (!mounted.current) break;
        try {
          const file = await prepare(id);
          if (Platform.OS === 'android') { await saveReportToDownloads(file.uri, file.filename); update(id, { saved: true }); savedCount++; }
          else await share(file);
        }
        catch (failure) { failures++; update(id, { error: failure.message || '파일을 만들지 못했습니다.' }); }
      }
      if (mounted.current && failures) setError(`${failures}개 파일을 준비하지 못했습니다. 해당 파일을 다시 받아 주세요.`);
      if (mounted.current && savedCount) await openSavedFolder();
    } finally { busy.current = false; if (mounted.current) { setPreparing(false); setActiveId(null); } }
  };
  return <View style={styles.container}><ScreenHeader title="보고서 다운로드" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.readyCard}><Ionicons name="document-text-outline" size={30} color={colors.primary} /><Text style={styles.title}>{loading ? '보고서를 불러오고 있어요' : preparing ? '보고서를 준비하고 있어요' : files.some(file => file.loadError) ? '파일을 확인해 주세요' : '보고서가 준비됐어요'}</Text><Text style={styles.description}>선택한 방문지의 파일을 각각 다운로드하세요.</Text></View>
      <Text style={styles.listHeading}>다운로드할 파일</Text>
      {loading && <Text style={styles.description}>보고서를 불러오고 있습니다.</Text>}
      {!loading && files.some(file => file.loadError) && <SecondaryButton title="다시 불러오기" onPress={() => setReload(value => value + 1)} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!folderNotice && <Text style={styles.description}>{folderNotice}</Text>}
      {files.map(file => <View key={file.progressId || `task-${file.taskId}`} style={styles.fileRow}>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName}>{file.name}</Text>
          <Text style={styles.fileState}>{file.progressId ? `${file.progressStatus === 'complete' ? '작업 후' : file.progressStatus === 'working' ? '작업 중' : '작업 전'} · ${String(file.createdAt || '').slice(0, 10)}` : ''}</Text>
          {activeId === file.progressId && <Text style={styles.fileState}>파일 준비 중…</Text>}
          {!!file.error && <Text style={styles.error}>{file.error}</Text>}
          {file.saved && <Text style={styles.fileState}>Download/외근도우미/다운로드에 저장했습니다.</Text>}
        </View>
        <PrimaryButton title={file.saved ? '다시 다운로드' : '다운로드'} disabled={preparing || !canOpen || !file.progressId || !canDownloadReport(file)} onPress={() => getFile(file.progressId)} style={styles.fileButton} />
      </View>)}
      {ids.length > 1 && <PrimaryButton title={preparing ? '다운로드 중…' : `${ids.length}개 모두 다운로드`} icon="download-outline" disabled={preparing || !canOpen} onPress={prepareAll} />}
      {Platform.OS === 'android' && files.some(file => file.saved) && <SecondaryButton title="저장 폴더 열기" onPress={openSavedFolder} disabled={preparing} />}
      <Text style={styles.description}>보고서는 작성일로부터 1년간 보관돼요.{Platform.OS === 'android' ? '\n파일은 Download/외근도우미/다운로드에 저장돼요.' : ''}</Text>
      <SecondaryButton title="이전 화면으로" onPress={onBack} />
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  readyCard: { padding: 18, gap: 10, borderRadius: 16, backgroundColor: colors.primarySoft },
  listHeading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  container: { flex: 1, backgroundColor: colors.background, marginTop: 0 }, body: { flexGrow: 1,  paddingBottom: 36, gap: 16, padding: 20, },
  icon: { alignSelf: 'center', width: 70, height: 70, borderRadius: radius.large, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  title: { color: colors.text,  fontWeight: '800', textAlign: 'left', fontSize: 22, }, description: { color: colors.textSoft,  lineHeight: 20, textAlign: 'left', fontSize: 12, },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 }, fileRow: {     backgroundColor: colors.surface,  borderColor: colors.line, flexDirection: 'column', alignItems: 'stretch', borderWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.line, borderRadius: 0, padding: 0, paddingBottom: 16, gap: 14, },
  fileInfo: {flex: 0, }, fileName: { color: colors.text, fontWeight: '700', fontSize: 13 }, fileState: { color: colors.textSoft, fontSize: 11, marginTop: 5 }, fileButton: { paddingHorizontal: 12, minHeight: 42 },
});
