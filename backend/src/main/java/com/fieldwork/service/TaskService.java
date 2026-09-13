package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.GroupMember;
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

    public TaskService(
            TaskRepository taskRepository,
            TaskProgressRepository taskProgressRepository,
            LocationAssignmentRepository locationAssignmentRepository,
            UserRepository userRepository,
            WorkGroupRepository workGroupRepository,
            GroupMemberRepository groupMemberRepository
    ) {
        this.taskRepository = taskRepository;
        this.taskProgressRepository = taskProgressRepository;
        this.locationAssignmentRepository = locationAssignmentRepository;
        this.userRepository = userRepository;
        this.workGroupRepository = workGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
    }

    public List<Map<String, Object>> getAllForFrontend() {
        return taskRepository.findAll().stream()
                .map(this::toFrontendMap)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getForFrontend(Long userId, Long groupId) {
        User user = getUser(userId);

        if (groupId == null) {
            return taskRepository.findByCreatedByAndGroupIsNullOrderByTaskIdDesc(user)
                    .stream()
                    .map(this::toFrontendMap)
                    .collect(Collectors.toList());
        }

        WorkGroup group = getGroup(groupId);
        GroupMember member = groupMemberRepository.findByGroupAndUser(group, user)
                .orElseThrow(() -> new RuntimeException("해당 그룹의 멤버가 아닙니다."));

        if ("LEADER".equalsIgnoreCase(member.getRole())) {
            List<Task> tasks = new java.util.ArrayList<>(
                    taskRepository.findByGroupOrderByTaskIdDesc(group)
            );

            // 팀장이 개인으로 등록한 방문지도 이 그룹에 배정할 수 있다.
            tasks.addAll(taskRepository.findByCreatedByAndGroupIsNullOrderByTaskIdDesc(user));

            // 소유권 컬럼 추가 전에 만들어진 방문지는 팀장만 확인하고 배정할 수 있다.
            tasks.addAll(taskRepository.findByCreatedByIsNullAndGroupIsNullOrderByTaskIdDesc());

            return tasks.stream()
                    .map(this::toFrontendMap)
                    .collect(Collectors.toList());
        }

        return locationAssignmentRepository
                .findByGroupAndAssigneeOrderByAssignedAtDesc(group, user)
                .stream()
                .map(assignment -> toFrontendMap(assignment.getTask()))
                .collect(Collectors.toList());
    }

    public Task getById(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
    }

    public Map<String, Object> createFromFrontendBody(Map<String, Object> body) {
        Task task = new Task();

        Long createdByUserId = toLong(body.get("createdByUserId"), body.get("userId"));
        if (createdByUserId == null) {
            throw new RuntimeException("방문지 생성 사용자 ID가 필요합니다.");
        }

        User creator = getUser(createdByUserId);
        task.setCreatedBy(creator);

        Long groupId = toLong(body.get("groupId"));
        if (groupId != null) {
            WorkGroup group = getGroup(groupId);
            if (!groupMemberRepository.existsByGroupAndUser(group, creator)) {
                throw new RuntimeException("해당 그룹의 멤버만 그룹 방문지를 만들 수 있습니다.");
            }
            task.setGroup(group);
        }

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

        task.setTaskCategory(firstNonBlank(
                str(body.get("taskCategory")),
                str(body.get("task")),
                str(body.get("task_category")),
                "현장 확인"
        ));

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

        return toFrontendMap(taskRepository.save(task));
    }

    public Map<String, Object> updateStatus(Long taskId, String status) {
        Task task = getById(taskId);
        task.setTaskStatus(status);
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
