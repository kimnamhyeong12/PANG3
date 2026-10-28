package com.fieldwork.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "support_inquiries", indexes = {
    @Index(name = "idx_support_owner_created", columnList = "user_id,created_at"),
    @Index(name = "idx_support_status_created", columnList = "status,created_at")
}, uniqueConstraints = @UniqueConstraint(name = "uk_support_owner_request", columnNames = {"user_id", "request_key"}))
public class SupportInquiry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) public User user;
    @Column(name = "request_key", nullable = false, length = 80) public String requestKey;
    @Column(nullable = false, length = 254) public String replyEmail;
    @Column(nullable = false, length = 30) public String category;
    @Column(nullable = false, length = 100) public String subject;
    @Column(nullable = false, length = 5000) public String message;
    @Column(length = 80) public String appVersion;
    @Column(length = 80) public String platform;
    @Column(nullable = false, length = 20) public String status = "WAITING";
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
    @Column(length = 5000) public String answer;
    public Instant answeredAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "answered_by") public User answeredBy;
    @Version public long version;
    @OneToMany(mappedBy = "inquiry", cascade = CascadeType.ALL, orphanRemoval = true)
    public java.util.List<SupportAttachment> attachments = new java.util.ArrayList<>();
}
