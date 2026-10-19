package com.fieldwork.service;

import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class PhotoLocationService {
    private final TaskService tasks;
    private final TaskProgressRepository reports;
    private final FileStorageService files;

    public PhotoLocationService(TaskService tasks, TaskProgressRepository reports, FileStorageService files) {
        this.tasks = tasks; this.reports = reports; this.files = files;
    }

    // The task, assignment and initial photo record commit together per photo.
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> create(Long userId, Long groupId, String name, Double lat, Double lng, MultipartFile photo) throws Exception {
        if (userId == null || userId <= 0) throw new IllegalArgumentException("로그인 사용자 정보가 필요합니다.");
        if (groupId != null && groupId <= 0) throw new IllegalArgumentException("업무공간을 확인해 주세요.");
        String displayName = name == null ? "" : name.trim();
        if (displayName.isEmpty() || displayName.length() > 255) throw new IllegalArgumentException("방문지 이름은 1~255자로 입력해 주세요.");
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new IllegalArgumentException("유효한 사진 GPS 위도·경도가 필요합니다.");
        if (photo == null || photo.isEmpty()) throw new IllegalArgumentException("사진 파일이 필요합니다.");

        Map<String, Object> body = new HashMap<>();
        body.put("createdByUserId", userId);
        if (groupId != null) body.put("groupId", groupId);
        body.put("detailAddress", displayName);
        body.put("lat", lat); body.put("lng", lng); body.put("status", "pending");
        // Existing TaskService enforces group membership and creates the assignment.
        Map<String, Object> location = tasks.createFromFrontendBody(body);
        Object id = location.get("taskId");
        if (!(id instanceof Number)) id = location.get("id");
        if (!(id instanceof Number taskNumber)) throw new IllegalStateException("방문지 등록 결과를 확인할 수 없습니다.");
        Long taskId = taskNumber.longValue();
        String savedPath = files.saveMultipart(taskId, "photo0", photo);
        if (savedPath == null) throw new IllegalArgumentException("사진 파일을 저장할 수 없습니다.");
        Path storedFile = Path.of(savedPath);
        // Filesystem writes are outside the DB transaction; compensate on rollback,
        // including a failure that is detected only during transaction commit.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    try { Files.deleteIfExists(storedFile); }
                    catch (Exception error) { org.slf4j.LoggerFactory.getLogger(PhotoLocationService.class).warn("Rolled-back photo cleanup failed", error); }
                }
            }
        });

        TaskProgress progress = new TaskProgress();
        progress.setTask(tasks.getById(taskId));
        progress.setPerformedByUserId(userId);
        progress.setLatitude(lat); progress.setLongitude(lng);
        progress.setProgressStatus("pending");
        progress.setMainComment(""); progress.setFieldMemo("");
        progress.setFieldPhotos(List.of(Map.of("type", "before", "path", savedPath,
                "comment", "작업 전|", "performedByUserId", userId)));
        reports.saveAndFlush(progress);
        return Map.of("taskId", taskId, "progressId", progress.getProgressId(),
                "name", displayName, "lat", lat, "lng", lng,
                "photoUrl", "/api/files/" + taskId + "/" + storedFile.getFileName());
    }
}
