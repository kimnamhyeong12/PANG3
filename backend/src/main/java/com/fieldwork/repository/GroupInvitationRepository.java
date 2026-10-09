package com.fieldwork.repository;

import com.fieldwork.entity.GroupInvitation;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupInvitationRepository
        extends JpaRepository<GroupInvitation, Long> {

    List<GroupInvitation> findByInviteeAndStatusOrderByCreatedAtDesc(
            User invitee,
            String status
    );

    boolean existsByGroupAndInviteeAndStatus(
            WorkGroup group,
            User invitee,
            String status
    );

    List<GroupInvitation> findByGroupAndStatus(WorkGroup group, String status);

    List<GroupInvitation> findByInviterAndStatus(User inviter, String status);

    List<GroupInvitation> findByInviteeAndStatus(User invitee, String status);
}
