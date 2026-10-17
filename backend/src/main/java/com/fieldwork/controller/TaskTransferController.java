package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;

import com.fieldwork.service.TaskTransferService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/groups/{groupId}/transfers")
public class TaskTransferController {
    private final TaskTransferService service;

    public TaskTransferController(TaskTransferService service) {
        this.service = service;
    }

    @GetMapping
    public List<Map<String, Object>> list(@PathVariable Long groupId, @RequestParam Long userId) {
        return service.list(groupId, CurrentUser.require(userId));
    }

    @GetMapping("/page")
    public Map<String, Object> page(@PathVariable Long groupId, @RequestParam Long userId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "all") String direction,
            @RequestParam(required = false) Long recipientId) {
        return service.page(groupId, CurrentUser.require(userId), page, direction, recipientId);
    }

    @PostMapping
    public Map<String, Object> create(@PathVariable Long groupId, @RequestBody Map<String, Object> body) {
        return service.create(
                groupId,
                CurrentUser.require(body.get("senderUserId")),
                asLong(body.get("recipientUserId")),
                asLongList(body.get("taskIds")),
                text(body.get("sido")),
                text(body.get("sigungu")),
                text(body.get("adminDong"))
        );
    }

    @PostMapping("/{requestId}/accept")
    public Map<String, Object> accept(@PathVariable Long groupId, @PathVariable Long requestId,
            @RequestBody Map<String, Object> body) {
        return service.respond(groupId, requestId, CurrentUser.require(body.get("userId")), true);
    }

    @PostMapping("/{requestId}/reject")
    public Map<String, Object> reject(@PathVariable Long groupId, @PathVariable Long requestId,
            @RequestBody Map<String, Object> body) {
        return service.respond(groupId, requestId, CurrentUser.require(body.get("userId")), false);
    }

    private Long asLong(Object value) {
        if (value == null) throw new IllegalArgumentException("사용자 ID가 필요합니다.");
        return Long.valueOf(value.toString());
    }

    private List<Long> asLongList(Object value) {
        if (!(value instanceof List<?> values)) return List.of();
        List<Long> result = new ArrayList<>();
        for (Object item : values) {
            if (item == null) continue;
            result.add(Long.valueOf(item.toString()));
        }
        return result;
    }

    private String text(Object value) {
        return value == null ? "" : value.toString().trim();
    }
}
