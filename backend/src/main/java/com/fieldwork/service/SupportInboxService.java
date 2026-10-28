package com.fieldwork.service;

import com.fieldwork.entity.SupportInquiry;
import com.fieldwork.entity.User;
import com.fieldwork.repository.SupportInquiryRepository;
import com.fieldwork.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class SupportInboxService {
    private final SupportInquiryRepository inquiries;
    private final UserRepository users;
    public SupportInboxService(SupportInquiryRepository inquiries, UserRepository users) { this.inquiries = inquiries; this.users = users; }
    public record Summary(Long id, String category, String subject, String status, Instant createdAt, Instant answeredAt) {}
    public record Detail(Long id, String category, String subject, String message, String replyEmail, String status,
                         Instant createdAt, String answer, Instant answeredAt, long version, List<AttachmentInfo> attachments) {}
    public record AttachmentInfo(Long id, String name, String contentType, long size) {}
    public record AdminDetail(Detail inquiry, Long userId, String loginId, String appVersion, String platform,
                              Long answeredById, String answeredByName) {}
    public record InboxPage(List<Summary> items, int page, boolean hasMore) {}
    public static Detail detail(SupportInquiry i) { return new Detail(i.id, i.category, i.subject, i.message, i.replyEmail, i.status, i.createdAt, i.answer, i.answeredAt, i.version,
        i.attachments.stream().map(a -> new AttachmentInfo(a.id, a.name, a.contentType, a.size)).toList()); }
    private Pageable page(int page) {
        if (page < 0 || page > 10000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "페이지가 올바르지 않습니다.");
        return PageRequest.of(page, 20, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
    }
    private InboxPage result(Page<SupportInquiry> rows) {
        return new InboxPage(rows.stream().map(i -> new Summary(i.id, i.category, i.subject, i.status, i.createdAt, i.answeredAt)).toList(), rows.getNumber(), rows.hasNext());
    }
    public InboxPage mine(Long userId, int page) { return result(inquiries.findByUser_UserId(userId, page(page))); }
    public Detail mine(Long userId, Long id) { return detail(inquiries.findByIdAndUser_UserId(id, userId).orElseThrow(SupportInboxService::missing)); }
    public User requireAgent(Long userId) {
        User user = users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "다시 로그인해 주세요."));
        if (!"ADMIN".equals(user.getRole()) && !"SUPPORT_AGENT".equals(user.getRole()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "고객센터 운영자 권한이 필요합니다.");
        return user;
    }
    public InboxPage all(Long agentId, String status, int page) {
        requireAgent(agentId);
        if (status == null || status.isBlank()) return result(inquiries.findAll(page(page)));
        if (!List.of("WAITING", "ANSWERED").contains(status)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "문의 상태가 올바르지 않습니다.");
        return result(inquiries.findByStatus(status, page(page)));
    }
    private AdminDetail adminDetail(SupportInquiry i) {
        return new AdminDetail(detail(i), i.user.getUserId(), i.user.getLoginId(), i.appVersion, i.platform,
            i.answeredBy == null ? null : i.answeredBy.getUserId(), i.answeredBy == null ? null : i.answeredBy.getName());
    }
    public AdminDetail read(Long agentId, Long id) { requireAgent(agentId); return adminDetail(inquiries.findById(id).orElseThrow(SupportInboxService::missing)); }
    @Transactional
    public AdminDetail answer(Long agentId, Long id, String answer, Long expectedVersion) {
        User agent = requireAgent(agentId);
        if (answer == null || answer.isBlank() || answer.trim().length() > 5000 || answer.indexOf('\0') >= 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "답변을 1~5000자 이내로 입력해 주세요.");
        SupportInquiry i = inquiries.findLocked(id).orElseThrow(SupportInboxService::missing);
        if (expectedVersion == null || expectedVersion != i.version || !"WAITING".equals(i.status))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 운영자가 이미 답변했거나 문의가 변경되었습니다. 최신 내용을 확인해 주세요.");
        i.answer = answer.trim(); i.answeredAt = Instant.now(); i.answeredBy = agent; i.status = "ANSWERED";
        inquiries.flush();
        return adminDetail(i);
    }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다."); }
}
