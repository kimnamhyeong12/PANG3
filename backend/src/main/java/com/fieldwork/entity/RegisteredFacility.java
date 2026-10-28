package com.fieldwork.entity;
import jakarta.persistence.*;
@Entity @Table(name="registered_facilities")
public class RegisteredFacility {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @OneToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(unique=true) public FacilityApplication application;
    @Column(nullable=false,length=80) public String categoryKey;
    @Column(nullable=false,length=100) public String name;
    @Column(nullable=false,length=300) public String address;
    @Column(nullable=false,length=40) public String sido;
    @Column(nullable=false,length=80) public String sigungu;
    @Column(nullable=false,length=40) public String adminDong;
    public double lat;
    public double lng;
}
