import { useEffect, useRef } from 'react';
import { PanResponder, Platform } from 'react-native';

export function useBackSwipe(onBack, enabled = true) {
  const current = useRef({ onBack, enabled });
  current.current = { onBack, enabled };
  const responder = useRef(null);
  if (!responder.current) {
    const shouldStart = (event, gesture) => Platform.OS === 'ios' && current.current.enabled &&
      !!current.current.onBack && gesture.numberActiveTouches === 1 &&
      event.nativeEvent.pageX - gesture.dx <= 28 && gesture.dx > 18 &&
      Math.abs(gesture.dy) < 35 && gesture.dx > Math.abs(gesture.dy) * 1.4;
    responder.current = PanResponder.create({
      onMoveShouldSetPanResponder: shouldStart,
      onMoveShouldSetPanResponderCapture: shouldStart,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) => {
        if (current.current.enabled && gesture.dx > 70 && Math.abs(gesture.dy) < 80) current.current.onBack?.();
      },
    });
  }
  return responder.current.panHandlers;
}

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
