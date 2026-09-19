
package com.fieldwork.entity;

import jakarta.persistence.*;

@Entity
@Table(
        name = "bus_stop",
        indexes = {
                @Index(name = "idx_bus_stop_external_id", columnList = "external_id"),
                @Index(name = "idx_bus_stop_name", columnList = "name")
        }
)
public class BusStop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "bus_stop_id")
    private Long busStopId;

    /**
     * 부산 버스 API에서 제공하는 정류소 고유 ID
     * 예: 167970102
     */
    @Column(name = "external_id", nullable = false, unique = true)
    private String externalId;

    /**
     * 정류소명
     * 예: 영주삼거리
     */
    @Column(name = "name")
    private String name;

    /**
     * 정류소 번호
     * 예: 01001
     */
    @Column(name = "ars_no")
    private String arsNo;

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
     * 정류소 유형
     * 예: 일반
     */
    @Column(name = "stop_type")
    private String stopType;
    @Column(name = "sido")
    private String sido;
    @Column(name="sigungu")
    private String sigungu;
    @Column(name="admin_dong")
    private String adminDong;

    public Long getBusStopId() {
        return busStopId;
    }

    public void setBusStopId(Long busStopId) {
        this.busStopId = busStopId;
    }

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getArsNo() {
        return arsNo;
    }

    public void setArsNo(String arsNo) {
        this.arsNo = arsNo;
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

    public String getStopType() {
        return stopType;
    }

    public void setStopType(String stopType) {
        this.stopType = stopType;
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
