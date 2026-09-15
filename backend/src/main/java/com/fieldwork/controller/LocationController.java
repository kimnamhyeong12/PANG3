package com.fieldwork.controller;

import com.fieldwork.service.TaskService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/locations")
@CrossOrigin(origins = "*")
public class LocationController {

    private final TaskService taskService;

    public LocationController(TaskService taskService) {
        this.taskService = taskService;
    }

    /**
     * 로그인 사용자와 현재 그룹을 기준으로 방문지 조회
     */
    @GetMapping
    public List<Map<String, Object>> getLocations(
            @RequestParam Long userId,
            @RequestParam(required = false) Long groupId
    ) {
        return taskService.getForFrontend(userId, groupId);
    }

    /** 그룹에 등록된 전체 팀 방문지 조회 */
    @GetMapping("/group/{groupId}")
    public List<Map<String, Object>> getGroupLocations(
            @PathVariable Long groupId,
            @RequestParam Long userId
    ) {
        return taskService.getGroupLocations(groupId, userId);
    }

    /**
     * 신규 방문지를 task 테이블에 저장
     */
    @PostMapping
    public Map<String, Object> createLocation(
            @RequestBody Map<String, Object> body
    ) {
        if (body.containsKey("name") || body.containsKey("address")) {
            if (!body.containsKey("detailAddress")
                    && body.get("name") != null) {
                body.put("detailAddress", body.get("name"));
            }

            if (!body.containsKey("roadAddress")
                    && body.get("address") != null) {
                body.put("roadAddress", body.get("address"));
            }
        }

        return taskService.createFromFrontendBody(body);
    }

    /**
     * 방문지 작업 상태 변경
     */
    @PatchMapping("/{id}/status")
    public Map<String, Object> updateStatus(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        String status = body.get("status") != null
                ? body.get("status").toString()
                : null;

        if (status == null && body.get("taskStatus") != null) {
            status = body.get("taskStatus").toString();
        }

        return taskService.updateStatus(id, status);
    }

    /**
     * 미처리 방문지 삭제
     */
    @DeleteMapping("/{id}")
    public Map<String, Object> deleteLocation(
            @PathVariable Long id
    ) {
        return taskService.deletePendingTask(id);
    }
}
