package com.fieldwork.security;

import com.fieldwork.service.AuthSessionService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;

public class BearerAuthenticationFilter extends OncePerRequestFilter {
    private final AuthSessionService sessions;
    public BearerAuthenticationFilter(AuthSessionService sessions) { this.sessions = sessions; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            Long userId = sessions.authenticate(header.substring(7));
            if (userId != null) {
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(new UsernamePasswordAuthenticationToken(userId, null, List.of()));
                SecurityContextHolder.setContext(context);
            }
        }
        chain.doFilter(request, response);
    }
}
