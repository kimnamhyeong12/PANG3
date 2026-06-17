package com.fieldwork.controller;

import com.fieldwork.entity.TaskProgress;
import com.fieldwork.service.TaskProgressService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

@RestController
@RequestMapping("/api/task-progress")
@CrossOrigin(origins = "*")
public class TaskProgressController {

    private final TaskProgressService taskProgressService;

    public TaskProgressController(TaskProgressService taskProgressService) {
        this.taskProgressService = taskProgressService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> saveProgressMultipart(MultipartHttpServletRequest request) throws Exception {
        return taskProgressService.saveFromMultipart(request);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> saveProgressJson(@RequestBody Map<String, Object> body) throws Exception {
        return taskProgressService.saveFromJson(body);
    }

    @GetMapping("/task/{taskId}")
    public Map<String, Object> getProgressByTaskId(@PathVariable Long taskId) {
        return taskProgressService.getLatestByTaskId(taskId);
    }

    @GetMapping("/{progressId}/report/download")
    public ResponseEntity<Resource> downloadReport(@PathVariable Long progressId) {
        TaskProgress progress = taskProgressService.getById(progressId);
        String reportPath = progress.getReportFilePath();

        if (reportPath == null || reportPath.isBlank()) {
            return ResponseEntity.notFound().build();
        }

        Path file = Paths.get(reportPath);
        if (!file.toFile().exists()) {
            return ResponseEntity.notFound().build();
        }

        String filename = file.getFileName().toString();
        FileSystemResource resource = new FileSystemResource(file);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }
}
