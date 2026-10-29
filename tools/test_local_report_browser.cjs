// Synthetic end-to-end exports using the actual self-hosted Python worker, including the native bridge protocol.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'backend/src/main/resources/static/report-runtime');
const output = path.join(root, 'backend/target/local-report-test');

(async () => {
  await fs.mkdir(output, { recursive: true });
  const photo = await fs.readFile(path.join(output, 'photo.jpg'));
  const tileImage = await fs.readFile(path.join(output, 'tile.png'));
  const protocolSource = await fs.readFile(path.join(root, 'frontend/utils/localReportProtocol.js'), 'utf8');
  const planSource = await fs.readFile(path.join(root, 'frontend/utils/reportMapPlan.js'), 'utf8');
  const moduleSource = protocolSource.replace("'./reportMapPlan.js'", `'data:text/javascript;base64,${Buffer.from(planSource).toString('base64')}'`);
  const protocol = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  let photoFetches = 0;
  let tileFetches = 0;
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/protocol.js') { response.setHeader('Content-Type', 'application/javascript'); return response.end(protocolSource); }
      if (request.url === '/reportMapPlan.js') { response.setHeader('Content-Type', 'application/javascript'); return response.end(planSource); }
      if (request.url.startsWith('/api/local-report-map/tiles/')) {
        if (request.headers.authorization !== 'Bearer synthetic') { response.statusCode = 401; return response.end(); }
        tileFetches++; response.setHeader('Content-Type', 'image/png'); response.setHeader('X-Map-Attribution', '© Synthetic tiles');
        response.setHeader('Cache-Control', 'private, max-age=604800'); return response.end(tileImage);
      }
      if (request.url === '/api/files/1/photo.jpg') {
        if (request.headers.authorization !== 'Bearer synthetic') { response.statusCode = 401; return response.end(); }
        photoFetches++; response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'image/jpeg'); return response.end(photo);
      }
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); return response.end('<!doctype html><title>Local report test</title>'); }
      const target = path.resolve(runtime, '.' + new URL(request.url, 'http://localhost').pathname.replace('/report-runtime', ''));
      if (!target.startsWith(runtime + path.sep)) { response.statusCode = 404; return response.end(); }
      const extension = path.extname(target);
      response.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json' })[extension] || 'application/octet-stream');
      response.end(await fs.readFile(target));
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try { browser = await chromium.launch({ headless: true, executablePath: process.env.REPORT_BROWSER_EXECUTABLE || undefined }); }
  catch (error) { server.close(); throw error; }
  const external = [];
  const requests = [];
  const context = await browser.newContext();
  await context.route('**/*', route => {
    requests.push(route.request().url());
    if (!route.request().url().startsWith(origin)) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const asset = { path: '/work/assets/0.jpg', url: '/api/files/1/photo.jpg', optional: false };
  const mapAsset = { path: '/work/assets/1.jpg', optional: false, map: { width: 960, height: 560, markers: [{ n: 1, lat: 35.1, lng: 128.9, color: '#2477F3' }] } };
  const individual = { schema: 1, kind: 'individual', fileName: 'local-individual.hwpx', revision: 'test-v1', assets: [asset, mapAsset], payload: {
    location_name: '기기 생성 검증 현장', report_name: '로컬 보고서', recorded_at: '2026-10-29T13:00:00',
    main_comment: '서버 사진으로 로컬 생성', field_memo: '테스트 메모', output_dir: '/work',
    field_photos: [{ path: asset.path, type: 'before', comment: '작업 전|합성 사진' }], map_image: mapAsset.path,
  } };
  const compiled = { schema: 1, kind: 'compiled', fileName: 'local-compiled.hwpx', assets: [asset, mapAsset], payload: {
    output_path: '/work/result.hwpx', overview_map_file: mapAsset.path, report: { title: '통합 로컬 검증', status: 'DRAFT', version: 1, groupBy: 'category' },
    project: { name: '합성 프로젝트', groupName: '테스트 그룹' }, summary: { totalCount: 1, period: {}, authors: ['테스터'] },
    sections: [{ label: '점검', items: [{ title: '합성 업무', address: '테스트 주소', comment: '통합 메모',
      photo_files: [{ path: asset.path, slot: '작업 전', comment: '통합 사진' }], map_file: mapAsset.path }] }],
  } };
  const htmlDescriptor = { schema: 1, kind: 'html', format: 'html', fileName: 'local-report.html', assets: [asset, mapAsset], payload: {
    report: { title: 'HTML 기기 생성 <검증>', status: 'DRAFT', version: 1, groupBy: 'category' },
    project: { name: '합성 프로젝트', groupName: '테스트 그룹' }, summary: { totalCount: 1, period: {}, authors: ['테스터'] },
    overviewMapImage: mapAsset.path,
    sections: [{ label: '점검', items: [{ title: '사진 점검', address: '테스트 주소', author: { name: '테스터' }, lat: 35.1, lng: 128.9,
      comment: '</script><script>window.injected=1</script>', mapImage: mapAsset.path,
      photos: [{ url: asset.path, slot: '작업 전', comment: '<img src=x onerror="window.injected=1">합성 사진' }] }] }],
  } };
  try {
    const page = await context.newPage();
    page.on('pageerror', error => console.error('page error:', error.message));
    await page.goto(origin);
    for (const descriptor of [individual, compiled, htmlDescriptor]) {
      const requestStart = requests.length;
      const result = await page.evaluate(async ({ descriptor, origin }) => {
        const { localReportSession } = await import('/protocol.js');
        const iframe = document.createElement('iframe');
        iframe.src = '/report-runtime/index.html';
        const progress = [];
        const session = localReportSession({ descriptor, onProgress: value => progress.push(value),
          send: message => iframe.contentWindow.postMessage(message, origin),
          fetchAsset: (url, options) => fetch(url, { ...options, headers: { Authorization: 'Bearer synthetic' } }),
        });
        const listener = event => { if (event.source === iframe.contentWindow && event.origin === origin) session.receive(event.data); };
        addEventListener('message', listener); document.body.appendChild(iframe);
        try { const result = await session.promise; return { ...result, bytes: result.bytes ? Array.from(result.bytes) : undefined, progress }; }
        finally { iframe.remove(); removeEventListener('message', listener); }
      }, { descriptor, origin });
      if (descriptor.format === 'html') {
        assert.ok(result.html.includes('data:image/jpeg;base64,'));
        assert.ok(!result.html.includes('Bearer synthetic'));
        assert.ok(result.progress.some(value => value.includes('HTML')));
        assert.ok(!requests.slice(requestStart).some(url => /vendor\/|python.zip/.test(url)), 'HTML must not load Python');
        await fs.writeFile(path.join(output, descriptor.fileName), result.html);
        await page.setContent(result.html);
        assert.equal(await page.locator('.rp-card').count(), 1);
        assert.equal(await page.locator('.rp-photos img').count(), 1);
        assert.equal(await page.evaluate(() => window.injected), undefined, 'report data must never execute as HTML/script');
        assert.equal(await page.locator('.rp-text').textContent(), '</script><script>window.injected=1</script>');
        await page.locator('.rp-img img').click();
        assert.equal(await page.locator('#rp-lightbox').isVisible(), true);
        await page.locator('.rp-lb-close').click();
        await page.locator('tr[data-n="1"]').click();
        assert.ok((await page.locator('#item-1').getAttribute('class')).includes('rp-hit'));
        await page.setViewportSize({ width: 1200, height: 900 });
        await page.screenshot({ path: path.join(output, 'html-desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(output, 'html-mobile.png'), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile layout must not overflow');
        console.log('HTML: local image resize/assembly, escaping, lightbox, table navigation and mobile layout passed');
        continue;
      }
      assert.ok(result.bytes.length > 1000);
      assert.ok(result.progress.some(value => value.includes('HWPX')));
      await fs.writeFile(path.join(output, descriptor.fileName), Buffer.from(result.bytes));
      console.log(`${descriptor.kind}: ${result.bytes.length} bytes, iframe worker export passed`);
    }
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.close();
    // Android/iOS injectJavaScript + postMessage protocol, emulated against the real page/worker.
    const native = await context.newPage();
    let session;
    await native.exposeFunction('nativeMessage', message => session.receive(JSON.parse(message)));
    await native.addInitScript(() => { window.ReactNativeWebView = { postMessage: text => window.nativeMessage(text) }; });
    session = protocol.localReportSession({ descriptor: individual,
      send: message => native.evaluate(value => window.pang3ReportReceive(value), message),
      fetchAsset: async url => new Response(url.includes('/local-report-map/') ? tileImage : photo, { status: 200, headers: { 'X-Map-Attribution': '© Synthetic tiles' } }),
    });
    await native.goto(origin + '/report-runtime/index.html');
    const nativeResult = await session.promise;
    assert.ok(nativeResult.bytes.length > 1000);
    await fs.writeFile(path.join(output, 'local-native-bridge.hwpx'), nativeResult.bytes);
    await native.close();
    const nativeHtml = await context.newPage();
    let htmlSession;
    await nativeHtml.exposeFunction('nativeMessage', message => htmlSession.receive(JSON.parse(message)));
    await nativeHtml.addInitScript(() => { window.ReactNativeWebView = { postMessage: text => window.nativeMessage(text) }; });
    htmlSession = protocol.localReportSession({ descriptor: htmlDescriptor,
      send: message => nativeHtml.evaluate(value => window.pang3ReportReceive(value), message),
      fetchAsset: async url => new Response(url.includes('/local-report-map/') ? tileImage : photo, { status: 200, headers: { 'X-Map-Attribution': '© Synthetic tiles' } }),
    });
    await nativeHtml.goto(origin + '/report-runtime/index.html');
    assert.ok((await htmlSession.promise).html.includes('data:image/jpeg;base64,'));
    await nativeHtml.close();
    assert.equal(photoFetches, 3);
    assert.ok(tileFetches > 0, 'device compositor must request original background tiles');
    assert.ok(!requests.some(url => /\/api\/local-reports\/.*\/(map|overview)(\/|$)/.test(url)), 'no server-generated map images');
    assert.deepEqual(external, [], 'Python/packages/credentials must never be requested from third-party servers');
    console.log('Native bridge export passed; no external network requests or localStorage writes');
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
