const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mockMaps } = require('./map-app-browser-test.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const output = path.resolve(__dirname, '../../output/group-management-2026-11-01');
const base = process.env.MAP_QA_URL || 'http://localhost:5173/groups';
const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
(async () => {
 await fs.mkdir(output, { recursive: true });
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
 const checks = [], errors = [];
 try { for (const leader of [true, false]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(mockMaps); await context.addInitScript(() => localStorage.setItem('pang3.groupId', '7'));
  let members = Array.from({ length: 35 }, (_, i) => ({ userId: i + 1, name: i === 0 ? '내 이름' : `팀원 ${i + 1}`, role: i === 0 && leader ? 'LEADER' : 'MEMBER', loginId: `hidden-login-${i}`, workSido: '숨길 근무지역', joinedAt: '2020-01-01' }));
  let group = { groupId: 7, groupName: '검증 그룹', role: leader ? 'LEADER' : 'MEMBER', personal: false, regionSido: '부산광역시', regionSigungu: '사하구', regionAdmCode: '21100' }, left = false;
  const personal = { groupId: 8, groupName: '개인', personal: true };
  const state = { links: 0, kicks: [], failKick: true, failLeave: true, region: [], leave: [], directInvites: 0 };
  await context.route('**/api/**', async route => {
   const req = route.request(), p = new URL(req.url()).pathname;
   if (!p.startsWith('/api/')) return route.continue();
   const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
   if (p === '/api/auth/refresh') return json({ userId: 1, name: '내 이름', loginId: 'test', role: 'USER', accessToken: 'fixture', expiresAt: '2099-01-01T00:00:00Z' });
   if (p === '/api/groups/user/1') return json(left ? [personal] : [{ ...group, memberCount: members.length }, personal]);
   if (p === '/api/groups/7') return json({ ...group, members });
   if (p === '/api/groups/7/members') return json(members);
   if (p === '/api/groups/invitations') return json([]);
   if (p === '/api/groups/7/invite-links') { state.links++; return json({ url: 'https://pinwork.co.kr/join/fixture-link' }); }
   if (p === '/api/groups/7/invitations') { state.directInvites++; return json({}); }
   if (p === '/api/groups/7/members/2') { state.kicks.push(req.postDataJSON()); if (state.failKick) { state.failKick = false; return json({ message: '잠시 후 다시 시도해 주세요.' }, 503); } members = members.filter(m => m.userId !== 2); return json({ removedUserId: 2 }); }
   if (p === '/api/groups/7/members/me') { state.leave.push(req.postDataJSON()); if (state.failLeave) { state.failLeave = false; return json({ message: '비밀번호를 확인해 주세요.' }, 400); } left = true; return json({}); }
   if (p === '/api/groups/7/region') { state.region.push(req.postDataJSON()); group = { ...group, ...req.postDataJSON() }; return json(group); }
   if (p.startsWith('/api/sgis/')) return json({ type: 'FeatureCollection', features: ['사하구', '남구'].map((name, i) => ({ type: 'Feature', properties: { adm_cd: i ? '21070' : '21100', adm_nm: `부산광역시 ${name}` }, geometry: { type: 'Polygon', coordinates: [[[128.96, 35.1], [128.98, 35.1], [128.96, 35.1]]] } })) });
   if (p.includes('/locations/group/')) return json(['pending', 'working', 'complete'].map((status, i) => ({ taskId: i + 1, assigneeUserId: 1, detailAddress: `방문지 ${i + 1}`, status, workDate: day, completedAt: status === 'complete' ? `${day}T09:00:00` : null, lat: 35.1 + i * .001, lng: 128.97 })));
   if (p === '/api/facility-applications' || p === '/api/support/inquiries') return json({ items: [] });
   return json([]);
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  try {
   await page.goto(new URL('/groups', base).href); const heading = page.locator('.groups-list-heading'); await heading.waitFor();
   const title = await heading.getByRole('heading', { name: '그룹 목록', exact: true }).boundingBox(), create = await heading.getByRole('button', { name: '그룹 만들기', exact: true }).boundingBox();
   assert(Math.abs(title.y + title.height / 2 - create.y - create.height / 2) < 2); assert(create.x > title.x);
   assert.equal(await page.locator('.app-main>.page-head').count(), 0);
   await heading.getByRole('button', { name: '초대 목록', exact: true }).click(); await heading.getByRole('heading', { name: '초대 목록', exact: true }).waitFor(); await heading.getByRole('button', { name: '그룹 목록', exact: true }).click();
   await page.getByRole('button', { name: '그룹 관리', exact: true }).click();
   const management = page.getByRole('region', { name: '그룹 관리', exact: true }), team = page.getByRole('region', { name: '팀원 관리', exact: true }), settings = page.getByRole('region', { name: '그룹 설정', exact: true });
   await team.getByText('팀원 35', { exact: true }).waitFor();
   const checkMemberHeader = async () => { const heading = team.locator(':scope > .panel-header'); const title = await heading.locator('.panel-title').boundingBox(); for (const label of ['팀원 초대','그룹 탈퇴']) { const button = await heading.getByRole('button', { name: label, exact: true }).boundingBox(); assert(button.x > title.x); assert(Math.abs(title.y + title.height / 2 - button.y - button.height / 2) < 2); } }; await checkMemberHeader();
   const a = await team.boundingBox(), b = await settings.boundingBox(), header = await page.locator('.group-management-heading').boundingBox();
   assert.equal(a.y, b.y); assert(Math.abs(a.height - b.height) < 2); assert(b.x - a.x - a.width >= 20); assert(a.y - header.y - header.height >= 20);
   const scroll = await page.getByLabel('팀원 목록', { exact: true }).evaluate(e => { e.scrollTop = 200; return { top: e.scrollTop, overflow: e.scrollHeight > e.clientHeight }; }); if (!scroll.overflow) { console.log(await team.evaluate(e => ({ height: e.offsetHeight, scroll: e.querySelector('.group-members-scroll').offsetHeight, styles: getComputedStyle(e.querySelector('.group-members-scroll')).cssText, gridHeight: e.parentElement.offsetHeight }))); await page.screenshot({ path: path.join(output, 'layout-failure.png'), fullPage: true }); } assert(scroll.overflow && scroll.top > 0);
   assert.equal(await team.getByText(/hidden-login|숨길 근무지역|2020\.01\.01/).count(), 0);
   assert.equal(await settings.getByText(/그룹 리더만|부산광역시만 제공/).count(), 0); assert((await settings.innerText()).includes('공공시설물을 지역별로 볼 수 있습니다.'));
   await team.getByRole('button', { name: '팀원 초대', exact: true }).click(); const invite = page.getByRole('dialog', { name: '팀원 초대', exact: true });
   await invite.getByLabel('초대 링크', { exact: true }).waitFor(); assert.equal(state.links, 1); assert.equal(state.directInvites, 0);
   await invite.getByRole('button', { name: '링크 복사' }).click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://pinwork.co.kr/join/fixture-link'); await invite.getByRole('button', { name: '닫기', exact: true }).click();
   if (leader) {
    assert.equal(await team.getByRole('button', { name: '내 이름 팀원 제외' }).count(), 0);
    await team.getByRole('button', { name: '팀원 2 팀원 제외', exact: true }).click(); const modal = page.getByRole('dialog', { name: '팀원 제외' });
    await modal.getByRole('button', { name: '취소' }).click(); assert.equal(state.kicks.length, 0);
    await team.getByRole('button', { name: '팀원 2 팀원 제외', exact: true }).click(); await modal.getByRole('button', { name: '팀원 제외', exact: true }).click(); await modal.getByRole('alert').waitFor();
    await modal.getByRole('button', { name: '팀원 제외', exact: true }).click(); await modal.waitFor({ state: 'hidden' }); assert.equal(state.kicks.length, 2); assert.equal(state.kicks[1].userId, 1); assert.equal(await team.getByText('팀원 2', { exact: true }).count(), 0);
   } else assert.equal(await team.getByRole('button', { name: /팀원 제외/ }).count(), 0);
   await settings.getByLabel('시/군/구', { exact: true }).selectOption('21070'); await settings.getByRole('button', { name: '지역 변경', exact: true }).click(); await settings.getByText('부산광역시 남구', { exact: true }).waitFor(); assert.equal(state.region.at(-1).regionSigungu, '남구');
   await page.screenshot({ path: path.join(output, `${leader ? 'leader' : 'member'}-management.png`), fullPage: true });
   await page.setViewportSize({ width: 390, height: 844 }); await checkMemberHeader(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   await page.screenshot({ path: path.join(output, `${leader ? 'leader' : 'member'}-mobile.png`), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
   if (!leader) {
    await team.getByRole('button', { name: '그룹 탈퇴', exact: true }).click(); const leave = page.getByRole('dialog', { name: '그룹 탈퇴', exact: true });
    await leave.getByLabel('현재 비밀번호', { exact: true }).fill('fixture-only'); await leave.getByRole('button', { name: '그룹 탈퇴', exact: true }).click(); await leave.getByRole('alert').waitFor(); await leave.getByRole('button', { name: '그룹 탈퇴', exact: true }).click(); await management.waitFor({ state: 'hidden' }); assert.equal(state.leave.length, 2);
   } else {
    await page.locator('.group-management-heading').getByRole('button', { name: '닫기' }).click(); await page.getByRole('button', { name: '업무현황', exact: true }).first().click();
    const back = page.getByRole('link', { name: '← 그룹 목록', exact: true }); await back.waitFor(); assert(await back.evaluate(e => e.classList.contains('btn-secondary')));
    await page.locator('.group-status-summary .stat-green').waitFor(); const tones = await page.locator('.group-status-summary strong').evaluateAll(nodes => nodes.map(e => getComputedStyle(e).color)); assert.equal(new Set(tones).size, 4);
    await page.screenshot({ path: path.join(output, 'status-colors.png'), fullPage: true });
   }
   checks.push(`${leader ? '그룹장' : '일반 팀원'}: 카드 정렬·이름 목록·스크롤·초대 링크·권한·지역 변경·탈퇴`); console.log('PASS ' + checks.at(-1));
  } finally { await context.close(); }
 }
 assert.deepEqual(errors, []); await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
