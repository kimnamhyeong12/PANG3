package com.fieldwork.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

/** 프로젝트 ↔ 업무 연결. 한 업무를 여러 프로젝트에 담을 수 있다 (D28). */
@Entity
@Table(name = "project_tasks",
        uniqueConstraints = @UniqueConstraint(name = "uk_project_tasks_project_task", columnNames = {"project_id", "task_id"}))
public class ProjectTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "project_task_id")
    private Long projectTaskId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) // 업무 삭제(TaskService) 시 연결도 같이 지워진다
    private Task task;

    @Column(name = "linked_at", nullable = false, updatable = false)
    private LocalDateTime linkedAt;

    public ProjectTask() {}

    public ProjectTask(Project project, Task task) {
        this.project = project;
        this.task = task;
    }

    @PrePersist
    void onCreate() {
        if (linkedAt == null) linkedAt = LocalDateTime.now();
    }

    public Long getProjectTaskId() { return projectTaskId; }
    public Project getProject() { return project; }
    public Task getTask() { return task; }
    public LocalDateTime getLinkedAt() { return linkedAt; }
}
