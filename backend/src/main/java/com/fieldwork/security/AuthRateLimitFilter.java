package com.fieldwork.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.service.AuthSessionService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Public authentication is limited before password hashing or database work. */
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private final RequestBudget budget = new RequestBudget();
    private final ObjectMapper json = new ObjectMapper();
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = path(request);
        boolean post = request.getMethod().equals("POST") && Set.of("/api/auth/login", "/api/auth/register",
                "/api/auth/email/request", "/api/auth/email/verify", "/api/auth/password/forgot",
                "/api/auth/password/reset", "/api/auth/refresh", "/api/auth/logout").contains(path);
        boolean availability = request.getMethod().equals("GET") && path.equals("/api/auth/login-id/availability");
        if (!post && !availability) { chain.doFilter(request, response); return; }
        long now = System.currentTimeMillis();
        int limit = path.equals("/api/auth/refresh") || path.equals("/api/auth/logout") || availability ? 120 : 30;
        if (!budget.allow("ip:" + request.getRemoteAddr() + ":" + path, limit, 300000, now)) { reject(response, 429); return; }
        if (!post) { chain.doFilter(request, response); return; }
        byte[] bytes = request.getInputStream().readNBytes(16385);
        if (bytes.length > 16384) { reject(response, 413); return; }
        try {
            var body = json.readTree(bytes);
            String login = body == null ? "" : body.path("loginId").asText("").trim();
            if (!login.isEmpty() && !path.equals("/api/auth/register") &&
                    !budget.allow("account:" + path + ":" + AuthSessionService.hash(login), 30, 300000, now)) {
                reject(response, 429); return;
            }
            String token = body == null ? "" : body.path("refreshToken").asText("");
            if (token.isEmpty() && request.getCookies() != null) for (Cookie cookie : request.getCookies())
                if (cookie.getName().equals("pang3_refresh")) token = cookie.getValue();
            if (path.equals("/api/auth/refresh") && !token.isEmpty() &&
                    !budget.allow("refresh:" + AuthSessionService.hash(token), 30, 60000, now)) { reject(response, 429); return; }
        } catch (com.fasterxml.jackson.core.JacksonException ignored) { /* MVC returns the input error. */ }
        chain.doFilter(new BufferedRequest(request, bytes), response);
    }
    public static String path(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.isEmpty() ? request.getRequestURI().substring(request.getContextPath().length()) : path;
    }
    static void reject(HttpServletResponse response, int status) throws IOException {
        response.setStatus(status);
        if (status == 429) response.setHeader("Retry-After", "300");
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(status == 413 ? "{\"message\":\"요청 내용이 너무 큽니다.\"}"
                : "{\"message\":\"요청이 많습니다. 잠시 후 다시 시도해 주세요.\"}");
    }
    private static final class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] bytes;
        BufferedRequest(HttpServletRequest request, byte[] bytes) { super(request); this.bytes = bytes; }
        @Override public ServletInputStream getInputStream() {
            var input = new ByteArrayInputStream(bytes);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8)); }
    }
}
