package com.fieldwork.repository;

import com.fieldwork.entity.TaskProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.Collection;
import java.util.List;

public interface TaskProgressRepository
        extends JpaRepository<TaskProgress, Long> {

    Optional<TaskProgress> findTopByTask_TaskIdOrderByCreatedAtDesc(Long taskId);

    List<TaskProgress> findByTask_TaskIdInOrderByCreatedAtDesc(Collection<Long> taskIds);

    void deleteByTask_TaskId(Long taskId);
}
