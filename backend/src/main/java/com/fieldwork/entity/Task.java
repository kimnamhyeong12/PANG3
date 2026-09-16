package com.fieldwork.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.PrePersist;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "task")
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "task_id")
    private Long taskId;

    @Column(name = "road_address")
    private String roadAddress;

    @Column(name = "detail_address")
    private String detailAddress;

    private Double lat;
    private Double lng;

    @Column(name = "task_category")
    private String taskCategory;

    @Column(name = "task_status")
    private String taskStatus;

    /** 최초 등록 시각. 중복 방문지를 날짜로 구분할 때 사용한다. */
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /** 방문지를 최초 등록한 날짜. 한 번 생성되면 변경하지 않는다. */
    @Column(name = "work_date", updatable = false)
    private LocalDate workDate;

    /** 현재 어느 날짜의 업무 목록에 배치되어 있는지 나타낸다. */
    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    @Column(name = "sido")
    private String sido;

    @Column(name = "sigungu")
    private String sigungu;

    @Column(name = "admin_dong")
    private String adminDong;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private WorkGroup group;

    public Long getTaskId() {
        return taskId;
    }

    public void setTaskId(Long taskId) {
        this.taskId = taskId;
    }

    public String getRoadAddress() {
        return roadAddress;
    }

    public void setRoadAddress(String roadAddress) {
        this.roadAddress = roadAddress;
    }

    public String getDetailAddress() {
        return detailAddress;
    }

    public void setDetailAddress(String detailAddress) {
        this.detailAddress = detailAddress;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
    }

    public String getTaskCategory() {
        return taskCategory;
    }

    public void setTaskCategory(String taskCategory) {
        this.taskCategory = taskCategory;
    }

    public String getTaskStatus() {
        return taskStatus;
    }

    public void setTaskStatus(String taskStatus) {
        this.taskStatus = taskStatus;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDate getWorkDate() {
        return workDate;
    }

    public void setWorkDate(LocalDate workDate) {
        this.workDate = workDate;
    }

    public LocalDate getScheduledDate() {
        return scheduledDate;
    }

    public void setScheduledDate(LocalDate scheduledDate) {
        this.scheduledDate = scheduledDate;
    }

    @PrePersist
    public void initializeWorkDates() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (workDate == null) {
            workDate = createdAt.toLocalDate();
        }
        if (scheduledDate == null) {
            scheduledDate = workDate;
        }
    }

    public String getSido() {
        return sido;
    }

    public void setSido(String sido) {
        this.sido = sido;
    }

    public String getSigungu() {
        return sigungu;
    }

    public void setSigungu(String sigungu) {
        this.sigungu = sigungu;
    }

    public String getAdminDong() {
        return adminDong;
    }

    public void setAdminDong(String adminDong) {
        this.adminDong = adminDong;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public WorkGroup getGroup() {
        return group;
    }

    public void setGroup(WorkGroup group) {
        this.group = group;
    }
}
