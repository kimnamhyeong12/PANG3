package com.fieldwork.repository;

import com.fieldwork.entity.TaskProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TaskProgressRepository extends JpaRepository<TaskProgress, Long> {

    Optional<TaskProgress> findTopByTask_TaskIdOrderByCreatedAtDesc(Long taskId);

}