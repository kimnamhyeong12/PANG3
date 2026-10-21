package com.fieldwork.service;

import com.fieldwork.entity.CompiledReport;
import com.fieldwork.entity.CompiledReportItem;
import com.fieldwork.entity.Project;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.CompiledReportItemRepository;
import com.fieldwork.repository.CompiledReportRepository;
import com.fieldwork.repository.TaskProgressRepository;
import com.fieldwork.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** 통합 보고서: 초안 생성/수정, 담기/빼기/override, 확정/수정본/버전, REPORT_SCHEMA v1 JSON 조립. */
@Service
public class CompiledReportService {
    public static final Set<String> GROUP_BY = Set.of("adminDong", "year", "author", "category");
    private static final Map<String, String> PHOTO_LABELS = Map.of("before", "작업 전", "during", "작업 중", "after", "작업 후");
    private static final int MAX_COMMENT = 5000;

    private final ProjectService projectService;
    private final CompiledReportRepository reports;
    private final CompiledReportItemRepository items;
    private final TaskProgressRepository progressRepository;
    private final UserRepository users;

    public CompiledReportService(ProjectService projectService, CompiledReportRepository reports,
            CompiledReportItemRepository items, TaskProgressRepository progressRepository,
            UserRepository users) {
        this.projectService = projectService;
        this.reports = reports;
        this.items = items;
        this.progressRepository = progressRepository;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(Long projectId, Long userId) {
        Project project = projectService.loadProject(projectId);
        projectService.requireMember(project.getGroup(), userId);
        return reports.findByProjectOrderByReportIdDesc(project).stream().map(this::summaryMap).toList();
    }

    @Transactional
    public Map<String, Object> create(Long projectId, Long userId, Map<String, Object> body) {
        Project project = projectService.loadProject(projectId);
        projectService.requireLeader(project.getGroup(), userId);
        CompiledReport report = new CompiledReport();
        report.setProject(project);
        report.setTitle(requireTitle(body.get("title")));
        report.setGroupBy(body.get("groupBy") == null ? "adminDong" : requireGroupBy(body.get("groupBy")));
        report.setStatus("DRAFT");
        report.setVersion(1);
        report.setCreatedBy(users.findById(userId).orElse(null));
        report = reports.saveAndFlush(report);
        report.setRootReportId(report.getReportId());
        return summaryMap(reports.saveAndFlush(report));
    }

    @Transactional
    public Map<String, Object> update(Long reportId, Long userId, Map<String, Object> body) {
        CompiledReport report = loadReport(reportId);
        projectService.requireLeader(report.getProject().getGroup(), userId);
        requireDraft(report);
        if (body.containsKey("title")) report.setTitle(requireTitle(body.get("title")));
        if (body.containsKey("groupBy")) report.setGroupBy(requireGroupBy(body.get("groupBy")));
        report.setUpdatedAt(LocalDateTime.now());
        return summaryMap(reports.saveAndFlush(report));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getJson(Long reportId, Long userId) {
        CompiledReport report = loadReport(reportId);
        projectService.requireMember(report.getProject().getGroup(), userId);
        if ("FINAL".equals(report.getStatus()) && report.getSnapshotJson() != null) return report.getSnapshotJson();
        return buildJson(report);
    }

    /** Member check only (used by downloads). */
    @Transactional(readOnly = true)
    public void requireReader(Long reportId, Long userId) {
        projectService.requireMember(loadReport(reportId).getProject().getGroup(), userId);
    }

    /** 확정: 현재 보고서 JSON 을 snapshot_json 에 고정한다. 이후 수정 API 는 409. */
    @Transactional
    public Map<String, Object> finalizeReport(Long reportId, Long userId) {
        CompiledReport report = lockReport(reportId);
        projectService.requireLeader(report.getProject().getGroup(), userId);
        requireDraft(report);
        LocalDateTime now = LocalDateTime.now();
        report.setStatus("FINAL");
        report.setFinalizedAt(now);
        report.setFinalizedBy(users.findById(userId).orElse(null));
        report.setUpdatedAt(now);
        if (report.getRootReportId() == null) report.setRootReportId(report.getReportId());
        report.setSnapshotJson(buildJson(report));
        return summaryMap(reports.saveAndFlush(report));
    }

    /** 수정하기: 확정본에서 같은 root 의 새 버전 초안을 만들고 항목/override 를 복제한다. */
    @Transactional
    public Map<String, Object> revise(Long reportId, Long userId) {
        CompiledReport source = lockReport(reportId);
        Project project = source.getProject();
        projectService.requireLeader(project.getGroup(), userId);
        if (!"FINAL".equals(source.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "확정된 보고서만 수정본을 만들 수 있습니다.");
        }
        Long root = source.getRootReportId() == null ? source.getReportId() : source.getRootReportId();
        // Serialize revisions of the same report family on the root row (DB unique indexes back this up).
        if (!root.equals(source.getReportId())) reports.findLocked(root);
        List<CompiledReport> versions = reports.findByRootReportIdOrderByVersionDesc(root);
        if (versions.stream().anyMatch(version -> "DRAFT".equals(version.getStatus()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 작성 중인 수정본이 있습니다.");
        }
        int nextVersion = versions.stream().mapToInt(version -> version.getVersion() == null ? 1 : version.getVersion())
                .max().orElse(source.getVersion() == null ? 1 : source.getVersion()) + 1;
        CompiledReport draft = new CompiledReport();
        draft.setProject(project);
        draft.setTitle(source.getTitle());
        draft.setGroupBy(source.getGroupBy());
        draft.setStatus("DRAFT");
        draft.setVersion(nextVersion);
        draft.setRootReportId(root);
        draft.setCreatedBy(users.findById(userId).orElse(null));
        draft = reports.saveAndFlush(draft);

        List<Long> skipped = new ArrayList<>();
        for (CompiledReportItem item : items.findWithProgress(source)) {
            TaskProgress progress = item.getProgress();
            if (!belongsTo(progress, project) || !projectService.isEligible(progress)) {
                skipped.add(progress.getProgressId());
                continue;
            }
            CompiledReportItem copy = new CompiledReportItem();
            copy.setReport(draft);
            copy.setProgress(progress);
            copy.setSortOrder(item.getSortOrder());
            copy.setOverrideComment(item.getOverrideComment());
            copy.setAddedByUserId(userId);
            items.save(copy);
        }
        items.flush();
        Map<String, Object> result = summaryMap(draft);
        result.put("skipped", skipped);
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> versions(Long reportId, Long userId) {
        CompiledReport report = loadReport(reportId);
        projectService.requireMember(report.getProject().getGroup(), userId);
        Long root = report.getRootReportId() == null ? report.getReportId() : report.getRootReportId();
        List<Map<String, Object>> result = new ArrayList<>();
        for (CompiledReport version : reports.findByRootReportIdOrderByVersionDesc(root)) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("reportId", version.getReportId());
            map.put("version", version.getVersion());
            map.put("status", version.getStatus());
            map.put("title", version.getTitle());
            map.put("finalizedAt", iso(version.getFinalizedAt()));
            map.put("finalizedBy", version.getFinalizedBy() == null ? null : version.getFinalizedBy().getName());
            map.put("updatedAt", iso(version.getUpdatedAt()));
            result.add(map);
        }
        return result;
    }

    /** 담기: 멤버 누구나, DRAFT 에만. 이미 담긴 기록/다른 프로젝트/미완료는 건너뛰고 사유를 돌려준다. */
    @Transactional
    public Map<String, Object> addItems(Long reportId, Long userId, Object rawProgressIds) {
        CompiledReport report = loadReport(reportId);
        Project project = report.getProject();
        projectService.requireMember(project.getGroup(), userId);
        requireDraft(report);
        List<Long> ids = ProjectService.parseIds(rawProgressIds, "progressIds");
        int nextOrder = items.maxSortOrder(report) + 1;
        List<Long> added = new ArrayList<>();
        List<Map<String, Object>> skipped = new ArrayList<>();
        for (Long progressId : ids) {
            TaskProgress progress = progressRepository.findById(progressId).orElse(null);
            String reason = null;
            if (progress == null) {
                reason = "NOT_FOUND";
            } else if (progress.getTask().getProject() == null
                    || !project.getProjectId().equals(progress.getTask().getProject().getProjectId())) {
                reason = "NOT_IN_PROJECT";
            } else if (!ReportRetentionService.available(progress)) {
                reason = "EXPIRED";
            } else if (!projectService.isCompleted(progress)) {
                reason = "NOT_COMPLETED";
            } else if (items.existsByReportAndProgress_ProgressId(report, progressId)) {
                reason = "ALREADY_IN_REPORT";
            }
            if (reason != null) {
                skipped.add(Map.of("progressId", progressId, "reason", reason));
                continue;
            }
            CompiledReportItem item = new CompiledReportItem();
            item.setReport(report);
            item.setProgress(progress);
            item.setSortOrder(nextOrder++);
            item.setAddedByUserId(userId);
            items.save(item);
            added.add(progressId);
        }
        items.flush();
        if (!added.isEmpty()) touch(report);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("added", added);
        result.put("skipped", skipped);
        return result;
    }

    @Transactional
    public Map<String, Object> updateItem(Long reportId, Long progressId, Long userId, Map<String, Object> body) {
        CompiledReport report = loadReport(reportId);
        projectService.requireLeader(report.getProject().getGroup(), userId);
        requireDraft(report);
        CompiledReportItem item = loadItem(report, progressId);
        if (body.containsKey("overrideComment")) {
            Object raw = body.get("overrideComment");
            String value = raw == null ? null : raw.toString();
            if (value != null && value.isBlank()) value = null;
            if (value != null && value.length() > MAX_COMMENT) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "문구는 5000자까지 입력할 수 있습니다.");
            }
            item.setOverrideComment(value);
        }
        if (body.containsKey("sortOrder")) {
            try {
                item.setSortOrder(Integer.valueOf(Objects.toString(body.get("sortOrder"), "")));
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "순서 값이 올바르지 않습니다.");
            }
        }
        items.saveAndFlush(item);
        touch(report);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("progressId", progressId);
        result.put("sortOrder", item.getSortOrder());
        result.put("overrideComment", item.getOverrideComment());
        return result;
    }

    @Transactional
    public Map<String, Object> removeItem(Long reportId, Long progressId, Long userId) {
        CompiledReport report = loadReport(reportId);
        projectService.requireLeader(report.getProject().getGroup(), userId);
        requireDraft(report);
        items.delete(loadItem(report, progressId));
        items.flush();
        touch(report);
        return Map.of("removed", progressId);
    }

    // ---------- REPORT_SCHEMA v1 ----------

    public Map<String, Object> buildJson(CompiledReport report) {
        Project project = report.getProject();
        Map<Long, String> names = new HashMap<>();
        String groupBy = report.getGroupBy() == null ? "adminDong" : report.getGroupBy();

        Map<String, List<Map<String, Object>>> buckets = new HashMap<>();
        Map<String, String> labels = new HashMap<>();
        Set<String> authors = new TreeSet<>();
        LocalDateTime from = null, to = null;
        for (CompiledReportItem item : items.findWithProgress(report)) {
            TaskProgress progress = item.getProgress();
            if (!belongsTo(progress, project) || !ReportRetentionService.available(progress)) continue;
            Map<String, Object> row = itemJson(item, progress, names);
            String[] section = sectionOf(groupBy, progress, row);
            labels.put(section[0], section[1]);
            buckets.computeIfAbsent(section[0], key -> new ArrayList<>()).add(row);
            authors.add(projectService.authorName(progress.getPerformedByUserId(), names));
            LocalDateTime at = projectService.completedAtOf(progress);
            if (at != null) {
                if (from == null || at.isBefore(from)) from = at;
                if (to == null || at.isAfter(to)) to = at;
            }
        }

        List<String> keys = new ArrayList<>(buckets.keySet());
        keys.sort(Comparator.<String, Boolean>comparing(key -> ProjectService.UNASSIGNED.equals(labels.get(key)))
                .thenComparing(labels::get));
        List<Map<String, Object>> sections = new ArrayList<>();
        List<Map<String, Object>> bySection = new ArrayList<>();
        int total = 0;
        for (String key : keys) {
            List<Map<String, Object>> rows = buckets.get(key);
            rows.sort(Comparator.<Map<String, Object>, Integer>comparing(row -> (Integer) row.get("sortOrder"))
                    .thenComparing(row -> Objects.toString(row.get("completedAt"), "")));
            Map<String, Object> section = new LinkedHashMap<>();
            section.put("key", key);
            section.put("label", labels.get(key));
            section.put("count", rows.size());
            section.put("items", rows);
            sections.add(section);
            bySection.add(Map.of("key", key, "label", labels.get(key), "count", rows.size()));
            total += rows.size();
        }

        Map<String, Object> reportMap = new LinkedHashMap<>();
        reportMap.put("reportId", report.getReportId());
        reportMap.put("title", report.getTitle());
        reportMap.put("status", report.getStatus());
        reportMap.put("version", report.getVersion());
        reportMap.put("groupBy", groupBy);
        reportMap.put("updatedAt", iso(report.getUpdatedAt()));

        Map<String, Object> projectMap = new LinkedHashMap<>();
        projectMap.put("projectId", project.getProjectId());
        projectMap.put("name", project.getName());
        projectMap.put("startDate", isoDate(project.getStartDate()));
        projectMap.put("endDate", isoDate(project.getEndDate()));
        projectMap.put("groupId", project.getGroup().getGroupId());
        projectMap.put("groupName", project.getGroup().getName());

        Map<String, Object> period = new LinkedHashMap<>();
        period.put("from", from == null ? null : isoDate(from.toLocalDate()));
        period.put("to", to == null ? null : isoDate(to.toLocalDate()));
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalCount", total);
        summary.put("period", period);
        summary.put("authors", new ArrayList<>(authors));
        summary.put("bySection", bySection);

        Map<String, Object> json = new LinkedHashMap<>();
        json.put("schemaVersion", 1);
        json.put("report", reportMap);
        json.put("project", projectMap);
        json.put("summary", summary);
        json.put("sections", sections);
        return json;
    }

    private Map<String, Object> itemJson(CompiledReportItem item, TaskProgress progress, Map<Long, String> names) {
        Task task = progress.getTask();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("progressId", progress.getProgressId());
        row.put("taskId", task.getTaskId());
        row.put("sortOrder", item.getSortOrder() == null ? 0 : item.getSortOrder());
        row.put("address", projectService.addressOf(task));
        row.put("adminDong", task.getAdminDong());
        row.put("category", task.getTaskCategory());
        row.put("completedAt", iso(projectService.completedAtOf(progress)));
        Map<String, Object> author = new LinkedHashMap<>();
        author.put("userId", progress.getPerformedByUserId());
        author.put("name", projectService.authorName(progress.getPerformedByUserId(), names));
        row.put("author", author);
        row.put("lat", projectService.latOf(progress));
        row.put("lng", projectService.lngOf(progress));
        boolean overridden = item.getOverrideComment() != null;
        row.put("comment", overridden ? item.getOverrideComment() : progress.getMainComment());
        row.put("commentOverridden", overridden);
        row.put("originalComment", progress.getMainComment());
        row.put("aiRefinedContent", progress.getAiRefinedContent());
        row.put("photos", photos(task.getTaskId(), progress.getFieldPhotos()));
        row.put("locationMapImage", fileUrl(task.getTaskId(), progress.getLocationMapImage()));
        return row;
    }

    /** returns {key, label} */
    private String[] sectionOf(String groupBy, TaskProgress progress, Map<String, Object> row) {
        switch (groupBy) {
            case "year": {
                Integer year = projectService.yearOf(progress);
                String label = year == null ? ProjectService.UNASSIGNED : String.valueOf(year);
                return new String[]{label, label};
            }
            case "author": {
                Long id = progress.getPerformedByUserId();
                @SuppressWarnings("unchecked")
                String name = Objects.toString(((Map<String, Object>) row.get("author")).get("name"));
                return new String[]{id == null ? ProjectService.UNASSIGNED : "user-" + id, name};
            }
            case "category": {
                String label = ProjectService.orUnassigned(progress.getTask().getTaskCategory());
                return new String[]{label, label};
            }
            default: {
                String label = ProjectService.orUnassigned(progress.getTask().getAdminDong());
                return new String[]{label, label};
            }
        }
    }

    private List<Map<String, Object>> photos(Long taskId, List<Map<String, Object>> fieldPhotos) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (fieldPhotos == null) return result;
        for (int i = 0; i < fieldPhotos.size(); i++) {
            Map<String, Object> photo = fieldPhotos.get(i);
            String url = fileUrl(taskId, Objects.toString(photo.get("path"), null));
            if (url == null) continue;
            String comment = Objects.toString(photo.get("comment"), "");
            int bar = comment.indexOf('|');
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("slot", PHOTO_LABELS.getOrDefault(PhotoSlots.typeOf(photo, i), ""));
            item.put("url", url);
            item.put("comment", bar >= 0 ? comment.substring(bar + 1) : comment);
            result.add(item);
        }
        return result;
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

    // ---------- helpers ----------

    private CompiledReport loadReport(Long reportId) {
        return reports.findById(reportId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "보고서를 찾을 수 없습니다."));
    }

    private CompiledReport lockReport(Long reportId) {
        return reports.findLocked(reportId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "보고서를 찾을 수 없습니다."));
    }

    private CompiledReportItem loadItem(CompiledReport report, Long progressId) {
        return items.findByReportAndProgress_ProgressId(report, progressId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "보고서에 담긴 항목이 아닙니다."));
    }

    private static boolean belongsTo(TaskProgress progress, Project project) {
        Project owner = progress.getTask().getProject();
        return owner != null && project.getProjectId().equals(owner.getProjectId());
    }

    private static void requireDraft(CompiledReport report) {
        if (!"DRAFT".equals(report.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "확정된 보고서는 수정할 수 없습니다.");
        }
    }

    private void touch(CompiledReport report) {
        report.setUpdatedAt(LocalDateTime.now());
        reports.saveAndFlush(report);
    }

    private Map<String, Object> summaryMap(CompiledReport report) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("reportId", report.getReportId());
        map.put("projectId", report.getProject().getProjectId());
        map.put("title", report.getTitle());
        map.put("status", report.getStatus());
        map.put("version", report.getVersion());
        map.put("rootReportId", report.getRootReportId());
        map.put("groupBy", report.getGroupBy());
        map.put("itemCount", items.countByReport(report));
        map.put("finalizedAt", iso(report.getFinalizedAt()));
        map.put("createdAt", iso(report.getCreatedAt()));
        map.put("updatedAt", iso(report.getUpdatedAt()));
        return map;
    }

    private static String requireTitle(Object raw) {
        String title = Objects.toString(raw, "").trim();
        if (title.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보고서 제목을 입력해 주세요.");
        if (title.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보고서 제목은 200자까지 입력할 수 있습니다.");
        return title;
    }

    private static String requireGroupBy(Object raw) {
        String value = Objects.toString(raw, "").trim();
        if (!GROUP_BY.contains(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "분류 기준이 올바르지 않습니다.");
        }
        return value;
    }

    private static String iso(LocalDateTime value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.SECONDS).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    private static String isoDate(LocalDate value) {
        return value == null ? null : value.toString();
    }
}
