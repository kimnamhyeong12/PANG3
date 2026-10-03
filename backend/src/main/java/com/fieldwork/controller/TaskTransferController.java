package com.fieldwork.controller;

import com.fieldwork.service.TaskTransferService;
import org.springframework.web.bind.annotation.*;
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
        return service.list(groupId, userId);
    }

    @PostMapping
    public Map<String, Object> create(@PathVariable Long groupId, @RequestBody Map<String, Object> body) {
        Object values = body.get("taskIds");
        if (!(values instanceof List<?> ids)) throw new IllegalArgumentException("방문지를 선택해주세요.");
        List<Long> taskIds = ids.stream().map(value -> Long.valueOf(value.toString())).toList();
        return service.create(groupId, asLong(body.get("senderUserId")),
                asLong(body.get("recipientUserId")), taskIds);
    }

    @PostMapping("/{requestId}/accept")
    public Map<String, Object> accept(@PathVariable Long groupId, @PathVariable Long requestId,
            @RequestBody Map<String, Object> body) {
        return service.respond(groupId, requestId, asLong(body.get("userId")), true);
    }

    @PostMapping("/{requestId}/reject")
    public Map<String, Object> reject(@PathVariable Long groupId, @PathVariable Long requestId,
            @RequestBody Map<String, Object> body) {
        return service.respond(groupId, requestId, asLong(body.get("userId")), false);
    }

    private Long asLong(Object value) {
        if (value == null) throw new IllegalArgumentException("사용자 ID가 필요합니다.");
        return Long.valueOf(value.toString());
    }
}
