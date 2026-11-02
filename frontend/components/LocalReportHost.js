import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { apiFetch } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { registerLocalReportHost } from '../utils/localReports';
import { colors } from '../constants/design';
import { localReportSession } from '../utils/localReportProtocol';
import { nativeReportRuntimeHtml, nativeReportImageDecoder, nativePreviewScriptFiles, nativeMapScriptFiles, nativeReportMapBridge } from '../utils/nativeReportRuntime';
import { nativeReportPreviewBridge } from '../utils/nativeReportPreview';

// Android's WebMessageListener supplies sourceOrigin; older bridges supply the full URL.
// Top-level navigation stays pinned to index.html independently of this message check.
export function isReportRuntimeMessageSource(value, runtimeUrl) {
  if (!value || value === 'about:blank') return true;
  try {
    const expected = new URL(runtimeUrl), actual = new URL(value);
    return actual.origin === expected.origin && !actual.search && !actual.hash
      && (actual.pathname === expected.pathname || actual.pathname === '/');
  } catch { return false; }
}

// A fresh WebView per document; unmounting releases HTML images or the Python worker's filesystem.
export default function LocalReportHost() {
  const [request, setRequest] = useState(null);
  const [progress, setProgress] = useState('보고서 생성을 준비하고 있어요.');
  const active = useRef(null);
  const view = useRef(null);
  const source = `${API_BASE_URL.replace(/\/$/, '')}/report-runtime/index.html`;
  const bootTimer = useRef(null);
  const clearBoot = () => { clearTimeout(bootTimer.current); bootTimer.current = null; };
  const bootProbe = `${nativeReportImageDecoder}if(typeof window.pang3ReportReceive==='function'){window.ReactNativeWebView.postMessage(JSON.stringify({channel:'pang3-local-report-v1',type:'ready'}));}true;`;
  useEffect(() => {
    const unregister = registerLocalReportHost((descriptor, { signal } = {}) => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('보고서 생성을 취소했습니다.'));
      if (active.current) return reject(new Error('이미 보고서를 만들고 있습니다.'));
      try {
        const job = localReportSession({ descriptor, onProgress: setProgress,
          fetchAsset: (path, options) => apiFetch(`${API_BASE_URL}${path}`, options),
          send: message => {
            if (!view.current) throw new Error('보고서 생성 화면의 연결이 끊겼습니다. 다시 시도해 주세요.');
            const previewBridge = descriptor.format === 'html' ? nativeReportPreviewBridge(source) : nativeReportMapBridge;
            view.current.injectJavaScript(`${nativeReportImageDecoder}${previewBridge}window.pang3ReportReceive(${JSON.stringify(message).replace(/</g, '\\u003c')});true;`);
          },
        });
        active.current = job;
        const runtimeController = new AbortController();
        const abort = () => job.cancel();
        signal?.addEventListener('abort', abort, { once: true });
        setProgress('보고서 생성을 준비하고 있어요.');
        clearBoot();
        bootTimer.current = setTimeout(() => { if (active.current === job) job.fail(new Error('보고서 생성기를 시작하지 못했습니다. 다시 시도해 주세요.')); }, 20000);
        // Use the trusted runtime HTML at the same base URL, enabling only the
        // in-memory tile images needed by the WebView's fallback decoder.
        apiFetch(source, { signal: runtimeController.signal, cache: 'no-store' }).then(async response => {
          if (!response.ok) throw new Error('보고서 생성기를 불러오지 못했습니다.');
          const indexHtml = await response.text();
          let previewScripts;
          {
            const directory = source.slice(0, source.lastIndexOf('/') + 1);
            const scriptFiles = descriptor.format === 'html' ? nativePreviewScriptFiles : nativeMapScriptFiles;
            const entries = await Promise.all(scriptFiles.map(async file => {
              const script = await apiFetch(`${directory}${file}`, { signal: runtimeController.signal, cache: 'no-store' });
              if (!script.ok) throw new Error(`보고서 양식을 불러오지 못했습니다. (${file})`);
              return [file, await script.text()];
            }));
            previewScripts = Object.fromEntries(entries);
          }
          const html = nativeReportRuntimeHtml(indexHtml, previewScripts);
          if (active.current === job) setRequest({ key: Date.now(), source: { html, baseUrl: source } });
        }).catch(error => job.fail(error));
        job.promise.then(resolve, reject).finally(() => {
          runtimeController.abort();
          signal?.removeEventListener('abort', abort);
          if (active.current === job) { clearBoot(); active.current = null; setRequest(null); }
        });
      } catch (error) { reject(error); }
    }));
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') active.current?.cancel();
    });
    return () => { clearBoot(); unregister(); subscription.remove(); active.current?.cancel(); active.current = null; };
  }, []);
  if (!request) return null;
  const fail = message => active.current?.fail(new Error(message));
  return <>
    {/* Keep the engine out of Modal: a preview Modal must not prevent its WebView from mounting. */}
    <View style={styles.engine} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView key={request.key} ref={view} source={request.source}
        javaScriptEnabled cacheEnabled domStorageEnabled={false}
        sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false}
        originWhitelist={['http://*', 'https://*']} mixedContentMode="never"
        onShouldStartLoadWithRequest={event => event.url === source || event.url === 'about:blank'}
        injectedJavaScript={bootProbe}
        onLoadEnd={() => view.current?.injectJavaScript(bootProbe)}
        onMessage={event => {
          const url = event.nativeEvent.url;
          if (!isReportRuntimeMessageSource(url, source)) return;
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.channel !== 'pang3-local-report-v1') return;
            if (message.type === 'ready') clearBoot();
            Promise.resolve(active.current?.receive(message)).catch(error => active.current?.fail(error));
          } catch { fail('보고서 생성기의 응답을 읽지 못했습니다. 다시 시도해 주세요.'); }
        }}
        onError={() => fail('보고서 생성기를 불러오지 못했습니다. 서버 연결을 확인해 주세요.')}
        onHttpError={event => { if (event.nativeEvent.url === source) fail(`보고서 생성기를 불러오지 못했습니다. (${event.nativeEvent.statusCode})`); }}
        onContentProcessDidTerminate={() => fail('보고서 생성기가 종료되었습니다. 다시 시도해 주세요.')}
        onRenderProcessGone={() => { fail('보고서 생성기가 종료되었습니다. 다시 시도해 주세요.'); return true; }}
      />
    </View>
    <Modal transparent visible animationType="fade" onRequestClose={() => active.current?.cancel()}>
      <View style={styles.overlay}><View style={styles.card}>
        <View style={styles.heading}><ActivityIndicator color={colors.primary}/><Text style={styles.title}>보고서 다운로드</Text></View>
        <Text style={styles.message}>{progress}</Text>
        <TouchableOpacity style={styles.cancel} onPress={() => active.current?.cancel()} accessibilityRole="button"><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#10285B66' },
  card: { backgroundColor: colors.surface, padding: 22, borderRadius: 20, gap: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  message: { fontSize: 14, lineHeight: 22, color: colors.textSoft },
  cancel: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 22, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceMuted },
  cancelText: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  engine: { position: 'absolute', bottom: 0, left: 0, width: 2, height: 2, overflow: 'hidden', opacity: 0.01 },
});
