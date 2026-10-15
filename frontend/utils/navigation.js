export const ROOT_SCREENS = new Set(['mapDirect', 'reportList', 'groupHome', 'settings', 'main', 'dashboard']);

export function navigationHistory(history, current, next, replace = false) {
  if (ROOT_SCREENS.has(next)) return [];
  return replace ? [...history] : [...history, current];
}

export function createExitConfirmation(interval = 2000) {
  let last = null;
  return {
    press(now = Date.now()) {
      if (last !== null && now - last >= 0 && now - last <= interval) { last = null; return true; }
      last = now;
      return false;
    },
    reset() { last = null; },
  };
}
