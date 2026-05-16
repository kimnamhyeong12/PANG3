package com.fieldwork.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name="task")
public class Task {

    @Id
    @Column(name="task_id")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long taskId;
    @Column(name="road_address")
    private String roadAddress;
    @Column(name="detail_address")
    private String detailAddress;
    @Column(name="task_category")
    private String taskCategory;
    private String status;
    @CreationTimestamp
    @Column(name="created_at", updatable = false)
    private LocalDateTime createdAt;

    private Double lat;
    private Double lng;

    public Task(){}

    public Long getTaskId(){ return taskId; }
    public void setTaskId(Long taskId){ this.taskId=taskId; }

    public String getDetailAddress(){ return detailAddress; }
    public void setDetailAddress(String detailAddress){ this.detailAddress=detailAddress; }

    public String getRoadAddress(){ return roadAddress; }
    public void setRoadAddress(String roadAddress){ this.roadAddress=roadAddress; }

    public String getTaskCategory() {return taskCategory; }
    public void setTaskCategory(String taskCategory){ this.taskCategory=taskCategory; }

    public String getStatus(){ return status; }
    public void setStatus(String status){ this.status=status; }

    public Double getLat(){ return lat; }
    public void setLat(Double lat){ this.lat=lat; }

    public Double getLng(){ return lng; }
    public void setLng(Double lng){ this.lng=lng; }
}