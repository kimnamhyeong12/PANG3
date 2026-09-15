package com.fieldwork.service;

import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final GroupService groupService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            GroupService groupService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.groupService = groupService;
    }

    @Transactional
    public User register(String loginId, String password, String name) {
        if (userRepository.existsByLoginId(loginId)) {
            throw new RuntimeException("이미 존재하는 아이디입니다.");
        }

        User user = new User();
        user.setLoginId(loginId);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setRole("USER");

        User savedUser = userRepository.save(user);
        groupService.ensurePersonalGroup(savedUser);
        return savedUser;
    }

    @Transactional
    public Map<String, Object> login(String loginId, String password) {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new RuntimeException("아이디 또는 비밀번호가 틀렸습니다."));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("아이디 또는 비밀번호가 틀렸습니다.");
        }

        // 기존 가입자도 첫 로그인 시 자동 1인 그룹과 기존 개인 데이터를 생성/이전한다.
        groupService.ensurePersonalGroup(user);

        Map<String, Object> result = new HashMap<>();
        result.put("message", "로그인 성공");
        result.put("userId", user.getUserId());
        result.put("loginId", user.getLoginId());
        result.put("name", user.getName());
        result.put("role", user.getRole());

        return result;
    }
}
