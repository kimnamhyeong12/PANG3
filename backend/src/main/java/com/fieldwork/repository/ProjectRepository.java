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

    List<Project> findByGroupOrderByProjectIdDesc(WorkGroup group);

    @Query("select t from Task t where t.project = :project order by t.taskId desc")
    List<Task> findTasks(@Param("project") Project project);

    @Query("select p from TaskProgress p join fetch p.task t where t.project = :project order by p.createdAt desc, p.progressId desc")
    List<TaskProgress> findProgress(@Param("project") Project project);
}
