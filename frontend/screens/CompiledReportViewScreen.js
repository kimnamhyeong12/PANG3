import useLiveRevision from '../utils/useLiveRevision';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ScreenHeader, SecondaryButton } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { colors, radius } from '../constants/design';
import { generateLocalReport } from '../utils/localReports';
import { openReportDownloadsFolder, saveReportToDownloads } from '../modules/kakao-navigation';
import { fetchCompiledReportHtml, fetchProgressReportHtml, injectKakaoKey } from '../utils/projectApi';

// D15: 기존 KakaoMapWebView와 같은 키·baseUrl로 보고서 지도 표시
const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || '';

// 보고서 자체(초기 로드)와 카카오 지도 SDK만 WebView 안에서 열고, 그 밖의 링크는 외부 브라우저로
const KAKAO_HOST = /(^|\.)(kakao\.com|daumcdn\.net)$/i;
export function allowReportNavigation(url) {
  const value = String(url || '');
  if (value === 'about:blank' || value.startsWith('about:') || value.startsWith('data:')) return true;
  if (value === 'https://localhost/' || value.startsWith('https://localhost/#')) return true;
  const host = (value.match(/^https?:\/\/([^/:?#]+)/i) || [])[1];
  return Boolean(host) && KAKAO_HOST.test(host);
}

const safeFileName = (value) => String(value || '보고서').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').slice(0, 80);

// 통합 보고서 미리보기. 앱의 프로젝트 화면에서 편집·확정한다.
// progressId 를 주면 건별 보고서 미리보기 (받기는 목록에서 하므로 HWPX 버튼 없음)
export default function CompiledReportViewScreen({ user, reportId, progressId, title, onBack }) {
  const liveRevision = useLiveRevision(['reports']);
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadMenu, setDownloadMenu] = useState(false);
  const loading = useRef(null);

  const load = useCallback(async () => {
    if ((!reportId && !progressId) || !user?.userId) return;
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    try {
      setError(null);
      setHtml(null);
      const options = { signal: controller.signal };
      const text = progressId ? await fetchProgressReportHtml(progressId, options) : await fetchCompiledReportHtml(reportId, user.userId, options);
      if (controller.signal.aborted) return;
      setHtml(injectKakaoKey(text, KAKAO_KEY));
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError.message || '보고서를 불러오지 못했습니다.');
    }
  }, [reportId, progressId, user?.userId, liveRevision]);

  useEffect(() => { load(); return () => loading.current?.abort(); }, [load]);

  const downloadLock = useRef(false);
  const downloadReport = async (format) => {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setDownloadMenu(false);
    try {
      setDownloading(true);
      let prepared;
      if (format === 'html') {
        const directory = new Directory(Paths.cache, 'local-reports');
        directory.create({ intermediates: true, idempotent: true });
        const fileName = `${safeFileName(title)}.html`;
        const file = new File(directory, `${Date.now()}-${fileName}`);
        file.write(html);
        prepared = { uri: file.uri, fileName };
      } else prepared = await generateLocalReport('compiled', reportId);
      const fileName = prepared.fileName || `${safeFileName(title)}.${format}`;
      const uri = prepared.uri;
      if (Platform.OS === 'android') {
        // 건별 보고서 받기와 같이: Download/외근도우미 에 저장 → 폴더 열기
        // (파일을 바로 열면 hwp+zip 을 등록한 다른 앱(통신사 PASS 등)이 뜨는 폰이 있었다)
        await saveReportToDownloads(uri, fileName);
        showAlert(`${format.toUpperCase()} 저장 완료`, `다운로드 폴더(외근도우미)에 저장했어요.\n${fileName}`, [
          { text: '닫기', style: 'cancel' },
          { text: '폴더 열기', onPress: () => openReportDownloadsFolder().catch((openError) => showAlert('폴더 열기', openError.message)) },
        ]);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: format === 'html' ? 'text/html' : 'application/octet-stream', dialogTitle: `${fileName} 받기` });
      } else {
        showAlert('보고서 저장', '파일을 받았지만 이 기기에서 공유를 사용할 수 없습니다.');
      }
    } catch (downloadError) {
      showAlert('보고서 받기 실패', downloadError.message || '파일을 받지 못했습니다.');
    } finally {
      setDownloading(false);
      downloadLock.current = false;
    }
  };

  const headerRight = (
    <TouchableOpacity style={styles.headerAction} onPress={() => setDownloadMenu(true)} disabled={downloading || !html} activeOpacity={0.75}>
      {downloading
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <Ionicons name="download-outline" size={18} color={html ? colors.primary : colors.textFaint} />}
      <Text style={[styles.headerActionText, !html && { color: colors.textFaint }]}>다운로드</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={title || '보고서'} onBack={onBack} right={progressId ? null : headerRight} />
      <View style={styles.body}>
        {error ? (
          <View style={styles.center}>
            <EmptyState icon="alert-circle-outline" title="보고서를 열 수 없어요" description={error} />
            <SecondaryButton title="다시 시도" icon="refresh" onPress={load} />
          </View>
        ) : html == null ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://localhost/' }}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            onShouldStartLoadWithRequest={(request) => {
              if (request.isTopFrame === false || allowReportNavigation(request.url)) return true;
              if (/^https?:\/\//i.test(request.url)) Linking.openURL(request.url).catch(() => {});
              return false;
            }}
            style={styles.web}
          />
        )}
      </View>
      <Modal visible={downloadMenu} transparent animationType="fade" onRequestClose={() => setDownloadMenu(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#10285B55' }} onPress={() => setDownloadMenu(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>다운로드 형식</Text>
            {['html', 'hwpx'].map(format => <SecondaryButton key={format} title={format.toUpperCase()} onPress={() => downloadReport(format)}/>)}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, marginHorizontal: 12, borderRadius: radius.medium, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  web: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, gap: 12, padding: 20, alignItems: 'center', justifyContent: 'center' },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8 },
  headerActionText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  footer: { color: colors.textSoft, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
});
