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
    @org.springframework.beans.factory.annotation.Autowired private com.fieldwork.service.SocialVerificationService socialVerification;

    public UserController(UserRepository userRepository, org.springframework.security.crypto.password.PasswordEncoder encoder, com.fieldwork.service.AuthSessionService sessions) {
        this.userRepository = userRepository; this.encoder = encoder; this.sessions = sessions;
    }

    private User verifiedUser(Long userId, String password) {
        return verifiedUser(userId, password, false);
    }
    private User verifiedUser(Long userId, String password, boolean lock) {
        CurrentUser.require(userId);
        User user = (lock ? userRepository.findProfileForUpdate(userId) : userRepository.findById(userId)).orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        if ("DELETED".equals(user.getRole()) || password == null ||
                !(socialVerification != null && socialVerification.valid(userId, password) || user.isPasswordLoginEnabled() && encoder.matches(password, user.getPassword())))
            throw new IllegalArgumentException("현재 비밀번호를 확인해 주세요.");
        return user;
    }

    @PostMapping("/{userId}/account/verify")
    public Map<String, Object> verifyAccount(@PathVariable Long userId, @RequestBody Map<String, String> body) {
        return com.fieldwork.service.AuthSessionService.userInfo(verifiedUser(userId, body.get("password")));
    }

    public record LoginCredentialsRequest(String loginId, String password, String credential) {}

    @PostMapping("/{userId}/login-credentials")
    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> setupLoginCredentials(@PathVariable Long userId, @RequestBody LoginCredentialsRequest body) {
        CurrentUser.require(userId);
        User user = userRepository.findProfileForUpdate(userId).orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        boolean setup = user.isLoginSetupRequired();
        String credential = body.credential();
        boolean socialVerified = socialVerification != null && socialVerification.valid(userId, credential);
        boolean passwordVerified = !setup && credential != null && user.isPasswordLoginEnabled() && encoder.matches(credential, user.getPassword());
        if ("DELETED".equals(user.getRole()) || !(socialVerified || passwordVerified))
            throw new IllegalArgumentException(setup ? "연결된 Google·카카오 계정으로 다시 인증해 주세요." : "현재 비밀번호 또는 연결된 Google·카카오 계정으로 다시 인증해 주세요.");
        if (user.isSocialProfilePending()) throw new IllegalArgumentException("간편가입 정보를 먼저 확인해 주세요.");
        String loginId = body.loginId() == null ? "" : body.loginId().trim();
        if (!loginId.matches("[A-Za-z0-9_.-]{3,50}") || User.isGeneratedLoginId(loginId))
            throw new IllegalArgumentException("아이디는 영문, 숫자 또는 _, ., -를 사용해 3~50자로 입력해 주세요.");
        String password = body.password();
        if (setup && (password == null || password.isBlank() || password.length() < 8 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72))
            throw new IllegalArgumentException("비밀번호는 8자 이상으로 입력하고, 너무 길면 줄여 주세요.");
        if (!setup && password != null && !password.isEmpty()) throw new IllegalArgumentException("비밀번호는 비밀번호 변경에서 변경해 주세요.");
        if (loginId.equals(user.getLoginId())) throw new IllegalArgumentException("현재 아이디와 다른 아이디를 입력해 주세요.");
        if (userRepository.existsByLoginId(loginId)) throw new IllegalArgumentException("이미 사용 중인 아이디입니다.");
        user.setLoginId(loginId);
        if (setup) { user.setPassword(encoder.encode(password)); user.setPasswordLoginEnabled(true); }
        try { userRepository.saveAndFlush(user); }
        catch (org.springframework.dao.DataIntegrityViolationException failure) { throw new IllegalArgumentException("이미 사용 중인 아이디입니다."); }
        sessions.revokeAll(userId);
        socialVerification.revoke(userId);
        Map<String, Object> result = com.fieldwork.service.AuthSessionService.userInfo(user);
        result.put("requiresLogin", true);
        return result;
    }

    @PatchMapping("/{userId}/account")
    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> updateAccount(@PathVariable Long userId, @RequestBody Map<String, Object> body) {
        User user = verifiedUser(userId, (String) body.get("currentPassword"), true);
        String name = (String) body.get("name"), sido = (String) body.get("workSido"), district = (String) body.get("workSigungu");
        if (name == null || name.isBlank() || name.trim().length() > 50) throw new IllegalArgumentException("이름은 1~50자로 입력해 주세요.");
        com.fieldwork.service.WorkRegion.validateOptional(sido, district);
        String address = (String) body.get("workplaceAddress");
        Double lat = body.get("workplaceLat") instanceof Number number ? number.doubleValue() : null;
        Double lng = body.get("workplaceLng") instanceof Number number ? number.doubleValue() : null;
        if ((address != null && !address.isBlank()) || lat != null || lng != null) {
            com.fieldwork.service.Workplace.validate(address, lat, lng);
        }
        String password = (String) body.get("newPassword");
        boolean changedPassword = password != null && !password.isEmpty();
        if (changedPassword && user.isLoginSetupRequired()) throw new IllegalArgumentException("아이디·비밀번호 설정에서 사용할 아이디와 비밀번호를 함께 등록해 주세요.");
        if (changedPassword && (password.length() < 8 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72))
            throw new IllegalArgumentException("새 비밀번호는 8자 이상으로 입력하고, 너무 길면 줄여 주세요.");
        user.setName(name.trim());
        user.setWorkSido(sido == null || sido.isBlank() ? null : sido.trim());
        user.setWorkSigungu(district == null || district.isBlank() ? null : district.trim());
        user.setWorkplaceAddress(address == null || address.isBlank() ? null : address.trim()); user.setWorkplaceLat(lat); user.setWorkplaceLng(lng);
        if (changedPassword) { user.setPassword(encoder.encode(password)); user.setPasswordLoginEnabled(true); sessions.revokeAll(userId); }
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
