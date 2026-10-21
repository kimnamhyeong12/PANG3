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
        // Absolute lifetime: refreshing never extends this deadline.
        session.refreshExpiresAt = Instant.now().plusSeconds(refreshSeconds);
        return renew(session, refresh);
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public Map<String, Object> refresh(String token) {
        AuthSession session = sessions.findRefreshLocked(hashChecked(token)).orElseThrow(AuthSessionService::unauthorized);
        Instant now = Instant.now();
        if (!active(session, now)) throw unauthorized();
        if (!session.refreshHash.equals(hash(token))) {
            if (session.previousRefreshUntil == null || !session.previousRefreshUntil.isAfter(now)) {
                session.revoked = true;
                throw unauthorized();
            }
            // The replacement is encrypted using the submitted old secret, not its stored digest.
            // This permits lost-response retries without persisting a plaintext refresh token.
            return renew(session, retryToken(session.refreshRetryCiphertext, token));
        }
        if (session.previousRefreshUntil != null && session.previousRefreshUntil.isAfter(now)) return renew(session, token);
        String replacement = token();
        session.previousRefreshHash = session.refreshHash;
        session.previousRefreshUntil = now.plusSeconds(60);
        session.refreshRetryCiphertext = encryptRetry(replacement, token);
        session.refreshHash = hash(replacement);
        return renew(session, replacement);
    }

    private Map<String, Object> renew(AuthSession session, String refresh) {
        Instant now = Instant.now();
        String access = token();
        session.accessHash = hash(access);
        session.accessExpiresAt = now.plusSeconds(accessSeconds).isBefore(session.refreshExpiresAt)
                ? now.plusSeconds(accessSeconds) : session.refreshExpiresAt;
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
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listActive(Long userId) {
        return sessions.findByUser_UserIdAndRevokedFalse(userId).stream().filter(s -> active(s, Instant.now()))
                .map(s -> Map.<String, Object>of("sessionId", s.id, "expiresAt", s.refreshExpiresAt.toString())).toList();
    }
    @Transactional
    public void revokeSession(Long userId, Long sessionId) {
        sessions.findOwnedLocked(sessionId, userId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "로그인 세션을 찾을 수 없습니다.")).revoked = true;
    }
    @Scheduled(fixedDelay = 3600000)
    @Transactional
    public void cleanup() { sessions.deleteExpired(Instant.now()); }

    public static Map<String, Object> userInfo(com.fieldwork.entity.User user) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", user.getUserId()); result.put("loginId", user.getLoginId());
        result.put("name", user.getName()); result.put("role", user.getRole());
        result.put("email", user.getEmail());
        result.put("passwordLoginEnabled", user.isPasswordLoginEnabled());
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
    private String encryptRetry(String replacement, String oldToken) {
        try {
            byte[] nonce = new byte[12]; random.nextBytes(nonce);
            var cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, retryKey(oldToken), new javax.crypto.spec.GCMParameterSpec(128, nonce));
            byte[] encrypted = cipher.doFinal(replacement.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(java.nio.ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        } catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException("Session rotation failed", ex); }
    }
    private static String retryToken(String encoded, String oldToken) {
        try {
            byte[] bytes = Base64.getDecoder().decode(encoded);
            var cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE, retryKey(oldToken),
                    new javax.crypto.spec.GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12)));
            return new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)), StandardCharsets.UTF_8);
        } catch (java.security.GeneralSecurityException | RuntimeException ex) { throw unauthorized(); }
    }
    private static javax.crypto.spec.SecretKeySpec retryKey(String oldToken) throws java.security.NoSuchAlgorithmException {
        byte[] key = MessageDigest.getInstance("SHA-256").digest(("pang3-refresh-retry-v1:" + oldToken).getBytes(StandardCharsets.UTF_8));
        return new javax.crypto.spec.SecretKeySpec(key, "AES");
    }
    private static String hashChecked(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw unauthorized();
        return hash(token);
    }
    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인 유지 기간이 끝났습니다. 다시 로그인해 주세요.");
    }
}
