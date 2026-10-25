package com.fieldwork.repository;

import com.fieldwork.entity.Project;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Project p where p.projectId = :id")
    java.util.Optional<Project> lockById(@Param("id") Long id);


    List<Project> findByGroupOrderByProjectIdDesc(WorkGroup group);

    @Query("select pt.task from ProjectTask pt where pt.project = :project order by pt.task.taskId desc")
    List<Task> findTasks(@Param("project") Project project);

    @Query("select p from TaskProgress p join fetch p.task t where exists (select 1 from ProjectTask pt where pt.project = :project and pt.task = t)"
            + " order by p.createdAt desc, p.progressId desc")
    List<TaskProgress> findProgress(@Param("project") Project project);
}
