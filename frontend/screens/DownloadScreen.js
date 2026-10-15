import { apiFetch, downloadProtectedFile } from '../utils/auth';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { saveReportToDownloads } from '../modules/kakao-navigation';
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
  const getFile = async id => {
    if (busy.current || !canOpen) return;
    busy.current = true; setPreparing(true); setError('');
    try {
      const file = await prepare(id);
      if (Platform.OS === 'android') {
        await saveReportToDownloads(file.uri, file.filename);
        update(id, { saved: true });
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
    try {
      for (const id of ids) {
        if (!mounted.current) break;
        try {
          const file = await prepare(id);
          if (Platform.OS === 'android') { await saveReportToDownloads(file.uri, file.filename); update(id, { saved: true }); }
          else await share(file);
        }
        catch (failure) { failures++; update(id, { error: failure.message || '파일을 만들지 못했습니다.' }); }
      }
      if (mounted.current && failures) setError(`${failures}개 파일을 준비하지 못했습니다. 해당 파일을 다시 받아 주세요.`);
    } finally { busy.current = false; if (mounted.current) { setPreparing(false); setActiveId(null); } }
  };
  return <View style={styles.container}><ScreenHeader title="보고서 다운로드" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.icon}><Ionicons name={files.length > 0 && files.every(file => file.uri) ? 'checkmark' : 'document-text-outline'} size={32} color="#FFFFFF" /></View>
      <Text style={styles.title}>{preparing ? 'HWPX 파일을 준비하고 있습니다' : files.length > 0 && files.every(file => file.uri) ? '보고서 파일이 준비되었습니다' : '보고서 다운로드'}</Text>

      <Text style={styles.description}>보고서는 작성일로부터 1년간 보관됩니다.{Platform.OS === 'android' ? '\n다운로드한 파일은 휴대폰 Download 폴더에 저장됩니다.' : ''}</Text>
      {loading && <Text style={styles.description}>보고서를 불러오고 있습니다.</Text>}
      {!loading && files.some(file => file.loadError) && <SecondaryButton title="다시 불러오기" onPress={() => setReload(value => value + 1)} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {files.map(file => <View key={file.progressId || `task-${file.taskId}`} style={styles.fileRow}>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName}>{file.name}</Text>
          <Text style={styles.fileState}>{file.progressId ? `${file.progressStatus === 'complete' ? '작업 후' : file.progressStatus === 'working' ? '작업 중' : '작업 전'} · ${String(file.createdAt || '').slice(0, 10)}` : ''}</Text>
          {activeId === file.progressId && <Text style={styles.fileState}>파일 준비 중…</Text>}
          {!!file.error && <Text style={styles.error}>{file.error}</Text>}
          {file.saved && <Text style={styles.fileState}>Download 폴더에 저장했습니다.</Text>}
        </View>
        <SecondaryButton title={file.saved ? '다시 다운로드' : '다운로드'} disabled={preparing || !canOpen || !file.progressId || !canDownloadReport(file)} onPress={() => getFile(file.progressId)} style={styles.fileButton} />
      </View>)}
      {ids.length > 1 && <PrimaryButton title={preparing ? '다운로드 중…' : `${ids.length}개 모두 다운로드`} icon="download-outline" disabled={preparing || !canOpen} onPress={prepareAll} />}
      <SecondaryButton title="이전 화면으로" onPress={onBack} />
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, marginTop: -15 }, body: { flexGrow: 1, padding: 24, paddingBottom: 36, gap: 16 },
  icon: { alignSelf: 'center', width: 70, height: 70, borderRadius: radius.large, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }, description: { color: colors.textSoft, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 }, fileRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14 },
  fileInfo: { flex: 1 }, fileName: { color: colors.text, fontWeight: '700', fontSize: 13 }, fileState: { color: colors.textSoft, fontSize: 11, marginTop: 5 }, fileButton: { paddingHorizontal: 12, minHeight: 42 },
});
