package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.CompiledReportService;
import com.fieldwork.service.ProjectService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ProjectController {
    private final ProjectService projects;
    private final CompiledReportService reports;

    public ProjectController(ProjectService projects, CompiledReportService reports) {
        this.projects = projects;
        this.reports = reports;
    }

    @GetMapping("/groups/{groupId}/projects")
    public List<Map<String, Object>> list(@PathVariable Long groupId, @RequestParam(required = false) Long userId) {
        return projects.list(groupId, CurrentUser.require(userId));
    }

    @PostMapping("/groups/{groupId}/projects")
    public Map<String, Object> create(@PathVariable Long groupId, @RequestBody Map<String, Object> body) {
        return projects.create(groupId, CurrentUser.require(body.get("userId")), body);
    }

    @GetMapping("/projects/{projectId}")
    public Map<String, Object> get(@PathVariable Long projectId, @RequestParam(required = false) Long userId) {
        return projects.get(projectId, CurrentUser.require(userId));
    }

    @PatchMapping("/projects/{projectId}")
    public Map<String, Object> update(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        return projects.update(projectId, CurrentUser.require(body.get("userId")), body);
    }

    @GetMapping("/projects/{projectId}/tasks")
    public List<Map<String, Object>> tasks(@PathVariable Long projectId, @RequestParam(required = false) Long userId) {
        return projects.tasks(projectId, CurrentUser.require(userId));
    }

    @PostMapping("/projects/{projectId}/tasks")
    public Map<String, Object> linkTasks(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        return projects.linkTasks(projectId, CurrentUser.require(body.get("userId")), body.get("taskIds"));
    }

    @DeleteMapping("/projects/{projectId}/tasks/{taskId}")
    public Map<String, Object> unlinkTask(@PathVariable Long projectId, @PathVariable Long taskId,
            @RequestParam(required = false) Long userId) {
        return projects.unlinkTask(projectId, taskId, CurrentUser.require(userId));
    }

    @GetMapping("/projects/{projectId}/items")
    public Map<String, Object> items(@PathVariable Long projectId, @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Integer year, @RequestParam(required = false) String adminDong,
            @RequestParam(required = false) Long authorId, @RequestParam(required = false) String category) {
        return projects.items(projectId, CurrentUser.require(userId), year, adminDong, authorId, category);
    }

    @GetMapping("/tasks/{taskId}/project-context")
    public Map<String, Object> taskContext(@PathVariable Long taskId, @RequestParam(required = false) Long userId) {
        return projects.taskContext(taskId, CurrentUser.require(userId));
    }

    @GetMapping("/projects/{projectId}/reports")
    public List<Map<String, Object>> reports(@PathVariable Long projectId, @RequestParam(required = false) Long userId) {
        return reports.list(projectId, CurrentUser.require(userId));
    }

    @PostMapping("/projects/{projectId}/reports")
    public Map<String, Object> createReport(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        return reports.create(projectId, CurrentUser.require(body.get("userId")), body);
    }
}
