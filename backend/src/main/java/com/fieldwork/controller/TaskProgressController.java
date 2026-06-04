package com.fieldwork.controller;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import com.fieldwork.repository.TaskRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/task-progress")
@CrossOrigin(origins = "*")
public class TaskProgressController {

    private final TaskProgressRepository taskProgressRepository;
    private final TaskRepository taskRepository;

    public TaskProgressController(
            TaskProgressRepository taskProgressRepository,
            TaskRepository taskRepository
    ) {
        this.taskProgressRepository = taskProgressRepository;
        this.taskRepository = taskRepository;
    }

    @PostMapping
    public TaskProgress saveProgress(@RequestBody Map<String, Object> body) {
        Long taskId = Long.valueOf(body.get("taskId").toString());

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));

        TaskProgress progress = new TaskProgress();
        progress.setTask(task);

        progress.setLatitude(toDouble(body.get("latitude")));
        progress.setLongitude(toDouble(body.get("longitude")));
        progress.setLocationMapImage((String) body.get("locationMapImage"));
        progress.setFieldPhotos((List<Map<String, Object>>) body.get("fieldPhotos"));
        progress.setMainComment((String) body.get("mainComment"));
        progress.setFieldMemo((String) body.get("fieldMemo"));

        String progressStatus = (String) body.get("progressStatus");
        progress.setProgressStatus(progressStatus);

        if (progressStatus != null) {
            task.setStatus(progressStatus);
            taskRepository.save(task);
        }

        return taskProgressRepository.save(progress);
    }

    @GetMapping("/task/{taskId}")
    public Map<String, Object> getProgressByTaskId(@PathVariable Long taskId) {
        return taskProgressRepository
                .findTopByTask_TaskIdOrderByCreatedAtDesc(taskId)
                .map(progress -> {
                    Map<String, Object> result = new java.util.HashMap<>();

                    result.put("progressId", progress.getProgressId());
                    result.put("taskId", progress.getTask().getTaskId());
                    result.put("latitude", progress.getLatitude());
                    result.put("longitude", progress.getLongitude());
                    result.put("locationMapImage", progress.getLocationMapImage());
                    result.put("fieldPhotos", progress.getFieldPhotos());
                    result.put("mainComment", progress.getMainComment());
                    result.put("fieldMemo", progress.getFieldMemo());
                    result.put("progressStatus", progress.getProgressStatus());

                    return result;
                })
                .orElse(null);
    }

    private Double toDouble(Object value) {
        if (value == null) return null;
        return Double.valueOf(value.toString());
    }
}