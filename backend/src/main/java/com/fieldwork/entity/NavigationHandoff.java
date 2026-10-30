package com.fieldwork.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "navigation_handoffs")
public class NavigationHandoff {
    @Id public Long userId;
    @Column(nullable=false, length=36) public String requestId;
    @Column(nullable=false) public Long groupId;
    @Column(nullable=false) public Long taskId;
    @Column(nullable=false, length=4) public String mode;
    @Column(nullable=false) public Instant expiresAt;
    @Version public long version;
}
