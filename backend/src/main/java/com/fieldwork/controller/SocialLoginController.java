package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.SocialAccountService;
import com.fieldwork.service.SocialLoginService;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/social")
public class SocialLoginController {
    private static final String CALLBACK_PAGE = loadCallbackPage();
    private final SocialLoginService social;
    private final SocialAccountService accounts;
    public SocialLoginController(SocialLoginService social, SocialAccountService accounts) { this.social = social; this.accounts = accounts; }
    @GetMapping("/providers") public Map<String, Boolean> providers() { return social.providers(); }
    @GetMapping("/identities") public java.util.List<String> identities() { return accounts.providers(CurrentUser.id()); }
    @PostMapping("/complete-profile") public ResponseEntity<Map<String, Object>> completeProfile(@RequestBody SocialAccountService.ProfileInput body) {
        return result(accounts.completeProfile(CurrentUser.id(), body));
    }
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> invalidProfile(IllegalArgumentException error) {
        return ResponseEntity.badRequest().header(HttpHeaders.CACHE_CONTROL, "no-store").body(Map.of("message", error.getMessage()));
    }
    @PostMapping("/{provider}/start") public ResponseEntity<Map<String, Object>> start(@PathVariable String provider) { return result(social.start(provider, null, false)); }
    @PostMapping("/{provider}/link") public ResponseEntity<Map<String, Object>> link(@PathVariable String provider) { return result(social.start(provider, CurrentUser.id(), false)); }
    @PostMapping("/{provider}/verify") public ResponseEntity<Map<String, Object>> verify(@PathVariable String provider) { return result(social.start(provider, CurrentUser.id(), true)); }
    public record PollRequest(String flowId, String pollToken) {}
    @PostMapping("/poll") public ResponseEntity<Map<String, Object>> poll(@RequestBody PollRequest body) { return result(social.poll(body.flowId(), body.pollToken())); }
    @PostMapping("/cancel") public ResponseEntity<Map<String, Object>> cancel(@RequestBody PollRequest body) { social.cancel(body.flowId(), body.pollToken()); return result(Map.of("cancelled", true)); }
    @GetMapping(value = "/{provider}/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> callback(@PathVariable String provider, @RequestParam(required = false) String state,
            @RequestParam(required = false) String code, @RequestParam(required = false) String error) {
        social.callback(provider, state, code, error);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").header("Referrer-Policy", "no-referrer")
                .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
                .body(CALLBACK_PAGE);
    }
    private static String loadCallbackPage() {
        try (var stream = new ClassPathResource("templates/social-auth-result.html").getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new UncheckedIOException("소셜 인증 안내 화면을 불러오지 못했습니다.", error);
        }
    }
    private ResponseEntity<Map<String, Object>> result(Map<String, Object> body) { return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body); }
}
