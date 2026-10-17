package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.SupportInquiryService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/support/inquiries")
public class SupportInquiryController {
    private final SupportInquiryService support;
    public SupportInquiryController(SupportInquiryService support) { this.support = support; }
    public record Inquiry(String replyEmail, String subject, String message, String appVersion, String platform) {}
    @PostMapping
    public Map<String, String> send(@RequestBody Inquiry body) {
        support.send(CurrentUser.id(), body.replyEmail(), body.subject(), body.message(), body.appVersion(), body.platform());
        return Map.of("message", "문의가 전송되었습니다.");
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failed(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "문의를 전송하지 못했습니다." : error.getReason()));
    }
}
