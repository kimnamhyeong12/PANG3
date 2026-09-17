package com.fieldwork.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "work_groups")
public class WorkGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "group_id")
    private Long groupId;

    @Column(nullable = false)
    private String name;

    // 그룹을 만든 팀장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "leader_id", nullable = false)
    private User leader;

    /**
     * true면 회원가입 시 자동 생성되는 1인 업무공간이다.
     * 방문지/담당자 구조는 일반 팀과 동일하고, 초대 같은 관리 기능만 제한한다.
     */
    @Column(name = "is_personal", nullable = false, columnDefinition = "boolean default false")
    private Boolean personal = false;

    @Column(name = "region_sido")
    private String regionSido;

    @Column(name = "region_sigungu")
    private String regionSigungu;

    @Column(name = "region_adm_code")
    private String regionAdmCode;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public WorkGroup() {
    }

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
        if (this.personal == null) {
            this.personal = false;
        }
    }

    public Long getGroupId() {
        return groupId;
    }

    public void setGroupId(Long groupId) {
        this.groupId = groupId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public User getLeader() {
        return leader;
    }

    public void setLeader(User leader) {
        this.leader = leader;
    }

    public boolean isPersonal() {
        return Boolean.TRUE.equals(personal);
    }

    public void setPersonal(boolean personal) {
        this.personal = personal;
    }

    public String getRegionSido() {
        return regionSido;
    }

    public void setRegionSido(String regionSido) {
        this.regionSido = regionSido;
    }

    public String getRegionSigungu() {
        return regionSigungu;
    }

    public void setRegionSigungu(String regionSigungu) {
        this.regionSigungu = regionSigungu;
    }

    public String getRegionAdmCode() {
        return regionAdmCode;
    }

    public void setRegionAdmCode(String regionAdmCode) {
        this.regionAdmCode = regionAdmCode;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
