package com.fieldwork.repository;

import com.fieldwork.entity.LocationAssignment;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LocationAssignmentRepository
        extends JpaRepository<LocationAssignment, Long> {

    List<LocationAssignment> findByGroupOrderByAssignedAtDesc(WorkGroup group);

    List<LocationAssignment> findByGroupAndAssigneeOrderByAssignedAtDesc(
            WorkGroup group,
            User assignee
    );

    Optional<LocationAssignment> findByGroupAndTask(
            WorkGroup group,
            Task task
    );

    List<LocationAssignment> findByTaskOrderByAssignedAtAsc(Task task);

    void deleteByTask_TaskId(Long taskId);
}
