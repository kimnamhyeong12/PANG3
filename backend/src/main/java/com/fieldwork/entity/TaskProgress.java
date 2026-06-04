package com.fieldwork.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "task_progress")
public class TaskProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "progress_id")
    private Long progressId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    private Double latitude;
    private Double longitude;

    @Column(name = "location_map_image")
    private String locationMapImage;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_photos", columnDefinition = "jsonb")
    private List<Map<String, Object>> fieldPhotos;

    @Column(name = "main_comment", columnDefinition = "TEXT")
    private String mainComment;

    @Column(name = "field_memo", columnDefinition = "TEXT")
    private String fieldMemo;

    @Column(name = "progress_status")
    private String progressStatus;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public Long getProgressId() { return progressId; }

    public Task getTask() { return task; }
    public void setTask(Task task) { this.task = task; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getLocationMapImage() { return locationMapImage; }
    public void setLocationMapImage(String locationMapImage) { this.locationMapImage = locationMapImage; }

    public List<Map<String, Object>> getFieldPhotos() { return fieldPhotos; }
    public void setFieldPhotos(List<Map<String, Object>> fieldPhotos) { this.fieldPhotos = fieldPhotos; }

    public String getMainComment() { return mainComment; }
    public void setMainComment(String mainComment) { this.mainComment = mainComment; }

    public String getFieldMemo() { return fieldMemo; }
    public void setFieldMemo(String fieldMemo) { this.fieldMemo = fieldMemo; }

    public String getProgressStatus() { return progressStatus; }
    public void setProgressStatus(String progressStatus) { this.progressStatus = progressStatus; }
}