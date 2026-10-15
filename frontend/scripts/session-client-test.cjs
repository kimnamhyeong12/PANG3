const assert = require('node:assert/strict');
const fs = require('node:fs');
const babel = require('../node_modules/@babel/core');
const exportsObject = {};
const code = babel.transformSync(fs.readFileSync(require('node:path').join(__dirname, '../utils/sessionClient.js'), 'utf8'), {
  configFile: false, babelrc: false, plugins: [require('../node_modules/@babel/plugin-transform-modules-commonjs')],
}).code;
new Function('exports', code)(exportsObject);
const { createSessionClient } = exportsObject;
const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const tokenResult = (name) => ({ userId: 7, loginId: 'tester', accessToken: 'access-'+name, refreshToken: 'refresh-'+name,
  expiresAt: new Date(Date.now()+900000).toISOString() });
function fixture(handler, initial = null) {
  let stored = initial, expired = 0; const calls = [];
  const session = createSessionClient({ baseUrl: 'https://api.test', transport: async (url, options) => {
    calls.push({ url: String(url), options }); return handler(String(url), options);
  }, storage: { get: async () => stored, set: async value => { stored=value; }, remove: async () => { stored=null; } }, onExpired: () => expired++ });
  return { session, calls, stored: () => stored, expired: () => expired };
}
(async () => {
  const availability = fixture(async (url) => {
    assert.ok(url.includes('/api/auth/login-id/availability?'), 'ID checks must not refresh a login session');
    return response(200, { available: true });
  });
  assert.equal((await availability.session.fetch('https://api.test/api/auth/login-id/availability?loginId=newuser')).status, 200);
  assert.equal(availability.calls.length, 1);
  assert.equal(availability.expired(), 0, 'signup ID checks must not reset the current screen');
  assert.equal(availability.calls[0].options.headers?.Authorization, undefined);
  const unavailableServer = fixture(async () => response(401), { refreshToken: 'keep-public-check-session' });
  await unavailableServer.session.fetch('https://api.test/api/auth/login-id/availability?loginId=newuser');
  assert.equal(unavailableServer.expired(), 0, 'a failed public ID check must not trigger session expiry');
  assert.equal(unavailableServer.stored().refreshToken, 'keep-public-check-session', 'public ID checks must preserve saved login data');
  assert.equal(unavailableServer.calls.length, 1, 'public ID check errors must not request refresh');
  let refreshes=0;
  const f=fixture(async (url, options) => {
    if(url.endsWith('/login')) return response(200,tokenResult('first'));
    if(url.endsWith('/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve,5)); return response(200,tokenResult('renewed')); }
    if(url.endsWith('/logout')) return response(200);
    if(url.endsWith('/forbidden')) return response(403);
    return response(options.headers?.Authorization === 'Bearer access-first' ? 401 : 200);
  });
  assert.equal((await f.session.login('tester','password')).userId,7);
  assert.ok(!JSON.stringify(f.stored()).includes('access-first'));
  const parallel=await Promise.all([f.session.fetch('https://api.test/api/tasks'), f.session.fetch('https://api.test/api/tasks')]);
  assert.ok(parallel.every(r=>r.ok)); assert.equal(refreshes,1,'parallel 401 requests share one refresh');
  await f.session.fetch('https://api.test/api/forbidden'); assert.equal(refreshes,1,'403 is never retried');
  await f.session.fetch('https://external.test/api/tasks', { headers:{ Authorization:'KakaoAK key' } });
  assert.equal(f.calls.at(-1).options.headers.Authorization,'KakaoAK key','no bearer leaks to external providers');
  await f.session.logout(); assert.equal(f.stored(),null);
  const boot=fixture(async()=>response(200,tokenResult('boot')), { refreshToken:'saved-secret', user:{userId:7} });
  assert.equal((await boot.session.restore()).userId,7);
  assert.equal(JSON.parse(boot.calls[0].options.body).refreshToken,'saved-secret');
  const offline=fixture(async()=>{ throw Error('offline'); }, {refreshToken:'keep-me'});
  await assert.rejects(offline.session.restore(),/offline/); assert.equal(offline.stored().refreshToken,'keep-me','network loss retains login');
  const revoked=fixture(async()=>response(401), {refreshToken:'old'});
  assert.equal(await revoked.session.restore(),null); assert.equal(revoked.stored(),null); assert.equal(revoked.expired(),1);
  let release;
  const race=fixture(async(url)=>url.endsWith('/refresh') ? new Promise(resolve=>{release=()=>resolve(response(200,tokenResult('late')));}) : response(200), {refreshToken:'saved'});
  const restoring=race.session.restore(); await new Promise(resolve=>setImmediate(resolve));
  await race.session.logout(); release(); assert.equal(await restoring,null); assert.equal(race.stored(),null,'in-flight refresh cannot resurrect logout');
  let count=0;
  const proactive=fixture(async(url)=>{ count++; return response(200,tokenResult(url.endsWith('/login')?'initial':'fresh')); });
  await proactive.session.login('tester','password');
  assert.equal((await proactive.session.headers()).Authorization,'Bearer access-initial'); assert.equal(count,1);
  console.log('Session lifecycle checks passed: restore, concurrent refresh, provider isolation, 403, offline retention, revocation and logout race');
})().catch(error=>{console.error(error);process.exitCode=1;});
