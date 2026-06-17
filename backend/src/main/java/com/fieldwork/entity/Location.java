package com.fieldwork.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name="locations")
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String address;
    private String status;

    private Double lat;
    private Double lng;

    // [인프라 파이프라인 연동을 위한 핵심 필드 2개 추가]
    private String fieldMemo; // 현장 담당자의 날것의 메모

    @Column(columnDefinition = "TEXT") // AI가 준 긴 보고서 본문을 담기 위해 TEXT 타입으로 세팅
    private String aiRefinedContent; // 제미나이가 정제해준 최종 공문서용 내용

    public Location(){}

    public Long getId(){ return id; }
    public void setId(Long id){ this.id=id; }

    public String getName(){ return name; }
    public void setName(String name){ this.name=name; }

    public String getAddress(){ return address; }
    public void setAddress(String address){ this.address=address; }

    public String getStatus(){ return status; }
    public void setStatus(String status){ this.status=status; }

    public Double getLat(){ return lat; }
    public void setLat(Double lat){ this.lat=lat; }

    public Double getLng(){ return lng; }
    public void setLng(Double lng){ this.lng=lng; }

    //  [추가된 필드들의 Getter / Setter 부]
    public String getFieldMemo() { return fieldMemo; }
    public void setFieldMemo(String fieldMemo) { this.fieldMemo = fieldMemo; }

    public String getAiRefinedContent() { return aiRefinedContent; }
    public void setAiRefinedContent(String aiRefinedContent) { this.aiRefinedContent = aiRefinedContent; }
}