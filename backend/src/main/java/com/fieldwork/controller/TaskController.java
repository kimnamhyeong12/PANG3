package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;

import com.fieldwork.service.TaskService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public List<Map<String, Object>> getTasks(
            @RequestParam Long userId,
            @RequestParam(required = false) Long groupId
    ) {
        return taskService.getForFrontend(CurrentUser.require(userId), groupId);
    }

    @PostMapping
    public Map<String, Object> createTask(@RequestBody Map<String, Object> body) {
        body.put("createdByUserId", CurrentUser.require(body.get("createdByUserId")));
        CurrentUser.require(body.get("userId"));
        return taskService.createFromFrontendBody(body);
    }

    @PatchMapping("/{taskId}/status")
    public Map<String, Object> updateStatus(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> body
    ) {
        String status = body.get("status") != null
                ? body.get("status").toString()
                : body.get("taskStatus").toString();
        taskService.requireEditor(taskId, CurrentUser.id());
        return taskService.updateStatus(taskId, status);
    }
}
