package com.fieldwork.repository;

import com.fieldwork.entity.TaskTransferRequest;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface TaskTransferRequestRepository extends JpaRepository<TaskTransferRequest, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from TaskTransferRequest request where request.id = :requestId")
    Optional<TaskTransferRequest> findByIdForUpdate(@Param("requestId") Long requestId);
    List<TaskTransferRequest> findByGroupAndRecipientOrderByRequestedAtDesc(WorkGroup group, User recipient);
    List<TaskTransferRequest> findByGroupAndSenderOrderByRequestedAtDesc(WorkGroup group, User sender);

    List<TaskTransferRequest> findByGroupAndSenderAndStatus(WorkGroup group, User sender, String status);

    List<TaskTransferRequest> findByGroupAndRecipientAndStatus(WorkGroup group, User recipient, String status);

    @Query("""
        select r from TaskTransferRequest r
        where r.group.groupId = :groupId
          and (r.sender.userId = :userId or r.recipient.userId = :userId)
          and (r.status = 'PENDING' or r.respondedAt is null or r.respondedAt > :cutoff)
          and (:direction = 'all' or (:direction = 'incoming' and r.recipient.userId = :userId)
               or (:direction = 'outgoing' and r.sender.userId = :userId))
          and (:recipientId is null or r.recipient.userId = :recipientId)
        order by case when r.status = 'PENDING' and r.recipient.userId = :userId then 0 else 1 end,
                 r.requestedAt desc, r.id desc
        """)
    org.springframework.data.domain.Slice<TaskTransferRequest> findHistory(
        @Param("groupId") Long groupId, @Param("userId") Long userId,
        @Param("cutoff") java.time.LocalDateTime cutoff, @Param("direction") String direction,
        @Param("recipientId") Long recipientId, org.springframework.data.domain.Pageable pageable);

    @Query("select distinct taskId from TaskTransferRequest r join r.taskIds taskId "
        + "where r.group.groupId = :groupId and r.sender.userId = :userId and r.status = 'PENDING'")
    List<Long> findPendingTaskIds(@Param("groupId") Long groupId, @Param("userId") Long userId);

    @Query("select r.id from TaskTransferRequest r where r.status <> 'PENDING' "
        + "and r.respondedAt <= :cutoff order by r.respondedAt, r.id")
    List<Long> findExpiredIds(@Param("cutoff") java.time.LocalDateTime cutoff,
        org.springframework.data.domain.Pageable pageable);
}
