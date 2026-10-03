package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskTransferRequest;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.TaskRepository;
import com.fieldwork.repository.TaskTransferRequestRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TaskTransferService {
    private final TaskTransferRequestRepository requests;
    private final TaskRepository tasks;
    private final UserRepository users;
    private final WorkGroupRepository groups;
    private final GroupMemberRepository members;
    private final TaskService taskService;

    public TaskTransferService(TaskTransferRequestRepository requests, TaskRepository tasks,
            UserRepository users, WorkGroupRepository groups, GroupMemberRepository members,
            TaskService taskService) {
        this.requests = requests;
        this.tasks = tasks;
        this.users = users;
        this.groups = groups;
        this.members = members;
        this.taskService = taskService;
    }

    @Transactional
    public Map<String, Object> create(Long groupId, Long senderId, Long recipientId, List<Long> taskIds) {
        WorkGroup group = group(groupId);
        User sender = member(group, senderId);
        User recipient = member(group, recipientId);
        if (group.isPersonal() || senderId.equals(recipientId)) {
            throw new IllegalArgumentException("다른 그룹 구성원을 선택해주세요.");
        }
        if (taskIds == null || taskIds.isEmpty()) {
            throw new IllegalArgumentException("이관할 방문지를 선택해주세요.");
        }
        List<Long> selectedIds = taskIds.stream().distinct().sorted().toList();
        for (Long taskId : selectedIds) {
            Task task = tasks.findById(taskId)
                    .orElseThrow(() -> new IllegalArgumentException("방문지를 찾을 수 없습니다."));
            User owner = taskService.currentAssignee(task);
            if (owner == null || !senderId.equals(owner.getUserId())) {
                throw new IllegalArgumentException("본인 담당 방문지만 이관할 수 있습니다.");
            }
        }
        TaskTransferRequest request = new TaskTransferRequest();
        request.setGroup(group);
        request.setSender(sender);
        request.setRecipient(recipient);
        request.setTaskIds(selectedIds);
        return toMap(requests.save(request));
    }

    @Transactional
    public Map<String, Object> respond(Long groupId, Long requestId, Long recipientId, boolean accept) {
        TaskTransferRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new IllegalArgumentException("이관 요청을 찾을 수 없습니다."));
        if (!groupId.equals(request.getGroup().getGroupId())) {
            throw new IllegalArgumentException("다른 그룹의 이관 요청입니다.");
        }
        if (!recipientId.equals(request.getRecipient().getUserId()) || !"PENDING".equals(request.getStatus())) {
            throw new IllegalArgumentException("처리할 수 없는 이관 요청입니다.");
        }
        member(request.getGroup(), recipientId);
        member(request.getGroup(), request.getSender().getUserId());
        if (accept) {
            List<Task> selected = new ArrayList<>();
            for (Long taskId : request.getTaskIds().stream().sorted(Comparator.naturalOrder()).toList()) {
                Task task = tasks.findByIdForUpdate(taskId)
                        .orElseThrow(() -> new IllegalArgumentException("방문지를 찾을 수 없습니다."));
                User owner = taskService.currentAssignee(task);
                if (owner == null || !owner.getUserId().equals(request.getSender().getUserId())) {
                    throw new IllegalArgumentException("담당자가 변경된 방문지가 있어 이관할 수 없습니다.");
                }
                selected.add(task);
            }
            for (Task task : selected) task.setCurrentAssignee(request.getRecipient());
            tasks.saveAll(selected);
        }
        request.setStatus(accept ? "ACCEPTED" : "REJECTED");
        request.setRespondedAt(LocalDateTime.now());
        return toMap(requests.save(request));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(Long groupId, Long userId) {
        WorkGroup group = group(groupId);
        User user = member(group, userId);
        Map<Long, TaskTransferRequest> result = new LinkedHashMap<>();
        requests.findByGroupAndRecipientOrderByRequestedAtDesc(group, user)
                .forEach(request -> result.put(request.getId(), request));
        requests.findByGroupAndSenderOrderByRequestedAtDesc(group, user)
                .forEach(request -> result.put(request.getId(), request));
        return result.values().stream()
                .sorted(Comparator.comparing(TaskTransferRequest::getRequestedAt).reversed())
                .map(this::toMap).toList();
    }

    private WorkGroup group(Long groupId) {
        return groups.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("그룹을 찾을 수 없습니다."));
    }

    private User member(WorkGroup group, Long userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        if (!members.existsByGroupAndUser(group, user)) {
            throw new IllegalArgumentException("그룹 구성원만 사용할 수 있습니다.");
        }
        return user;
    }

    private Map<String, Object> toMap(TaskTransferRequest request) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", request.getId());
        map.put("groupId", request.getGroup().getGroupId());
        map.put("senderUserId", request.getSender().getUserId());
        map.put("senderName", request.getSender().getName());
        map.put("recipientUserId", request.getRecipient().getUserId());
        map.put("recipientName", request.getRecipient().getName());
        map.put("taskIds", request.getTaskIds());
        map.put("status", request.getStatus());
        map.put("requestedAt", request.getRequestedAt());
        map.put("respondedAt", request.getRespondedAt());
        return map;
    }
}
