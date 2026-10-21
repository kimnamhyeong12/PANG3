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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/** 보고서에 담긴 task_progress 1건. 문구 수정(override)은 여기에만 저장하고 원본은 바꾸지 않는다. */
@Entity
@Table(name = "compiled_report_items",
        uniqueConstraints = @UniqueConstraint(name = "uk_compiled_report_items_report_progress",
                columnNames = {"report_id", "progress_id"}))
public class CompiledReportItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "item_id")
    private Long itemId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "report_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private CompiledReport report;

    /** 보관 기간 만료로 원본 기록이 삭제되면 항목도 함께 삭제된다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "progress_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private TaskProgress progress;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "override_comment", columnDefinition = "TEXT")
    private String overrideComment;

    @Column(name = "override_title", length = 200)
    private String overrideTitle;

    /** 원본 사진 path → 이 보고서에서만 쓰는 사진 설명. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "override_photo_comments", columnDefinition = "jsonb")
    private Map<String, Object> overridePhotoComments;

    @Column(name = "added_by_user_id")
    private Long addedByUserId;

    @Column(name = "added_at", nullable = false, updatable = false)
    private LocalDateTime addedAt;

    @PrePersist
    public void prePersist() {
        if (addedAt == null) addedAt = LocalDateTime.now();
        if (sortOrder == null) sortOrder = 0;
    }

    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }

    public CompiledReport getReport() { return report; }
    public void setReport(CompiledReport report) { this.report = report; }

    public TaskProgress getProgress() { return progress; }
    public void setProgress(TaskProgress progress) { this.progress = progress; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }

    public String getOverrideComment() { return overrideComment; }
    public void setOverrideComment(String overrideComment) { this.overrideComment = overrideComment; }

    public String getOverrideTitle() { return overrideTitle; }
    public void setOverrideTitle(String overrideTitle) { this.overrideTitle = overrideTitle; }

    public Map<String, Object> getOverridePhotoComments() { return overridePhotoComments; }
    public void setOverridePhotoComments(Map<String, Object> overridePhotoComments) { this.overridePhotoComments = overridePhotoComments; }

    public Long getAddedByUserId() { return addedByUserId; }
    public void setAddedByUserId(Long addedByUserId) { this.addedByUserId = addedByUserId; }

    public LocalDateTime getAddedAt() { return addedAt; }
    public void setAddedAt(LocalDateTime addedAt) { this.addedAt = addedAt; }
}
