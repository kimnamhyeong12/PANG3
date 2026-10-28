package com.fieldwork.entity;
import jakarta.persistence.*;
@Entity @Table(name="facility_categories")
public class FacilityCategory {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @Column(nullable=false,unique=true,length=40) public String name;
}
