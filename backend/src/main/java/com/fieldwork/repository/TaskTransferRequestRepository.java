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
}
