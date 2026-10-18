package com.fieldwork.service;

import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class RouteRequestGuardTest {
    @BeforeEach void login() { as(1L); }
    @AfterEach void logout() { SecurityContextHolder.clearContext(); }
    void as(Long id) { SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(id, null, List.of())); }
    Map<String, Object> segment(int index) { return Map.of("start", Map.of("lat", 35.0, "lng", 129.0),
            "end", Map.of("lat", 35.0 + index * 0.0001, "lng", 129.1), "transportMode", "car"); }
    @Test void repeatsAreCachedAndAUsersLimitDoesNotBlockAnotherUser() {
        var guard = new RouteRequestGuard(); var calls = new AtomicInteger();
        java.util.function.Supplier<Map<String, Object>> action = () -> Map.of("calls", calls.incrementAndGet());
        var original = guard.call("segment", segment(0), null, action);
        assertEquals(original, guard.call("segment", segment(0), null, action));
        for (int i = 1; i < 60; i++) guard.call("segment", segment(i), null, action);
        assertEquals(60, calls.get());
        assertEquals(429, assertThrows(ResponseStatusException.class, () -> guard.call("segment", segment(61), null, action)).getStatusCode().value());
        assertEquals(original, guard.call("segment", segment(0), null, action));
        as(2L); guard.call("segment", segment(61), null, action); assertEquals(61, calls.get());
    }
    @Test void rejectsInvalidOrOversizedInputsBeforeCallingProvider() {
        var guard = new RouteRequestGuard(); var calls = new AtomicInteger();
        java.util.function.Supplier<Map<String, Object>> action = () -> { calls.incrementAndGet(); return Map.of(); };
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> guard.call("segment", Map.of("start", Map.of("lat", 999, "lng", 129)), null, action)).getStatusCode().value());
        var visits = Collections.nCopies(51, Map.of("lat", 35, "lng", 129));
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> guard.call("optimize", Map.of("currentLocation", Map.of("lat",35,"lng",129), "locations",visits),null,action)).getStatusCode().value());
        assertEquals(0, calls.get());
    }
}
