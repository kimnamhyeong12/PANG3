package com.fieldwork.controller;

import com.fieldwork.service.TaskService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "*")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public List<Map<String, Object>> getTasks() {
        return taskService.getAllForFrontend();
    }

    @PostMapping
    public Map<String, Object> createTask(@RequestBody Map<String, Object> body) {
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
        return taskService.updateStatus(taskId, status);
    }
}
