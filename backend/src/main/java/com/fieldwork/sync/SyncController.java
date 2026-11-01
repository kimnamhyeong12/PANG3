package com.fieldwork.sync;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.*;
import com.fieldwork.repository.UserRepository;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.http.*;

@RestController @RequestMapping("/api/sync")
public class SyncController {
    private final ChangeHub hub; private final TaskService tasks; private final UserRepository users; private final AuthSessionService sessions;
    public SyncController(ChangeHub hub, TaskService tasks, UserRepository users, AuthSessionService sessions) { this.hub = hub; this.tasks = tasks; this.users = users; this.sessions = sessions; }
    @GetMapping(value="/events", produces="text/event-stream") public ResponseEntity<SseEmitter> events(@RequestHeader("Authorization") String authorization) {
        long deadline = sessions.streamExpiresAt(authorization.substring(7)).toEpochMilli();
        return ResponseEntity.ok().header("Cache-Control", "no-cache, no-store").header("X-Accel-Buffering", "no").body(hub.connect(CurrentUser.id(), deadline));
    }
    @GetMapping("/tasks") public Map<String,Object> delta(@RequestParam Long groupId, @RequestParam List<Long> ids) {
        if (ids.size() > 128 || ids.isEmpty()) throw new IllegalArgumentException("변경 방문지 번호를 확인해 주세요.");
        List<Map<String,Object>> rows = tasks.getChangedLocations(groupId, CurrentUser.id(), ids);
        Set<Long> visible = new HashSet<>(); rows.forEach(r -> visible.add(((Number)r.get("taskId")).longValue()));
        return Map.of("items", rows, "removedIds", ids.stream().filter(id -> !visible.contains(id)).toList());
    }
    @GetMapping("/me") public Map<String,Object> me() { return AuthSessionService.userInfo(users.findById(CurrentUser.id()).orElseThrow()); }
}
