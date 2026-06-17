package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class TaskProgressService {

    private final TaskProgressRepository taskProgressRepository;
    private final TaskService taskService;
    private final FileStorageService fileStorageService;
    private final AiReportService aiReportService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TaskProgressService(
            TaskProgressRepository taskProgressRepository,
            TaskService taskService,
            FileStorageService fileStorageService,
            AiReportService aiReportService
    ) {
        this.taskProgressRepository = taskProgressRepository;
        this.taskService = taskService;
        this.fileStorageService = fileStorageService;
        this.aiReportService = aiReportService;
    }

    public Map<String, Object> saveFromMultipart(MultipartHttpServletRequest request) throws Exception {
        Long taskId = Long.valueOf(request.getParameter("taskId"));
        Task task = taskService.getById(taskId);

        TaskProgress progress = new TaskProgress();
        progress.setTask(task);
        progress.setLatitude(parseDouble(request.getParameter("latitude")));
        progress.setLongitude(parseDouble(request.getParameter("longitude")));
        progress.setMainComment(request.getParameter("mainComment"));
        progress.setFieldMemo(request.getParameter("fieldMemo"));
        progress.setProgressStatus(request.getParameter("progressStatus"));

        MultipartFile mapImage = request.getFile("mapImage");
        if (mapImage != null && !mapImage.isEmpty()) {
            progress.setLocationMapImage(fileStorageService.saveMultipart(taskId, "map", mapImage));
        }

        List<String> comments = parsePhotoComments(request.getParameter("photoComments"));
        List<Map<String, Object>> fieldPhotos = new ArrayList<>();
        List<MultipartFile> photoFiles = request.getFiles("fieldPhotos");

        for (int i = 0; i < photoFiles.size(); i++) {
            MultipartFile photo = photoFiles.get(i);
            if (photo == null || photo.isEmpty()) {
                continue;
            }
            String savedPath = fileStorageService.saveMultipart(taskId, "photo" + i, photo);
            Map<String, Object> item = new HashMap<>();
            item.put("path", savedPath);
            item.put("comment", i < comments.size() ? comments.get(i) : "");
            fieldPhotos.add(item);
        }

        progress.setFieldPhotos(fieldPhotos);
        syncTaskStatus(task, progress.getProgressStatus());

        progress = taskProgressRepository.save(progress);
        runAiIfPossible(task, progress);

        return toResponseMap(progress, task);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> saveFromJson(Map<String, Object> body) throws Exception {
        Long taskId = Long.valueOf(body.get("taskId").toString());
        Task task = taskService.getById(taskId);

        TaskProgress progress = new TaskProgress();
        progress.setTask(task);
        progress.setLatitude(parseDoubleObj(body.get("latitude")));
        progress.setLongitude(parseDoubleObj(body.get("longitude")));
        progress.setMainComment(str(body.get("mainComment")));
        progress.setFieldMemo(str(body.get("fieldMemo")));
        progress.setProgressStatus(str(body.get("progressStatus")));

        Object mapObj = body.get("locationMapImage");
        if (mapObj != null) {
            progress.setLocationMapImage(mapObj.toString());
        }

        List<Map<String, Object>> normalizedPhotos = new ArrayList<>();
        Object photosObj = body.get("fieldPhotos");
        if (photosObj instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> photoMap) {
                    Map<String, Object> normalized = new HashMap<>();
                    Object uri = photoMap.get("uri");
                    Object path = photoMap.get("path");
                    normalized.put("path", path != null ? path.toString() : (uri != null ? uri.toString() : null));
                    normalized.put("comment", photoMap.get("comment"));
                    normalizedPhotos.add(normalized);
                }
            }
        }
        progress.setFieldPhotos(normalizedPhotos);

        syncTaskStatus(task, progress.getProgressStatus());
        progress = taskProgressRepository.save(progress);

        boolean hasLocalPhoto = normalizedPhotos.stream()
                .anyMatch(p -> isLocalPath(str(p.get("path"))));
        if (hasLocalPhoto || fileStorageService.exists(progress.getLocationMapImage())) {
            runAiIfPossible(task, progress);
        }

        return toResponseMap(progress, task);
    }

    public Map<String, Object> getLatestByTaskId(Long taskId) {
        return taskProgressRepository
                .findTopByTask_TaskIdOrderByCreatedAtDesc(taskId)
                .map(p -> toResponseMap(p, p.getTask()))
                .orElse(null);
    }

    public TaskProgress getById(Long progressId) {
        return taskProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("Progress not found: " + progressId));
    }

    private void runAiIfPossible(Task task, TaskProgress progress) {
        try {
            aiReportService.generateReport(task, progress);
            taskProgressRepository.save(progress);
        } catch (Exception e) {
            System.out.println("[TaskProgress] AI 생성 실패: " + e.getMessage());
            progress.setAiRefinedContent("AI 보고서 생성 중 오류: " + e.getMessage());
            taskProgressRepository.save(progress);
        }
    }

    private void syncTaskStatus(Task task, String progressStatus) {
        if (progressStatus != null && !progressStatus.isBlank()) {
            task.setTaskStatus(progressStatus);
            taskService.saveEntity(task);
        }
    }

    public Map<String, Object> toResponseMap(TaskProgress progress, Task task) {
        Map<String, Object> result = new HashMap<>();

        result.put("progressId", progress.getProgressId());
        result.put("taskId", task.getTaskId());
        result.put("latitude", progress.getLatitude());
        result.put("longitude", progress.getLongitude());
        result.put("locationMapImage", toPublicFileUrl(task.getTaskId(), progress.getLocationMapImage()));
        result.put("fieldPhotos", toPublicPhotoList(task.getTaskId(), progress.getFieldPhotos()));
        result.put("mainComment", progress.getMainComment());
        result.put("fieldMemo", progress.getFieldMemo());
        result.put("progressStatus", progress.getProgressStatus());
        result.put("aiRefinedContent", progress.getAiRefinedContent());
        result.put("reportFilePath", progress.getReportFilePath());
        result.put("createdAt", progress.getCreatedAt());

        result.put("detailAddress", task.getDetailAddress());
        result.put("roadAddress", task.getRoadAddress());
        result.put("taskCategory", task.getTaskCategory());

        if (progress.getReportFilePath() != null) {
            result.put("reportDownloadUrl",
                    "/api/task-progress/" + progress.getProgressId() + "/report/download");
        }

        return result;
    }

    private List<String> parsePhotoComments(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of(raw);
        }
    }

    private boolean isLocalPath(String path) {
        if (path == null) {
            return false;
        }
        return path.startsWith("file:") || path.startsWith("/") || path.contains("uploads");
    }

    private Double parseDouble(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Double.valueOf(value);
    }

    private Double parseDoubleObj(Object value) {
        if (value == null) {
            return null;
        }
        return Double.valueOf(value.toString());
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }

    private String toPublicFileUrl(Long taskId, String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) {
            return null;
        }
        if (absolutePath.startsWith("http://") || absolutePath.startsWith("https://")) {
            return absolutePath;
        }
        java.nio.file.Path path = java.nio.file.Paths.get(absolutePath);
        return "/api/files/" + taskId + "/" + path.getFileName().toString();
    }

    private List<Map<String, Object>> toPublicPhotoList(Long taskId, List<Map<String, Object>> photos) {
        if (photos == null) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> photo : photos) {
            Map<String, Object> item = new HashMap<>(photo);
            Object path = photo.get("path");
            if (path != null) {
                item.put("uri", toPublicFileUrl(taskId, path.toString()));
            }
            result.add(item);
        }
        return result;
    }
}
