package com.fieldwork.entity;

import jakarta.persistence.*;

@Entity
@Table(
        name = "entrance",
        indexes = {
                @Index(name = "idx_entrance_admin_dong", columnList = "admin_dong"),
                @Index(name = "idx_entrance_sig_code", columnList = "sig_code")
        }
)
public class Entrance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "entrance_id")
    private Long entranceId;

    /**
     * 시군구 코드 (통계청 5자리 코드)
     */
    @Column(name = "sig_code")
    private String sigCode;

    /**
     * 건물군 ID (원본 데이터의 건물 그룹 식별자)
     */
    @Column(name = "building_group")
    private String buildingGroup;

    /**
     * 위도
     */
    @Column(name = "lat")
    private Double lat;

    /**
     * 경도
     */
    @Column(name = "lng")
    private Double lng;

    /**
     * 시도
     */
    @Column(name = "sido")
    private String sido;

    /**
     * 시군구
     */
    @Column(name = "sigungu")
    private String sigungu;

    /**
     * 행정동
     */
    @Column(name = "admin_dong")
    private String adminDong;


    public Long getEntranceId() {
        return entranceId;
    }

    public void setEntranceId(Long entranceId) {
        this.entranceId = entranceId;
    }


    public String getSigCode() {
        return sigCode;
    }

    public void setSigCode(String sigCode) {
        this.sigCode = sigCode;
    }


    public String getBuildingGroup() {
        return buildingGroup;
    }

    public void setBuildingGroup(String buildingGroup) {
        this.buildingGroup = buildingGroup;
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
}
