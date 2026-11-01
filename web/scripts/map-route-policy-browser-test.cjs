// Browser checks against the real components with isolated API and permission fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mockMaps } = require('./map-app-browser-test.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.MAP_QA_URL || 'http://localhost:5173/map';
const output = path.resolve(__dirname, '../../output/map-route-policy-2026-11-01');
const current = { lat: 35.105, lng: 128.965 }, home = { lat: 35.11, lng: 128.98 };
const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
function permissionFixture({ allowed }) {
  const p = new EventTarget(); p.state = sessionStorage.getItem('qa.permission') || (allowed ? 'granted' : 'denied');
  navigator.permissions.query = async () => p;
  let next = 0; const watches = new Map();
  navigator.geolocation.watchPosition = cb => { const id = ++next; watches.set(id, cb); setTimeout(() => { if (watches.has(id) && p.state === 'granted') cb({ coords: { latitude: 35.105, longitude: 128.965, accuracy: 10 } }); }, 0); return id; };
  navigator.geolocation.clearWatch = id => watches.delete(id);
  window.qaPermission = state => { sessionStorage.setItem('qa.permission', state); p.state = state; p.dispatchEvent(new Event('change')); };
  localStorage.setItem('pang3.groupId', '7');
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) { for (let i = 0; i < 80; i++) { if (await fn()) return; await pause(100); } throw Error('condition timed out'); }
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  const checks = [], errors = [];
  try {
    for (const allowed of [true, false]) for (const registered of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 1360, height: 940 } });
      await context.addInitScript(mockMaps); await context.addInitScript(permissionFixture, { allowed });
      let profile = { userId: 1, name: '검증', loginId: 'test', role: 'USER', workSido: '부산광역시', workSigungu: '사하구', ...(registered ? { workplaceLat: home.lat, workplaceLng: home.lng, workplaceAddress: '등록 근무지' } : {}) };
      const tasks = [11, 12].map((id, i) => ({ taskId: id, assigneeUserId: 1, detailAddress: `방문지 ${id}`, roadAddress: '부산 사하구', lat: 35.106 + i * .001, lng: 128.966 + i * .002, status: 'pending', workDate: day }));
      const state = { orders: [], segments: [], saves: [], pending: [], hold: false }; let record = null;
      await context.route('**/api/**', async route => {
        const req = route.request(), u = new URL(req.url()), p = u.pathname;
        if (!p.startsWith('/api/') || !['localhost', '127.0.0.1'].includes(u.hostname)) return route.continue();
        const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        if (p === '/api/auth/refresh') return json({ ...profile, accessToken: 'fixture', expiresAt: '2099-01-01T00:00:00Z' });
        if (p === '/api/groups/user/1') return json([{ groupId: 7, groupName: '검증 그룹', personal: false }]);
        if (p.includes('/locations/group/')) return json(tasks);
        if (p.startsWith('/api/sgis/')) return json({ type: 'FeatureCollection', features: [] });
        if (p === '/api/routes/order') {
          const body = req.postDataJSON(); state.orders.push(body);
          if (state.hold) { state.hold = false; return new Promise(resolve => state.pending.push(() => json({ optimizedLocations: body.locations.slice().reverse() }).then(resolve))); }
          return json({ optimizedLocations: body.locations.slice().reverse() });
        }
        if (p === '/api/routes/segment') {
          const body = req.postDataJSON(); state.segments.push(body);
          return json({ path: [body.start, body.end].map(p => ({ latitude: p.lat, longitude: p.lng })), totalDistance: 1400, totalDuration: 600 });
        }
        if (p === '/api/users/1/account') { profile = { ...profile, ...req.postDataJSON() }; return json(profile); }
        if (p.startsWith('/api/task-progress/task/')) return json(record);
        if (p === '/api/task-progress') { state.saves.push(req.postDataJSON()); record = { ...req.postDataJSON(), progressId: 500 }; return json(record); }
        if (p === '/api/progress-reports/500') return json({ ...record, canEdit: true, photos: [], revision: 'r1' });
        return json([]);
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
      const map = () => page.goto(new URL('/map', base).href);
      const clickMarker = async () => page.evaluate(() => { const marker = window.qaMarkers.findLast(m => m.options.title === '방문지 11' && m.map); window.qaMapEvent(marker, 'click'); });
      const noRoute = async () => {
        await page.getByLabel('방문 순서 추천 안내', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('경로 미리보기', { exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: '길안내 시작', exact: true }).count(), 0);
        assert(await page.locator('.app-visit-number').evaluateAll(nodes => nodes.every(n => !/^\d+$/.test(n.textContent.trim()))));
        assert.equal(await page.evaluate(() => window.qaMarkers.some(m => m.options.strokeWeight === 6 && m.map)), false);
      };
      try {
        await map(); await page.locator('.app-map-visit').nth(1).waitFor();
        await page.waitForFunction(() => window.qaMarkers.some(m => m.options.title === '방문지 11' && m.map));
        assert.equal(await page.getByRole('toolbar', { name: '지도 도구' }).getByRole('button').count(), 6);
        for (const name of ['현재 위치', '확대', '축소']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1);
        if (allowed || registered) {
          await until(() => state.orders.length > 0);
          const order = state.orders.at(-1); assert.deepEqual(order.currentLocation, allowed ? current : home);
          assert.deepEqual(order.returnLocation, registered ? home : undefined);
          await until(async () => (await page.locator('.app-visit-number').allTextContents()).some(t => t === '1'));
          assert.equal(await page.locator('.app-map-visit').first().innerText().then(t => t.includes('방문지 12')), true);
          await clickMarker(); await page.getByLabel('예상 거리', { exact: true }).waitFor();
          assert.deepEqual(state.segments.at(-1).start, allowed ? current : home);
        } else {
          await noRoute(); assert.equal(state.orders.length, 0); assert.equal(state.segments.length, 0);
          await clickMarker(); await page.getByLabel('방문지 정보', { exact: true }).waitFor(); await noRoute();
          await page.getByRole('button', { name: '보고서 작성', exact: true }).click();
          await page.getByLabel('보고서 이름', { exact: true }).waitFor(); assert.equal(state.saves.length, 0);
          await page.getByLabel('본문', { exact: true }).fill('현장 확인 내용'); await page.getByRole('button', { name: '저장', exact: true }).click();
          await page.waitForURL('**/reports/500/edit'); assert.equal(state.saves[0].taskId, 11); assert.equal(state.saves[0].mainComment, '현장 확인 내용');
          await map(); await page.locator('.app-map-visit').nth(1).waitFor(); await clickMarker();
          await page.getByRole('button', { name: '보고서 작성', exact: true }).click(); await page.waitForURL('**/reports/500/edit'); assert.equal(state.saves.length, 1, 'existing report opens without creating or overwriting another record');
          await map(); await page.locator('.app-map-visit').nth(1).waitFor();
        }
        if (allowed) {
          await page.evaluate(() => window.qaPermission('denied'));
          if (registered) { await until(() => state.orders.at(-1)?.currentLocation.lat === home.lat); assert.deepEqual(state.orders.at(-1).returnLocation, home); }
          else {
            await noRoute(); const count = state.orders.length;
            state.hold = true; await page.evaluate(() => window.qaPermission('granted'));
            await until(() => state.pending.length === 1); await page.evaluate(() => window.qaPermission('denied')); await noRoute();
            await state.pending.shift()(); await pause(200); await noRoute(); assert.equal(state.orders.length, count + 1);
            await page.evaluate(() => window.qaPermission('granted')); await page.getByLabel('예상 거리', { exact: true }).waitFor(); assert.equal(await page.getByLabel('방문 순서 추천 안내', { exact: true }).count(), 0);
            await page.evaluate(() => window.qaPermission('denied')); await noRoute();
          }
        }
        if (registered) {
          await page.goto(new URL('/settings', base).href); await page.getByRole('button', { name: '근무지 삭제', exact: true }).click();
          await page.getByLabel('현재 비밀번호', { exact: true }).first().fill('fixture-only'); await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
          await page.getByText('계정 정보를 저장했습니다.', { exact: true }).waitFor();
          const count = state.orders.length; await page.locator('.sidebar').getByRole('link', { name: '지도', exact: true }).click();
          await noRoute(); await pause(400); assert.equal(state.orders.length, count);
        }
        await page.setViewportSize({ width: 390, height: 844 }); await clickMarker(); await noRoute();
        const boxes = await page.evaluate(() => ['.app-map-tools', '.app-route-unavailable', '.app-visit-info-card'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom }; }));
        assert(boxes.every(b => b.x >= 0 && b.y >= 0 && b.r <= 391 && b.b <= 845));
        assert(boxes[2].b <= boxes[1].y, 'visit info and explanation cards must not overlap');
        await page.screenshot({ path: path.join(output, `${allowed}-${registered}-mobile.png`), fullPage: true });
        checks.push(`${allowed ? '허용' : '거부'}/${registered ? '등록' : '미등록'} 및 권한 철회·근무지 삭제·마커 전용 상태`); console.log('PASS ' + checks.at(-1));
      } finally { await context.close(); }
    }
    assert.deepEqual(errors, []); await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
