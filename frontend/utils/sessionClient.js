// Platform-neutral session lifecycle. Secrets belong to the supplied secure
// storage adapter, never to AsyncStorage/localStorage or request URLs.
export function createSessionClient({ baseUrl, transport, storage, client = 'native', onExpired = () => {} }) {
  let access = null;
  let accessDeadline = 0;
  let saved = null;
  let epoch = 0;
  let refreshing = null;
  let storageQueue = Promise.resolve();
  const store = (action) => {
    const next = storageQueue.catch(() => {}).then(action); storageQueue = next; return next;
  };
  const userFrom = (result) => Object.fromEntries(Object.entries(result).filter(([key]) =>
    !['accessToken', 'refreshToken', 'expiresAt', 'refreshExpiresAt'].includes(key)));
  const authRequest = async (path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      return await transport(`${baseUrl}/api/auth/${path}`, {
        method: 'POST', credentials: client === 'web' ? 'include' : 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Auth-Client': client },
        body: JSON.stringify(body || {}),
      });
    } finally { clearTimeout(timer); }
  };
  async function clear(notify = true) {
    epoch++; access = null; accessDeadline = 0; saved = null;
    try { await store(() => storage.remove()); } finally { if (notify) onExpired(); }
  }
  async function accept(result, version) {
    if (version !== epoch) return null;
    if (!result.accessToken || (client === 'native' && !result.refreshToken)) throw new Error('인증 서버를 업데이트해야 합니다.');
    const next = { refreshToken: result.refreshToken, user: userFrom(result) };
    await store(() => version === epoch ? storage.set(next) : undefined);
    if (version !== epoch) return null;
    saved = next; access = result.accessToken;
    accessDeadline = Date.parse(result.expiresAt) || 0;
    return next.user;
  }
  async function refresh() {
    if (refreshing) return refreshing;
    const version = epoch;
    const work = (async () => {
      const response = await authRequest('refresh', client === 'native' ? { refreshToken: saved?.refreshToken } : {});
      if (response.status === 401) {
        if (version === epoch) await clear();
        return null;
      }
      if (!response.ok) throw new Error('로그인 연결을 복원하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return accept(await response.json(), version);
    })();
    refreshing = work;
    try { return await work; } finally { if (refreshing === work) refreshing = null; }
  }
  return {
    async login(loginId, password) {
      const version = ++epoch;
      access = null;
      const response = await authRequest('login', { loginId, password });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = new Error(body?.message || '로그인하지 못했습니다.'); error.status = response.status; throw error;
      }
      const result = await response.json();
      try { return await accept(result, version); }
      catch (error) {
        await authRequest('logout', client === 'native' ? { refreshToken: result.refreshToken } : {}).catch(() => {});
        throw error;
      }
    },
    async restore() {
      const version = epoch;
      const restored = await store(() => storage.get());
      if (version !== epoch) return null;
      saved = restored;
      if (client === 'native' && !saved?.refreshToken) return null;
      return refresh();
    },
    async logout() {
      const token = saved?.refreshToken;
      await clear(false);
      // Local logout is unconditional. Offline revocation is reported to the
      // caller so it cannot be mistaken for server-side revocation.
      const response = await authRequest('logout', client === 'native' ? { refreshToken: token } : {});
      if (!response.ok) throw new Error('서버의 로그인 해제 요청이 완료되지 않았습니다.');
    },
    async headers() {
      if ((!access || accessDeadline <= Date.now() + 30000) && !await refresh()) throw new Error('다시 로그인해 주세요.');
      return { Authorization: `Bearer ${access}` };
    },
    async fetch(url, options = {}) {
      const target = new URL(String(url), baseUrl || undefined);
      const base = baseUrl ? new URL(baseUrl) : null;
      if (!base || target.origin !== base.origin || !target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/api/`)
          || ['/api/auth/login-id/availability', '/api/auth/login', '/api/auth/register', '/api/auth/password/forgot', '/api/auth/password/reset', '/api/auth/email/verify'].includes(target.pathname)) return transport(url, options);
      if ((!access || accessDeadline <= Date.now() + 30000) && !await refresh()) throw new Error('다시 로그인해 주세요.');
      const version = epoch;
      const sent = access;
      const send = () => transport(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${access}` } });
      let response = await send();
      if (response.status === 401 && version === epoch) {
        // A parallel request may already have refreshed the token.
        if (access !== sent || await refresh()) response = await send();
        // Another browser tab can replace the access token between refresh and
        // retry. Only a rejected refresh proves that the login session ended.
      }
      return response;
    },
  };
}
