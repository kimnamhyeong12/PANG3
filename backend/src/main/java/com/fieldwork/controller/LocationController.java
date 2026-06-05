package com.fieldwork.controller;

import com.fieldwork.entity.Location;
import com.fieldwork.service.LocationService;
import com.fieldwork.service.TaskService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/locations")
@CrossOrigin(origins = "*")
public class LocationController {

    private final LocationService locationService;
    private final TaskService taskService;

    public LocationController(LocationService locationService, TaskService taskService) {
        this.locationService = locationService;
        this.taskService = taskService;
    }

    /**
     * 신규: task 테이블 기준 목록 (프론트 호환 필드 포함)
     */
    @GetMapping
    public List<Map<String, Object>> getLocations() {
        return taskService.getAllForFrontend();
    }

    /**
     * 신규: task 생성 (기존 locations POST 와 동일 URL 유지)
     */
    @PostMapping
    public Map<String, Object> createLocation(@RequestBody Map<String, Object> body) {
        if (body.containsKey("name") || body.containsKey("address")) {
            if (!body.containsKey("detailAddress") && body.get("name") != null) {
                body.put("detailAddress", body.get("name"));
            }
            if (!body.containsKey("roadAddress") && body.get("address") != null) {
                body.put("roadAddress", body.get("address"));
            }
        }
        return taskService.createFromFrontendBody(body);
    }

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
}
