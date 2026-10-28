package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.SupportInboxService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/support/inquiries")
public class SupportAdminController {
    private final SupportInboxService inbox;
    public SupportAdminController(SupportInboxService inbox) { this.inbox = inbox; }
    @GetMapping public ResponseEntity<SupportInboxService.InboxPage> list(@RequestParam(required = false) String status, @RequestParam(defaultValue = "0") int page) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(inbox.all(CurrentUser.id(), status, page));
    }
    @GetMapping("/{id}") public ResponseEntity<SupportInboxService.AdminDetail> read(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(inbox.read(CurrentUser.id(), id));
    }
    public record Answer(String answer, Long version) {}
    @PostMapping("/{id}/answer") public ResponseEntity<SupportInboxService.AdminDetail> answer(@PathVariable Long id, @RequestBody Answer body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(inbox.answer(CurrentUser.id(), id, body.answer(), body.version()));
    }
}
