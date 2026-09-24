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
    private final PushNotificationService pushNotificationService;

    public GroupService(
            WorkGroupRepository workGroupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupInvitationRepository groupInvitationRepository,
            LocationAssignmentRepository locationAssignmentRepository,
            UserRepository userRepository,
            TaskRepository taskRepository,
            PushNotificationService pushNotificationService) {
        this.workGroupRepository = workGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupInvitationRepository = groupInvitationRepository;
        this.locationAssignmentRepository = locationAssignmentRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
        this.pushNotificationService = pushNotificationService;
    }

    @Transactional
    public Map<String, Object> createGroup(
            String groupName,
            Long leaderUserId,
            String regionSido,
            String regionSigungu,
            String regionAdmCode) {
        if (groupName == null || groupName.trim().isEmpty()) {
            throw new RuntimeException("洹몃９ ?대쫫???낅젰?댁＜?몄슂.");
        }

        User leader = getUser(leaderUserId);

        WorkGroup group = new WorkGroup();
        group.setName(groupName.trim());
        group.setLeader(leader);
        group.setPersonal(false);
        group.setRegionSido(regionSido == null || regionSido.isBlank() ? "遺?곌킅??떆" : regionSido.trim());
        group.setRegionSigungu(regionSigungu == null ? "" : regionSigungu.trim());
        group.setRegionAdmCode(regionAdmCode == null ? "" : regionAdmCode.trim());
        WorkGroup savedGroup = workGroupRepository.save(group);

        GroupMember leaderMember = new GroupMember();
        leaderMember.setGroup(savedGroup);
        leaderMember.setUser(leader);
        leaderMember.setRole(ROLE_LEADER);
        groupMemberRepository.save(leaderMember);

        Map<String, Object> result = groupSummary(savedGroup, ROLE_LEADER);
        result.put("message", "洹몃９???앹꽦?섏뿀?듬땲??");
        return result;
    }

    @Transactional
    public Map<String, Object> updateGroupRegion(
            Long groupId,
            Long leaderUserId,
            String regionSido,
            String regionSigungu,
            String regionAdmCode) {
        WorkGroup group = getGroup(groupId);
        requireLeader(group, leaderUserId);

        if (group.isPersonal()) {
            throw new RuntimeException("媛쒖씤 ?낅Т怨듦컙? 怨듦났?낅Т ?붾㈃?먯꽌 援?룰뎔???좏깮?⑸땲??");
        }
        if (regionSigungu == null || regionSigungu.isBlank()
                || regionAdmCode == null || regionAdmCode.isBlank()) {
            throw new RuntimeException("?쒕룞 援?룰뎔???좏깮?댁＜?몄슂.");
        }

        group.setRegionSido(regionSido == null || regionSido.isBlank()
                ? "遺?곌킅??떆"
                : regionSido.trim());
        group.setRegionSigungu(regionSigungu.trim());
        group.setRegionAdmCode(regionAdmCode.trim());

        WorkGroup saved = workGroupRepository.save(group);
        Map<String, Object> result = groupSummary(saved, ROLE_LEADER);
        result.put("message", "?쒕룞吏??씠 蹂寃쎈릺?덉뒿?덈떎.");
        return result;
    }

    /**
     * 紐⑤뱺 怨꾩젙? 濡쒓렇???꾩씠?붾? ?대쫫?쇰줈 ?ъ슜?섎뒗 ?ㅼ젣 1??洹몃９???섎굹 媛吏꾨떎.
     * 湲곗〈 ?ъ슜?먯쓽 group_id媛 ?녿뜕 諛⑸Ц吏??理쒖큹 濡쒓렇??洹몃９ 議고쉶 ???닿납?쇰줈 ?댁쟾?쒕떎.
     */
    @Transactional
    public WorkGroup ensurePersonalGroup(User user) {
        if (user == null || user.getUserId() == null) {
            throw new RuntimeException("?ъ슜???뺣낫媛 ?놁뒿?덈떎.");
        }

        WorkGroup personalGroup = workGroupRepository
                .findFirstByLeaderAndPersonalTrue(user)
                .orElseGet(() -> {
                    WorkGroup created = new WorkGroup();
                    created.setName(user.getLoginId());
                    created.setLeader(user);
                    created.setPersonal(true);
                    created.setRegionSido(user.getWorkSido() == null ? "遺?곌킅??떆" : user.getWorkSido());
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

        // ?덉쟾 ?곗씠?곕뒗 ?대떦 諛곗젙留??덇퀬 task.group_id媛 鍮꾩뼱 ?덉쓣 ???덈떎.
        // ?대떦 ????꾧뎄??洹몃９ 紐⑸줉??議고쉶?섎㈃ ?뚯쑀 洹몃９???먮룞 蹂듦뎄?쒕떎.
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
            throw new RuntimeException("?먮룞 1??洹몃９?먮뒗 ??먯쓣 珥덈??????놁뒿?덈떎. ??洹몃９??留뚮뱾?댁＜?몄슂.");
        }

        if (inviteeLoginId == null || inviteeLoginId.trim().isEmpty()) {
            throw new RuntimeException("珥덈????ъ슜???꾩씠?붾? ?낅젰?댁＜?몄슂.");
        }

        User invitee = userRepository.findByLoginId(inviteeLoginId.trim())
                .orElseThrow(() -> new RuntimeException("?대떦 ?꾩씠?붿쓽 ?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎."));

        if (invitee.getUserId().equals(inviter.getUserId())) {
            throw new RuntimeException("?먭린 ?먯떊? 珥덈??????놁뒿?덈떎.");
        }

        if (groupMemberRepository.existsByGroupAndUser(group, invitee)) {
            throw new RuntimeException("?대? 洹몃９??媛?낅맂 ?ъ슜?먯엯?덈떎.");
        }

        if (groupInvitationRepository.existsByGroupAndInviteeAndStatus(
                group,
                invitee,
                INVITE_PENDING)) {
            throw new RuntimeException("?대? ?湲?以묒씤 珥덈?媛 ?덉뒿?덈떎.");
        }

        GroupInvitation invitation = new GroupInvitation();
        invitation.setGroup(group);
        invitation.setInviter(inviter);
        invitation.setInvitee(invitee);
        invitation.setStatus(INVITE_PENDING);

        GroupInvitation saved = groupInvitationRepository.save(invitation);
        Map<String, Object> result = invitationMap(saved);
        result.put("message", "珥덈?瑜?蹂대깉?듬땲??");
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
        result.put("message", "洹몃９ 珥덈?瑜??섎씫?덉뒿?덈떎.");
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
        result.put("message", "洹몃９ 珥덈?瑜?嫄곗젅?덉뒿?덈떎.");
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
            throw new RuntimeException("1??洹몃９???대떦?먮뒗 蹂몄씤留??좏깮?????덉뒿?덈떎.");
        }

        if (!groupMemberRepository.existsByGroupAndUser(group, assignee)) {
            throw new RuntimeException("?대떦?먮뒗 ?대떦 洹몃９??硫ㅻ쾭?ъ빞 ?⑸땲??");
        }

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("諛⑸Ц吏瑜?李얠쓣 ???놁뒿?덈떎."));

        if (task.getGroup() != null
                && !task.getGroup().getGroupId().equals(group.getGroupId())) {
            throw new RuntimeException("?ㅻⅨ 洹몃９??諛⑸Ц吏??諛곗젙?????놁뒿?덈떎.");
        }

        if (task.getGroup() == null
                && task.getCreatedBy() != null
                && !task.getCreatedBy().getUserId().equals(leader.getUserId())) {
            throw new RuntimeException("?ㅻⅨ ?ъ슜?먯쓽 媛쒖씤 諛⑸Ц吏??諛곗젙?????놁뒿?덈떎.");
        }

        if (task.getGroup() == null) {
            task.setGroup(group);
        }

        if (task.getCreatedBy() == null) {
            task.setCreatedBy(leader);
        }

        taskRepository.save(task);

        LocationAssignment existingAssignment = locationAssignmentRepository
                .findByGroupAndTask(group, task)
                .orElse(null);

        User previousAssignee =
                existingAssignment != null
                        ? existingAssignment.getAssignee()
                        : null;

        LocationAssignment assignment =
                existingAssignment != null
                        ? existingAssignment
                        : new LocationAssignment();

        assignment.setGroup(group);
        assignment.setTask(task);
        assignment.setAssignee(assignee);
        assignment.setAssignedBy(leader);

        LocationAssignment saved = locationAssignmentRepository.save(assignment);

        boolean isNewAssignment = previousAssignee == null;
        boolean assigneeChanged =
                previousAssignee != null
                        && !previousAssignee.getUserId()
                        .equals(assignee.getUserId());

        if (isNewAssignment) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("type", PushNotificationService.TYPE_TASK_ASSIGNED);
            data.put("taskId", task.getTaskId());
            data.put("groupId", group.getGroupId());

            pushNotificationService.sendToUserAfterCommit(
                    assignee.getUserId(),
                    "새 업무가 배정되었습니다",
                    taskDisplayName(task) + " 업무가 배정되었습니다.",
                    data
            );
        } else if (assigneeChanged) {
            Map<String, Object> oldAssigneeData = new LinkedHashMap<>();
            oldAssigneeData.put(
                    "type",
                    PushNotificationService.TYPE_ASSIGNEE_CHANGED
            );
            oldAssigneeData.put("taskId", task.getTaskId());
            oldAssigneeData.put("groupId", group.getGroupId());

            pushNotificationService.sendToUserAfterCommit(
                    previousAssignee.getUserId(),
                    "담당 업무가 변경되었습니다",
                    taskDisplayName(task)
                            + " 업무의 담당자가 변경되었습니다.",
                    oldAssigneeData
            );

            Map<String, Object> newAssigneeData = new LinkedHashMap<>();
            newAssigneeData.put(
                    "type",
                    PushNotificationService.TYPE_ASSIGNEE_CHANGED
            );
            newAssigneeData.put("taskId", task.getTaskId());
            newAssigneeData.put("groupId", group.getGroupId());

            pushNotificationService.sendToUserAfterCommit(
                    assignee.getUserId(),
                    "담당 업무가 변경되었습니다",
                    taskDisplayName(task)
                            + " 업무가 새로 배정되었습니다.",
                    newAssigneeData
            );
        }

        Map<String, Object> result = assignmentMap(saved);
        result.put("message", "?대떦?먭? 吏?뺣릺?덉뒿?덈떎.");

        return result;
    }

    @Transactional
    public List<Map<String, Object>> assignTasksBulk(
            Long groupId,
            List<Long> taskIds,
            Long leaderUserId,
            Long assigneeUserId) {
        if (taskIds == null || taskIds.isEmpty()) {
            throw new RuntimeException("諛곗젙??諛⑸Ц吏媛 ?놁뒿?덈떎.");
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
            throw new RuntimeException("1??洹몃９??蹂몄씤 ?대떦 諛곗젙? ?댁젣?????놁뒿?덈떎.");
        }

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("諛⑸Ц吏瑜?李얠쓣 ???놁뒿?덈떎."));

        LocationAssignment assignment = locationAssignmentRepository
                .findByGroupAndTask(group, task)
                .orElseThrow(() -> new RuntimeException("吏?뺣맂 ?대떦?먭? ?놁뒿?덈떎."));

        User previousAssignee = assignment.getAssignee();

        locationAssignmentRepository.delete(assignment);

        if (previousAssignee != null) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put(
                    "type",
                    PushNotificationService.TYPE_ASSIGNEE_CHANGED
            );
            data.put("taskId", task.getTaskId());
            data.put("groupId", group.getGroupId());

            pushNotificationService.sendToUserAfterCommit(
                    previousAssignee.getUserId(),
                    "담당 업무가 변경되었습니다",
                    taskDisplayName(task)
                            + " 업무의 담당이 해제되었습니다.",
                    data
            );
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "?대떦??諛곗젙???댁젣?덉뒿?덈떎.");
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
            throw new RuntimeException("?ъ슜???뺣낫媛 ?놁뒿?덈떎.");
        }

        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎."));
    }

    private WorkGroup getGroup(Long groupId) {
        if (groupId == null) {
            throw new RuntimeException("洹몃９ ?뺣낫媛 ?놁뒿?덈떎.");
        }

        return workGroupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("洹몃９??李얠쓣 ???놁뒿?덈떎."));
    }

    private GroupInvitation getInvitation(Long invitationId) {
        return groupInvitationRepository.findById(invitationId)
                .orElseThrow(() -> new RuntimeException("珥덈?瑜?李얠쓣 ???놁뒿?덈떎."));
    }

    private GroupMember requireMember(WorkGroup group, Long userId) {
        User user = getUser(userId);
        return groupMemberRepository.findByGroupAndUser(group, user)
                .orElseThrow(() -> new RuntimeException("洹몃９??媛?낅맂 ?ъ슜?먮쭔 ?묎렐?????덉뒿?덈떎."));
    }

    private User requireLeader(WorkGroup group, Long userId) {
        GroupMember member = requireMember(group, userId);

        if (!ROLE_LEADER.equals(member.getRole()) ||
                !group.getLeader().getUserId().equals(member.getUser().getUserId())) {
            throw new RuntimeException("??λ쭔 ?섑뻾?????덈뒗 ?묒뾽?낅땲??");
        }

        return member.getUser();
    }

    private void validateInvitationOwner(GroupInvitation invitation, Long userId) {
        if (userId == null || !invitation.getInvitee().getUserId().equals(userId)) {
            throw new RuntimeException("蹂몄씤?먭쾶 ??珥덈?留?泥섎━?????덉뒿?덈떎.");
        }
    }

    private void requirePending(GroupInvitation invitation) {
        if (!INVITE_PENDING.equals(invitation.getStatus())) {
            throw new RuntimeException("?대? 泥섎━??珥덈??낅땲??");
        }
    }

    private String normalizeInvitationStatus(String status) {
        if (status == null || status.isBlank()) {
            return INVITE_PENDING;
        }

        String normalized = status.trim().toUpperCase();
        if (!List.of(INVITE_PENDING, INVITE_ACCEPTED, INVITE_REJECTED).contains(normalized)) {
            throw new RuntimeException("?щ컮瑜댁? ?딆? 珥덈? ?곹깭?낅땲??");
        }
        return normalized;
    }

    private void migrateLegacyPersonalTasks(User user, WorkGroup personalGroup) {
        List<Task> legacyTasks = taskRepository
                .findByCreatedByAndGroupIsNullOrderByTaskIdDesc(user);

        for (Task task : legacyTasks) {
            List<LocationAssignment> existingAssignments =
                    locationAssignmentRepository.findByTaskOrderByAssignedAtAsc(task);

            // ?덉쟾 ? 諛곗젙???대? 議댁옱?섎㈃ 洹?? ?뚯쑀 諛⑸Ц吏濡?蹂듦뎄?쒕떎.
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
        map.put("regionSido", group.getRegionSido());
        map.put("regionSigungu", group.getRegionSigungu());
        map.put("regionAdmCode", group.getRegionAdmCode());
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
        map.put("priority", task.getPriority());
        map.put("createdAt", task.getCreatedAt());
        map.put("created_at", task.getCreatedAt());
        map.put("workDate", task.getWorkDate());
        map.put("work_date", task.getWorkDate());
        map.put("scheduledDate", task.getScheduledDate());
        map.put("scheduled_date", task.getScheduledDate());
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
