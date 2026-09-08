package com.fieldwork.repository;

import com.fieldwork.entity.GroupMember;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, Long> {

    List<GroupMember> findByGroup(WorkGroup group);

    List<GroupMember> findByUser(User user);

    Optional<GroupMember> findByGroupAndUser(
            WorkGroup group,
            User user
    );

    boolean existsByGroupAndUser(
            WorkGroup group,
            User user
    );
}