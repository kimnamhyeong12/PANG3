package com.fieldwork.service;

import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.PushTokenRepository;
import com.fieldwork.repository.GroupInvitationRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final GroupService groupService;
    private final PushTokenRepository pushTokenRepository;
    private final GroupInvitationRepository groupInvitationRepository;
    @org.springframework.beans.factory.annotation.Autowired private SocialVerificationService socialVerification;
    @org.springframework.beans.factory.annotation.Autowired private com.fieldwork.repository.SocialIdentityRepository socialIdentities;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            GroupService groupService,
            PushTokenRepository pushTokenRepository,
            GroupInvitationRepository groupInvitationRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.groupService = groupService;
        this.pushTokenRepository = pushTokenRepository;
        this.groupInvitationRepository = groupInvitationRepository;
    }

    @Transactional
    public User register(String loginId, String password, String name, String workSido, String workSigungu) {
        return register(loginId, password, name, workSido, workSigungu, null, null, null);
    }

    @Transactional
    public User register(String loginId, String password, String name, String workSido, String workSigungu,
                         String workplaceAddress, Double workplaceLat, Double workplaceLng) {
        WorkRegion.validateOptional(workSido, workSigungu);
        if (workplaceAddress != null || workplaceLat != null || workplaceLng != null) {
            Workplace.validate(workplaceAddress, workplaceLat, workplaceLng);
        }
        if (userRepository.existsByLoginId(loginId)) {
            throw new RuntimeException("이미 존재하는 아이디입니다.");
        }

        User user = new User();
        user.setLoginId(loginId);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setRole("USER");
        user.setWorkSido(workSido == null || workSido.isBlank() ? null : workSido.trim());
        user.setWorkSigungu(workSigungu == null || workSigungu.isBlank() ? null : workSigungu.trim());

        user.setWorkplaceAddress(workplaceAddress == null ? null : workplaceAddress.trim());
        user.setWorkplaceLat(workplaceLat);
        user.setWorkplaceLng(workplaceLng);
        User savedUser = userRepository.save(user);
        groupService.ensurePersonalGroup(savedUser);
        return savedUser;
    }

    @Transactional
    public Map<String, Object> login(String loginId, String password) {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new RuntimeException("아이디 또는 비밀번호가 틀렸습니다."));

        if ("DELETED".equals(user.getRole()) || !user.isPasswordLoginEnabled() || password == null
                || !passwordEncoder.matches(password, user.getPassword())) {
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
        result.put("workSido", user.getWorkSido());
        result.put("workSigungu", user.getWorkSigungu());
        result.put("workplaceAddress", user.getWorkplaceAddress());
        result.put("workplaceLat", user.getWorkplaceLat());
        result.put("workplaceLng", user.getWorkplaceLng());

        return result;
    }

    @Transactional
    public Map<String, Object> deleteAccount(String loginId, String password) {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new IllegalArgumentException("아이디 또는 비밀번호가 틀렸습니다."));
        if ("DELETED".equals(user.getRole()) || password == null
                || !(socialVerification.valid(user.getUserId(), password) || user.isPasswordLoginEnabled() && passwordEncoder.matches(password, user.getPassword()))) {
            throw new IllegalArgumentException("아이디 또는 비밀번호가 틀렸습니다.");
        }

        groupService.leaveAllGroupsForDeletedUser(user);
        socialIdentities.deleteByUser_UserId(user.getUserId());
        socialVerification.revoke(user.getUserId());
        groupInvitationRepository.findByInviterAndStatus(user, "PENDING")
                .forEach(invitation -> invitation.setStatus("REJECTED"));
        groupInvitationRepository.findByInviteeAndStatus(user, "PENDING")
                .forEach(invitation -> invitation.setStatus("REJECTED"));
        pushTokenRepository.findByUserAndActiveTrue(user)
                .forEach(token -> token.setActive(false));

        // 기존 업무와 보고서의 작성자 FK는 유지하고 계정 정보만 익명화한다.
        user.setLoginId("deleted-" + user.getUserId() + "-" + UUID.randomUUID());
        user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setName("탈퇴한 사용자");
        user.setWorkSido(null);
        user.setWorkSigungu(null);
        user.setWorkplaceAddress(null); user.setWorkplaceLat(null); user.setWorkplaceLng(null);
        user.setRole("DELETED");
        user.setEmail(null);

        return Map.of("message", "계정 탈퇴가 완료되었습니다.");
    }
}
