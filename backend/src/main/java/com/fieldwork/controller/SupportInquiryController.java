package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.SupportInquiryService;
import com.fieldwork.service.SupportInboxService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/support/inquiries")
public class SupportInquiryController {
    private final SupportInquiryService support;
    private final SupportInboxService inbox;
    private final com.fasterxml.jackson.databind.ObjectMapper json;
    public SupportInquiryController(SupportInquiryService support, SupportInboxService inbox, com.fasterxml.jackson.databind.ObjectMapper json) { this.support = support; this.inbox = inbox; this.json = json; }
    public record Inquiry(String replyEmail, String subject, String message, String appVersion, String platform, String category, String requestKey) {}
    @PostMapping(consumes = org.springframework.http.MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> send(@RequestBody Inquiry body) {
        Long id = support.send(CurrentUser.id(), body.replyEmail(), body.subject(), body.message(), body.appVersion(), body.platform(), body.category(), body.requestKey());
        return Map.of("message", "문의가 접수되었습니다.", "inquiryId", id);
    }
    @PostMapping(consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@RequestPart("inquiry") String payload,
            @RequestPart(value = "files", required = false) java.util.List<org.springframework.web.multipart.MultipartFile> files) {
        Inquiry body;
        try { body = json.readValue(payload, Inquiry.class); }
        catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "문의 입력 내용을 확인해 주세요."); }
        if (body == null) throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "문의 입력 내용을 확인해 주세요.");
        Long id = support.send(CurrentUser.id(), body.replyEmail(), body.subject(), body.message(), body.appVersion(), body.platform(), body.category(), body.requestKey(), files);
        return Map.of("message", "문의가 접수되었습니다.", "inquiryId", id);
    }
    @GetMapping
    public ResponseEntity<SupportInboxService.InboxPage> list(@RequestParam(defaultValue = "0") int page) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(inbox.mine(CurrentUser.id(), page));
    }
    @GetMapping("/{id}")
    public ResponseEntity<SupportInboxService.Detail> read(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(inbox.mine(CurrentUser.id(), id));
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failed(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "문의를 전송하지 못했습니다." : error.getReason()));
    }
}
