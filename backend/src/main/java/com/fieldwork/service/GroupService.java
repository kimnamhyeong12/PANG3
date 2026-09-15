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
        group.setPersonal(false);
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

    /**
     * 모든 계정은 로그인 아이디를 이름으로 사용하는 실제 1인 그룹을 하나 가진다.
     * 기존 사용자의 group_id가 없던 방문지도 최초 로그인/그룹 조회 때 이곳으로 이전한다.
     */
    @Transactional
    public WorkGroup ensurePersonalGroup(User user) {
        if (user == null || user.getUserId() == null) {
            throw new RuntimeException("사용자 정보가 없습니다.");
        }

        WorkGroup personalGroup = workGroupRepository
                .findFirstByLeaderAndPersonalTrue(user)
                .orElseGet(() -> {
                    WorkGroup created = new WorkGroup();
                    created.setName(user.getLoginId());
                    created.setLeader(user);
                    created.setPersonal(true);
                    return workGroupRepository.save(created);
                });

        if (!user.getLoginId().equals(personalGroup.getName())) {
            personalGroup.setName(user.getLoginId());
            personalGroup = workGroupRepository.save(personalGroup);
        }

        if (!groupMemberRepository.existsByGroupAndUser(personalGroup, user)) {
            GroupMember member = new GroupMember();
            member.setGroup(personalGroup);
            member.setUser(user);
            member.setRole(ROLE_LEADER);
            groupMemberRepository.save(member);
        }

        migrateLegacyPersonalTasks(user, personalGroup);
        ensurePersonalAssignments(user, personalGroup);
        return personalGroup;
    }

    @Transactional
    public List<Map<String, Object>> getUserGroups(Long userId) {
        User user = getUser(userId);
        ensurePersonalGroup(user);

        List<GroupMember> memberships =
                groupMemberRepository.findByUserOrderByJoinedAtDesc(user);

        // 예전 데이터는 담당 배정만 있고 task.group_id가 비어 있을 수 있다.
        // 해당 팀의 누구든 그룹 목록을 조회하면 소유 그룹을 자동 복구한다.
        memberships.forEach(member ->
                synchronizeAssignedTaskGroups(member.getGroup()));

        return memberships
                .stream()
                .sorted((left, right) -> Boolean.compare(
                        right.getGroup().isPersonal(),
                        left.getGroup().isPersonal()))
                .map(member -> groupSummary(member.getGroup(), member.getRole()))
                .toList();
    }

    @Transactional
    public Map<String, Object> getGroupDetail(Long groupId, Long userId) {
        WorkGroup group = getGroup(groupId);
        GroupMember requester = requireMember(group, userId);
        synchronizeAssignedTaskGroups(group);

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

        if (group.isPersonal()) {
            throw new RuntimeException("자동 1인 그룹에는 팀원을 초대할 수 없습니다. 새 그룹을 만들어주세요.");
        }

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

        if (group.isPersonal() && !assignee.getUserId().equals(group.getLeader().getUserId())) {
            throw new RuntimeException("1인 그룹의 담당자는 본인만 선택할 수 있습니다.");
        }

        if (!groupMemberRepository.existsByGroupAndUser(group, assignee)) {
            throw new RuntimeException("담당자는 해당 그룹의 멤버여야 합니다.");
        }

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("방문지를 찾을 수 없습니다."));

        if (task.getGroup() != null
                && !task.getGroup().getGroupId().equals(group.getGroupId())) {
            throw new RuntimeException("다른 그룹의 방문지는 배정할 수 없습니다.");
        }

        if (task.getGroup() == null
                && task.getCreatedBy() != null
                && !task.getCreatedBy().getUserId().equals(leader.getUserId())) {
            throw new RuntimeException("다른 사용자의 개인 방문지는 배정할 수 없습니다.");
        }

        if (task.getGroup() == null) {
            task.setGroup(group);
        }

        if (task.getCreatedBy() == null) {
            task.setCreatedBy(leader);
        }

        taskRepository.save(task);

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

        if (group.isPersonal()) {
            throw new RuntimeException("1인 그룹의 본인 담당 배정은 해제할 수 없습니다.");
        }

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

    @Transactional
    public List<Map<String, Object>> getAssignments(Long groupId, Long requesterUserId) {
        WorkGroup group = getGroup(groupId);
        requireMember(group, requesterUserId);
        synchronizeAssignedTaskGroups(group);

        return locationAssignmentRepository.findByGroupOrderByAssignedAtDesc(group)
                .stream()
                .map(this::assignmentMap)
                .toList();
    }

    @Transactional
    public List<Map<String, Object>> getMyAssignments(Long groupId, Long userId) {
        WorkGroup group = getGroup(groupId);
        GroupMember member = requireMember(group, userId);
        synchronizeAssignedTaskGroups(group);

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

    private void migrateLegacyPersonalTasks(User user, WorkGroup personalGroup) {
        List<Task> legacyTasks = taskRepository
                .findByCreatedByAndGroupIsNullOrderByTaskIdDesc(user);

        for (Task task : legacyTasks) {
            List<LocationAssignment> existingAssignments =
                    locationAssignmentRepository.findByTaskOrderByAssignedAtAsc(task);

            // 예전 팀 배정이 이미 존재하면 그 팀 소유 방문지로 복구한다.
            if (!existingAssignments.isEmpty()) {
                task.setGroup(existingAssignments.get(0).getGroup());
                taskRepository.save(task);
                continue;
            }

            task.setGroup(personalGroup);
            taskRepository.save(task);
        }
    }

    private void ensurePersonalAssignments(User user, WorkGroup personalGroup) {
        for (Task task : taskRepository.findByGroupOrderByTaskIdDesc(personalGroup)) {
            LocationAssignment assignment = locationAssignmentRepository
                    .findByGroupAndTask(personalGroup, task)
                    .orElse(null);

            if (assignment != null
                    && assignment.getAssignee().getUserId().equals(user.getUserId())
                    && assignment.getAssignedBy().getUserId().equals(user.getUserId())) {
                continue;
            }

            if (assignment == null) {
                assignment = new LocationAssignment();
            }

            assignment.setGroup(personalGroup);
            assignment.setTask(task);
            assignment.setAssignee(user);
            assignment.setAssignedBy(user);
            locationAssignmentRepository.save(assignment);
        }
    }

    private void synchronizeAssignedTaskGroups(WorkGroup group) {
        for (LocationAssignment assignment :
                locationAssignmentRepository.findByGroupOrderByAssignedAtDesc(group)) {
            Task task = assignment.getTask();

            if (task.getGroup() == null) {
                task.setGroup(group);
                taskRepository.save(task);
            }
        }
    }

    private Map<String, Object> groupSummary(WorkGroup group, String role) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("groupId", group.getGroupId());
        map.put("groupName", group.getName());
        map.put("leaderUserId", group.getLeader().getUserId());
        map.put("leaderLoginId", group.getLeader().getLoginId());
        map.put("leaderName", group.getLeader().getName());
        map.put("role", role);
        map.put("personal", group.isPersonal());
        map.put("personalWorkspace", group.isPersonal());
        map.put("workspaceType", group.isPersonal() ? "PERSONAL" : "TEAM");
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
        map.put("groupName", assignment.getGroup().getName());
        map.put("personalWorkspace", assignment.getGroup().isPersonal());
        map.put("workspaceType", assignment.getGroup().isPersonal() ? "PERSONAL" : "TEAM");
        map.put("taskId", task.getTaskId());
        map.put("locationId", task.getTaskId());
        map.put("id", task.getTaskId());
        map.put("detailAddress", task.getDetailAddress());
        map.put("roadAddress", task.getRoadAddress());
        map.put("taskCategory", task.getTaskCategory());
        map.put("task", task.getTaskCategory());
        map.put("status", task.getTaskStatus());
        map.put("adminDong", task.getAdminDong());
        map.put("sido", task.getSido());
        map.put("sigungu", task.getSigungu());
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
