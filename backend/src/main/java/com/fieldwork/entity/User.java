package com.fieldwork.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "login_id", unique = true)
    private String loginId;

    private String password;

    private String name;

    private String role;

    @Column(name = "work_sido")
    private String workSido;

    @Column(name = "work_sigungu")
    private String workSigungu;

    @Column(name = "workplace_address")
    private String workplaceAddress;
    @Column(name = "workplace_lat")
    private Double workplaceLat;
    @Column(name = "workplace_lng")
    private Double workplaceLng;
    public String getWorkplaceAddress() { return workplaceAddress; }
    public void setWorkplaceAddress(String value) { workplaceAddress = value; }
    public Double getWorkplaceLat() { return workplaceLat; }
    public void setWorkplaceLat(Double value) { workplaceLat = value; }
    public Double getWorkplaceLng() { return workplaceLng; }
    public void setWorkplaceLng(Double value) { workplaceLng = value; }

    public User() {}

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getLoginId() {
        return loginId;
    }

    public void setLoginId(String loginId) {
        this.loginId = loginId;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getWorkSido() {
        return workSido;
    }

    public void setWorkSido(String workSido) {
        this.workSido = workSido;
    }

    public String getWorkSigungu() {
        return workSigungu;
    }

    public void setWorkSigungu(String workSigungu) {
        this.workSigungu = workSigungu;
    }
}
