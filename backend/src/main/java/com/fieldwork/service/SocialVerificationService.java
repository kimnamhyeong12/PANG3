package com.fieldwork.service;

import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/** Short-lived reauthentication credential, bound to one app account. */
@Service
public class SocialVerificationService {
    private record Grant(Long userId, Instant expiresAt) {}
    private final ConcurrentHashMap<String, Grant> grants = new ConcurrentHashMap<>();
    public synchronized String issue(Long userId) {
        grants.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(Instant.now()));
        if (grants.size() >= 1000) throw new IllegalStateException("잠시 후 다시 인증해 주세요.");
        byte[] bytes = new byte[32]; new java.security.SecureRandom().nextBytes(bytes);
        String token = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        grants.put(AuthSessionService.hash(token), new Grant(userId, Instant.now().plusSeconds(300)));
        return "social:" + token;
    }
    public boolean valid(Long userId, String credential) {
        if (credential == null || !credential.matches("social:[A-Za-z0-9_-]{43}")) return false;
        Grant grant = grants.get(AuthSessionService.hash(credential.substring(7)));
        return grant != null && grant.userId().equals(userId) && grant.expiresAt().isAfter(Instant.now());
    }
    public void revoke(Long userId) { grants.entrySet().removeIf(entry -> entry.getValue().userId().equals(userId)); }
}
