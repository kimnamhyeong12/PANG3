package com.fieldwork.controller;

import com.fieldwork.entity.User;
import com.fieldwork.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin("*")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public User register(@RequestBody Map<String, String> body) {
        String loginId = body.get("loginId");
        String password = body.get("password");
        String name = body.get("name");

        return authService.register(loginId, password, name);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        String loginId = body.get("loginId");
        String password = body.get("password");

        return authService.login(loginId, password);
    }
}