package com.fieldwork.entity;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="group_invite_links")
public class GroupInviteLink {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="group_id",nullable=false) public WorkGroup group;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="creator_user_id",nullable=false) public User creator;
    @Column(nullable=false,unique=true,length=64) public String tokenHash;
    @Column(nullable=false) public Instant expiresAt;
    public boolean revoked;
    public int uses;
}
