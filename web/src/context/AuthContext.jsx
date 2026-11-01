import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { liveSync } from '../lib/liveSync.js';
import { webSession } from '../api/session.js';

const STORAGE_KEY = 'pang3.user';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const restore = useCallback(async () => {
    setLoading(true); setError('');
    try { setUser(await webSession.restore()); }
    catch { setError('로그인 연결을 복원하지 못했습니다. 다시 연결해 주세요.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY);
    const expired = () => setUser(null);
    window.addEventListener('pang3:session-expired', expired);
    restore();
    return () => window.removeEventListener('pang3:session-expired', expired);
  }, [restore]);

  useEffect(() => {
    if (!user?.userId) return;
    const off = liveSync.subscribe(event => {
      if (!(event.topics || []).some(t => t === 'account' || t === 'resync')) return;
      if (!event.topics.includes('resync') && event.userIds?.length && !event.userIds.includes(user.userId)) return;
      webSession.fetch(new URL('/api/sync/me', import.meta.env.VITE_API_BASE_URL || window.location.origin)).then(r => {
        if (!r.ok) throw Error('profile'); return r.json();
      }).then(profile => setUser(previous => previous?.userId === profile.userId && JSON.stringify(previous) !== JSON.stringify(profile) ? profile : previous)).catch(() => liveSync.recover());
    });
    const changed = () => document.visibilityState === 'hidden' ? liveSync.pause() : liveSync.resume();
    liveSync.start(); changed(); document.addEventListener('visibilitychange', changed);
    return () => { off(); document.removeEventListener('visibilitychange', changed); liveSync.stop(); };
  }, [user?.userId]);

  // POST /api/auth/login → { userId, loginId, name, role, workSido, workSigungu, message }
  const login = useCallback(async (loginId, password) => {
    const result = await webSession.login(loginId, password);
    const nextUser = {
      ...result,
      userId: result.userId,
      loginId: result.loginId,
      name: result.name,
      role: result.role,
      workSido: result.workSido,
      workSigungu: result.workSigungu,
    };
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    webSession.logout().catch(() => {});
  }, []);

  const value = useMemo(() => ({ user, login, logout, loading, error, restore, updateUser: (next) => setUser(previous => ({ ...previous, ...next })) }), [user, login, logout, loading, error, restore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
