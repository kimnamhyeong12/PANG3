package com.fieldwork.entity;

import jakarta.persistence.*;

@Entity
@Table(
        name = "aed",
        indexes = {
                @Index(name = "idx_aed_address", columnList = "address"),
                @Index(name = "idx_aed_admin_dong", columnList = "admin_dong")
        }
)
public class Aed {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "aed_id")
    private Long aedId;

    /**
     * AED 모델명
     */
    @Column(name = "model_name")
    private String modelName;

    /**
     * AED 설치 위치
     */
    @Column(name = "address")
    private String address;

    /**
     * 제조사
     */
    @Column(name = "product_name")
    private String productName;

    /**
     * 관리기관 전화번호
     */
    @Column(name = "business_tel")
    private String businessTel;

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


    public Long getAedId() {
        return aedId;
    }

    public void setAedId(Long aedId) {
        this.aedId = aedId;
    }


    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }


    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }


    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }


    public String getBusinessTel() {
        return businessTel;
    }

    public void setBusinessTel(String businessTel) {
        this.businessTel = businessTel;
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