package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.repository.TaskRepository;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TaskService {

    private final TaskRepository taskRepository;

    public TaskService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    public List<Map<String, Object>> getAllForFrontend() {
        return taskRepository.findAll().stream()
                .map(this::toFrontendMap)
                .collect(Collectors.toList());
    }

    public Task getById(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
    }

    public Map<String, Object> createFromFrontendBody(Map<String, Object> body) {
        Task task = new Task();
        task.setDetailAddress(firstNonBlank(
                str(body.get("detailAddress")),
                str(body.get("name")),
                str(body.get("detail_address"))
        ));
        task.setRoadAddress(firstNonBlank(
                str(body.get("roadAddress")),
                str(body.get("address")),
                str(body.get("road_address"))
        ));
        task.setLat(toDouble(body.get("lat"), body.get("latitude")));
        task.setLng(toDouble(body.get("lng"), body.get("longitude")));
        task.setTaskCategory(firstNonBlank(
                str(body.get("taskCategory")),
                str(body.get("task")),
                str(body.get("task_category")),
                "현장 확인"
        ));
        task.setTaskStatus(firstNonBlank(
                str(body.get("taskStatus")),
                str(body.get("status")),
                str(body.get("task_status")),
                "pending"
        ));

        return toFrontendMap(taskRepository.save(task));
    }

    public Map<String, Object> updateStatus(Long taskId, String status) {
        Task task = getById(taskId);
        task.setTaskStatus(status);
        return toFrontendMap(taskRepository.save(task));
    }

    public Task saveEntity(Task task) {
        return taskRepository.save(task);
    }

    public Map<String, Object> toFrontendMap(Task task) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", task.getTaskId());
        map.put("taskId", task.getTaskId());
        map.put("task_id", task.getTaskId());
        map.put("detailAddress", task.getDetailAddress());
        map.put("detail_address", task.getDetailAddress());
        map.put("roadAddress", task.getRoadAddress());
        map.put("road_address", task.getRoadAddress());
        map.put("name", task.getDetailAddress());
        map.put("address", task.getRoadAddress());
        map.put("lat", task.getLat());
        map.put("lng", task.getLng());
        map.put("latitude", task.getLat());
        map.put("longitude", task.getLng());
        map.put("taskCategory", task.getTaskCategory());
        map.put("task_category", task.getTaskCategory());
        map.put("task", task.getTaskCategory());
        map.put("status", task.getTaskStatus());
        map.put("taskStatus", task.getTaskStatus());
        map.put("task_status", task.getTaskStatus());
        return map;
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }

    private Double toDouble(Object... values) {
        for (Object value : values) {
            if (value != null) {
                return Double.valueOf(value.toString());
            }
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
