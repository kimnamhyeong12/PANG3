package com.fieldwork.entity;
import jakarta.persistence.*;
import java.time.*;
@Entity @Table(name="facility_applications",indexes=@Index(name="idx_facility_owner_created",columnList="user_id,created_at"),uniqueConstraints=@UniqueConstraint(columnNames={"user_id","request_key"}))
public class FacilityApplication {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") public User user;
    @Column(name="request_key",nullable=false,length=80) public String requestKey;
    @Column(nullable=false,length=100) public String name;
    @Column(nullable=false,length=40) public String kind;
    @Column(length=300) public String address;
    @Column(nullable=false,length=300) public String detailLocation;
    @Column(length=3000) public String description;
    @Column(nullable=false) public LocalDate confirmedDate;
    public double photoLat;
    public double photoLng;
    @Column(nullable=false,length=20) public String status="PENDING";
    @Column(length=2000) public String reviewNote;
    @ManyToOne(fetch=FetchType.LAZY) public User reviewer;
    public Instant reviewedAt;
    public Instant consentedAt;
    @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
    @Column(length=120) public String photoKey;
    @Column(length=120) public String screenshotKey;
    @Version public long version;
}
