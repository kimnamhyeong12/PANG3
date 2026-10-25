package com.fieldwork.service;

import com.fieldwork.entity.CompiledReport;
import com.fieldwork.entity.Project;
import com.fieldwork.entity.ProjectTask;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.CompiledReportItemRepository;
import com.fieldwork.repository.CompiledReportRepository;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.ProjectRepository;
import com.fieldwork.repository.ProjectTaskRepository;
import com.fieldwork.repository.TaskRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/** 프로젝트 CRUD, 업무 연결, 완료 항목 조회. 권한: 그룹 구성원 = 생성/수정/조회. */
@Service
public class ProjectService {
    public static final String UNASSIGNED = "(미지정)";
    private static final Set<String> COMPLETE = Set.of("complete", "completed", "done");
    private static final Set<String> PROJECT_STATUSES = Set.of("ACTIVE", "ARCHIVED");

    private final ProjectRepository projects;
    private final WorkGroupRepository groups;
    private final GroupMemberRepository members;
    private final UserRepository users;
    private final TaskRepository tasks;
    private final CompiledReportRepository reports;
    private final CompiledReportItemRepository items;
    private final ProjectTaskRepository links;
    private final AdminDongService adminDongs;

    public ProjectService(ProjectRepository projects, WorkGroupRepository groups, GroupMemberRepository members,
            UserRepository users, TaskRepository tasks, CompiledReportRepository reports, CompiledReportItemRepository items,
            ProjectTaskRepository links, AdminDongService adminDongs) {
        this.projects = projects;
        this.groups = groups;
        this.members = members;
        this.users = users;
        this.tasks = tasks;
        this.reports = reports;
        this.items = items;
        this.links = links;
        this.adminDongs = adminDongs;
    }

    // ---------- permissions ----------

    public void requireMember(WorkGroup group, Long userId) {
        if (isLeader(group, userId)) return;
        User user = userId == null ? null : users.findById(userId).orElse(null);
        if (user == null || !members.existsByGroupAndUser(group, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "그룹 멤버만 볼 수 있습니다.");
        }
    }

    public void requireLeader(WorkGroup group, Long userId) {
        if (!isLeader(group, userId)) {
            requireMember(group, userId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "그룹 리더만 할 수 있습니다.");
        }
    }

    public boolean isLeader(WorkGroup group, Long userId) {
        return userId != null && group.getLeader() != null && userId.equals(group.getLeader().getUserId());
    }

    public Project loadProject(Long projectId) {
        return projects.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "프로젝트를 찾을 수 없습니다."));
    }

    // ---------- projects ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(Long groupId, Long userId) {
        WorkGroup group = loadGroup(groupId);
        requireMember(group, userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Project project : projects.findByGroupOrderByProjectIdDesc(group)) {
            Map<String, Object> map = toMap(project);
            map.put("completedCount", eligibleProgress(project).size());
            List<CompiledReport> drafts = reports.findByProjectAndStatusOrderByReportIdDesc(project, "DRAFT");
            map.put("draftReportCount", drafts.size());
            // 확정 보고서 수(같은 보고서의 버전은 하나로 센다)
            map.put("finalReportCount", reports.findByProjectAndStatusOrderByReportIdDesc(project, "FINAL").stream()
                    .map(report -> report.getRootReportId() == null ? report.getReportId() : report.getRootReportId())
                    .distinct().count());
            map.put("latestDraft", drafts.isEmpty() ? null : Map.of(
                    "reportId", drafts.get(0).getReportId(), "title", drafts.get(0).getTitle()));
            result.add(map);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> create(Long groupId, Long userId, Map<String, Object> body) {
        WorkGroup group = loadGroup(groupId);
        requireMember(group, userId);
        if (group.isPersonal()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "개인 작업공간에서는 프로젝트를 만들 수 없습니다.");
        }
        Project project = new Project();
        project.setGroup(group);
        project.setName(requireName(body.get("name")));
        project.setStartDate(parseDate(body.get("startDate")));
        project.setEndDate(parseDate(body.get("endDate")));
        checkPeriod(project);
        project.setCreatedBy(users.findById(userId).orElse(null));
        return toMap(projects.saveAndFlush(project));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(Long projectId, Long userId) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        Map<String, Object> map = toMap(project);
        map.put("completedCount", eligibleProgress(project).size());
        map.put("taskCount", projects.findTasks(project).size());
        map.put("isLeader", isLeader(project.getGroup(), userId));
        map.put("canManage", true);
        return map;
    }

    /**
     * 앱 작업 기록 화면용: 업무가 속한 프로젝트와 그 초안 보고서. 프로젝트가 없으면 projectId=null.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> taskContext(Long taskId, Long userId) {
        Task task = tasks.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "업무를 찾을 수 없습니다."));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("projectId", null);
        result.put("draftReports", List.of());
        if (task.getGroup() == null) return result;
        requireMember(task.getGroup(), userId);
        List<Project> linkedProjects = links.findProjects(task);
        if (linkedProjects.isEmpty()) return result;
        List<Map<String, Object>> drafts = new ArrayList<>();
        List<Map<String, Object>> projectRows = new ArrayList<>();
        for (Project project : linkedProjects) {
            projectRows.add(Map.of("projectId", project.getProjectId(), "projectName", project.getName()));
            for (CompiledReport report : reports.findByProjectAndStatusOrderByReportIdDesc(project, "DRAFT")) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("reportId", report.getReportId());
                row.put("title", report.getTitle());
                row.put("projectName", project.getName());
                row.put("itemCount", items.countByReport(report));
                drafts.add(row);
            }
        }
        // 기존 필드(projectId/projectName)는 가장 최근 프로젝트, 전체는 projects 로 준다.
        result.put("projectId", linkedProjects.get(0).getProjectId());
        result.put("projectName", linkedProjects.get(0).getName());
        result.put("projects", projectRows);
        result.put("draftReports", drafts);
        return result;
    }

    @Transactional
    public Map<String, Object> update(Long projectId, Long userId, Map<String, Object> body) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        if (body.containsKey("name")) project.setName(requireName(body.get("name")));
        if (body.containsKey("startDate")) project.setStartDate(parseDate(body.get("startDate")));
        if (body.containsKey("endDate")) project.setEndDate(parseDate(body.get("endDate")));
        if (body.containsKey("status")) {
            String status = Objects.toString(body.get("status"), "").trim().toUpperCase();
            if (!PROJECT_STATUSES.contains(status)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 상태가 올바르지 않습니다.");
            }
            project.setStatus(status);
        }
        checkPeriod(project);
        return toMap(projects.saveAndFlush(project));
    }

    // ---------- tasks ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> tasks(Long projectId, Long userId) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        return projects.findTasks(project).stream().map(this::taskMap).toList();
    }

    @Transactional
    public Map<String, Object> linkTasks(Long projectId, Long userId, Object rawTaskIds) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        projects.lockById(projectId).orElseThrow();
        List<Long> ids = parseIds(rawTaskIds, "taskIds");
        List<Task> found = tasks.findAllById(ids);
        if (found.size() != ids.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "업무를 찾을 수 없습니다.");
        }
        Long groupId = project.getGroup().getGroupId();
        for (Task task : found) {
            if (task.getGroup() == null || !groupId.equals(task.getGroup().getGroupId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "같은 그룹의 업무만 연결할 수 있습니다.");
            }
        }
        // 다른 프로젝트 연결은 그대로 둔다 (D28: 한 업무를 여러 프로젝트에 담을 수 있음).
        Set<Long> already = new HashSet<>();
        for (ProjectTask link : links.findLinks(project, ids)) already.add(link.getTask().getTaskId());
        List<ProjectTask> created = new ArrayList<>();
        for (Task task : found) {
            if (already.add(task.getTaskId())) created.add(new ProjectTask(project, task));
        }
        links.saveAllAndFlush(created);
        // 행정동이 빈 업무는 좌표·주소로 채운다 (D34)
        List<Task> filled = found.stream().filter(task -> adminDongs.fill(task, null)).toList();
        if (!filled.isEmpty()) tasks.saveAllAndFlush(filled);
        return Map.of("linked", ids);
    }

    @Transactional
    public Map<String, Object> unlinkTask(Long projectId, Long taskId, Long userId) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        List<ProjectTask> found = links.findLinks(project, List.of(taskId));
        if (found.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "프로젝트에 연결된 업무가 아닙니다.");
        }
        unlink(project, found);
        return Map.of("unlinked", taskId);
    }

    /** 여러 건 한 번에 해제. 연결되지 않은 id 는 건너뛴다. */
    @Transactional
    public Map<String, Object> unlinkTasks(Long projectId, Long userId, Object rawTaskIds) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        List<ProjectTask> found = links.findLinks(project, parseIds(rawTaskIds, "taskIds"));
        unlink(project, found);
        return Map.of("unlinked", found.stream().map(link -> link.getTask().getTaskId()).toList());
    }

    private void unlink(Project project, List<ProjectTask> found) {
        for (ProjectTask link : found) removeFromDrafts(project, link.getTask());
        links.deleteAll(found);
        links.flush();
    }

    /** 업무가 이 프로젝트에 연결되어 있는지 (보고서 담기 검사용). */
    public boolean isLinked(Project project, Task task) {
        return links.existsByProjectAndTask(project, task);
    }

    // ---------- completed items ----------

    /**
     * Completed records of the project. Each item carries {@code inReportIds}: the DRAFT reports of
     * this project that already contain it. {@code filters} lists option values from all eligible items.
     */
    @Transactional // 행정동이 빈 업무를 처음 볼 때 채워 저장한다 (D34)
    public Map<String, Object> items(Long projectId, Long userId, Integer year, String adminDong, Long authorId, String category) {
        Project project = loadProject(projectId);
        requireMember(project.getGroup(), userId);
        List<TaskProgress> eligible = eligibleProgress(project);
        List<Task> filled = new ArrayList<>();
        for (TaskProgress progress : eligible) {
            if (adminDongs.fill(progress.getTask(), progress)) filled.add(progress.getTask());
        }
        if (!filled.isEmpty()) tasks.saveAllAndFlush(filled);

        Map<Long, List<Long>> membership = new HashMap<>();
        for (Object[] row : items.findDraftMembership(project)) {
            membership.computeIfAbsent((Long) row[1], key -> new ArrayList<>()).add((Long) row[0]);
        }
        Map<Long, String> names = new HashMap<>();
        Set<Integer> years = new TreeSet<>();
        Set<String> dongs = new TreeSet<>();
        Set<String> categories = new TreeSet<>();
        Map<Long, String> authors = new TreeMap<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (TaskProgress progress : eligible) {
            Task task = progress.getTask();
            Integer itemYear = yearOf(progress);
            if (itemYear != null) years.add(itemYear);
            dongs.add(orUnassigned(task.getAdminDong()));
            categories.add(orUnassigned(task.getTaskCategory()));
            if (progress.getPerformedByUserId() != null) {
                authors.put(progress.getPerformedByUserId(), authorName(progress.getPerformedByUserId(), names));
            }
            if (year != null && !year.equals(itemYear)) continue;
            if (!matches(adminDong, task.getAdminDong())) continue;
            if (!matches(category, task.getTaskCategory())) continue;
            if (authorId != null && !authorId.equals(progress.getPerformedByUserId())) continue;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("progressId", progress.getProgressId());
            row.put("taskId", task.getTaskId());
            row.put("address", addressOf(task));
            row.put("adminDong", task.getAdminDong());
            row.put("category", task.getTaskCategory());
            row.put("completedAt", completedAtOf(progress));
            row.put("year", itemYear);
            row.put("authorId", progress.getPerformedByUserId());
            row.put("authorName", authorName(progress.getPerformedByUserId(), names));
            row.put("comment", memoOf(progress));
            row.put("photoCount", progress.getFieldPhotos() == null ? 0 : progress.getFieldPhotos().size());
            row.put("lat", latOf(progress));
            row.put("lng", lngOf(progress));
            row.put("inReportIds", membership.getOrDefault(progress.getProgressId(), List.of()));
            rows.add(row);
        }
        List<Map<String, Object>> authorOptions = new ArrayList<>();
        authors.forEach((id, name) -> authorOptions.add(Map.of("userId", id, "name", name)));
        Map<String, Object> filters = new LinkedHashMap<>();
        filters.put("years", new ArrayList<>(years));
        filters.put("adminDongs", new ArrayList<>(dongs));
        filters.put("authors", authorOptions);
        filters.put("categories", new ArrayList<>(categories));

        List<Map<String, Object>> drafts = reports.findByProjectAndStatusOrderByReportIdDesc(project, "DRAFT").stream()
                .map(report -> Map.<String, Object>of("reportId", report.getReportId(), "title", report.getTitle()))
                .toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", rows);
        result.put("totalCount", eligible.size());
        result.put("filters", filters);
        result.put("draftReports", drafts);
        return result;
    }

    // ---------- shared helpers (also used by CompiledReportService) ----------

    public List<TaskProgress> eligibleProgress(Project project) {
        return projects.findProgress(project).stream().filter(this::isEligible).toList();
    }

    public boolean isEligible(TaskProgress progress) {
        return ReportRetentionService.available(progress) && isCompleted(progress);
    }

    /** progressStatus decides; a record without its own status follows the task status. */
    public boolean isCompleted(TaskProgress progress) {
        String status = progress.getProgressStatus();
        if (status == null || status.isBlank()) {
            status = progress.getTask() == null ? null : progress.getTask().getTaskStatus();
        }
        return status != null && COMPLETE.contains(status.trim().toLowerCase());
    }

    public LocalDateTime completedAtOf(TaskProgress progress) {
        LocalDateTime completed = progress.getTask() == null ? null : progress.getTask().getCompletedAt();
        return completed != null ? completed : progress.getCreatedAt();
    }

    public Integer yearOf(TaskProgress progress) {
        LocalDateTime at = completedAtOf(progress);
        return at == null ? null : at.getYear();
    }

    public String addressOf(Task task) {
        String road = Objects.toString(task.getRoadAddress(), "").trim();
        String detail = Objects.toString(task.getDetailAddress(), "").trim();
        String joined = (road + " " + detail).trim();
        return joined.isEmpty() ? null : joined;
    }

    public Double latOf(TaskProgress progress) {
        Double lat = progress.getTask().getLat();
        return lat != null ? lat : progress.getLatitude();
    }

    public Double lngOf(TaskProgress progress) {
        Double lng = progress.getTask().getLng();
        return lng != null ? lng : progress.getLongitude();
    }

    public String authorName(Long userId, Map<Long, String> cache) {
        if (userId == null) return UNASSIGNED;
        return cache.computeIfAbsent(userId, id -> users.findById(id)
                .map(user -> user.getName() == null || user.getName().isBlank() ? user.getLoginId() : user.getName())
                .orElse(UNASSIGNED));
    }

    /** 앱은 메모를 field_memo 에, 웹 편집은 main_comment 에 저장한다. 보고서 본문은 둘을 합친 값이다 (D36). */
    public static String memoOf(TaskProgress progress) {
        LinkedHashSet<String> parts = new LinkedHashSet<>();
        for (String value : new String[]{progress.getFieldMemo(), progress.getMainComment()}) {
            if (value != null && !value.isBlank()) parts.add(value.strip());
        }
        return parts.isEmpty() ? null : String.join("\n", parts);
    }

    public static String orUnassigned(String value) {
        return value == null || value.isBlank() ? UNASSIGNED : value.trim();
    }

    public static List<Long> parseIds(Object raw, String field) {
        if (!(raw instanceof Collection<?> values) || values.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " 값이 필요합니다.");
        }
        if (values.size() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "한 번에 500건까지 처리할 수 있습니다.");
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (Object value : values) {
            try {
                ids.add(Long.valueOf(Objects.toString(value, "")));
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " 값이 올바르지 않습니다.");
            }
        }
        return new ArrayList<>(ids);
    }

    // ---------- private ----------

    /** A task leaving a project drops out of that project's DRAFT reports; FINAL snapshots stay as they are. */
    private void removeFromDrafts(Project project, Task task) {
        List<com.fieldwork.entity.CompiledReportItem> stale = items.findDraftItemsForTask(project, task);
        if (!stale.isEmpty()) {
            items.deleteAll(stale);
            items.flush();
        }
    }

    private WorkGroup loadGroup(Long groupId) {
        return groups.findById(groupId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "그룹을 찾을 수 없습니다."));
    }

    private static boolean matches(String filter, String value) {
        if (filter == null || filter.isBlank()) return true;
        return filter.trim().equals(orUnassigned(value));
    }

    private Map<String, Object> toMap(Project project) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("projectId", project.getProjectId());
        map.put("groupId", project.getGroup().getGroupId());
        map.put("name", project.getName());
        map.put("startDate", project.getStartDate());
        map.put("endDate", project.getEndDate());
        map.put("status", project.getStatus());
        map.put("createdAt", project.getCreatedAt());
        map.put("updatedAt", project.getUpdatedAt());
        return map;
    }

    private Map<String, Object> taskMap(Task task) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("taskId", task.getTaskId());
        map.put("roadAddress", task.getRoadAddress());
        map.put("detailAddress", task.getDetailAddress());
        map.put("adminDong", task.getAdminDong());
        map.put("taskCategory", task.getTaskCategory());
        map.put("taskStatus", task.getTaskStatus());
        map.put("completedAt", task.getCompletedAt());
        map.put("lat", task.getLat());
        map.put("lng", task.getLng());
        return map;
    }

    private static String requireName(Object raw) {
        String name = Objects.toString(raw, "").trim();
        if (name.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 이름을 입력해 주세요.");
        if (name.length() > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 이름은 100자까지 입력할 수 있습니다.");
        return name;
    }

    private static LocalDate parseDate(Object raw) {
        String value = Objects.toString(raw, "").trim();
        if (value.isEmpty()) return null;
        try {
            return LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "날짜 형식이 올바르지 않습니다. (예: 2026-01-31)");
        }
    }

    private static void checkPeriod(Project project) {
        if (project.getStartDate() != null && project.getEndDate() != null
                && project.getEndDate().isBefore(project.getStartDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종료일은 시작일보다 빠를 수 없습니다.");
        }
    }
}
