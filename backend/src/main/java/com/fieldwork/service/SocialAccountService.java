package com.fieldwork.service;

import com.fieldwork.entity.SocialIdentity;
import com.fieldwork.entity.User;
import com.fieldwork.repository.SocialIdentityRepository;
import com.fieldwork.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

@Service
public class SocialAccountService {
    private final SocialIdentityRepository identities;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final GroupService groups;
    public SocialAccountService(SocialIdentityRepository identities, UserRepository users, PasswordEncoder encoder, GroupService groups) {
        this.identities = identities; this.users = users; this.encoder = encoder; this.groups = groups;
    }
    @Transactional
    public synchronized Long resolve(String provider, String subject, String name, Long accountId, boolean verifyOnly) {
        if (subject == null || subject.isBlank() || subject.length() > 255) throw new IllegalArgumentException("소셜 계정을 확인하지 못했습니다.");
        SocialIdentity existing = identities.findByProviderAndSubject(provider, subject).orElse(null);
        if (verifyOnly) {
            if (existing == null || !existing.getUser().getUserId().equals(accountId)) throw new IllegalArgumentException("현재 앱 계정에 연결된 소셜 계정으로 인증해 주세요.");
            if ("DELETED".equals(existing.getUser().getRole())) throw new IllegalArgumentException("탈퇴한 계정입니다.");
            return accountId;
        }
        if (existing != null) {
            if (accountId != null && !existing.getUser().getUserId().equals(accountId)) throw new IllegalArgumentException("다른 앱 계정에 이미 연결된 소셜 계정입니다.");
            if ("DELETED".equals(existing.getUser().getRole())) throw new IllegalArgumentException("탈퇴한 계정입니다.");
            groups.ensurePersonalGroup(existing.getUser());
            return existing.getUser().getUserId();
        }
        User user;
        if (accountId != null) {
            user = users.findById(accountId).orElseThrow();
            if ("DELETED".equals(user.getRole())) throw new IllegalArgumentException("탈퇴한 계정입니다.");
            if (identities.findByUser_UserIdAndProvider(accountId, provider).isPresent()) throw new IllegalArgumentException("이미 다른 소셜 계정이 연결되어 있습니다.");
        } else {
            user = new User(); user.setLoginId("social-" + UUID.randomUUID());
            user.setPassword(encoder.encode(UUID.randomUUID().toString())); user.setPasswordLoginEnabled(false);
            user.setSocialProfilePending(true);
            String displayName = name == null || name.isBlank() ? "현장 작업자" : name.trim();
            user.setName(displayName.substring(0, Math.min(50, displayName.length()))); user.setRole("USER");
            user = users.saveAndFlush(user);
        }
        SocialIdentity identity = new SocialIdentity(); identity.setProvider(provider); identity.setSubject(subject); identity.setUser(user);
        identities.saveAndFlush(identity); groups.ensurePersonalGroup(user);
        return user.getUserId();
    }
    @Transactional(readOnly = true)
    public List<String> providers(Long userId) { return identities.findByUser_UserId(userId).stream().map(SocialIdentity::getProvider).toList(); }

    public record ProfileInput(String name, String workSido, String workSigungu, String workplaceAddress, Double workplaceLat, Double workplaceLng) {}

    @Transactional
    public java.util.Map<String, Object> completeProfile(Long userId, ProfileInput input) {
        User user = users.findProfileForUpdate(userId).orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        if ("DELETED".equals(user.getRole())) throw new IllegalArgumentException("탈퇴한 계정입니다.");
        // Retries after a lost success response cannot overwrite a completed account.
        if (!user.isSocialProfilePending()) return AuthSessionService.userInfo(user);
        if (user.isPasswordLoginEnabled() || identities.findByUser_UserId(userId).isEmpty())
            throw new IllegalArgumentException("소셜 가입 정보를 확인해 주세요.");
        if (input == null || input.name() == null || input.name().isBlank() || input.name().trim().length() > 50 || input.name().indexOf('\0') >= 0)
            throw new IllegalArgumentException("이름은 1~50자로 입력해 주세요.");
        WorkRegion.validateOptional(input.workSido(), input.workSigungu());
        boolean hasWorkplace = input.workplaceAddress() != null && !input.workplaceAddress().isBlank()
            || input.workplaceLat() != null || input.workplaceLng() != null;
        if (hasWorkplace) Workplace.validate(input.workplaceAddress(), input.workplaceLat(), input.workplaceLng());
        user.setName(input.name().trim());
        user.setWorkSido(input.workSido() == null || input.workSido().isBlank() ? null : input.workSido().trim());
        user.setWorkSigungu(user.getWorkSido() == null ? null : WorkRegion.normalizeSigungu(input.workSido(), input.workSigungu()));
        user.setWorkplaceAddress(hasWorkplace ? input.workplaceAddress().trim() : null);
        user.setWorkplaceLat(hasWorkplace ? input.workplaceLat() : null);
        user.setWorkplaceLng(hasWorkplace ? input.workplaceLng() : null);
        user.setSocialProfilePending(false);
        users.saveAndFlush(user);
        return AuthSessionService.userInfo(user);
    }
}
