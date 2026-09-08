package com.fieldwork.controller;

import com.fieldwork.service.GroupService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/groups")
@CrossOrigin("*")
public class GroupController {

    private final GroupService groupService;

    public GroupController(GroupService groupService) {
        this.groupService = groupService;
    }

    @PostMapping
    public Map<String, Object> createGroup(
            @RequestBody Map<String, Object> body
    ) {

        String groupName = (String) body.get("name");

        Object userIdObject = body.get("userId");

        if (userIdObject == null) {
            throw new RuntimeException("userId가 필요합니다.");
        }

        Long userId;

        if (userIdObject instanceof Number) {
            userId = ((Number) userIdObject).longValue();
        } else {
            userId = Long.parseLong(userIdObject.toString());
        }

        return groupService.createGroup(groupName, userId);
    }
}