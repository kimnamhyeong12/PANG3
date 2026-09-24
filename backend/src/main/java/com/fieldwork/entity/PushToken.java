package com.fieldwork.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "push_tokens",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_push_token",
                        columnNames = {"expo_push_token"}
                )
        }
)
public class PushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "push_token_id")
    private Long pushTokenId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "expo_push_token", nullable = false, length = 255)
    private String expoPushToken;

    @Column(name = "platform", length = 20)
    private String platform;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        active = true;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getPushTokenId() {
        return pushTokenId;
    }

    public void setPushTokenId(Long pushTokenId) {
        this.pushTokenId = pushTokenId;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getExpoPushToken() {
        return expoPushToken;
    }

    public void setExpoPushToken(String expoPushToken) {
        this.expoPushToken = expoPushToken;
    }

    public String getPlatform() {
        return platform;
    }

    public void setPlatform(String platform) {
        this.platform = platform;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
