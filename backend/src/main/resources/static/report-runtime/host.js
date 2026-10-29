/* Trusted transport only. Tokens, arbitrary Python and remote script URLs never enter this page. */
(() => {
  const channel = 'pang3-local-report-v1';
  let worker, parentOrigin, job, started = false;
  const pendingAssets = new Map();
  const pendingTiles = new Map();
  let mapRenderer, tileSequence = 0;
  const send = message => {
    const value = { channel, job, ...message };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(value));
    else if (parentOrigin) window.parent.postMessage(value, parentOrigin);
  };
  const deliverAsset = message => {
    if (worker) worker.postMessage(message);
    else { const resolve = pendingAssets.get(message.index); pendingAssets.delete(message.index); resolve?.(message); }
  };
  const renderMap = async message => {
    if (!mapRenderer) {
      const { createMapRenderer } = await import('./report-map.js');
      mapRenderer = createMapRenderer(tile => new Promise(resolve => {
        const index = tileSequence++; pendingTiles.set(index, resolve);
        send({ type: 'tile', index, z: tile.z, x: tile.x, y: tile.y });
      }));
    }
    send({ type: 'progress', message: '이 기기에서 위치도와 마커를 그리고 있어요.' });
    deliverAsset({ type: 'asset-result', index: message.index, ...await mapRenderer(message.map) });
  };
  const receive = message => {
    if (message?.channel !== channel) return;
    if (message.type === 'start' && !started) {
      started = true;
      job = message.job;
      if (message.descriptor?.format === 'html') {
        import('./report-html.js').then(async ({ buildHtmlReport }) => {
          const html = await buildHtmlReport(message.descriptor,
            index => new Promise(resolve => { pendingAssets.set(index, resolve); send({ type: 'asset', index }); }),
            text => send({ type: 'progress', message: text }));
          const count = Math.ceil(html.length / 65536);
          for (let index = 0; index < count; index++) send({ type: 'html-chunk', index, count, data: html.slice(index * 65536, (index + 1) * 65536) });
          send({ type: 'done', size: html.length });
        }).catch(error => send({ type: 'error', message: /[가-힣]/.test(error.message) ? error.message : '이 기기에서 HTML 보고서를 만들지 못했습니다.' }));
        return;
      }
      worker = new Worker('worker.js');
      worker.onmessage = event => send(event.data);
      worker.onerror = () => send({ type: 'error', message: '보고서 생성 환경을 불러오지 못했습니다.' });
      worker.postMessage({ type: 'start', descriptor: message.descriptor });
    } else if (message.job === job && message.type === 'asset-result') {
      if (message.renderMap) renderMap(message).catch(() => send({ type: 'error', message: '위치도를 만들지 못했습니다. 지도 연결을 확인하고 다시 시도해 주세요.' }));
      else deliverAsset(message);
    } else if (message.job === job && message.type === 'tile-result') {
      const resolve = pendingTiles.get(message.index); pendingTiles.delete(message.index); resolve?.(message);
    }
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.source === window) return;
    if (parentOrigin && parentOrigin !== event.origin) return;
    if (event.data?.channel !== channel || event.data.type !== 'start' && !parentOrigin) return;
    parentOrigin = event.origin;
    receive(event.data);
  });
  // Native injectJavaScript calls a fixed receiver; JSON is passed as data, never evaluated as Python.
  window.pang3ReportReceive = receive;
  if (window.ReactNativeWebView) send({ type: 'ready' });
  else window.parent.postMessage({ channel, type: 'ready' }, '*'); // Contains no data.
})();
