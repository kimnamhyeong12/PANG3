package com.fieldwork.service;

import com.fieldwork.entity.AuthSession;
import com.fieldwork.repository.AuthSessionRepository;
import com.fieldwork.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

@Service
public class AuthSessionService {
    private final AuthSessionRepository sessions;
    private final UserRepository users;
    private final long accessSeconds;
    private final long refreshSeconds;
    private final SecureRandom random = new SecureRandom();

    public AuthSessionService(AuthSessionRepository sessions, UserRepository users,
            @Value("${fieldwork.auth.access-seconds:900}") long accessSeconds,
            @Value("${fieldwork.auth.refresh-seconds:7776000}") long refreshSeconds) {
        this.sessions = sessions; this.users = users;
        if (accessSeconds < 60 || refreshSeconds < accessSeconds) throw new IllegalArgumentException("Invalid session lifetime");
        this.accessSeconds = accessSeconds; this.refreshSeconds = refreshSeconds;
    }

    @Transactional
    public Map<String, Object> issue(Long userId) {
        AuthSession session = new AuthSession();
        session.user = users.findById(userId).orElseThrow(AuthSessionService::unauthorized);
        if ("DELETED".equals(session.user.getRole())) throw unauthorized();
        String refresh = token();
        session.refreshHash = hash(refresh);
        return renew(session, refresh);
    }

    @Transactional
    public Map<String, Object> refresh(String token) {
        AuthSession session = sessions.findRefreshLocked(hashChecked(token)).orElseThrow(AuthSessionService::unauthorized);
        if (!active(session, Instant.now())) throw unauthorized();
        // Keep the refresh secret stable so interrupted/concurrent refreshes cannot
        // strand a device. Each refresh replaces the short-lived access token.
        return renew(session, token);
    }

    private Map<String, Object> renew(AuthSession session, String refresh) {
        Instant now = Instant.now();
        String access = token();
        session.accessHash = hash(access);
        session.accessExpiresAt = now.plusSeconds(accessSeconds);
        session.refreshExpiresAt = now.plusSeconds(refreshSeconds);
        sessions.save(session);
        Map<String, Object> result = userInfo(session.user);
        result.put("accessToken", access); result.put("refreshToken", refresh);
        result.put("expiresAt", session.accessExpiresAt.toString());
        result.put("refreshExpiresAt", session.refreshExpiresAt.toString());
        return result;
    }

    @Transactional(readOnly = true)
    public Long authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return null;
        AuthSession session = sessions.findByAccessHash(hash(token)).orElse(null);
        Instant now = Instant.now();
        return session != null && active(session, now) && session.accessExpiresAt.isAfter(now)
                ? session.user.getUserId() : null;
    }
    static boolean active(AuthSession session, Instant now) {
        return !session.revoked && session.refreshExpiresAt.isAfter(now) && !"DELETED".equals(session.user.getRole());
    }
    @Transactional
    public void logout(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return;
        sessions.findRefreshLocked(hash(token)).ifPresent(session -> session.revoked = true);
    }
    @Transactional
    public void revokeAll(Long userId) { sessions.revokeAll(userId); }
    @Scheduled(fixedDelay = 3600000)
    @Transactional
    public void cleanup() { sessions.deleteExpired(Instant.now()); }

    public static Map<String, Object> userInfo(com.fieldwork.entity.User user) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", user.getUserId()); result.put("loginId", user.getLoginId());
        result.put("name", user.getName()); result.put("role", user.getRole());
        result.put("email", user.getEmail());
        result.put("workSido", user.getWorkSido()); result.put("workSigungu", user.getWorkSigungu());
        result.put("workplaceAddress", user.getWorkplaceAddress());
        result.put("workplaceLat", user.getWorkplaceLat()); result.put("workplaceLng", user.getWorkplaceLng());
        return result;
    }
    public String token() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    public static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    private static String hashChecked(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw unauthorized();
        return hash(token);
    }
    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인 유지 기간이 끝났습니다. 다시 로그인해 주세요.");
    }
}
