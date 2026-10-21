package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.entity.User;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.TaskProgressRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 보고서 보관함의 건별 보고서 편집 (D23·D27): 원본 task_progress 의 제목·본문·사진 설명만 고친다.
 * 권한은 현재 담당자 + 그룹 리더. 위치·사진 파일·상태는 건드리지 않는다 (기존 작업 저장 경로 그대로).
 */
@Service
public class ProgressReportEditService {
    private static final Map<String, String> PHOTO_LABELS = Map.of("before", "작업 전", "during", "작업 중", "after", "작업 후");
    private static final int MAX_TITLE = 120;
    private static final int MAX_COMMENT = 10000;
    private static final int MAX_PHOTO_COMMENT = 500;

    private final TaskProgressRepository progressRepository;
    private final TaskProgressService taskProgressService;
    private final TaskService taskService;
    private final ProjectService projectService;
    private final GroupMemberRepository members;

    public ProgressReportEditService(TaskProgressRepository progressRepository, TaskProgressService taskProgressService,
            TaskService taskService, ProjectService projectService, GroupMemberRepository members) {
        this.progressRepository = progressRepository;
        this.taskProgressService = taskProgressService;
        this.taskService = taskService;
        this.projectService = projectService;
        this.members = members;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(Long progressId, Long userId) {
        TaskProgress progress = load(progressId);
        taskProgressService.validateReader(progress.getTask(), userId);
        return toMap(progress, userId);
    }

    @Transactional
    public Map<String, Object> update(Long progressId, Long userId, Map<String, Object> body) {
        TaskProgress progress = progressRepository.findLocked(progressId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "보고서를 찾을 수 없습니다."));
        ReportRetentionService.requireAvailable(progress);
        Task task = progress.getTask();
        taskProgressService.validateReader(task, userId);
        if (!canEdit(task, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "현재 담당자나 그룹 리더만 보고서를 고칠 수 있습니다.");
        }
        if (!revisionOf(progress).equals(Objects.toString(body.get("expectedRevision"), ""))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 곳에서 보고서가 변경되었습니다. 새로 불러온 뒤 다시 고쳐 주세요.");
        }

        if (body.containsKey("reportName")) {
            String name = Objects.toString(body.get("reportName"), "").trim();
            if (name.length() > MAX_TITLE || name.chars().anyMatch(Character::isISOControl)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보고서 이름은 120자 이내로 입력해 주세요.");
            }
            progress.setReportName(name.isEmpty() ? null : name);
        }
        boolean commentChanged = false;
        if (body.containsKey("mainComment")) {
            String comment = Objects.toString(body.get("mainComment"), "");
            if (comment.length() > MAX_COMMENT) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "본문은 10,000자 이내로 입력해 주세요.");
            }
            commentChanged = !comment.equals(Objects.toString(progress.getMainComment(), ""));
            progress.setMainComment(comment);
        }
        if (body.get("photoComments") instanceof Map<?, ?> changes && !changes.isEmpty()) {
            progress.setFieldPhotos(applyPhotoComments(progress.getFieldPhotos(), changes));
        } else if (body.get("photoComments") != null && !(body.get("photoComments") instanceof Map<?, ?>)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진 설명 형식이 올바르지 않습니다.");
        }
        // 기존 저장 경로와 같이: 만들어 둔 HWPX 는 다시 만들고, 본문이 바뀌면 AI 정리는 버린다.
        progress.setReportFilePath(null);
        if (commentChanged) progress.setAiRefinedContent(null);
        return toMap(progressRepository.saveAndFlush(progress), userId);
    }

    private static List<Map<String, Object>> applyPhotoComments(List<Map<String, Object>> photos, Map<?, ?> changes) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (photos != null) for (Map<String, Object> photo : photos) result.add(new HashMap<>(photo));
        for (Map.Entry<?, ?> entry : changes.entrySet()) {
            int index;
            try {
                index = Integer.parseInt(Objects.toString(entry.getKey(), ""));
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진 순번이 올바르지 않습니다.");
            }
            if (index < 0 || index >= result.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "없는 사진입니다.");
            String value = Objects.toString(entry.getValue(), "").trim();
            if (value.length() > MAX_PHOTO_COMMENT) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진 설명은 500자까지 입력할 수 있습니다.");
            }
            // '|' 앞부분은 단계 표시로 읽히므로(PhotoSlots) 설명에는 쓸 수 없다.
            if (value.indexOf('|') >= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진 설명에는 | 문자를 쓸 수 없습니다.");
            }
            Map<String, Object> photo = result.get(index);
            String old = Objects.toString(photo.get("comment"), "");
            int bar = old.indexOf('|');
            // "작업 전|설명" 처럼 앞에 붙은 단계 표시는 그대로 둔다 (PhotoSlots.typeOf 가 읽음).
            photo.put("comment", bar >= 0 ? old.substring(0, bar + 1) + value : value);
        }
        return result;
    }

    private boolean canEdit(Task task, Long userId) {
        if (userId == null) return false;
        if (task.getGroup() != null && projectService.isLeader(task.getGroup(), userId)) return true;
        User owner = taskService.currentAssignee(task);
        // TaskService.requireEditor 와 같이: 그룹을 떠난 담당자는 고칠 수 없다.
        return owner != null && userId.equals(owner.getUserId())
                && (task.getGroup() == null || members.existsByGroupAndUser(task.getGroup(), owner));
    }

    private Map<String, Object> toMap(TaskProgress progress, Long userId) {
        Task task = progress.getTask();
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("progressId", progress.getProgressId());
        map.put("taskId", task.getTaskId());
        map.put("groupId", task.getGroup() == null ? null : task.getGroup().getGroupId());
        map.put("reportName", progress.getReportName());
        map.put("autoTitle", CompiledReportService.autoTitle(task));
        map.put("address", projectService.addressOf(task));
        map.put("adminDong", task.getAdminDong());
        map.put("category", task.getTaskCategory());
        map.put("completedAt", iso(projectService.completedAtOf(progress)));
        map.put("authorName", projectService.authorName(progress.getPerformedByUserId(), new HashMap<>()));
        User owner = taskService.currentAssignee(task);
        map.put("assigneeUserId", owner == null ? null : owner.getUserId());
        map.put("assigneeName", owner == null ? null : owner.getName());
        map.put("lat", projectService.latOf(progress));
        map.put("lng", projectService.lngOf(progress));
        map.put("mainComment", progress.getMainComment());
        List<Map<String, Object>> photos = new ArrayList<>();
        List<Map<String, Object>> fieldPhotos = progress.getFieldPhotos();
        if (fieldPhotos != null) {
            for (int i = 0; i < fieldPhotos.size(); i++) {
                Map<String, Object> photo = fieldPhotos.get(i);
                String url = fileUrl(task.getTaskId(), Objects.toString(photo.get("path"), null));
                if (url == null) continue;
                String comment = Objects.toString(photo.get("comment"), "");
                int bar = comment.indexOf('|');
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("index", i);
                row.put("slot", PHOTO_LABELS.getOrDefault(PhotoSlots.typeOf(photo, i), ""));
                row.put("url", url);
                row.put("comment", bar >= 0 ? comment.substring(bar + 1) : comment);
                photos.add(row);
            }
        }
        map.put("photos", photos);
        map.put("canEdit", canEdit(task, userId));
        map.put("isLeader", task.getGroup() != null && projectService.isLeader(task.getGroup(), userId));
        map.put("revision", revisionOf(progress));
        return map;
    }

    private static String revisionOf(TaskProgress progress) {
        StringBuilder data = new StringBuilder();
        data.append(Objects.toString(progress.getReportName(), "")).append('\u0000')
                .append(Objects.toString(progress.getMainComment(), "")).append('\u0000');
        if (progress.getFieldPhotos() != null) {
            for (Map<String, Object> photo : progress.getFieldPhotos()) {
                data.append(Objects.toString(photo.get("path"), "")).append('\u0001')
                        .append(Objects.toString(photo.get("comment"), "")).append('\u0000');
            }
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("보고서 변경 상태를 확인하지 못했습니다.");
        }
    }

    private TaskProgress load(Long progressId) {
        TaskProgress progress = progressRepository.findById(progressId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "보고서를 찾을 수 없습니다."));
        ReportRetentionService.requireAvailable(progress);
        return progress;
    }

    /** Same public URL shape as TaskProgressService.toPublicFileUrl. */
    private static String fileUrl(Long taskId, String path) {
        if (path == null || path.isBlank()) return null;
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        try {
            return "/api/files/" + taskId + "/" + Paths.get(path).getFileName();
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static String iso(LocalDateTime value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.SECONDS).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }
}
