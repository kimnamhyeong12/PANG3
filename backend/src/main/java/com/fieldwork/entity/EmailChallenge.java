package com.fieldwork.entity;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "email_challenges")
public class EmailChallenge {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch = FetchType.EAGER, optional = false) @JoinColumn(name = "user_id", nullable = false) public User user;
    @Column(nullable = false, unique = true, length = 64) public String tokenHash;
    @Column(nullable = false) public String purpose;
    @Column(nullable = false, length = 254) public String email;
    @Column(nullable = false) public Instant expiresAt;
    @Column(nullable = false) public boolean used;
}
