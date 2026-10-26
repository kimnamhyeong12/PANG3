package com.fieldwork.entity;

import jakarta.persistence.*;

/** A bounded, user/workspace/mode-scoped recommendation cache, not route geometry. */
@Entity
@Table(name = "visit_duration_snapshot", indexes = @Index(name = "idx_visit_duration_owner", columnList = "owner_id,touched_at"))
public class VisitDurationSnapshot {
    @Id @Column(length = 64) public String id;
    @Column(name = "owner_id", nullable = false) public Long ownerId;
    @Column(name = "touched_at", nullable = false) public long touchedAt;
    @Column(nullable = false, columnDefinition = "text") public String payload;
}
