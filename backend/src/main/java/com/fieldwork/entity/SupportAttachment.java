package com.fieldwork.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "support_attachments", indexes = @Index(name = "idx_support_attachment_inquiry", columnList = "inquiry_id"))
public class SupportAttachment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "inquiry_id", nullable = false) public SupportInquiry inquiry;
    @Column(nullable = false, length = 160) public String name;
    @Column(nullable = false, length = 100) public String contentType;
    @Column(nullable = false) public long size;
    @Column(nullable = false, unique = true, length = 120) public String storageKey;
}
