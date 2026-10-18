package com.fieldwork.entity;

import jakarta.persistence.*;
import java.time.Instant;

/** Only SHA-256 digests are stored; raw bearer tokens are never persisted. */
@Entity
@Table(name = "auth_sessions")
public class AuthSession {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    public User user;
    @Column(nullable = false, unique = true, length = 64)
    public String accessHash;
    @Column(nullable = false, unique = true, length = 64)
    public String refreshHash;
    @Column(length = 64, unique = true)
    public String previousRefreshHash;
    public Instant previousRefreshUntil;
    @Column(length = 256)
    public String refreshRetryCiphertext;
    @Column(nullable = false)
    public Instant accessExpiresAt;
    @Column(nullable = false)
    public Instant refreshExpiresAt;
    @Column(nullable = false)
    public boolean revoked;
}
