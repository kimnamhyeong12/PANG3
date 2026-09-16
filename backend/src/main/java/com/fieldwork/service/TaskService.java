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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

    public TaskService(
            TaskRepository taskRepository,
            TaskProgressRepository taskProgressRepository,
            LocationAssignmentRepository locationAssignmentRepository,
            UserRepository userRepository,
            WorkGroupRepository workGroupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupService groupService
    ) {
        this.taskRepository = taskRepository;
        this.taskProgressRepository = taskProgressRepository;
        this.locationAssignmentRepository = locationAssignmentRepository;
        this.userRepository = userRepository;
        this.workGroupRepository = workGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupService = groupService;
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
                .orElseThrow(() -> new RuntimeException("해당 그룹의 멤버가 아닙니다."));

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
            throw new RuntimeException("해당 그룹의 멤버가 아닙니다.");
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
            throw new RuntimeException("방문지 생성 사용자 ID가 필요합니다.");
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
                .orElseThrow(() -> new RuntimeException("해당 그룹의 멤버만 방문지를 만들 수 있습니다."));
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

        // 카테고리는 선택 사항이다. 선택하지 않은 경우 빈 값(null)을 그대로 유지한다.
        task.setTaskCategory(firstNonBlank(
                str(body.get("taskCategory")),
                str(body.get("task")),
                str(body.get("task_category"))
        ));

        // workDate는 최초 등록일로 한 번만 저장한다.
        // 프론트가 보낸 한국 로컬 날짜가 있으면 그 값을 사용하고 이후에는 변경하지 않는다.
        LocalDate requestedWorkDate = toLocalDate(
                body.get("workDate"),
                body.get("work_date")
        );
        LocalDate originalWorkDate = requestedWorkDate != null
                ? requestedWorkDate
                : LocalDate.now();
        task.setWorkDate(originalWorkDate);

        // scheduledDate는 현재 어느 날짜의 업무 목록에 들어가 있는지를 나타낸다.
        LocalDate requestedScheduledDate = toLocalDate(
                body.get("scheduledDate"),
                body.get("scheduled_date")
        );
        task.setScheduledDate(
                requestedScheduledDate != null ? requestedScheduledDate : originalWorkDate
        );

        task.setTaskStatus(firstNonBlank(
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

        // 1인 그룹과 일반 팀원은 등록 즉시 본인 담당으로 연결한다.
        // 다인 그룹의 팀장이 추가한 방문지는 담당자 지정 화면에서 배정한다.
        if (taskGroup != null
                && creatorMembership != null
                && (taskGroup.isPersonal()
                    || "MEMBER".equalsIgnoreCase(creatorMembership.getRole()))) {
            LocationAssignment assignment = new LocationAssignment();
            assignment.setGroup(taskGroup);
            assignment.setTask(savedTask);
            assignment.setAssignee(creator);
            assignment.setAssignedBy(creator);
            locationAssignmentRepository.save(assignment);
        }

        return toFrontendMap(savedTask);
    }

    @Transactional
    public Map<String, Object> updateStatus(Long taskId, String status) {
        Task task = getById(taskId);
        task.setTaskStatus(status);
        return toFrontendMap(taskRepository.save(task));
    }

    /**
     * 미처리 업무를 오늘 업무로 다시 가져올 때 배치 날짜만 갱신한다.
     * work_date/created_at은 최초 등록 시점 정보이므로 절대 변경하지 않는다.
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

    /*
     * 미처리 방문지 삭제
     *
     * task를 바로 삭제하면
     * task_progress / task_assignments에서
     * 해당 task_id를 참조하고 있을 수 있으므로
     * 관련 데이터를 먼저 삭제한다.
     */
    @Transactional
    public Map<String, Object> deletePendingTask(Long taskId) {

        Task task = taskRepository.findById(taskId).orElse(null);

        /*
         * DB에는 이미 없는데
         * 휴대폰에 예전 데이터가 남은 경우도
         * 삭제 성공으로 처리
         */
        if (task == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("taskId", taskId);
            result.put("message", "이미 삭제된 방문지입니다.");
            return result;
        }

        String status = task.getTaskStatus();

        /*
         * 완료되었거나 작업 중인 방문지는
         * 실수로 삭제하지 못하게 보호
         */
        if (status != null
                && !status.isBlank()
                && !"pending".equalsIgnoreCase(status)) {

            throw new RuntimeException(
                    "미처리 방문지만 삭제할 수 있습니다."
            );
        }

        // 담당자 배정 삭제
        locationAssignmentRepository.deleteByTask_TaskId(taskId);

        // 진행 기록 삭제
        taskProgressRepository.deleteByTask_TaskId(taskId);

        // 실제 방문지 삭제
        taskRepository.delete(task);

        Map<String, Object> result = new HashMap<>();
        result.put("taskId", taskId);
        result.put("message", "방문지가 삭제되었습니다.");

        return result;
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

        map.put("createdAt", task.getCreatedAt());
        map.put("created_at", task.getCreatedAt());
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
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
    }

    private WorkGroup getGroup(Long groupId) {
        return workGroupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("그룹을 찾을 수 없습니다."));
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
