package com.fieldwork.entity;

import jakarta.persistence.*;

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
}