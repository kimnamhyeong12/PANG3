package com.fieldwork.controller;

import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@CrossOrigin("*")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public record WorkplaceRequest(String workplaceAddress, Double workplaceLat, Double workplaceLng) {}

    @PatchMapping("/{userId}/workplace")
    public Map<String, Object> updateWorkplace(@PathVariable Long userId, @RequestBody WorkplaceRequest body) {
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
