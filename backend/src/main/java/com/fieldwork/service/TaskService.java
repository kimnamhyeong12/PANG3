package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.GroupMember;
import com.fieldwork.entity.LocationAssignment;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.LocationAssignmentRepository;
import com.fieldwork.repository.TaskProgressRepository;
import com.fieldwork.repository.TaskRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskProgressRepository taskProgressRepository;
    private final LocationAssignmentRepository locationAssignmentRepository;
    private final UserRepository userRepository;
    private final WorkGroupRepository workGroupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupService groupService;
    private final PushNotificationService pushNotificationService;

    public TaskService(
            TaskRepository taskRepository,
            TaskProgressRepository taskProgressRepository,
            LocationAssignmentRepository locationAssignmentRepository,
            UserRepository userRepository,
            WorkGroupRepository workGroupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupService groupService,
            PushNotificationService pushNotificationService
    ) {
        this.taskRepository = taskRepository;
        this.taskProgressRepository = taskProgressRepository;
        this.locationAssignmentRepository = locationAssignmentRepository;
        this.userRepository = userRepository;
        this.workGroupRepository = workGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupService = groupService;
        this.pushNotificationService = pushNotificationService;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAllForFrontend() {
        return taskRepository.findAll().stream()
                .map(this::toFrontendMap)
                .collect(Collectors.toList());
    }

    @Transactional
    public List<Map<String, Object>> getForFrontend(Long userId, Long groupId) {
        User user = getUser(userId);

        if (groupId == null) {
            groupId = groupService.ensurePersonalGroup(user).getGroupId();
        }

        WorkGroup group = getGroup(groupId);
        GroupMember member = groupMemberRepository.findByGroupAndUser(group, user)
                .orElseThrow(() -> new RuntimeException("?대떦 洹몃９??硫ㅻ쾭媛 ?꾨떃?덈떎."));

        if ("LEADER".equalsIgnoreCase(member.getRole())) {
            return taskRepository.findByGroupOrderByTaskIdDesc(group).stream()
                    .map(this::toFrontendMap)
                    .collect(Collectors.toList());
        }

        return locationAssignmentRepository
                .findByGroupAndAssigneeOrderByAssignedAtDesc(group, user)
                .stream()
                .map(assignment -> toFrontendMap(assignment.getTask()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getGroupLocations(Long groupId, Long userId) {
        User user = getUser(userId);
        WorkGroup group = getGroup(groupId);

        if (!groupMemberRepository.existsByGroupAndUser(group, user)) {
            throw new RuntimeException("?대떦 洹몃９??硫ㅻ쾭媛 ?꾨떃?덈떎.");
        }

        return taskRepository.findByGroupOrderByTaskIdDesc(group)
                .stream()
                .map(this::toFrontendMap)
                .collect(Collectors.toList());
    }

    public Task getById(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
    }

    @Transactional
    public Map<String, Object> createFromFrontendBody(Map<String, Object> body) {
        Task task = new Task();

        Long createdByUserId = toLong(body.get("createdByUserId"), body.get("userId"));
        if (createdByUserId == null) {
            throw new RuntimeException("諛⑸Ц吏 ?앹꽦 ?ъ슜??ID媛 ?꾩슂?⑸땲??");
        }

        User creator = getUser(createdByUserId);
        task.setCreatedBy(creator);

        Long groupId = toLong(body.get("groupId"));
        if (groupId == null) {
            groupId = groupService.ensurePersonalGroup(creator).getGroupId();
        }
        GroupMember creatorMembership = null;
        WorkGroup taskGroup = null;
        WorkGroup group = getGroup(groupId);
        creatorMembership = groupMemberRepository.findByGroupAndUser(group, creator)
                .orElseThrow(() -> new RuntimeException("?대떦 洹몃９??硫ㅻ쾭留?諛⑸Ц吏瑜?留뚮뱾 ???덉뒿?덈떎."));
        task.setGroup(group);
        taskGroup = group;

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

        task.setLat(toDouble(
                body.get("lat"),
                body.get("latitude")
        ));

        task.setLng(toDouble(
                body.get("lng"),
                body.get("longitude")
        ));

        // 移댄뀒怨좊━???좏깮 ?ы빆?대떎. ?좏깮?섏? ?딆? 寃쎌슦 鍮?媛?null)??洹몃?濡??좎??쒕떎.
        task.setTaskCategory(firstNonBlank(
                str(body.get("taskCategory")),
                str(body.get("task")),
                str(body.get("task_category"))
        ));

        task.setPriority(toInteger(
                body.get("priority")
        ));

        // workDate??理쒖큹 ?깅줉?쇰줈 ??踰덈쭔 ??ν븳??
        // ?꾨줎?멸? 蹂대궦 ?쒓뎅 濡쒖뺄 ?좎쭨媛 ?덉쑝硫?洹?媛믪쓣 ?ъ슜?섍퀬 ?댄썑?먮뒗 蹂寃쏀븯吏 ?딅뒗??
        LocalDate requestedWorkDate = toLocalDate(
                body.get("workDate"),
                body.get("work_date")
        );
        LocalDate originalWorkDate = requestedWorkDate != null
                ? requestedWorkDate
                : LocalDate.now();
        task.setWorkDate(originalWorkDate);

        // scheduledDate???꾩옱 ?대뒓 ?좎쭨???낅Т 紐⑸줉???ㅼ뼱媛 ?덈뒗吏瑜??섑??몃떎.
        LocalDate requestedScheduledDate = toLocalDate(
                body.get("scheduledDate"),
                body.get("scheduled_date")
        );
        task.setScheduledDate(
                requestedScheduledDate != null ? requestedScheduledDate : originalWorkDate
        );

        applyStatusTransition(task, firstNonBlank(
                str(body.get("taskStatus")),
                str(body.get("status")),
                str(body.get("task_status")),
                "pending"
        ));

        task.setSido(firstNonBlank(
                str(body.get("sido"))
        ));

        task.setSigungu(firstNonBlank(
                str(body.get("sigungu"))
        ));

        task.setAdminDong(firstNonBlank(
                str(body.get("adminDong")),
                str(body.get("admin_dong"))
        ));

        Task savedTask = taskRepository.save(task);

        // 1??洹몃９怨??쇰컲 ??먯? ?깅줉 利됱떆 蹂몄씤 ?대떦?쇰줈 ?곌껐?쒕떎.
        // ?ㅼ씤 洹몃９????μ씠 異붽???諛⑸Ц吏???대떦??吏???붾㈃?먯꽌 諛곗젙?쒕떎.
        boolean deferAssignment = booleanValue(body.get("deferAssignment"));
        if (taskGroup != null
                && creatorMembership != null
                && (taskGroup.isPersonal()
                    || (!deferAssignment
                        && "MEMBER".equalsIgnoreCase(creatorMembership.getRole())))) {
            LocationAssignment assignment = new LocationAssignment();
            assignment.setGroup(taskGroup);
            assignment.setTask(savedTask);
            assignment.setAssignee(creator);
            assignment.setAssignedBy(creator);
            locationAssignmentRepository.save(assignment);
        }

        return toFrontendMap(savedTask);
    }

    private boolean booleanValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        return value != null && Boolean.parseBoolean(value.toString());
    }

    @Transactional
    public Map<String, Object> updateStatus(Long taskId, String status) {
        Task task = getById(taskId);
        return toFrontendMap(updateStatusEntity(task, status));
    }

    @Transactional
    public Task updateStatusEntity(Task task, String status) {
        applyStatusTransition(task, status);
        return taskRepository.save(task);
    }

    /**
     * 誘몄쿂由??낅Т瑜??ㅻ뒛 ?낅Т濡??ㅼ떆 媛?몄삱 ??諛곗튂 ?좎쭨留?媛깆떊?쒕떎.
     * work_date/created_at? 理쒖큹 ?깅줉 ?쒖젏 ?뺣낫?대?濡??덈? 蹂寃쏀븯吏 ?딅뒗??
     */
    @Transactional
    public Map<String, Object> updateScheduledDate(Long taskId, String scheduledDate) {
        Task task = getById(taskId);
        LocalDate parsed = (scheduledDate == null || scheduledDate.isBlank())
                ? LocalDate.now()
                : LocalDate.parse(scheduledDate.trim());
        task.setScheduledDate(parsed);
        return toFrontendMap(taskRepository.save(task));
    }

    @Transactional
    public Map<String, Object> updatePriority(
            Long taskId,
            Integer priority,
            Long userId,
            Long groupId
    ) {
        Task task = getById(taskId);

        WorkGroup group = task.getGroup();

        if (groupId != null) {
            if (group == null
                    || !groupId.equals(group.getGroupId())) {
                throw new RuntimeException(
                        "현재 업무공간의 방문지가 아닙니다."
                );
            }
        }

        if (userId != null && group != null) {
            User requester = getUser(userId);

            if (!groupMemberRepository.existsByGroupAndUser(
                    group,
                    requester
            )) {
                throw new RuntimeException(
                        "해당 업무공간의 멤버만 우선순위를 변경할 수 있습니다."
                );
            }
        }

        Integer previousPriority = task.getPriority();

        if (Objects.equals(previousPriority, priority)) {
            return toFrontendMap(task);
        }

        task.setPriority(priority);
        Task saved = taskRepository.save(task);

        LocationAssignment assignment = null;

        if (group != null) {
            assignment = locationAssignmentRepository
                    .findByGroupAndTask(group, task)
                    .orElse(null);
        }

        if (assignment == null) {
            List<LocationAssignment> assignments =
                    locationAssignmentRepository
                            .findByTaskOrderByAssignedAtAsc(task);

            if (!assignments.isEmpty()) {
                assignment = assignments.get(0);
            }
        }

        if (assignment != null
                && assignment.getAssignee() != null) {
            Map<String, Object> data = new HashMap<>();
            data.put(
                    "type",
                    PushNotificationService.TYPE_PRIORITY_CHANGED
            );
            data.put("taskId", task.getTaskId());

            if (group != null) {
                data.put("groupId", group.getGroupId());
            }

            if (priority != null) {
                data.put("priority", priority);
            }

            String body = priority == null
                    ? taskDisplayName(task)
                        + " 업무의 우선순위가 해제되었습니다."
                    : taskDisplayName(task)
                        + " 업무가 " + priority
                        + "순위로 변경되었습니다.";

            pushNotificationService.sendToUserAfterCommit(
                    assignment.getAssignee().getUserId(),
                    "업무 우선순위가 변경되었습니다",
                    body,
                    data
            );
        }

        return toFrontendMap(saved);
    }

    /*
     * 誘몄쿂由?諛⑸Ц吏 ??젣
     *
     * task瑜?諛붾줈 ??젣?섎㈃
     * task_progress / task_assignments?먯꽌
     * ?대떦 task_id瑜?李몄“?섍퀬 ?덉쓣 ???덉쑝誘濡?
     * 愿???곗씠?곕? 癒쇱? ??젣?쒕떎.
     */
    @Transactional
    public Map<String, Object> deletePendingTask(Long taskId) {

        Task task = taskRepository.findById(taskId).orElse(null);

        /*
         * DB?먮뒗 ?대? ?녿뒗??
         * ?대??곗뿉 ?덉쟾 ?곗씠?곌? ?⑥? 寃쎌슦??
         * ??젣 ?깃났?쇰줈 泥섎━
         */
        if (task == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("taskId", taskId);
            result.put("message", "?대? ??젣??諛⑸Ц吏?낅땲??");
            return result;
        }

        String status = task.getTaskStatus();

        /*
         * ?꾨즺?섏뿀嫄곕굹 ?묒뾽 以묒씤 諛⑸Ц吏??
         * ?ㅼ닔濡???젣?섏? 紐삵븯寃?蹂댄샇
         */
        if (status != null
                && !status.isBlank()
                && !"pending".equalsIgnoreCase(status)) {

            throw new RuntimeException(
                    "誘몄쿂由?諛⑸Ц吏留???젣?????덉뒿?덈떎."
            );
        }

        // ?대떦??諛곗젙 ??젣
        locationAssignmentRepository.deleteByTask_TaskId(taskId);

        // 吏꾪뻾 湲곕줉 ??젣
        taskProgressRepository.deleteByTask_TaskId(taskId);

        // ?ㅼ젣 諛⑸Ц吏 ??젣
        taskRepository.delete(task);

        Map<String, Object> result = new HashMap<>();
        result.put("taskId", taskId);
        result.put("message", "諛⑸Ц吏媛 ??젣?섏뿀?듬땲??");

        return result;
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
        map.put("priority", task.getPriority());

        map.put("createdAt", task.getCreatedAt());
        map.put("created_at", task.getCreatedAt());
        map.put("completedAt", task.getCompletedAt());
        map.put("completed_at", task.getCompletedAt());
        map.put("workDate", task.getWorkDate());
        map.put("work_date", task.getWorkDate());
        map.put("scheduledDate", task.getScheduledDate());
        map.put("scheduled_date", task.getScheduledDate());

        map.put("sido", task.getSido());
        map.put("sigungu", task.getSigungu());
        map.put("adminDong", task.getAdminDong());
        map.put("admin_dong", task.getAdminDong());

        map.put("createdByUserId", task.getCreatedBy() != null
                ? task.getCreatedBy().getUserId()
                : null);
        map.put("groupId", task.getGroup() != null
                ? task.getGroup().getGroupId()
                : null);
        map.put("groupName", task.getGroup() != null
                ? task.getGroup().getName()
                : null);
        map.put("personalWorkspace", task.getGroup() != null
                && task.getGroup().isPersonal());
        map.put("workspaceType", task.getGroup() != null
                && task.getGroup().isPersonal()
                ? "PERSONAL"
                : "TEAM");

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

    private Long toLong(Object... values) {
        for (Object value : values) {
            if (value != null && !value.toString().isBlank()) {
                return Long.valueOf(value.toString());
            }
        }
        return null;
    }

    private Integer toInteger(Object... values) {
        for (Object value : values) {
            if (value != null && !value.toString().isBlank()) {
                return Integer.valueOf(value.toString());
            }
        }
        return null;
    }

    private LocalDate toLocalDate(Object... values) {
        for (Object value : values) {
            if (value != null && !value.toString().isBlank()) {
                return LocalDate.parse(value.toString().trim().substring(0, 10));
            }
        }
        return null;
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎."));
    }

    private WorkGroup getGroup(Long groupId) {
        return workGroupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("洹몃９??李얠쓣 ???놁뒿?덈떎."));
    }

    private String taskDisplayName(Task task) {
        if (task == null) {
            return "방문지";
        }

        if (task.getDetailAddress() != null
                && !task.getDetailAddress().isBlank()) {
            return task.getDetailAddress();
        }

        if (task.getTaskCategory() != null
                && !task.getTaskCategory().isBlank()) {
            return task.getTaskCategory();
        }

        return "방문지";
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private void applyStatusTransition(Task task, String status) {
        boolean wasComplete = isCompleteStatus(task.getTaskStatus());
        boolean willBeComplete = isCompleteStatus(status);

        if (!wasComplete && willBeComplete) {
            task.setCompletedAt(LocalDateTime.now());
        } else if (wasComplete && !willBeComplete) {
            task.setCompletedAt(null);
        }

        task.setTaskStatus(status);
    }

    private boolean isCompleteStatus(String status) {
        if (status == null) {
            return false;
        }
        String normalized = status.trim().toLowerCase();
        return "complete".equals(normalized)
                || "completed".equals(normalized)
                || "done".equals(normalized);
    }
}
