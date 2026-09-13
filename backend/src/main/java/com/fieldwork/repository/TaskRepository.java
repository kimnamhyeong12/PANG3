package com.fieldwork.repository;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByCreatedByAndGroupIsNullOrderByTaskIdDesc(User createdBy);

    List<Task> findByGroupOrderByTaskIdDesc(WorkGroup group);

    List<Task> findByCreatedByIsNullAndGroupIsNullOrderByTaskIdDesc();
}
