package com.fieldwork.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Account checks cannot be bypassed by changing IP or the supplied userId. */
public class AccountRateLimitFilter extends OncePerRequestFilter {
    private final RequestBudget budget = new RequestBudget();
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        String path = AuthRateLimitFilter.path(request);
        if (auth != null && auth.getPrincipal() instanceof Long userId &&
                (path.matches("/api/users/[0-9]+/account(?:/verify)?") ||
                path.equals("/api/auth/email/request") || path.equals("/api/auth/account")) &&
                !request.getMethod().equals("GET") &&
                !budget.allow("account-check:" + userId, 30, 300000, System.currentTimeMillis())) {
            AuthRateLimitFilter.reject(response, 429); return;
        }
        chain.doFilter(request, response);
    }
}
