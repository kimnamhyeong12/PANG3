package com.fieldwork.entity;
import jakarta.persistence.*;
/** Saved project destination. Independent of disposable/repeated tasks. */
@Entity @Table(name="project_places")
public class ProjectPlace {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long placeId;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="project_id",nullable=false) private Project project;
 private String name;
 private String roadAddress;
 private Double lat;
 private Double lng;
 private String category;
 private String sido;
 private String sigungu;
 private String adminDong;
 public Long getPlaceId(){return placeId;}
 public Project getProject(){return project;} public void setProject(Project v){project=v;}
 public String getName(){return name;} public void setName(String v){name=v;}
 public String getRoadAddress(){return roadAddress;} public void setRoadAddress(String v){roadAddress=v;}
 public Double getLat(){return lat;} public void setLat(Double v){lat=v;}
 public Double getLng(){return lng;} public void setLng(Double v){lng=v;}
 public String getCategory(){return category;} public void setCategory(String v){category=v;}
 public String getSido(){return sido;} public void setSido(String v){sido=v;}
 public String getSigungu(){return sigungu;} public void setSigungu(String v){sigungu=v;}
 public String getAdminDong(){return adminDong;} public void setAdminDong(String v){adminDong=v;}
}
