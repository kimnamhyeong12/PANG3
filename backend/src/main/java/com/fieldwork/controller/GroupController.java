package com.fieldwork.controller;

import com.fieldwork.service.GroupService;
import com.fieldwork.service.TaskService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/groups")
@CrossOrigin("*")
public class GroupController {

    private final GroupService groupService;
    private final TaskService taskService;

    public GroupController(GroupService groupService, TaskService taskService) {
        this.groupService = groupService;
        this.taskService = taskService;
    }

    @PostMapping
    public Map<String, Object> createGroup(@RequestBody Map<String, Object> body) {
        return groupService.createGroup(
                stringValue(body.get("name")),
                longValue(body.get("userId")),
                stringValue(body.get("regionSido")),
                stringValue(body.get("regionSigungu")),
                stringValue(body.get("regionAdmCode")));
    }

    @GetMapping("/user/{userId}")
    public List<Map<String, Object>> getUserGroups(@PathVariable Long userId) {
        return groupService.getUserGroups(userId);
    }

    @GetMapping("/{groupId}")
    public Map<String, Object> getGroupDetail(
            @PathVariable Long groupId,
            @RequestParam Long userId) {
        return groupService.getGroupDetail(groupId, userId);
    }

    @PatchMapping("/{groupId}/region")
    public Map<String, Object> updateGroupRegion(
            @PathVariable Long groupId,
            @RequestBody Map<String, Object> body) {
        return groupService.updateGroupRegion(
                groupId,
                longValue(body.get("leaderUserId")),
                stringValue(body.get("regionSido")),
                stringValue(body.get("regionSigungu")),
                stringValue(body.get("regionAdmCode")));
    }

    @GetMapping("/{groupId}/members")
    public List<Map<String, Object>> getMembers(
            @PathVariable Long groupId,
            @RequestParam Long userId) {
        return groupService.getMembers(groupId, userId);
    }

    @PostMapping("/{groupId}/invitations")
    public Map<String, Object> inviteMember(
            @PathVariable Long groupId,
            @RequestBody Map<String, Object> body) {
        return groupService.inviteMember(
                groupId,
                longValue(body.get("inviterUserId")),
                stringValue(body.get("inviteeLoginId")));
    }

    @GetMapping("/invitations")
    public List<Map<String, Object>> getInvitations(
            @RequestParam Long userId,
            @RequestParam(defaultValue = "PENDING") String status) {
        return groupService.getInvitations(userId, status);
    }

    @PostMapping("/invitations/{invitationId}/accept")
    public Map<String, Object> acceptInvitation(
            @PathVariable Long invitationId,
            @RequestBody Map<String, Object> body) {
        return groupService.acceptInvitation(
                invitationId,
                longValue(body.get("userId")));
    }

    @PostMapping("/invitations/{invitationId}/reject")
    public Map<String, Object> rejectInvitation(
            @PathVariable Long invitationId,
            @RequestBody Map<String, Object> body) {
        return groupService.rejectInvitation(
                invitationId,
                longValue(body.get("userId")));
    }

    // Older app builds still use these read paths for their analysis dashboard.
    @GetMapping("/{groupId}/assignments")
    public List<Map<String, Object>> getSharedWorkForLegacyApp(
            @PathVariable Long groupId, @RequestParam Long userId) {
        return taskService.getGroupLocations(groupId, userId);
    }

    @GetMapping("/{groupId}/assignments/mine")
    public List<Map<String, Object>> getMyWorkForLegacyApp(
            @PathVariable Long groupId, @RequestParam Long userId) {
        return taskService.getGroupLocations(groupId, userId).stream()
                .filter(task -> userId.equals(task.get("assigneeUserId")))
                .toList();
    }

    private Long longValue(Object value) {
        if (value == null) {
            throw new RuntimeException("필수 값이 누락되었습니다.");
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(value.toString());
    }

    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }
}
