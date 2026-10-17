package com.fieldwork.controller;

import com.fieldwork.service.AuthSessionService;
import com.fieldwork.security.CurrentUser;
import com.fieldwork.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import com.fieldwork.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthSessionService sessions;
    private final UserRepository users;
    private final boolean secureCookie;
    private final long refreshSeconds;
    private final com.fieldwork.service.AccountEmailService email;

    public AuthController(AuthService authService, AuthSessionService sessions, UserRepository users, com.fieldwork.service.AccountEmailService email,
            @Value("${fieldwork.auth.cookie-secure:true}") boolean secureCookie,
            @Value("${fieldwork.auth.refresh-seconds:7776000}") long refreshSeconds) {
        this.authService = authService;
        this.sessions = sessions; this.users = users;
        this.secureCookie = secureCookie; this.refreshSeconds = refreshSeconds;
        this.email = email;
    }

    @GetMapping("/login-id/availability")
    public Map<String, Object> loginIdAvailability(@RequestParam String loginId) {
        String value = loginId.trim();
        if (!value.matches("[A-Za-z0-9_.-]{3,50}")) throw new IllegalArgumentException("아이디는 영문, 숫자 또는 _, ., -를 사용해 3~50자로 입력해 주세요.");
        return Map.of("loginId", value, "available", !users.existsByLoginId(value));
    }

    @PostMapping("/register")
    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> register(@RequestBody Map<String, String> body) {
        String loginId = body.get("loginId");
        String password = body.get("password");
        if (loginId == null || !loginId.trim().matches("[A-Za-z0-9_.-]{3,50}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "아이디는 영문, 숫자 또는 특수문자(_, ., -)를 사용해 3~50자로 입력해 주세요.");
        }
        if (password == null || password.isBlank() || password.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호는 8자 이상 입력해 주세요.");
        }
        if (password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호가 너무 길어요. 조금 줄여서 입력해 주세요.");
        }
        String name = body.get("name");
        if (name == null || name.isBlank() || name.trim().length() > 50) {
            throw new IllegalArgumentException("이름은 1~50자로 입력해 주세요.");
        }
        name = name.trim();
        String workSido = body.get("workSido");
        String workSigungu = body.get("workSigungu");

        var registered = authService.register(loginId.trim(), password, name, workSido, workSigungu, body.get("workplaceAddress"),
                body.get("workplaceLat") == null ? null : Double.valueOf(body.get("workplaceLat")),
                body.get("workplaceLng") == null ? null : Double.valueOf(body.get("workplaceLng")));
        if (body.get("email") != null && !body.get("email").isBlank()) email.requestVerification(registered, body.get("email"));
        return AuthSessionService.userInfo(registered);
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String loginId = body.get("loginId");
        String password = body.get("password");

        Map<String, Object> result;
        try { result = authService.login(loginId, password); }
        catch (RuntimeException ex) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 틀렸습니다."); }
        return tokenResponse(sessions.issue((Long) result.get("userId")), request);
    }

    @DeleteMapping("/account")
    public ResponseEntity<Map<String, Object>> deleteAccount(@RequestBody Map<String, String> body) {
        Long id = CurrentUser.id();
        var user = users.findById(id).orElseThrow();
        if (!user.getLoginId().equals(body.get("loginId"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "본인 계정만 탈퇴할 수 있습니다.");
        var result = authService.deleteAccount(user.getLoginId(), body.get("password"));
        sessions.revokeAll(id);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie("", 0)).body(result);
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh(@RequestBody(required = false) Map<String, String> body, HttpServletRequest request) {
        return tokenResponse(sessions.refresh(refreshToken(body, request)), request);
    }
    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(@RequestBody(required = false) Map<String, String> body, HttpServletRequest request) {
        sessions.logout(refreshToken(body, request));
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie("", 0)).body(Map.of("message", "로그아웃되었습니다."));
    }
    @GetMapping("/me")
    public Map<String, Object> me() { return AuthSessionService.userInfo(users.findById(CurrentUser.id()).orElseThrow()); }

    private ResponseEntity<Map<String, Object>> tokenResponse(Map<String, Object> result, HttpServletRequest request) {
        var builder = ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store");
        if ("web".equals(request.getHeader("X-Auth-Client"))) {
            builder.header(HttpHeaders.SET_COOKIE, cookie((String) result.remove("refreshToken"), refreshSeconds));
        } else if (!"native".equals(request.getHeader("X-Auth-Client"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "로그인 클라이언트 정보가 필요합니다.");
        }
        return builder.body(result);
    }
    private String refreshToken(Map<String, String> body, HttpServletRequest request) {
        if ("native".equals(request.getHeader("X-Auth-Client"))) return body == null ? null : body.get("refreshToken");
        if (!"web".equals(request.getHeader("X-Auth-Client"))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "로그인 클라이언트 정보가 필요합니다.");
        if (request.getCookies() != null) for (var cookie : request.getCookies()) if ("pang3_refresh".equals(cookie.getName())) return cookie.getValue();
        return null;
    }
    private String cookie(String value, long seconds) {
        return ResponseCookie.from("pang3_refresh", value).httpOnly(true).secure(secureCookie).sameSite("Lax")
                .path("/api/auth").maxAge(java.time.Duration.ofSeconds(seconds)).build().toString();
    }
}
