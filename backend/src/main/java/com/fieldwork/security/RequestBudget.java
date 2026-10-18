package com.fieldwork.security;

import java.util.HashMap;
import java.util.Map;

/** Bounded single-process counters; callers never trust a client-supplied forwarded IP. */
public final class RequestBudget {
    private record Window(long expires, int count) {}
    private final Map<String, Window> windows = new HashMap<>();
    public synchronized boolean allow(String key, int limit, long windowMillis, long now) {
        windows.entrySet().removeIf(entry -> entry.getValue().expires <= now);
        Window current = windows.get(key);
        if (current == null && windows.size() >= 10000 || current != null && current.count >= limit) return false;
        windows.put(key, new Window(current == null ? now + windowMillis : current.expires,
                current == null ? 1 : current.count + 1));
        return true;
    }
}
