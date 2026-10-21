package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.core.env.Environment;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Server-side authorization code flow. Provider and app tokens never enter callback URLs. */
@Service
public class SocialLoginService {
    private final Environment environment;
    private final SocialAccountService accounts;
    private final SocialVerificationService verification;
    private final AuthSessionService sessions;
    private final RestTemplate http;
    private static final class Attempt {
        String provider, secretHash, verifier;
        Long accountId;
        boolean verifyOnly, claimed;
        Instant expiresAt = Instant.now().plusSeconds(300);
        Map<String, Object> result;
    }
    private final ConcurrentHashMap<String, Attempt> attempts = new ConcurrentHashMap<>();
    public SocialLoginService(Environment environment, SocialAccountService accounts, SocialVerificationService verification, AuthSessionService sessions) {
        this.environment = environment; this.accounts = accounts; this.verification = verification; this.sessions = sessions;
        var factory = new SimpleClientHttpRequestFactory(); factory.setConnectTimeout(8000); factory.setReadTimeout(8000);
        http = new RestTemplate(factory);
    }
    private String setting(String provider, String field) {
        return environment.getProperty("fieldwork.auth.social." + provider + "." + field,
                environment.getProperty("SOCIAL_" + provider.toUpperCase(Locale.ROOT) + "_" + field.toUpperCase(Locale.ROOT).replace('-', '_'), "")).trim();
    }
    private String baseUrl() {
        return environment.getProperty("fieldwork.auth.social.public-base-url", environment.getProperty("SOCIAL_PUBLIC_BASE_URL", "")).replaceAll("/+$", "");
    }
    public boolean enabled(String provider) {
        return Set.of("google", "kakao").contains(provider) && baseUrl().startsWith("https://") && !setting(provider, "client-id").isBlank()
                && (!provider.equals("google") || !setting(provider, "client-secret").isBlank());
    }
    public Map<String, Boolean> providers() { return Map.of("google", enabled("google"), "kakao", enabled("kakao")); }
    private String callbackUrl(String provider) { return baseUrl() + "/api/auth/social/" + provider + "/callback"; }

    public synchronized Map<String, Object> start(String provider, Long accountId, boolean verifyOnly) {
        if (!enabled(provider)) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이 소셜 로그인의 서버 설정이 아직 준비되지 않았습니다.");
        attempts.entrySet().removeIf(entry -> !entry.getValue().expiresAt.isAfter(Instant.now()));
        if (attempts.size() >= 1000) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "잠시 후 다시 로그인해 주세요.");
        String flowId = sessions.token(), secret = sessions.token();
        Attempt attempt = new Attempt(); attempt.provider = provider; attempt.secretHash = AuthSessionService.hash(secret);
        attempt.accountId = accountId; attempt.verifyOnly = verifyOnly; attempt.verifier = sessions.token();
        var uri = UriComponentsBuilder.fromUriString(provider.equals("google") ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://kauth.kakao.com/oauth/authorize")
                .queryParam("client_id", setting(provider, "client-id")).queryParam("redirect_uri", callbackUrl(provider))
                .queryParam("response_type", "code").queryParam("state", flowId);
        if (provider.equals("google")) uri.queryParam("scope", "openid profile").queryParam("prompt", "select_account")
                .queryParam("code_challenge", Base64.getUrlEncoder().withoutPadding().encodeToString(java.util.HexFormat.of().parseHex(AuthSessionService.hash(attempt.verifier))))
                .queryParam("code_challenge_method", "S256");
        attempts.put(flowId, attempt);
        return Map.of("flowId", flowId, "pollToken", secret, "authorizationUrl", uri.build().encode().toUriString());
    }
    public void callback(String provider, String state, String code, String error) {
        Attempt attempt = state == null ? null : attempts.get(state);
        if (attempt == null || !attempt.provider.equals(provider)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "로그인 요청을 확인하지 못했습니다.");
        synchronized (attempt) {
            if (attempt.claimed || !attempt.expiresAt.isAfter(Instant.now())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "만료되었거나 이미 처리된 로그인입니다.");
            attempt.claimed = true;
        }
        try {
            if (error != null || code == null || code.isBlank() || code.length() > 4096) throw new IllegalArgumentException("소셜 로그인이 취소되었습니다.");
            var form = new LinkedMultiValueMap<String, String>();
            form.add("grant_type", "authorization_code"); form.add("code", code);
            form.add("client_id", setting(provider, "client-id")); form.add("redirect_uri", callbackUrl(provider));
            if (!setting(provider, "client-secret").isBlank()) form.add("client_secret", setting(provider, "client-secret"));
            if (provider.equals("google")) form.add("code_verifier", attempt.verifier);
            var headers = new HttpHeaders(); headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            JsonNode token = http.postForObject(provider.equals("google") ? "https://oauth2.googleapis.com/token" : "https://kauth.kakao.com/oauth/token", new HttpEntity<>(form, headers), JsonNode.class);
            String access = token == null ? "" : token.path("access_token").asText("");
            if (access.isBlank()) throw new IllegalArgumentException("소셜 인증을 완료하지 못했습니다.");
            var auth = new HttpHeaders(); auth.setBearerAuth(access);
            JsonNode profile = http.exchange(provider.equals("google") ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://kapi.kakao.com/v2/user/me",
                    HttpMethod.GET, new HttpEntity<>(auth), JsonNode.class).getBody();
            if (profile == null) throw new IllegalArgumentException("소셜 사용자 정보를 확인하지 못했습니다.");
            String subject = profile.path(provider.equals("google") ? "sub" : "id").asText("");
            String name = provider.equals("google") ? profile.path("name").asText("") : profile.path("properties").path("nickname").asText("");
            synchronized (attempt) {
                if (!attempt.expiresAt.isAfter(Instant.now()) || attempts.get(state) != attempt) return;
                Long userId = accounts.resolve(provider, subject, name, attempt.accountId, attempt.verifyOnly);
                attempt.result = attempt.verifyOnly ? Map.of("verificationToken", verification.issue(userId))
                        : attempt.accountId != null ? Map.of("linked", true, "provider", provider, "userId", userId) : sessions.issue(userId);
                // Retrying a lost poll response returns the same result without issuing a second session.
                attempt.expiresAt = Instant.now().plusSeconds(300);
            }
        } catch (IllegalArgumentException ex) {
            synchronized (attempt) { attempt.result = Map.of("error", ex.getMessage()); }
        } catch (Exception ex) {
            synchronized (attempt) { attempt.result = Map.of("error", "소셜 인증에 실패했습니다. 잠시 후 다시 시도해 주세요."); }
        }
    }
    private Attempt requireAttempt(String id, String secret) {
        Attempt attempt = id == null ? null : attempts.get(id);
        if (attempt == null || secret == null || !secret.matches("[A-Za-z0-9_-]{43}")
                || !java.security.MessageDigest.isEqual(attempt.secretHash.getBytes(java.nio.charset.StandardCharsets.US_ASCII), AuthSessionService.hash(secret).getBytes(java.nio.charset.StandardCharsets.US_ASCII))
                || !attempt.expiresAt.isAfter(Instant.now())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인 요청이 만료되었습니다. 다시 시도해 주세요.");
        return attempt;
    }
    public Map<String, Object> poll(String id, String secret) {
        Attempt attempt = requireAttempt(id, secret);
        synchronized (attempt) { return attempt.result == null ? Map.of("pending", true) : new HashMap<>(attempt.result); }
    }
    public void cancel(String id, String secret) {
        Attempt attempt = requireAttempt(id, secret);
        synchronized (attempt) {
            attempts.remove(id, attempt); attempt.expiresAt = Instant.EPOCH;
            if (attempt.result != null && attempt.result.get("refreshToken") instanceof String refresh) sessions.logout(refresh);
        }
    }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 60000)
    public void expireAttempts() { attempts.entrySet().removeIf(entry -> !entry.getValue().expiresAt.isAfter(Instant.now())); }
}
