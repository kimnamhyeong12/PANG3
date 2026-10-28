package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.GroupInviteLinkService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
public class GroupInviteLinkController {
    private final GroupInviteLinkService links;
    public GroupInviteLinkController(GroupInviteLinkService links){this.links=links;}
    @PostMapping("/api/groups/{groupId}/invite-links") public GroupInviteLinkService.Created create(@PathVariable Long groupId){return links.create(groupId,CurrentUser.id());}
    @GetMapping("/api/group-invite-links/{token}") public ResponseEntity<GroupInviteLinkService.Preview> preview(@PathVariable String token){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(links.preview(token,CurrentUser.id()));}
    @PostMapping("/api/group-invite-links/{token}/join") public GroupInviteLinkService.Preview join(@PathVariable String token){return links.join(token,CurrentUser.id());}
    @DeleteMapping("/api/group-invite-links/{id}") public void revoke(@PathVariable Long id){links.revoke(id,CurrentUser.id());}
    @GetMapping(value="/join/{token:[A-Za-z0-9_-]{43}}",produces=MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> landing(@PathVariable String token){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'")
            .body("<!doctype html><html lang='ko'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>핀워크 그룹 초대</title><body style='font-family:sans-serif;padding:32px;line-height:1.8'><h1>핀워크 그룹 초대</h1><p>앱에서 로그인한 뒤 그룹을 확인하고 참여해 주세요.</p><a href='pang3://join?token="+token+"'>핀워크 앱에서 열기</a><p>앱이 없다면 먼저 핀워크를 설치해 주세요.</p></body></html>");
    }
}
