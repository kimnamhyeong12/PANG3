import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ScreenHeader, SecondaryButton } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import { colors, radius } from '../constants/design';
import { downloadProtectedFile } from '../utils/auth';
import { openReportDownloadsFolder, saveReportToDownloads } from '../modules/kakao-navigation';
import { fetchCompiledReportHtml, fetchProgressReportHtml, injectKakaoKey, prepareCompiledHwpx } from '../utils/projectApi';

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

// 통합 보고서 읽기 전용 보기 (B④). 편집·확정은 PC 웹에서만.
// progressId 를 주면 건별 보고서 미리보기 (받기는 목록에서 하므로 HWPX 버튼 없음)
export default function CompiledReportViewScreen({ user, reportId, progressId, title, onBack }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if ((!reportId && !progressId) || !user?.userId) return;
    try {
      setError(null);
      setHtml(null);
      const text = progressId ? await fetchProgressReportHtml(progressId) : await fetchCompiledReportHtml(reportId, user.userId);
      setHtml(injectKakaoKey(text, KAKAO_KEY));
    } catch (loadError) {
      setError(loadError.message || '보고서를 불러오지 못했습니다.');
    }
  }, [reportId, progressId, user?.userId]);

  useEffect(() => { load(); }, [load]);

  const downloadHwpx = async () => {
    if (downloading) return;
    try {
      setDownloading(true);
      const prepared = await prepareCompiledHwpx(reportId, user.userId);
      const fileName = prepared.fileName || `${safeFileName(title)}.hwpx`;
      const uri = await downloadProtectedFile(prepared.downloadUrl, fileName);
      if (Platform.OS === 'android') {
        // 건별 보고서 받기와 같이: Download/외근도우미 에 저장 → 폴더 열기
        // (파일을 바로 열면 hwp+zip 을 등록한 다른 앱(통신사 PASS 등)이 뜨는 폰이 있었다)
        await saveReportToDownloads(uri, fileName);
        showAlert('HWPX 저장 완료', `다운로드 폴더(외근도우미)에 저장했어요.\n${fileName}`, [
          { text: '닫기', style: 'cancel' },
          { text: '폴더 열기', onPress: () => openReportDownloadsFolder().catch((openError) => showAlert('폴더 열기', openError.message)) },
        ]);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: `${fileName} 받기` });
      } else {
        showAlert('HWPX 저장', '파일을 받았지만 이 기기에서 공유를 사용할 수 없습니다.');
      }
    } catch (downloadError) {
      showAlert('HWPX 받기 실패', downloadError.message || '파일을 받지 못했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const headerRight = (
    <TouchableOpacity style={styles.headerAction} onPress={downloadHwpx} disabled={downloading || !html} activeOpacity={0.75}>
      {downloading
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <Ionicons name="download-outline" size={18} color={html ? colors.primary : colors.textFaint} />}
      <Text style={[styles.headerActionText, !html && { color: colors.textFaint }]}>HWPX 받기</Text>
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
      {!progressId && <Text style={styles.footer}>편집·확정은 PC 웹에서 할 수 있어요</Text>}
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
