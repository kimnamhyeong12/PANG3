import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { registerLocalReportHost } from '../utils/localReports';
import { localReportSession } from '../utils/localReportProtocol';

// A fresh WebView per document; unmounting releases HTML images or the Python worker's filesystem.
export default function LocalReportHost() {
  const [request, setRequest] = useState(null);
  const [progress, setProgress] = useState('보고서 생성을 준비하고 있어요.');
  const active = useRef(null);
  const view = useRef(null);
  const source = `${API_BASE_URL.replace(/\/$/, '')}/report-runtime/index.html`;
  useEffect(() => {
    const unregister = registerLocalReportHost((descriptor, { signal } = {}) => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('보고서 생성을 취소했습니다.'));
      if (active.current) return reject(new Error('이미 보고서를 만들고 있습니다.'));
      try {
        const job = localReportSession({ descriptor, onProgress: setProgress,
          fetchAsset: (path, options) => apiFetch(`${API_BASE_URL}${path}`, options),
          send: message => view.current?.injectJavaScript(`window.pang3ReportReceive(${JSON.stringify(message)});true;`),
        });
        active.current = job;
        const abort = () => job.cancel();
        signal?.addEventListener('abort', abort, { once: true });
        setProgress('보고서 생성을 준비하고 있어요.');
        setRequest({ key: Date.now() });
        job.promise.then(resolve, reject).finally(() => {
          signal?.removeEventListener('abort', abort);
          if (active.current === job) { active.current = null; setRequest(null); }
        });
      } catch (error) { reject(error); }
    }));
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') active.current?.cancel();
    });
    return () => { unregister(); subscription.remove(); active.current?.cancel(); active.current = null; };
  }, []);
  return request ? <Modal transparent visible animationType="fade" onRequestClose={() => active.current?.cancel()}>
    <View style={styles.overlay}><View style={styles.card}>
      <ActivityIndicator color="#2477F3" size="large" />
      <Text style={styles.title}>보고서를 만들고 있어요</Text>
      <Text style={styles.message}>{progress}</Text>
      <Text style={styles.message}>완료될 때까지 앱을 열어 두세요.</Text>
      <TouchableOpacity style={styles.cancel} onPress={() => active.current?.cancel()}><Text>취소</Text></TouchableOpacity>
      <View style={styles.engine} pointerEvents="none"><WebView key={request.key} ref={view} source={{ uri: source }}
        javaScriptEnabled cacheEnabled domStorageEnabled={false}
        sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false}
        originWhitelist={['http://*', 'https://*']} mixedContentMode="never"
        onShouldStartLoadWithRequest={event => event.url === source || event.url === 'about:blank'}
        onMessage={event => {
          if (event.nativeEvent.url !== source) return;
          try { active.current?.receive(JSON.parse(event.nativeEvent.data)); } catch { active.current?.cancel(); }
        }}
        onError={() => active.current?.cancel()} onHttpError={() => active.current?.cancel()}
        onContentProcessDidTerminate={() => active.current?.cancel()}
        onRenderProcessGone={() => { active.current?.cancel(); return true; }}
      /></View>
    </View></View>
  </Modal> : null;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#0008' },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 16, alignItems: 'center', gap: 14 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  message: { fontSize: 14, textAlign: 'center', color: '#4B5563' },
  cancel: { padding: 14 }, engine: { width: 1, height: 1, overflow: 'hidden' },
});
