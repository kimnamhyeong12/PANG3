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

    @Column(name = "priority")
    private Integer priority;

    /** 理쒖큹 ?깅줉 ?쒓컖. 以묐났 諛⑸Ц吏瑜??좎쭨濡?援щ텇?????ъ슜?쒕떎. */
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /** ?낅Т ?곹깭媛 complete濡??꾪솚???ㅼ젣 ?쒓컖. 湲곗〈 ?꾨즺 ?곗씠?곕뒗 null?????덈떎. */
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    /** 諛⑸Ц吏瑜?理쒖큹 ?깅줉???좎쭨. ??踰??앹꽦?섎㈃ 蹂寃쏀븯吏 ?딅뒗?? */
    @Column(name = "work_date", updatable = false)
    private LocalDate workDate;

    /** ?꾩옱 ?대뒓 ?좎쭨???낅Т 紐⑸줉??諛곗튂?섏뼱 ?덈뒗吏 ?섑??몃떎. */
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

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(LocalDateTime completedAt) {
        this.completedAt = completedAt;
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
