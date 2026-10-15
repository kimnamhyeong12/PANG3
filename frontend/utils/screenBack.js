import { useEffect, useRef } from 'react';

// Screen-local panels take priority over leaving the screen, including the persistent map.
const handlers = new Set();
export function useScreenBackHandler(handler, active = true) {
  const current = useRef(handler);
  current.current = handler;
  useEffect(() => {
    if (!active) return;
    const callback = () => current.current();
    handlers.add(callback);
    return () => handlers.delete(callback);
  }, [active]);
}
export function consumeScreenBack() {
  for (const handler of [...handlers].reverse()) if (handler()) return true;
  return false;
}
