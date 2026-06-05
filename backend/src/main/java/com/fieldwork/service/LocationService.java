package com.fieldwork.service;

import com.fieldwork.entity.Location;
import com.fieldwork.repository.LocationRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 레거시 locations API 호환용.
 * 실제 데이터는 task 테이블을 사용합니다.
 */
@Service
public class LocationService {

    private final LocationRepository repo;
    private final TaskService taskService;

    public LocationService(LocationRepository repo, TaskService taskService) {
        this.repo = repo;
        this.taskService = taskService;
    }

    public List<Location> getAllLocations() {
        return repo.findAll();
    }

    public Map<String, Object> saveLocationAsTask(Map<String, Object> body) {
        return taskService.createFromFrontendBody(body);
    }

    public Location saveLocation(Location location) {
        location.setStatus(location.getStatus() != null ? location.getStatus() : "pending");

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("detailAddress", location.getName());
        body.put("roadAddress", location.getAddress());
        body.put("lat", location.getLat());
        body.put("lng", location.getLng());
        body.put("taskCategory", location.getName());
        body.put("status", location.getStatus());

        taskService.createFromFrontendBody(body);
        return location;
    }

    public Location updateStatus(Long id, String status) {
        taskService.updateStatus(id, status);

        return repo.findById(id).map(loc -> {
            loc.setStatus(status);
            return repo.save(loc);
        }).orElseGet(() -> {
            Location loc = new Location();
            loc.setId(id);
            loc.setStatus(status);
            return loc;
        });
    }
}
