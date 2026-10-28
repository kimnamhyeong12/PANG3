package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.SupportAttachmentService;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class SupportAttachmentController {
    private final SupportAttachmentService files;
    public SupportAttachmentController(SupportAttachmentService files) { this.files = files; }
    @GetMapping("/api/support/inquiries/{inquiryId}/attachments/{attachmentId}")
    public ResponseEntity<Resource> own(@PathVariable Long inquiryId, @PathVariable Long attachmentId) {
        return download(inquiryId, attachmentId, false);
    }
    @GetMapping("/api/admin/support/inquiries/{inquiryId}/attachments/{attachmentId}")
    public ResponseEntity<Resource> admin(@PathVariable Long inquiryId, @PathVariable Long attachmentId) {
        return download(inquiryId, attachmentId, true);
    }
    private ResponseEntity<Resource> download(Long inquiryId, Long attachmentId, boolean admin) {
        var file = files.download(CurrentUser.id(), inquiryId, attachmentId, admin);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "sandbox; default-src 'none'")
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.name(), StandardCharsets.UTF_8).build().toString())
            .contentType(MediaType.parseMediaType(file.contentType())).contentLength(file.size()).body(new FileSystemResource(file.path()));
    }
}
