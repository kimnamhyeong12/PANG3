package com.fieldwork.repository;

import com.fieldwork.entity.Project;
import com.fieldwork.entity.ProjectTask;
import com.fieldwork.entity.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProjectTaskRepository extends JpaRepository<ProjectTask, Long> {

    boolean existsByProjectAndTask(Project project, Task task);

    Optional<ProjectTask> findByProjectAndTask(Project project, Task task);

    @Query("select pt from ProjectTask pt where pt.project = :project and pt.task.taskId in :taskIds")
    List<ProjectTask> findLinks(@Param("project") Project project, @Param("taskIds") Collection<Long> taskIds);

    @Query("select pt.project from ProjectTask pt where pt.task = :task order by pt.project.projectId desc")
    List<Project> findProjects(@Param("task") Task task);
}
