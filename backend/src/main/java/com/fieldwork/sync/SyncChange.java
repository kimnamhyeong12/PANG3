package com.fieldwork.sync;

import jakarta.persistence.*;
import java.time.Instant;

/** Transactional notification outbox; payloads contain identifiers only. */
@Entity @Table(name = "sync_changes", indexes = @Index(name = "idx_sync_change_created", columnList = "created_at"))
public class SyncChange {
    @Id @Column(length = 36) public String id;
    @Column(nullable = false, columnDefinition = "text") public String payload;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
}
