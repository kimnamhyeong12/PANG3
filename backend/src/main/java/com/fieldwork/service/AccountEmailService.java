package com.fieldwork.service;

import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.Locale;

@Service
public class AccountEmailService {
    private final EmailChallengeRepository challenges;
    private final UserRepository users;
    private final AuthSessionService sessions;
    private final PasswordEncoder encoder;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from;
    private final String publicUrl;
    private final com.fieldwork.security.RequestBudget mailBudget = new com.fieldwork.security.RequestBudget();
    public AccountEmailService(EmailChallengeRepository challenges, UserRepository users, AuthSessionService sessions,
            PasswordEncoder encoder, ObjectProvider<JavaMailSender> mail,
            @Value("${fieldwork.auth.mail-from:}") String from, @Value("${fieldwork.auth.public-url:}") String publicUrl) {
        this.challenges=challenges; this.users=users; this.sessions=sessions; this.encoder=encoder;
        this.mail=mail; this.from=from; this.publicUrl=publicUrl;
    }
    @Transactional
    public void requestVerification(User user, String email) {
        String normalized = normalize(email);
        if (users.findByEmail(normalized).filter(other -> !other.getUserId().equals(user.getUserId())).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "사용할 수 없는 이메일입니다.");
        }
        sendChallenge(user, normalized, "VERIFY", "이메일 인증", "verify-email");
    }
    @Transactional
    public void updateEmail(Long userId, String password, String email) {
        User user = users.findById(userId).orElseThrow();
        if (password == null || !encoder.matches(password, user.getPassword())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "현재 비밀번호를 확인해 주세요.");
        requestVerification(user, email);
    }
    @Transactional
    public void verify(String token) {
        EmailChallenge challenge = challenge(token, "VERIFY");
        if (users.findByEmail(challenge.email).filter(other -> !other.getUserId().equals(challenge.user.getUserId())).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "사용할 수 없는 이메일입니다.");
        }
        challenge.user.setEmail(challenge.email);
        challenge.used = true;
        challenges.invalidate(challenge.user.getUserId(), "VERIFY");
        challenges.invalidate(challenge.user.getUserId(), "RESET");
    }
    @Transactional
    public void requestReset(String loginId, String email) {
        checkMail();
        String normalized = normalize(email);
        users.findByEmail(normalized).filter(user -> user.getLoginId().equals(loginId) && !"DELETED".equals(user.getRole()))
            .ifPresent(user -> sendChallenge(user, normalized, "RESET", "비밀번호 재설정", "reset-password"));
        // Return the same message whether or not an account matches.
    }
    @Transactional
    public void reset(String token, String password) {
        if (password == null || password.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호는 8자 이상 입력해 주세요.");
        }
        if (password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호가 너무 길어요. 조금 줄여서 입력해 주세요.");
        }
        EmailChallenge challenge = challenge(token, "RESET");
        if (!challenge.email.equals(challenge.user.getEmail())) throw invalid();
        challenge.user.setPassword(encoder.encode(password));
        challenge.used = true;
        challenges.invalidate(challenge.user.getUserId(), "RESET");
        challenges.invalidate(challenge.user.getUserId(), "VERIFY");
        sessions.revokeAll(challenge.user.getUserId());
    }
    private EmailChallenge challenge(String token, String purpose) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw invalid();
        EmailChallenge challenge = challenges.findLocked(AuthSessionService.hash(token)).orElseThrow(AccountEmailService::invalid);
        if (challenge.used || !purpose.equals(challenge.purpose) || !challenge.expiresAt.isAfter(Instant.now())
                || "DELETED".equals(challenge.user.getRole())) throw invalid();
        return challenge;
    }
    private void sendChallenge(User user, String email, String purpose, String subject, String page) {
        JavaMailSender sender = checkMail();
        long now = System.currentTimeMillis();
        if (!mailBudget.allow("recipient:" + purpose + ":" + AuthSessionService.hash(email), 1, 60000, now)
                || !mailBudget.allow("user:" + user.getUserId(), 5, 3600000, now))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "메일 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        String token = sessions.token();
        challenges.invalidate(user.getUserId(), purpose);
        EmailChallenge challenge = new EmailChallenge();
        challenge.user=user; challenge.email=email; challenge.purpose=purpose;
        challenge.tokenHash=AuthSessionService.hash(token); challenge.expiresAt=Instant.now().plusSeconds(1800);
        challenges.save(challenge);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from); message.setTo(email); message.setSubject("외근도우미 " + subject);
        message.setText(subject + " 링크입니다. 30분 동안 한 번 사용할 수 있습니다.\n\n"
                + publicUrl.replaceAll("/+$", "") + "/" + page + "#token=" + token
                + "\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.");
        try { sender.send(message); }
        catch (org.springframework.mail.MailException ex) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    }
    private JavaMailSender checkMail() {
        JavaMailSender sender = mail.getIfAvailable();
        if (sender == null || from.isBlank() || !publicUrl.startsWith("https://")) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송 설정이 준비되지 않았습니다.");
        }
        return sender;
    }
    private static String normalize(String email) {
        String value = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (value.length() > 254 || !value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 주소를 확인해 주세요.");
        return value;
    }
    private static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "링크가 만료되었거나 이미 사용되었습니다."); }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 3600000)
    @Transactional
    public void cleanup() { challenges.deleteExpired(Instant.now()); }
}
