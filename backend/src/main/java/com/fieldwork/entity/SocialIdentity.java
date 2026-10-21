package com.fieldwork.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "social_identities", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"provider", "subject"}),
        @UniqueConstraint(columnNames = {"user_id", "provider"})})
public class SocialIdentity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 16) private String provider;
    @Column(nullable = false, length = 255) private String subject;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) private User user;
    public String getProvider() { return provider; }
    public void setProvider(String value) { provider = value; }
    public void setSubject(String value) { subject = value; }
    public User getUser() { return user; }
    public void setUser(User value) { user = value; }
}
