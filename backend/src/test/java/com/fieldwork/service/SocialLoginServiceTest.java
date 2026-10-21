package com.fieldwork.service;

import org.junit.jupiter.api.*;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.MediaType;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SocialLoginServiceTest {
    SocialLoginService service;
    SocialAccountService accounts;
    AuthSessionService sessions;
    SocialVerificationService verification;
    MockRestServiceServer server;
    @BeforeEach void setup() {
        var environment = new MockEnvironment().withProperty("SOCIAL_PUBLIC_BASE_URL", "https://app.example.test")
                .withProperty("SOCIAL_GOOGLE_CLIENT_ID", "test-client").withProperty("SOCIAL_GOOGLE_CLIENT_SECRET", "test-secret")
                .withProperty("SOCIAL_KAKAO_CLIENT_ID", "test-kakao");
        accounts = mock(SocialAccountService.class); sessions = mock(AuthSessionService.class); verification = new SocialVerificationService();
        when(sessions.token()).thenAnswer(call -> { byte[] bytes = new byte[32]; new java.security.SecureRandom().nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); });
        when(accounts.resolve(anyString(), anyString(), anyString(), isNull(), eq(false))).thenReturn(7L);
        when(sessions.issue(7L)).thenReturn(Map.of("userId", 7L, "accessToken", "app-access", "refreshToken", "app-refresh"));
        service = new SocialLoginService(environment, accounts, verification, sessions);
        server = MockRestServiceServer.bindTo((RestTemplate) ReflectionTestUtils.getField(service, "http")).build();
    }
    Map<String, Object> start(String provider) { return service.start(provider, null, false); }
    String value(Map<String, Object> attempt, String key) { return (String) attempt.get(key); }
    void googleResponse() {
        server.expect(requestTo("https://oauth2.googleapis.com/token"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("code_verifier=")))
                .andRespond(withSuccess("{\"access_token\":\"provider-token\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://openidconnect.googleapis.com/v1/userinfo"))
                .andExpect(header("Authorization", "Bearer provider-token"))
                .andRespond(withSuccess("{\"sub\":\"google-subject\",\"name\":\"작업자\"}", MediaType.APPLICATION_JSON));
    }
    @Test void stateSecretPkceReplayAndRetry() {
        var attempt = start("google");
        assertTrue(value(attempt, "authorizationUrl").contains("code_challenge_method=S256"));
        assertFalse(value(attempt, "authorizationUrl").contains(value(attempt, "pollToken")));
        assertThrows(ResponseStatusException.class, () -> service.poll(value(attempt, "flowId"), "wrong"));
        assertThrows(ResponseStatusException.class, () -> service.callback("kakao", value(attempt, "flowId"), "code", null));
        assertEquals(true, service.poll(value(attempt, "flowId"), value(attempt, "pollToken")).get("pending"));
        googleResponse(); service.callback("google", value(attempt, "flowId"), "code", null);
        assertEquals("app-access", service.poll(value(attempt, "flowId"), value(attempt, "pollToken")).get("accessToken"));
        service.poll(value(attempt, "flowId"), value(attempt, "pollToken")); verify(sessions, times(1)).issue(7L);
        assertThrows(ResponseStatusException.class, () -> service.callback("google", value(attempt, "flowId"), "code", null));
        server.verify();
    }
    @Test void cancelledAttemptCannotCompleteOrLeaveAnIssuedSession() {
        var pending = start("google"); service.cancel(value(pending, "flowId"), value(pending, "pollToken"));
        assertThrows(ResponseStatusException.class, () -> service.callback("google", value(pending, "flowId"), "code", null));
        var complete = start("google"); googleResponse(); service.callback("google", value(complete, "flowId"), "code", null);
        service.cancel(value(complete, "flowId"), value(complete, "pollToken")); verify(sessions).logout("app-refresh");
    }
    @Test void denialAndWrongReauthenticationNeverIssueSessions() {
        var denied = start("google"); service.callback("google", value(denied, "flowId"), null, "access_denied");
        assertTrue(service.poll(value(denied, "flowId"), value(denied, "pollToken")).containsKey("error"));
        var verifyAttempt = service.start("google", 9L, true);
        googleResponse(); when(accounts.resolve("google", "google-subject", "작업자", 9L, true)).thenThrow(new IllegalArgumentException("다른 계정"));
        service.callback("google", value(verifyAttempt, "flowId"), "code", null);
        assertTrue(service.poll(value(verifyAttempt, "flowId"), value(verifyAttempt, "pollToken")).containsKey("error"));
        verify(sessions, never()).issue(anyLong());
    }
    @Test void verificationIsBoundToAccountAndRevocable() {
        String credential = verification.issue(7L);
        assertTrue(verification.valid(7L, credential)); assertFalse(verification.valid(8L, credential));
        verification.revoke(7L); assertFalse(verification.valid(7L, credential));
    }
    @Test void kakaoUsesItsOwnTokenAndProfileEndpoints() {
        var attempt = start("kakao");
        server.expect(requestTo("https://kauth.kakao.com/oauth/token")).andRespond(withSuccess("{\"access_token\":\"kakao-token\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://kapi.kakao.com/v2/user/me")).andExpect(header("Authorization", "Bearer kakao-token"))
                .andRespond(withSuccess("{\"id\":12345,\"properties\":{\"nickname\":\"작업자\"}}", MediaType.APPLICATION_JSON));
        service.callback("kakao", value(attempt, "flowId"), "code", null);
        verify(accounts).resolve("kakao", "12345", "작업자", null, false); server.verify();
    }
}
