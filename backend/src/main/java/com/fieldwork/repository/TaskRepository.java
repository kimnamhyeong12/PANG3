package com.fieldwork.repository;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

import java.util.List;
import java.util.Collection;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select task from Task task where task.taskId = :taskId")
    Optional<Task> findByIdForUpdate(@Param("taskId") Long taskId);
    List<Task> findByCreatedByAndGroupIsNullOrderByTaskIdDesc(User createdBy);

    List<Task> findByGroupOrderByTaskIdDesc(WorkGroup group);

    List<Task> findByCreatedByIsNullAndGroupIsNullOrderByTaskIdDesc();

    List<Task> findByCurrentAssigneeOrderByTaskIdDesc(User currentAssignee);

    List<Task> findByCurrentAssignee_UserIdInOrderByTaskIdDesc(Collection<Long> userIds);

    List<Task> findByCurrentAssigneeIsNullOrderByTaskIdDesc();
}
