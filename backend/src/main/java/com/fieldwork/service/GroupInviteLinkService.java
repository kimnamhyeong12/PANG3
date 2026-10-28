package com.fieldwork.service;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service
public class GroupInviteLinkService {
    private final GroupInviteLinkRepository links;
    private final WorkGroupRepository groups;
    private final GroupMemberRepository members;
    private final UserRepository users;
    public GroupInviteLinkService(GroupInviteLinkRepository links,WorkGroupRepository groups,GroupMemberRepository members,UserRepository users) { this.links=links;this.groups=groups;this.members=members;this.users=users; }
    public record Created(Long id,String url,Instant expiresAt) {}
    public record Preview(Long groupId,String groupName,Instant expiresAt,boolean alreadyMember) {}
    private User user(Long id) { return users.findById(id).filter(u->!"DELETED".equals(u.getRole())).orElseThrow(()->error(401,"다시 로그인해 주세요.")); }
    @Transactional public Created create(Long groupId,Long userId) {
        WorkGroup group=groups.findById(groupId).orElseThrow(()->error(404,"그룹을 찾을 수 없습니다.")); User user=user(userId);
        if(group.isPersonal())throw error(400,"개인 업무공간에는 초대 링크를 만들 수 없습니다.");
        if(!members.existsByGroupAndUser(group,user))throw error(403,"그룹 멤버만 초대 링크를 만들 수 있습니다.");
        byte[] bytes=new byte[32]; new java.security.SecureRandom().nextBytes(bytes); String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        GroupInviteLink link=new GroupInviteLink();link.group=group;link.creator=user;link.tokenHash=hash(token);link.expiresAt=Instant.now().plus(Duration.ofDays(7));links.save(link);
        return new Created(link.id,"https://pinwork.co.kr/join/"+token,link.expiresAt);
    }
    private GroupInviteLink valid(String token) {
        if(token==null||!token.matches("[A-Za-z0-9_-]{43}"))throw error(404,"초대 링크를 확인해 주세요.");
        GroupInviteLink link=links.findByTokenHash(hash(token)).orElseThrow(()->error(404,"초대 링크를 찾을 수 없습니다."));
        if(link.revoked||!link.expiresAt.isAfter(Instant.now())||link.uses>=50)throw error(410,"만료되거나 사용이 중지된 초대 링크입니다.");
        if(link.group.isPersonal()||"DELETED".equals(link.creator.getRole())||!members.existsByGroupAndUser(link.group,link.creator))throw error(410,"더 이상 사용할 수 없는 초대 링크입니다.");
        return link;
    }
    @Transactional public Preview preview(String token,Long userId) { GroupInviteLink link=valid(token);return new Preview(link.group.getGroupId(),link.group.getName(),link.expiresAt,members.existsByGroupAndUser(link.group,user(userId))); }
    @Transactional public Preview join(String token,Long userId) {
        GroupInviteLink link=valid(token);User user=user(userId);
        groups.lockForJoin(link.group.getGroupId()).orElseThrow(()->error(410,"그룹을 찾을 수 없습니다."));
        if(!members.existsByGroupAndUser(link.group,user)) { GroupMember member=new GroupMember();member.setGroup(link.group);member.setUser(user);member.setRole("MEMBER");members.saveAndFlush(member);link.uses++; }
        return new Preview(link.group.getGroupId(),link.group.getName(),link.expiresAt,true);
    }
    @Transactional public void revoke(Long id,Long userId) {
        GroupInviteLink link=links.locked(id).orElseThrow(()->error(404,"초대 링크를 찾을 수 없습니다."));
        if(!link.creator.getUserId().equals(userId)&&!link.group.getLeader().getUserId().equals(userId))throw error(403,"초대한 사람이나 그룹장만 링크를 중지할 수 있습니다.");
        link.revoked=true;
    }
    private static String hash(String value) { try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);} }
    private static ResponseStatusException error(int code,String message) {return new ResponseStatusException(HttpStatus.valueOf(code),message);}
}
