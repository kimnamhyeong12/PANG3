package com.fieldwork.controller;

import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.service.TaskProgressService;
import com.fieldwork.service.TaskService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/groups/{groupId}/reports")
public class GroupReportController {
    private final TaskService tasks;
    private final TaskProgressRepository progressRepository;
    private final TaskProgressService progressService;
    private final UserRepository users;
    private final GroupMemberRepository members;

    public GroupReportController(TaskService tasks, TaskProgressRepository progressRepository,
            TaskProgressService progressService, UserRepository users, GroupMemberRepository members) {
        this.members = members;
        this.tasks = tasks;
        this.progressRepository = progressRepository;
        this.progressService = progressService;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(@PathVariable Long groupId, @RequestParam Long userId) {
        Set<Long> taskIds = tasks.getGroupLocations(groupId, com.fieldwork.security.CurrentUser.require(userId)).stream()
                .map(task -> ((Number) task.get("id")).longValue())
                .collect(Collectors.toSet());
        if (taskIds.isEmpty()) return List.of();
        return progressRepository.findByTask_TaskIdInOrderByCreatedAtDesc(taskIds).stream()
                .filter(com.fieldwork.service.ReportRetentionService::available)
                .map(this::toReportMap)
                .toList();
    }

    private Map<String, Object> toReportMap(TaskProgress progress) {
        Map<String, Object> result = progressService.toResponseMap(progress, progress.getTask());
        result.remove("reportFilePath");
        var owner = tasks.currentAssignee(progress.getTask());
        result.put("assigneeUserId", owner == null ? null : owner.getUserId());
        result.put("assigneeName", owner == null ? "담당자 확인 불가" : owner.getName());
        result.put("assigneeDeparted", owner != null && !members.existsByGroupAndUser(progress.getTask().getGroup(), owner));
        result.put("performedByLoginId", progress.getPerformedByUserId() == null ? null : users.findById(progress.getPerformedByUserId()).map(user -> user.getLoginId()).orElse(null));
        result.put("performedByDeparted", progress.getPerformedByUserId() != null && users.findById(progress.getPerformedByUserId())
                .map(user -> !members.existsByGroupAndUser(progress.getTask().getGroup(), user)).orElse(true));
        result.put("adminDong", progress.getTask().getAdminDong());
        result.put("taskLatitude", progress.getTask().getLat());
        result.put("taskLongitude", progress.getTask().getLng());
        result.put("taskStatus", progress.getTask().getTaskStatus());
        result.put("performedByName", progress.getPerformedByUserId() == null
                ? "작업자 확인 불가"
                : users.findById(progress.getPerformedByUserId())
                    .map(user -> user.getName() == null ? user.getLoginId() : user.getName())
                    .orElse("작업자 확인 불가"));
        return result;
    }
}
