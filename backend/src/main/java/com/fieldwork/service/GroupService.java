package com.fieldwork.service;

import com.fieldwork.entity.GroupInvitation;
import com.fieldwork.entity.GroupMember;
import com.fieldwork.entity.LocationAssignment;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.GroupInvitationRepository;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.LocationAssignmentRepository;
import com.fieldwork.repository.TaskRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class GroupService {

    private static final String ROLE_LEADER = "LEADER";
    private static final String ROLE_MEMBER = "MEMBER";
    private static final String INVITE_PENDING = "PENDING";
    private static final String INVITE_ACCEPTED = "ACCEPTED";
    private static final String INVITE_REJECTED = "REJECTED";

    private final WorkGroupRepository workGroupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupInvitationRepository groupInvitationRepository;
    private final LocationAssignmentRepository locationAssignmentRepository;
    private final UserRepository userRepository;
    private final TaskRepository taskRepository;

    public GroupService(
            WorkGroupRepository workGroupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupInvitationRepository groupInvitationRepository,
            LocationAssignmentRepository locationAssignmentRepository,
            UserRepository userRepository,
            TaskRepository taskRepository) {
        this.workGroupRepository = workGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupInvitationRepository = groupInvitationRepository;
        this.locationAssignmentRepository = locationAssignmentRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
    }

    @Transactional
    public Map<String, Object> createGroup(String groupName, Long leaderUserId) {
        if (groupName == null || groupName.trim().isEmpty()) {
            throw new RuntimeException("그룹 이름을 입력해주세요.");
        }

        User leader = getUser(leaderUserId);

        WorkGroup group = new WorkGroup();
        group.setName(groupName.trim());
        group.setLeader(leader);
        WorkGroup savedGroup = workGroupRepository.save(group);

        GroupMember leaderMember = new GroupMember();
        leaderMember.setGroup(savedGroup);
        leaderMember.setUser(leader);
        leaderMember.setRole(ROLE_LEADER);
        groupMemberRepository.save(leaderMember);

        Map<String, Object> result = groupSummary(savedGroup, ROLE_LEADER);
        result.put("message", "그룹이 생성되었습니다.");
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getUserGroups(Long userId) {
        User user = getUser(userId);

        return groupMemberRepository.findByUserOrderByJoinedAtDesc(user)
                .stream()
                .map(member -> groupSummary(member.getGroup(), member.getRole()))
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getGroupDetail(Long groupId, Long userId) {
        WorkGroup group = getGroup(groupId);
        GroupMember requester = requireMember(group, userId);

        Map<String, Object> result = groupSummary(group, requester.getRole());
        result.put("members", groupMemberRepository.findByGroupOrderByJoinedAtAsc(group)
                .stream()
                .map(this::memberMap)
                .toList());
        result.put("assignments", locationAssignmentRepository.findByGroupOrderByAssignedAtDesc(group)
                .stream()
                .map(this::assignmentMap)
                .toList());
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getMembers(Long groupId, Long requesterUserId) {
        WorkGroup group = getGroup(groupId);
        requireMember(group, requesterUserId);

        return groupMemberRepository.findByGroupOrderByJoinedAtAsc(group)
                .stream()
                .map(this::memberMap)
                .toList();
    }

    @Transactional
    public Map<String, Object> inviteMember(
            Long groupId,
            Long inviterUserId,
            String inviteeLoginId) {
        WorkGroup group = getGroup(groupId);
        User inviter = requireLeader(group, inviterUserId);

        if (inviteeLoginId == null || inviteeLoginId.trim().isEmpty()) {
            throw new RuntimeException("초대할 사용자 아이디를 입력해주세요.");
        }

        User invitee = userRepository.findByLoginId(inviteeLoginId.trim())
                .orElseThrow(() -> new RuntimeException("해당 아이디의 사용자를 찾을 수 없습니다."));

        if (invitee.getUserId().equals(inviter.getUserId())) {
            throw new RuntimeException("자기 자신은 초대할 수 없습니다.");
        }

        if (groupMemberRepository.existsByGroupAndUser(group, invitee)) {
            throw new RuntimeException("이미 그룹에 가입된 사용자입니다.");
        }

        if (groupInvitationRepository.existsByGroupAndInviteeAndStatus(
                group,
                invitee,
                INVITE_PENDING)) {
            throw new RuntimeException("이미 대기 중인 초대가 있습니다.");
        }

        GroupInvitation invitation = new GroupInvitation();
        invitation.setGroup(group);
        invitation.setInviter(inviter);
        invitation.setInvitee(invitee);
        invitation.setStatus(INVITE_PENDING);

        GroupInvitation saved = groupInvitationRepository.save(invitation);
        Map<String, Object> result = invitationMap(saved);
        result.put("message", "초대를 보냈습니다.");
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getInvitations(Long userId, String status) {
        User invitee = getUser(userId);
        String normalizedStatus = normalizeInvitationStatus(status);

        return groupInvitationRepository
                .findByInviteeAndStatusOrderByCreatedAtDesc(invitee, normalizedStatus)
                .stream()
                .map(this::invitationMap)
                .toList();
    }

    @Transactional
    public Map<String, Object> acceptInvitation(Long invitationId, Long userId) {
        GroupInvitation invitation = getInvitation(invitationId);
        validateInvitationOwner(invitation, userId);
        requirePending(invitation);

        WorkGroup group = invitation.getGroup();
        User invitee = invitation.getInvitee();

        if (!groupMemberRepository.existsByGroupAndUser(group, invitee)) {
            GroupMember member = new GroupMember();
            member.setGroup(group);
            member.setUser(invitee);
            member.setRole(ROLE_MEMBER);
            groupMemberRepository.save(member);
        }

        invitation.setStatus(INVITE_ACCEPTED);
        groupInvitationRepository.save(invitation);

        Map<String, Object> result = groupSummary(group, ROLE_MEMBER);
        result.put("invitationId", invitation.getInvitationId());
        result.put("message", "그룹 초대를 수락했습니다.");
        return result;
    }

    @Transactional
    public Map<String, Object> rejectInvitation(Long invitationId, Long userId) {
        GroupInvitation invitation = getInvitation(invitationId);
        validateInvitationOwner(invitation, userId);
        requirePending(invitation);

        invitation.setStatus(INVITE_REJECTED);
        groupInvitationRepository.save(invitation);

        Map<String, Object> result = invitationMap(invitation);
        result.put("message", "그룹 초대를 거절했습니다.");
        return result;
    }

    @Transactional
    public Map<String, Object> assignTask(
            Long groupId,
            Long taskId,
            Long leaderUserId,
            Long assigneeUserId) {
        WorkGroup group = getGroup(groupId);
        User leader = requireLeader(group, leaderUserId);
        User assignee = getUser(assigneeUserId);

        if (!groupMemberRepository.existsByGroupAndUser(group, assignee)) {
            throw new RuntimeException("담당자는 해당 그룹의 멤버여야 합니다.");
        }

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("방문지를 찾을 수 없습니다."));

        LocationAssignment assignment = locationAssignmentRepository
                .findByGroupAndTask(group, task)
                .orElseGet(LocationAssignment::new);

        assignment.setGroup(group);
        assignment.setTask(task);
        assignment.setAssignee(assignee);
        assignment.setAssignedBy(leader);

        LocationAssignment saved = locationAssignmentRepository.save(assignment);
        Map<String, Object> result = assignmentMap(saved);
        result.put("message", "담당자가 지정되었습니다.");

        return result;
    }

    @Transactional
    public List<Map<String, Object>> assignTasksBulk(
            Long groupId,
            List<Long> taskIds,
            Long leaderUserId,
            Long assigneeUserId) {
        if (taskIds == null || taskIds.isEmpty()) {
            throw new RuntimeException("배정할 방문지가 없습니다.");
        }

        List<Map<String, Object>> result = new ArrayList<>();

        for (Long taskId : taskIds) {
            Map<String, Object> assigned = assignTask(
                    groupId,
                    taskId,
                    leaderUserId,
                    assigneeUserId);

            result.add(assigned);
        }

        return result;
    }

    @Transactional
    public Map<String, Object> unassignTask(
            Long groupId,
            Long taskId,
            Long leaderUserId) {
        WorkGroup group = getGroup(groupId);
        requireLeader(group, leaderUserId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("방문지를 찾을 수 없습니다."));

        LocationAssignment assignment = locationAssignmentRepository
                .findByGroupAndTask(group, task)
                .orElseThrow(() -> new RuntimeException("지정된 담당자가 없습니다."));

        locationAssignmentRepository.delete(assignment);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "담당자 배정을 해제했습니다.");
        result.put("groupId", groupId);
        result.put("taskId", taskId);
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAssignments(Long groupId, Long requesterUserId) {
        WorkGroup group = getGroup(groupId);
        requireMember(group, requesterUserId);

        return locationAssignmentRepository.findByGroupOrderByAssignedAtDesc(group)
                .stream()
                .map(this::assignmentMap)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getMyAssignments(Long groupId, Long userId) {
        WorkGroup group = getGroup(groupId);
        GroupMember member = requireMember(group, userId);

        return locationAssignmentRepository
                .findByGroupAndAssigneeOrderByAssignedAtDesc(group, member.getUser())
                .stream()
                .map(this::assignmentMap)
                .toList();
    }

    private User getUser(Long userId) {
        if (userId == null) {
            throw new RuntimeException("사용자 정보가 없습니다.");
        }

        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
    }

    private WorkGroup getGroup(Long groupId) {
        if (groupId == null) {
            throw new RuntimeException("그룹 정보가 없습니다.");
        }

        return workGroupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("그룹을 찾을 수 없습니다."));
    }

    private GroupInvitation getInvitation(Long invitationId) {
        return groupInvitationRepository.findById(invitationId)
                .orElseThrow(() -> new RuntimeException("초대를 찾을 수 없습니다."));
    }

    private GroupMember requireMember(WorkGroup group, Long userId) {
        User user = getUser(userId);
        return groupMemberRepository.findByGroupAndUser(group, user)
                .orElseThrow(() -> new RuntimeException("그룹에 가입된 사용자만 접근할 수 있습니다."));
    }

    private User requireLeader(WorkGroup group, Long userId) {
        GroupMember member = requireMember(group, userId);

        if (!ROLE_LEADER.equals(member.getRole()) ||
                !group.getLeader().getUserId().equals(member.getUser().getUserId())) {
            throw new RuntimeException("팀장만 수행할 수 있는 작업입니다.");
        }

        return member.getUser();
    }

    private void validateInvitationOwner(GroupInvitation invitation, Long userId) {
        if (userId == null || !invitation.getInvitee().getUserId().equals(userId)) {
            throw new RuntimeException("본인에게 온 초대만 처리할 수 있습니다.");
        }
    }

    private void requirePending(GroupInvitation invitation) {
        if (!INVITE_PENDING.equals(invitation.getStatus())) {
            throw new RuntimeException("이미 처리된 초대입니다.");
        }
    }

    private String normalizeInvitationStatus(String status) {
        if (status == null || status.isBlank()) {
            return INVITE_PENDING;
        }

        String normalized = status.trim().toUpperCase();
        if (!List.of(INVITE_PENDING, INVITE_ACCEPTED, INVITE_REJECTED).contains(normalized)) {
            throw new RuntimeException("올바르지 않은 초대 상태입니다.");
        }
        return normalized;
    }

    private Map<String, Object> groupSummary(WorkGroup group, String role) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("groupId", group.getGroupId());
        map.put("groupName", group.getName());
        map.put("leaderUserId", group.getLeader().getUserId());
        map.put("leaderLoginId", group.getLeader().getLoginId());
        map.put("leaderName", group.getLeader().getName());
        map.put("role", role);
        map.put("memberCount", groupMemberRepository.countByGroup(group));
        map.put("createdAt", group.getCreatedAt());
        return map;
    }

    private Map<String, Object> memberMap(GroupMember member) {
        User user = member.getUser();
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("groupMemberId", member.getGroupMemberId());
        map.put("userId", user.getUserId());
        map.put("loginId", user.getLoginId());
        map.put("name", user.getName());
        map.put("role", member.getRole());
        map.put("joinedAt", member.getJoinedAt());
        return map;
    }

    private Map<String, Object> invitationMap(GroupInvitation invitation) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("invitationId", invitation.getInvitationId());
        map.put("status", invitation.getStatus());
        map.put("createdAt", invitation.getCreatedAt());
        map.put("groupId", invitation.getGroup().getGroupId());
        map.put("groupName", invitation.getGroup().getName());
        map.put("inviterUserId", invitation.getInviter().getUserId());
        map.put("inviterLoginId", invitation.getInviter().getLoginId());
        map.put("inviterName", invitation.getInviter().getName());
        map.put("inviteeUserId", invitation.getInvitee().getUserId());
        map.put("inviteeLoginId", invitation.getInvitee().getLoginId());
        map.put("inviteeName", invitation.getInvitee().getName());
        return map;
    }

    private Map<String, Object> assignmentMap(LocationAssignment assignment) {
        Task task = assignment.getTask();
        User assignee = assignment.getAssignee();
        User assignedBy = assignment.getAssignedBy();

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("assignmentId", assignment.getAssignmentId());
        map.put("groupId", assignment.getGroup().getGroupId());
        map.put("taskId", task.getTaskId());
        map.put("locationId", task.getTaskId());
        map.put("detailAddress", task.getDetailAddress());
        map.put("roadAddress", task.getRoadAddress());
        map.put("taskCategory", task.getTaskCategory());
        map.put("status", task.getTaskStatus());
        map.put("lat", task.getLat());
        map.put("lng", task.getLng());
        map.put("assigneeUserId", assignee.getUserId());
        map.put("assigneeLoginId", assignee.getLoginId());
        map.put("assigneeName", assignee.getName());
        map.put("assignedByUserId", assignedBy.getUserId());
        map.put("assignedByLoginId", assignedBy.getLoginId());
        map.put("assignedByName", assignedBy.getName());
        map.put("assignedAt", assignment.getAssignedAt());
        return map;
    }
}
