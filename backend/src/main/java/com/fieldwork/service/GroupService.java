package com.fieldwork.service;

import com.fieldwork.entity.GroupMember;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
public class GroupService {

    private final WorkGroupRepository workGroupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final UserRepository userRepository;

    public GroupService(
            WorkGroupRepository workGroupRepository,
            GroupMemberRepository groupMemberRepository,
            UserRepository userRepository
    ) {
        this.workGroupRepository = workGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public Map<String, Object> createGroup(String groupName, Long leaderUserId) {

        if (groupName == null || groupName.trim().isEmpty()) {
            throw new RuntimeException("그룹 이름을 입력해주세요.");
        }

        if (leaderUserId == null) {
            throw new RuntimeException("사용자 정보가 없습니다.");
        }

        // 그룹을 만드는 사용자 조회
        User leader = userRepository.findById(leaderUserId)
                .orElseThrow(() ->
                        new RuntimeException("사용자를 찾을 수 없습니다.")
                );

        // 그룹 생성
        WorkGroup group = new WorkGroup();
        group.setName(groupName.trim());
        group.setLeader(leader);

        WorkGroup savedGroup = workGroupRepository.save(group);

        // 그룹을 만든 사용자를 자동으로 LEADER로 등록
        GroupMember leaderMember = new GroupMember();
        leaderMember.setGroup(savedGroup);
        leaderMember.setUser(leader);
        leaderMember.setRole("LEADER");

        groupMemberRepository.save(leaderMember);

        // 프론트로 반환
        Map<String, Object> result = new HashMap<>();

        result.put("message", "그룹이 생성되었습니다.");
        result.put("groupId", savedGroup.getGroupId());
        result.put("groupName", savedGroup.getName());

        result.put("leaderUserId", leader.getUserId());
        result.put("leaderLoginId", leader.getLoginId());
        result.put("leaderName", leader.getName());

        return result;
    }
}