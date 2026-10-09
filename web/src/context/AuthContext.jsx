import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const STORAGE_KEY = 'pang3.user';
const AuthContext = createContext(null);

function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  // POST /api/auth/login → { userId, loginId, name, role, workSido, workSigungu, message }
  const login = useCallback(async (loginId, password) => {
    const result = await api.post('/api/auth/login', { loginId, password });
    const nextUser = {
      userId: result.userId,
      loginId: result.loginId,
      name: result.name,
      role: result.role,
      workSido: result.workSido,
      workSigungu: result.workSigungu,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
