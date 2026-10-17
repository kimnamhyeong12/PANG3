package com.fieldwork.service;

import com.fieldwork.repository.UserRepository;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SupportInquiryService {
    private static final String INBOX = "pang3.apps@gmail.com";
    private record Window(long start, int count) {}
    private final Map<Long, Window> windows = new HashMap<>();
    private final UserRepository users;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from;

    public SupportInquiryService(UserRepository users, ObjectProvider<JavaMailSender> mail,
            @Value("${fieldwork.auth.mail-from:}") String from) {
        this.users = users; this.mail = mail; this.from = from;
    }

    public void send(Long userId, String replyEmail, String subject, String content, String appVersion, String platform) {
        var user = users.findById(userId).filter(u -> !"DELETED".equals(u.getRole()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "다시 로그인해 주세요."));
        String reply = text(replyEmail, 254, "답변받을 이메일");
        try { new InternetAddress(reply, true).validate(); }
        catch (AddressException error) { throw invalid("이메일 주소를 확인해 주세요."); }
        if (!reply.contains("@") || reply.indexOf('\r') >= 0 || reply.indexOf('\n') >= 0) throw invalid("이메일 주소를 확인해 주세요.");
        String title = text(subject, 100, "제목");
        if (title.indexOf('\r') >= 0 || title.indexOf('\n') >= 0) throw invalid("제목은 한 줄로 입력해 주세요.");
        String body = text(content, 5000, "문의 내용");
        JavaMailSender sender = mail.getIfAvailable();
        if (sender == null || from.isBlank()) throw unavailable();
        if (!allow(userId, System.currentTimeMillis()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "문의가 많습니다. 잠시 후 다시 시도해 주세요.");
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from); message.setTo(INBOX); message.setReplyTo(reply);
        message.setSubject("[PANG3 문의] " + title);
        message.setText("문의 계정: " + user.getLoginId() + " (" + user.getUserId() + ")\n"
            + "답변받을 이메일: " + reply + "\n"
            + "앱 버전: " + metadata(appVersion) + " / " + metadata(platform) + "\n\n" + body);
        try { sender.send(message); }
        catch (MailException error) { throw unavailable(); }
    }

    private static String text(String value, int max, String label) {
        String result = value == null ? "" : value.trim();
        if (result.isEmpty() || result.length() > max || result.indexOf('\0') >= 0)
            throw invalid(label + "을(를) 1~" + max + "자 이내로 입력해 주세요.");
        return result;
    }
    private static String metadata(String value) {
        return value == null ? "알 수 없음" : value.replaceAll("[\\r\\n\\p{Cntrl}]", " ").substring(0, Math.min(value.length(), 80));
    }
    // Single-server guard, matching the current deployment. Does not store inquiry contents.
    private synchronized boolean allow(Long id, long now) {
        windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= 3600000);
        Window current = windows.get(id);
        if (current == null && windows.size() >= 10000 || current != null && current.count() >= 5) return false;
        windows.put(id, new Window(current == null ? now : current.start(), current == null ? 1 : current.count() + 1));
        return true;
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "문의를 전송하지 못했습니다. 입력 내용은 유지되니 잠시 후 다시 시도해 주세요.");
    }
}
