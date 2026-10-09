import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const STORAGE_KEY = 'pang3.groupId';
const GroupContext = createContext(null);

function loadGroupId() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) : null;
}

export function GroupProvider({ children }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupIdState] = useState(loadGroupId);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const loadedOnceRef = useRef(false);

  const setGroupId = useCallback((nextId) => {
    if (nextId == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(nextId));
    setGroupIdState(nextId);
  }, []);

  // GET /api/groups/user/{userId} → [{ groupId, groupName, personal, memberCount, regionSido, regionSigungu, ... }]
  // 관리자용 웹이라 1인 개인 그룹(personal: true)은 제외하고 팀 그룹만 다룬다.
  // 최초 로드만 전체 화면 로딩/에러로 막고, 이후 reload(지역 변경 후 등)는 화면을 유지한 채 백그라운드로 갱신한다.
  const reload = useCallback(async () => {
    if (!user) return;
    const initial = !loadedOnceRef.current;
    if (initial) setLoading(true);
    setError(null);
    try {
      const list = await api.get(`/api/groups/user/${user.userId}`);
      setGroups((list ?? []).filter((g) => !g.personal));
      loadedOnceRef.current = true;
    } catch (e) {
      if (initial) setError(errorMessage(e, '그룹 정보를 불러오지 못했습니다.'));
      else console.warn('[group] 그룹 목록 갱신 실패', e);
    } finally {
      if (initial) setLoading(false);
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      reload();
    } else {
      setGroups([]);
      setLoaded(false);
      loadedOnceRef.current = false;
      setGroupId(null);
    }
  }, [user, reload, setGroupId]);

  // 그룹 목록이 바뀌면: 1개면 자동 선택, 저장된 groupId가 목록에 없으면 해제
  useEffect(() => {
    if (loading || groups.length === 0) return;
    if (groups.length === 1) {
      if (groupId !== groups[0].groupId) setGroupId(groups[0].groupId);
    } else if (groupId != null && !groups.some((g) => g.groupId === groupId)) {
      setGroupId(null);
    }
  }, [groups, groupId, loading, setGroupId]);

  const currentGroup = groups.find((g) => g.groupId === groupId) ?? null;

  const value = useMemo(
    () => ({ groups, groupId, currentGroup, setGroupId, loading, loaded, error, reload }),
    [groups, groupId, currentGroup, setGroupId, loading, loaded, error, reload]
  );
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup() {
  return useContext(GroupContext);
}
