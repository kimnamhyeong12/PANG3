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

    @Column(name = "password_login_enabled")
    private Boolean passwordLoginEnabled = true;
    public boolean isPasswordLoginEnabled() { return !Boolean.FALSE.equals(passwordLoginEnabled); }
    public void setPasswordLoginEnabled(boolean value) { passwordLoginEnabled = value; }

    @Column(name = "social_profile_pending", nullable = false, columnDefinition = "boolean default false")
    private boolean socialProfilePending = false;
    public boolean isSocialProfilePending() { return socialProfilePending; }
    public void setSocialProfilePending(boolean value) { socialProfilePending = value; }

    private String name;

    private String role;
    @Column(unique = true, length = 254)
    private String email;
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

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

    @com.fasterxml.jackson.annotation.JsonIgnore
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
