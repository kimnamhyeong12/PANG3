package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;

import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;
    private final org.springframework.security.crypto.password.PasswordEncoder encoder;
    private final com.fieldwork.service.AuthSessionService sessions;

    public UserController(UserRepository userRepository, org.springframework.security.crypto.password.PasswordEncoder encoder, com.fieldwork.service.AuthSessionService sessions) {
        this.userRepository = userRepository; this.encoder = encoder; this.sessions = sessions;
    }

    private User verifiedUser(Long userId, String password) {
        CurrentUser.require(userId);
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        if ("DELETED".equals(user.getRole()) || password == null || !encoder.matches(password, user.getPassword()))
            throw new IllegalArgumentException("현재 비밀번호를 확인해 주세요.");
        return user;
    }

    @PostMapping("/{userId}/account/verify")
    public Map<String, Object> verifyAccount(@PathVariable Long userId, @RequestBody Map<String, String> body) {
        return com.fieldwork.service.AuthSessionService.userInfo(verifiedUser(userId, body.get("password")));
    }

    @PatchMapping("/{userId}/account")
    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> updateAccount(@PathVariable Long userId, @RequestBody Map<String, Object> body) {
        User user = verifiedUser(userId, (String) body.get("currentPassword"));
        String name = (String) body.get("name"), sido = (String) body.get("workSido"), district = (String) body.get("workSigungu");
        if (name == null || name.isBlank() || name.trim().length() > 50) throw new IllegalArgumentException("이름은 1~50자로 입력해 주세요.");
        if (sido == null || sido.isBlank() || district == null || district.isBlank()) throw new IllegalArgumentException("근무지역을 선택해 주세요.");
        String address = (String) body.get("workplaceAddress");
        Double lat = body.get("workplaceLat") instanceof Number number ? number.doubleValue() : null;
        Double lng = body.get("workplaceLng") instanceof Number number ? number.doubleValue() : null;
        com.fieldwork.service.Workplace.validate(address, lat, lng);
        String password = (String) body.get("newPassword");
        boolean changedPassword = password != null && !password.isEmpty();
        if (changedPassword && (password.length() < 8 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72))
            throw new IllegalArgumentException("새 비밀번호는 8자 이상으로 입력하고, 너무 길면 줄여 주세요.");
        user.setName(name.trim()); user.setWorkSido(sido.trim()); user.setWorkSigungu(district.trim());
        user.setWorkplaceAddress(address.trim()); user.setWorkplaceLat(lat); user.setWorkplaceLng(lng);
        if (changedPassword) { user.setPassword(encoder.encode(password)); sessions.revokeAll(userId); }
        userRepository.saveAndFlush(user);
        Map<String, Object> result = com.fieldwork.service.AuthSessionService.userInfo(user);
        result.put("requiresLogin", changedPassword);
        return result;
    }

    public record WorkplaceRequest(String workplaceAddress, Double workplaceLat, Double workplaceLng) {}

    @PatchMapping("/{userId}/workplace")
    public Map<String, Object> updateWorkplace(@PathVariable Long userId, @RequestBody WorkplaceRequest body) {
        CurrentUser.require(userId);
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        if ("DELETED".equals(user.getRole())) throw new IllegalArgumentException("탈퇴한 계정입니다.");
        com.fieldwork.service.Workplace.validate(body.workplaceAddress(), body.workplaceLat(), body.workplaceLng());
        user.setWorkplaceAddress(body.workplaceAddress().trim()); user.setWorkplaceLat(body.workplaceLat()); user.setWorkplaceLng(body.workplaceLng());
        userRepository.save(user);
        return Map.of("workplaceAddress", user.getWorkplaceAddress(), "workplaceLat", user.getWorkplaceLat(), "workplaceLng", user.getWorkplaceLng());
    }

    @PatchMapping("/{userId}/work-region")
    public Map<String, Object> updateWorkRegion(
            @PathVariable Long userId,
            @RequestBody Map<String, String> body) {
        CurrentUser.require(userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        if ("DELETED".equals(user.getRole())) {
            throw new IllegalArgumentException("탈퇴한 계정입니다.");
        }

        String workSido = body.get("workSido");
        if (workSido == null || workSido.isBlank()) {
            throw new RuntimeException("근무지역을 선택해주세요.");
        }

        user.setWorkSido(workSido.trim());
        user.setWorkSigungu(body.get("workSigungu"));
        userRepository.save(user);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", user.getUserId());
        result.put("loginId", user.getLoginId());
        result.put("name", user.getName());
        result.put("role", user.getRole());
        result.put("workSido", user.getWorkSido());
        result.put("workSigungu", user.getWorkSigungu());
        result.put("workplaceAddress", user.getWorkplaceAddress());
        result.put("workplaceLat", user.getWorkplaceLat());
        result.put("workplaceLng", user.getWorkplaceLng());
        return result;
    }
}
