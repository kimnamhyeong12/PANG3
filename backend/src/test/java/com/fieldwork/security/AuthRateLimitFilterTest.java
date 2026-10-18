package com.fieldwork.security;

import jakarta.servlet.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class AuthRateLimitFilterTest {
    @Test void accountBudgetSurvivesIpChangesAndBodyRemainsReadable() throws Exception {
        var filter = new AuthRateLimitFilter(); var calls = new AtomicInteger();
        byte[] body = "{\"loginId\":\"same-account\",\"password\":\"wrong\"}".getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i < 31; i++) {
            var request = new MockHttpServletRequest("POST","/api/auth/login");
            request.setRemoteAddr("192.0.2." + i); request.setContentType("application/json"); request.setContent(body);
            var response = new MockHttpServletResponse();
            filter.doFilter(request,response,(wrapped, reply) -> { calls.incrementAndGet(); assertArrayEquals(body,wrapped.getInputStream().readAllBytes()); });
            if (i == 30) assertEquals(429,response.getStatus());
        }
        assertEquals(30,calls.get());
    }
    @Test void hugeAuthBodiesAreRejectedBeforeTheyReachTheController() throws Exception {
        var request = new MockHttpServletRequest("POST","/api/auth/register"); request.setContent(new byte[16385]);
        var response = new MockHttpServletResponse();
        new AuthRateLimitFilter().doFilter(request,response,(wrapped,reply) -> fail("oversized body reached controller"));
        assertEquals(413,response.getStatus());
    }
}
