package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveFromMultipart(MultipartHttpServletRequest request) throws Exception {
        Long taskId = Long.valueOf(request.getParameter("taskId"));
        Task task = taskService.getById(taskId);
        Long performerId = parseLong(request.getParameter("userId"));
        validateEditor(task, performerId);

        TaskProgress progress = editableProgress(task, parseLong(request.getParameter("progressId")));
        validateRevision(progress, request.getParameter("expectedRevision"));
        List<Map<String, Object>> previousPhotos = progress.getFieldPhotos();
        progress.setTask(task);
        if (progress.getProgressId() == null) progress.setPerformedByUserId(performerId);
        progress.setLatitude(parseDouble(request.getParameter("latitude")));
        progress.setLongitude(parseDouble(request.getParameter("longitude")));
        progress.setLocationAddress(request.getParameter("locationAddress"));
        progress.setMainComment(request.getParameter("mainComment"));
        progress.setFieldMemo(request.getParameter("fieldMemo"));
        progress.setProgressStatus(request.getParameter("progressStatus"));
        if (isCurrentRecord(task, progress)) syncTaskLocation(task, progress.getLatitude(), progress.getLongitude());

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
            item.put("performedByUserId", performerId);
            fieldPhotos.add(item);
        }

        String slots = request.getParameter("photoSlots");
        if (slots != null) {
            List<Map<String, Object>> manifest = objectMapper.readValue(slots, new TypeReference<List<Map<String, Object>>>() {});
            fieldPhotos = PhotoSlots.merge(manifest, previousPhotos, fieldPhotos);
        }
        progress.setFieldPhotos(fieldPhotos);
        syncReportStatus(task, progress);
        progress.setReportFilePath(null);
        progress.setAiRefinedContent(null);

        progress = taskProgressRepository.saveAndFlush(progress);
        return toResponseMap(progress, task);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveFromJson(Map<String, Object> body) throws Exception {
        Long taskId = Long.valueOf(body.get("taskId").toString());
        Task task = taskService.getById(taskId);
        Long performerId = parseLong(body.get("userId") == null ? null : body.get("userId").toString());
        validateEditor(task, performerId);

        TaskProgress progress = editableProgress(task, parseLong(str(body.get("progressId"))));
        validateRevision(progress, str(body.get("expectedRevision")));
        progress.setTask(task);
        if (progress.getProgressId() == null) progress.setPerformedByUserId(performerId);
        progress.setLatitude(parseDoubleObj(body.get("latitude")));
        progress.setLongitude(parseDoubleObj(body.get("longitude")));
        progress.setLocationAddress(str(body.get("locationAddress")));
        progress.setMainComment(str(body.get("mainComment")));
        progress.setFieldMemo(str(body.get("fieldMemo")));
        progress.setProgressStatus(str(body.get("progressStatus")));
        if (isCurrentRecord(task, progress)) syncTaskLocation(task, progress.getLatitude(), progress.getLongitude());

        Object mapObj = body.get("locationMapImage");
        if (mapObj != null) {
            fileStorageService.requireTaskFile(taskId, mapObj.toString());
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
                    fileStorageService.requireTaskFile(taskId, path != null ? path.toString() : (uri == null ? null : uri.toString()));
                    normalized.put("path", path != null ? path.toString() : (uri != null ? uri.toString() : null));
                    normalized.put("comment", photoMap.get("comment"));
                    normalized.put("performedByUserId", performerId);
                    normalizedPhotos.add(normalized);
                }
            }
        }
        progress.setFieldPhotos(normalizedPhotos);

        syncReportStatus(task, progress);
        progress.setReportFilePath(null);
        progress.setAiRefinedContent(null);
        progress = taskProgressRepository.saveAndFlush(progress);

        return toResponseMap(progress, task);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> updatePosition(Long taskId, Long userId, Map<String, Object> body, MultipartFile mapImage) throws Exception {
        taskService.requireEditor(taskId, userId);
        Task task = taskService.getById(taskId);
        Double lat = parseDoubleObj(body.get("latitude")), lng = parseDoubleObj(body.get("longitude"));
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
                || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new IllegalArgumentException("위치를 확인해 주세요.");
        Long id = parseLong(str(body.get("progressId")));
        if (id == null) {
            if (taskProgressRepository.findTopByTask_TaskIdOrderByCreatedAtDesc(taskId).isPresent())
                throw new IllegalArgumentException("최신 보고서를 다시 불러온 뒤 위치를 변경해 주세요.");
            syncTaskLocation(task, lat, lng);
            return Map.of("taskLatitude", lat, "taskLongitude", lng);
        }
        TaskProgress record = editableProgress(task, id);
        validateRevision(record, str(body.get("expectedRevision")));
        record.setLatitude(lat); record.setLongitude(lng);
        record.setLocationAddress(str(body.get("locationAddress")));
        record.setLocationMapImage(mapImage != null && !mapImage.isEmpty()
            ? fileStorageService.saveMultipart(taskId, "map", mapImage) : null);
        record.setReportFilePath(null); record.setAiRefinedContent(null);
        if (isCurrentRecord(task, record)) syncTaskLocation(task, lat, lng);
        return toResponseMap(taskProgressRepository.saveAndFlush(record), task);
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

    private void validateEditor(Task task, Long performerId) {
        taskService.requireEditor(task.getTaskId(), performerId);
        var owner = taskService.currentAssignee(task);
        if (performerId == null || owner == null || !performerId.equals(owner.getUserId())) {
            throw new IllegalArgumentException("현재 담당자만 작업 자료를 등록할 수 있습니다.");
        }
    }

    private TaskProgress editableProgress(Task task, Long progressId) {
        if (progressId == null) return new TaskProgress();
        TaskProgress progress = taskProgressRepository.findLocked(progressId)
                .orElseThrow(() -> new IllegalArgumentException("보고서를 찾을 수 없습니다."));
        if (!task.getTaskId().equals(progress.getTask().getTaskId())) {
            throw new IllegalArgumentException("방문지와 보고서가 일치하지 않습니다.");
        }
        return progress;
    }

    private void validateRevision(TaskProgress progress, String expected) {
        if (progress.getProgressId() != null && (expected == null ||
                !revisionOf(progress).equals(expected))) {
            throw new IllegalArgumentException("다른 곳에서 보고서가 변경되었습니다. 작성 내용은 보관되며, 최신 기록을 확인해야 합니다.");
        }
    }

    private String revisionOf(TaskProgress progress) {
        try {
            Map<String, Object> data = new java.util.TreeMap<>();
            data.put("memo", progress.getFieldMemo()); data.put("comment", progress.getMainComment());
            data.put("lat", progress.getLatitude()); data.put("lng", progress.getLongitude());
            data.put("address", progress.getLocationAddress()); data.put("map", progress.getLocationMapImage());
            data.put("status", progress.getProgressStatus());
            data.put("photos", progress.getFieldPhotos() == null ? List.of() : progress.getFieldPhotos().stream()
                    .map(photo -> new java.util.TreeMap<>(photo)).toList());
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(data)));
        } catch (Exception e) { throw new IllegalStateException("보고서 변경 상태를 확인하지 못했습니다."); }
    }

    // Correcting a report never reopens a completed task or changes status from an old visit.
    private void syncReportStatus(Task task, TaskProgress progress) {
        if ("complete".equalsIgnoreCase(task.getTaskStatus())) return;
        if (isCurrentRecord(task, progress)) syncTaskStatus(task, progress.getProgressStatus());
    }

    private boolean isCurrentRecord(Task task, TaskProgress progress) {
        TaskProgress latest = taskProgressRepository.findTopByTask_TaskIdOrderByCreatedAtDesc(task.getTaskId()).orElse(null);
        return progress.getProgressId() == null || latest == null || latest.getProgressId().equals(progress.getProgressId());
    }

    @Transactional
    public Map<String, Object> prepareReport(Long progressId, Long userId) {
        TaskProgress progress = taskProgressRepository.findLocked(progressId)
                .orElseThrow(() -> new IllegalArgumentException("보고서를 찾을 수 없습니다."));
        validateReader(progress.getTask(), userId);
        validateDownloadable(progress);
        if (progress.getReportFilePath() == null || !fileStorageService.exists(progress.getReportFilePath())) {
            runAiIfPossible(progress.getTask(), progress);
        }
        if (progress.getReportFilePath() == null) throw new IllegalStateException("보고서 파일을 만들지 못했습니다. 다시 시도하세요.");
        return toResponseMap(progress, progress.getTask());
    }

    public void validateTaskReader(Long taskId, Long userId) { validateReader(taskService.getById(taskId), userId); }

    public void validateReader(Task task, Long userId) {
        if (userId == null) throw new IllegalArgumentException("사용자 정보가 필요합니다.");
        if (task.getGroup() != null) {
            boolean allowed = taskService.getGroupLocations(task.getGroup().getGroupId(), userId).stream()
                    .anyMatch(row -> task.getTaskId().equals(((Number) row.get("id")).longValue()));
            if (allowed) return;
        } else if (taskService.currentAssignee(task) != null && userId.equals(taskService.currentAssignee(task).getUserId())) return;
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "보고서를 확인할 권한이 없습니다.");
    }

    public void validateDownloadable(TaskProgress progress) {
        String status = progress.getProgressStatus();
        if (!"working".equalsIgnoreCase(status) && !"complete".equalsIgnoreCase(status)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT, "작업 전 보고서는 다운로드할 수 없습니다.");
        }
    }

    public String prepareCombined(List<Long> ids, Long userId) throws Exception {
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("보고서를 선택하세요.");
        List<Map<String, Object>> reports = new ArrayList<>();
        for (Long id : ids.stream().distinct().toList()) {
            TaskProgress progress = getById(id);
            validateReader(progress.getTask(), userId);
            validateDownloadable(progress);
            reports.add(aiReportService.buildPayload(progress.getTask(), progress));
        }
        return aiReportService.generateCombined(reports);
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
            taskService.updateStatusEntity(task, progressStatus);
        }
    }

    private void syncTaskLocation(Task task, Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            return;
        }
        taskService.updateLocationEntity(task, latitude, longitude);
    }

    public Map<String, Object> toResponseMap(TaskProgress progress, Task task) {
        Map<String, Object> result = new HashMap<>();

        result.put("progressId", progress.getProgressId());
        result.put("revision", revisionOf(progress));
        result.put("taskStatus", task.getTaskStatus());
        result.put("taskLatitude", task.getLat());
        result.put("taskLongitude", task.getLng());
        result.put("taskId", task.getTaskId());
        result.put("latitude", progress.getLatitude());
        result.put("longitude", progress.getLongitude());
        result.put("locationAddress", progress.getLocationAddress());
        result.put("performedByUserId", progress.getPerformedByUserId());
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

    private Double parseDouble(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Double.valueOf(value);
    }

    private Long parseLong(String value) {
        return value == null || value.isBlank() ? null : Long.valueOf(value);
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
