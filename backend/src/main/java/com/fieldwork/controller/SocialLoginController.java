package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.SocialAccountService;
import com.fieldwork.service.SocialLoginService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/social")
public class SocialLoginController {
    private final SocialLoginService social;
    private final SocialAccountService accounts;
    public SocialLoginController(SocialLoginService social, SocialAccountService accounts) { this.social = social; this.accounts = accounts; }
    @GetMapping("/providers") public Map<String, Boolean> providers() { return social.providers(); }
    @GetMapping("/identities") public java.util.List<String> identities() { return accounts.providers(CurrentUser.id()); }
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
                .body("<!doctype html><html lang='ko'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>로그인 확인</title><body style='font-family:sans-serif;padding:40px;text-align:center'><h2>인증 요청을 처리했습니다</h2><p>앱으로 돌아가 결과를 확인해 주세요.</p><a href='pang3://auth/social'>앱으로 돌아가기</a></body></html>");
    }
    private ResponseEntity<Map<String, Object>> result(Map<String, Object> body) { return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body); }
}
