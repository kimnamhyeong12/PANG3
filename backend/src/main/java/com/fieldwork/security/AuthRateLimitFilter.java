package com.fieldwork.security;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.*;

/** Single-instance guard. A shared gateway limiter is required when scaling. */
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private record Window(long start, int count) {}
    private final Map<String, Window> windows = new HashMap<>();
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.isEmpty()) path = request.getRequestURI().substring(request.getContextPath().length());
        boolean limited = request.getMethod().equals("POST") && Set.of("/api/auth/login", "/api/auth/register",
                "/api/auth/email/request", "/api/auth/email/verify", "/api/auth/password/forgot", "/api/auth/password/reset").contains(path);
        if (limited && !allow(request.getRemoteAddr() + ":" + path, System.currentTimeMillis())) {
            response.setStatus(429); response.setHeader("Retry-After", "300"); response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"message\":\"요청이 많습니다. 잠시 후 다시 시도해 주세요.\"}"); return;
        }
        chain.doFilter(request, response);
    }
    synchronized boolean allow(String key, long now) {
        windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= 300000);
        Window current = windows.get(key);
        if (current == null && windows.size() >= 10000 || current != null && current.count() >= 30) return false;
        windows.put(key, new Window(current == null ? now : current.start(), current == null ? 1 : current.count() + 1)); return true;
    }
}
