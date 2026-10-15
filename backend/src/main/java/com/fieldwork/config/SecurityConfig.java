package com.fieldwork.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, com.fieldwork.service.AuthSessionService sessions) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> {})
            .sessionManagement(session -> session.sessionCreationPolicy(org.springframework.security.config.http.SessionCreationPolicy.STATELESS))
            .addFilterBefore(new com.fieldwork.security.BearerAuthenticationFilter(sessions), org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(new com.fieldwork.security.AuthRateLimitFilter(), com.fieldwork.security.BearerAuthenticationFilter.class)
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401); response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"message\":\"로그인이 필요합니다.\"}");
                })
                .accessDeniedHandler((request, response, error) -> {
                    response.setStatus(403); response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"message\":\"접근 권한이 없습니다.\"}");
                }))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/auth/login-id/availability", "/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/logout", "/error").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/auth/email/verify", "/api/auth/password/forgot", "/api/auth/password/reset").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().denyAll()
            );

        return http.build();
    }
}
