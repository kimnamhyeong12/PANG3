package com.fieldwork.service;

import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.SupportInquiryRepository;
import com.fieldwork.entity.SupportInquiry;
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
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupportInquiryService {
    private static final String INBOX = "pang3.apps@gmail.com";
    private record Window(long start, int count) {}
    private final Map<Long, Window> windows = new HashMap<>();
    private final UserRepository users;
    private final SupportInquiryRepository inquiries;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from;
    private final org.springframework.context.ApplicationEventPublisher events;
    private final SupportAttachmentService files;
    public record MailNotification(Long inquiryId, SimpleMailMessage message) {}

    public SupportInquiryService(UserRepository users, SupportInquiryRepository inquiries, ObjectProvider<JavaMailSender> mail, org.springframework.context.ApplicationEventPublisher events, SupportAttachmentService files,
            @Value("${fieldwork.auth.mail-from:}") String from) {
        this.users = users; this.inquiries = inquiries; this.mail = mail; this.from = from; this.events = events; this.files = files;
    }

    @Transactional
    public Long send(Long userId, String replyEmail, String subject, String content, String appVersion, String platform) {
        return send(userId, replyEmail, subject, content, appVersion, platform, null, null);
    }

    @Transactional
    public Long send(Long userId, String replyEmail, String subject, String content, String appVersion, String platform, String category, String requestKey) {
        return send(userId, replyEmail, subject, content, appVersion, platform, category, requestKey, java.util.List.of());
    }

    @Transactional
    public Long send(Long userId, String replyEmail, String subject, String content, String appVersion, String platform, String category, String requestKey, java.util.List<org.springframework.web.multipart.MultipartFile> attachments) {
        var user = users.findById(userId).filter(u -> !"DELETED".equals(u.getRole()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "다시 로그인해 주세요."));
        String key = requestKey == null || requestKey.isBlank() ? java.util.UUID.randomUUID().toString() : text(requestKey, 80, "요청 번호");
        var previous = inquiries.findByUser_UserIdAndRequestKey(userId, key);
        if (previous.isPresent()) return previous.get().id;
        files.validate(attachments);
        String reply = text(replyEmail, 254, "답변 이메일");
        try { new InternetAddress(reply, true).validate(); }
        catch (AddressException error) { throw invalid("이메일 주소를 확인해 주세요."); }
        if (!reply.contains("@") || reply.indexOf('\r') >= 0 || reply.indexOf('\n') >= 0) throw invalid("이메일 주소를 확인해 주세요.");
        String title = text(subject, 100, "제목");
        if (title.indexOf('\r') >= 0 || title.indexOf('\n') >= 0) throw invalid("제목은 한 줄로 입력해 주세요.");
        String body = text(content, 5000, "문의 내용");
        String type = category == null || category.isBlank() ? "기타" : text(category, 30, "문의 유형");
        if (!java.util.List.of("이용 방법", "오류 신고", "계정", "결제·환불", "대량 데이터 등록 요청", "기타").contains(type)) throw invalid("문의 유형을 확인해 주세요.");
        if (!allow(userId, System.currentTimeMillis()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "문의가 많습니다. 잠시 후 다시 시도해 주세요.");
        SupportInquiry inquiry = new SupportInquiry();
        inquiry.user = user; inquiry.requestKey = key; inquiry.replyEmail = reply; inquiry.category = type;
        inquiry.subject = title; inquiry.message = body; inquiry.appVersion = metadata(appVersion); inquiry.platform = metadata(platform);
        inquiries.saveAndFlush(inquiry);
        files.save(inquiry, attachments);
        // The database is the source of truth. An email outage must not reject an accepted ticket.
        JavaMailSender sender = mail.getIfAvailable();
        if (sender == null || from.isBlank()) return inquiry.id;
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from); message.setTo(INBOX); message.setReplyTo(reply);
        message.setSubject("[핀워크 문의] " + title);
        message.setText("문의 번호: " + inquiry.id + "\n문의 계정: " + user.getLoginId() + " (" + user.getUserId() + ")\n"
            + "답변 이메일: " + reply + "\n"
            + "문의 유형: " + type + "\n앱 버전: " + metadata(appVersion) + " / " + metadata(platform) + "\n\n" + body
            + "\n\n첨부파일: " + inquiry.attachments.size() + "개 (관리자 문의함에서 확인)"
            + "\n앱에 답변을 표시하려면 관리자 문의함에서 답변을 등록해 주세요. 이 메일에 직접 답장한 내용은 앱에 표시되지 않습니다.");
        events.publishEvent(new MailNotification(inquiry.id, message));
        return inquiry.id;
    }

    @org.springframework.transaction.event.TransactionalEventListener(phase = org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT)
    public void notifyOperator(MailNotification notification) {
        JavaMailSender sender = mail.getIfAvailable();
        if (sender == null) return;
        try { sender.send(notification.message()); }
        catch (MailException error) {
            org.slf4j.LoggerFactory.getLogger(SupportInquiryService.class).warn("Support email notification failed for inquiry {}", notification.inquiryId());
        }
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
    // Single-server guard, matching the current deployment. Contains only rate-limit counters.
    private synchronized boolean allow(Long id, long now) {
        windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= 3600000);
        Window current = windows.get(id);
        if (current == null && windows.size() >= 10000 || current != null && current.count() >= 5) return false;
        windows.put(id, new Window(current == null ? now : current.start(), current == null ? 1 : current.count() + 1));
        return true;
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
