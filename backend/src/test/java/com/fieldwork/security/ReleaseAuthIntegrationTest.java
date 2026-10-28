package com.fieldwork.security;

import com.fasterxml.jackson.databind.*;
import com.fieldwork.config.*;
import com.fieldwork.controller.*;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import com.fieldwork.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = ReleaseAuthIntegrationTest.TestConfig.class, properties = {
    "spring.config.location=classpath:/auth-test.properties", "fieldwork.upload.base-dir=target/test-uploads"})
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
class ReleaseAuthIntegrationTest {
    @Configuration @EnableAutoConfiguration @EntityScan("com.fieldwork.entity") @EnableJpaRepositories("com.fieldwork.repository")
    @Import({SecurityConfig.class, CorsConfig.class, SecurityExceptionHandler.class, ApiExceptionHandler.class,
        AuthController.class, AccountEmailController.class, UserController.class, FileController.class,
        GroupController.class, GroupReportController.class, LocationController.class, TaskController.class,
        NotificationController.class, TaskProgressController.class, AuthService.class, AuthSessionService.class, VisitDurationCache.class,
        AccountEmailService.class, GroupService.class, TaskService.class, TaskProgressService.class, TaskTransferService.class,
        SupportInquiryController.class, SupportInquiryService.class, SupportInboxService.class, SupportAdminController.class, SupportAttachmentService.class, SupportAttachmentController.class,
        FacilityApplicationController.class, FacilityRegistryService.class, FacilityEvidenceService.class,
        GroupInviteLinkService.class, GroupInviteLinkController.class,
        SocialLoginController.class, SocialLoginService.class, SocialAccountService.class, SocialVerificationService.class,
        PhotoLocationController.class, PhotoLocationService.class,
        FileStorageService.class, FieldworkProperties.class, UploadSecurityConfig.class})
    static class TestConfig {
        @Bean PushNotificationService push() { return mock(PushNotificationService.class); }
        @Bean AiReportService ai() { return mock(AiReportService.class); }
        @Bean JavaMailSender mail() { return mock(JavaMailSender.class); }
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired AuthSessionRepository sessions;
    @Autowired EmailChallengeRepository challenges;
    @Autowired WorkGroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskProgressRepository progress;
    @Autowired LocationAssignmentRepository assignments;
    @Autowired TaskTransferService transfers;
    @Autowired PasswordEncoder encoder;
    @Autowired JavaMailSender mail;
    @Autowired SocialAccountService socialAccounts;
    @Autowired SocialVerificationService socialVerification;
    @Autowired AuthSessionService sessionService;
    @Autowired SupportInquiryRepository supportInquiries;
    @Autowired SupportInboxService supportInbox;
    @Autowired FacilityRegistryService facilityRegistry;
    @Autowired RegisteredFacilityRepository registeredFacilities;
    @Autowired GroupInviteLinkRepository inviteLinks;

    byte[] gpsPhoto() throws Exception {
        var jpeg=new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB),"jpg",jpeg);
        var t=java.nio.ByteBuffer.allocate(128).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        t.put((byte)'I').put((byte)'I').putShort((short)42).putInt(8).putShort((short)1);
        t.putShort((short)0x8825).putShort((short)4).putInt(1).putInt(26).putInt(0);
        t.putShort((short)4);
        t.putShort((short)1).putShort((short)2).putInt(2).putInt('N');
        t.putShort((short)2).putShort((short)5).putInt(3).putInt(80);
        t.putShort((short)3).putShort((short)2).putInt(2).putInt('E');
        t.putShort((short)4).putShort((short)5).putInt(3).putInt(104).putInt(0);
        for(int number:new int[]{35,6,0,129,2,0})t.putInt(number).putInt(1);
        byte[] image=jpeg.toByteArray();var out=new java.io.ByteArrayOutputStream();
        out.write(image,0,2);out.write(new byte[]{(byte)0xff,(byte)0xe1,0,(byte)136});out.write(new byte[]{'E','x','i','f',0,0});out.write(t.array());out.write(image,2,image.length-2);return out.toByteArray();
    }
    org.springframework.mock.web.MockMultipartFile facilityPayload(String key) throws Exception {
        return new org.springframework.mock.web.MockMultipartFile("application","","application/json",json.writeValueAsBytes(Map.of("name","현장 시설","kind","테스트 시설","detailLocation","건물 입구 오른쪽","address","부산광역시 사하구","confirmedDate",java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString(),"requestKey",key,"consent",true)));
    }
    @Test void facilityApplicationRequiresGpsAndBothEvidenceAndApprovalPublishesOnlyReviewedData() throws Exception {
        User owner=user(), reviewer=user();reviewer.setRole("FACILITY_REVIEWER");users.saveAndFlush(reviewer);
        JsonNode auth=login(owner), admin=login(reviewer), other=login(user());
        var photo=new org.springframework.mock.web.MockMultipartFile("photo","facility.jpg","image/jpeg",gpsPhoto());
        var image=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",image);
        var screenshot=new org.springframework.mock.web.MockMultipartFile("screenshot","map.png","image/png",image.toByteArray());
        var payload=facilityPayload(UUID.randomUUID().toString());
        mvc.perform(multipart("/api/facility-applications").file(payload).file(photo).header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/facility-applications").file(payload).file(screenshot).file(new org.springframework.mock.web.MockMultipartFile("photo","plain.png","image/png",image.toByteArray())).header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        Long id=json.readTree(mvc.perform(multipart("/api/facility-applications").file(payload).file(photo).file(screenshot).header("Authorization",bearer(auth))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/facility-applications/"+id).header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.photoLat").value(35.1)).andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(get("/api/facility-applications/"+id).header("Authorization",bearer(other))).andExpect(status().isNotFound());
        mvc.perform(get("/api/facility-applications/"+id+"/evidence/photo").header("Authorization",bearer(other))).andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/facility-applications").header("Authorization",bearer(auth))).andExpect(status().isForbidden());
        assertTrue(facilityRegistry.registered("aed","부산광역시","사하구","하단1동").isEmpty());
        long version=facilityRegistry.read(owner.getUserId(),id,false).version();
        var review=Map.ofEntries(Map.entry("status","APPROVED"),Map.entry("note","현장 사진과 위치 확인"),Map.entry("version",version),Map.entry("categoryName","AED"),Map.entry("name","검증된 시설"),Map.entry("address","부산광역시 사하구 하단동"),Map.entry("lat",35.1),Map.entry("lng",129.033333),Map.entry("sido","부산광역시"),Map.entry("sigungu","사하구"),Map.entry("adminDong","하단1동"));
        mvc.perform(postJson("/api/admin/facility-applications/"+id+"/review",review).header("Authorization",bearer(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        assertEquals(1,facilityRegistry.registered("aed","부산광역시","사하구","하단1동").size());
        mvc.perform(postJson("/api/admin/facility-applications/"+id+"/review",review).header("Authorization",bearer(admin))).andExpect(status().isConflict());
        mvc.perform(get("/api/admin/facility-applications/"+id+"/evidence/photo").header("Authorization",bearer(admin))).andExpect(status().isOk()).andExpect(content().contentType("image/jpeg"));
        Long customId=json.readTree(mvc.perform(multipart("/api/facility-applications").file(facilityPayload(UUID.randomUUID().toString())).file(photo).file(screenshot).header("Authorization",bearer(auth))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asLong();
        var custom=new HashMap<String,Object>(review);custom.put("categoryName","소화전");custom.put("version",facilityRegistry.read(owner.getUserId(),customId,false).version());
        mvc.perform(postJson("/api/admin/facility-applications/"+customId+"/review",custom).header("Authorization",bearer(admin))).andExpect(status().isOk());
        var category=facilityRegistry.categories().stream().filter(c->"소화전".equals(c.label())).findFirst().orElseThrow();
        var publicData=new PublicDataService(null,null,null,null,facilityRegistry).getPublicData(category.key(),null,"부산광역시","사하구","하단1동");
        assertEquals(1,publicData.size());
    }
    @Test void groupInviteLinksRequireMembershipExplicitAcceptanceAndRespectRevocationAndExpiry() throws Exception {
        User owner=user(), receiver=user(), outsider=user();WorkGroup g=group(owner,receiver);JsonNode a=login(owner),b=login(outsider);
        mvc.perform(postJson("/api/groups/"+g.getGroupId()+"/invite-links",Map.of()).header("Authorization",bearer(b))).andExpect(status().isForbidden());
        JsonNode created=json.readTree(mvc.perform(postJson("/api/groups/"+g.getGroupId()+"/invite-links",Map.of()).header("Authorization",bearer(a))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertTrue(created.get("url").asText().startsWith("https://pinwork.co.kr/join/"));String token=created.get("url").asText().substring(created.get("url").asText().lastIndexOf('/')+1);
        mvc.perform(get("/api/group-invite-links/"+token)).andExpect(status().isUnauthorized());
        mvc.perform(get("/join/"+token)).andExpect(status().isOk());
        mvc.perform(get("/api/group-invite-links/"+token).header("Authorization",bearer(b))).andExpect(status().isOk()).andExpect(jsonPath("$.alreadyMember").value(false));
        assertFalse(members.existsByGroupAndUser(g,outsider));
        for(int i=0;i<2;i++)mvc.perform(postJson("/api/group-invite-links/"+token+"/join",Map.of()).header("Authorization",bearer(b))).andExpect(status().isOk());
        assertTrue(members.existsByGroupAndUser(g,outsider));assertEquals(3,members.countByGroup(g));
        mvc.perform(delete("/api/group-invite-links/"+created.get("id").asLong()).header("Authorization",bearer(a))).andExpect(status().isOk());
        mvc.perform(get("/api/group-invite-links/"+token).header("Authorization",bearer(b))).andExpect(status().isGone());
        var newLink=json.readTree(mvc.perform(postJson("/api/groups/"+g.getGroupId()+"/invite-links",Map.of()).header("Authorization",bearer(a))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var row=inviteLinks.findById(newLink.get("id").asLong()).orElseThrow();row.expiresAt=java.time.Instant.now().minusSeconds(1);inviteLinks.saveAndFlush(row);
        String expired=newLink.get("url").asText().substring(newLink.get("url").asText().lastIndexOf('/')+1);
        mvc.perform(postJson("/api/group-invite-links/"+expired+"/join",Map.of()).header("Authorization",bearer(b))).andExpect(status().isGone());
    }
    String ip;
    @Test void socialOnlyAccountCanManageProfileAndDeleteWithoutALocalPassword() throws Exception {
        Long id = socialAccounts.resolve("kakao", UUID.randomUUID().toString(), "소셜 작업자", null, false);
        User account = users.findById(id).orElseThrow();
        assertFalse(account.isPasswordLoginEnabled());
        Map<String, Object> auth = sessionService.issue(id);
        String authorization = "Bearer " + auth.get("accessToken");
        String credential = socialVerification.issue(id);
        mvc.perform(postJson("/api/users/" + id + "/account/verify", Map.of("password", credential)).header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$.passwordLoginEnabled").value(false));
        mvc.perform(patch("/api/users/" + id + "/account").header("Authorization", authorization).contentType("application/json")
                .content(json.writeValueAsString(Map.of("currentPassword", credential, "name", "수정한 이름"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("수정한 이름"));
        mvc.perform(delete("/api/auth/account").header("Authorization", authorization).contentType("application/json")
                .content(json.writeValueAsString(Map.of("loginId", account.getLoginId(), "password", credential))))
                .andExpect(status().isOk());
        assertTrue(socialAccounts.providers(id).isEmpty());
        assertFalse(socialVerification.valid(id, credential));
        mvc.perform(get("/api/auth/me").header("Authorization", authorization)).andExpect(status().isUnauthorized());
    }
    @Test void reportRenamePreservesActualCompletion() throws Exception {
        User owner = user(), colleague = user(); Task task = task(group(owner, colleague), owner);
        JsonNode auth = login(owner);
        var body = new HashMap<String, Object>(); body.put("taskId", task.getTaskId()); body.put("userId", owner.getUserId());
        body.put("progressStatus", "complete"); body.put("reportName", "첫 보고서"); body.put("fieldPhotos", List.of());
        JsonNode first = json.readTree(mvc.perform(postJson("/api/task-progress", body).header("Authorization", bearer(auth)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.completedAt").isNotEmpty()).andReturn().getResponse().getContentAsString());
        body.put("progressId", first.get("progressId").asLong()); body.put("expectedRevision", first.get("revision").asText()); body.put("reportName", "수정한 보고서");
        mvc.perform(postJson("/api/task-progress", body).header("Authorization", bearer(auth)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reportName").value("수정한 보고서"))
                .andExpect(jsonPath("$.completedAt").value(first.get("completedAt").asText())).andExpect(jsonPath("$.taskStatus").value("complete"));
        mvc.perform(get("/api/task-progress/task/" + task.getTaskId()).header("Authorization", bearer(auth)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reportName").value("수정한 보고서"));
    }
    @Test void socialIdentityLinksOnlyExplicitlyAndCannotBeMovedToAnotherAccount() throws Exception {
        User owner = user(), other = user(); String subject = UUID.randomUUID().toString();
        assertEquals(owner.getUserId(), socialAccounts.resolve("google", subject, "소셜 이름", owner.getUserId(), false));
        assertEquals(owner.getUserId(), socialAccounts.resolve("google", subject, "소셜 이름", null, false));
        assertThrows(IllegalArgumentException.class, () -> socialAccounts.resolve("google", subject, "이름", other.getUserId(), false));
        assertThrows(IllegalArgumentException.class, () -> socialAccounts.resolve("google", subject, "이름", other.getUserId(), true));
        assertEquals(owner.getUserId(), socialAccounts.resolve("google", subject, "이름", owner.getUserId(), true));
        mvc.perform(postJson("/api/auth/social/google/link", Map.of())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/social/identities")).andExpect(status().isUnauthorized());
        JsonNode auth = login(owner);
        mvc.perform(get("/api/auth/social/identities").header("Authorization", bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$[0]").value("google"));
        String credential = socialVerification.issue(owner.getUserId());
        mvc.perform(postJson("/api/users/" + owner.getUserId() + "/account/verify", Map.of("password", credential)).header("Authorization", bearer(auth)))
                .andExpect(status().isOk());
    }
    @BeforeEach void setup() { ip=UUID.randomUUID().toString(); reset(mail); }
    User user() {
        User user = new User(); user.setLoginId("u" + UUID.randomUUID().toString().replace("-", ""));
        user.setPassword(encoder.encode("test-password")); user.setName("tester"); user.setRole("USER"); user.setWorkSigungu("사하구");
        return users.saveAndFlush(user);
    }
    MockHttpServletRequestBuilder postJson(String path, Object body) throws Exception {
        return post(path).with(request -> { request.setRemoteAddr(ip); return request; })
                .contentType("application/json").content(json.writeValueAsString(body));
    }
    JsonNode login(User user) throws Exception {
        return json.readTree(mvc.perform(postJson("/api/auth/login", Map.of("loginId", user.getLoginId(), "password", "test-password"))
            .header("X-Auth-Client", "native")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    String bearer(JsonNode session) { return "Bearer " + session.get("accessToken").asText(); }
    WorkGroup group(User a, User b) {
        WorkGroup group=new WorkGroup(); group.setName("test group"); group.setLeader(a); group=groups.saveAndFlush(group);
        for (User user : List.of(a,b)) { GroupMember member=new GroupMember(); member.setGroup(group); member.setUser(user); member.setRole("MEMBER"); members.saveAndFlush(member); }
        return group;
    }
    Task task(WorkGroup group, User owner) {
        Task task=new Task(); task.setGroup(group); task.setCreatedBy(owner); task.setCurrentAssignee(owner); task.setTaskStatus("working");
        return tasks.saveAndFlush(task);
    }

    @Test void supportInquiryRequiresLoginAndKeepsTicketsWhenMailFails() throws Exception {
        var body=Map.of("replyEmail","reply@example.test","subject","Help","message","Question");
        mvc.perform(postJson("/api/support/inquiries",body)).andExpect(status().isUnauthorized());
        User account=user(); JsonNode auth=login(account);
        doThrow(new org.springframework.mail.MailSendException("smtp unavailable")).when(mail).send(any(SimpleMailMessage.class));
        mvc.perform(postJson("/api/support/inquiries",body).header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.inquiryId").isNumber());
        mvc.perform(get("/api/support/inquiries").header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].subject").value("Help"));
        verify(mail).send(any(SimpleMailMessage.class));
    }

    Long inquiry(JsonNode auth, String key) throws Exception {
        return json.readTree(mvc.perform(postJson("/api/support/inquiries",Map.of("replyEmail","reply@example.test","subject","사진 오류","message","사진 선택이 안 됩니다.","category","오류 신고","requestKey",key))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("inquiryId").asLong();
    }
    User agent() { User agent=user(); agent.setRole("SUPPORT_AGENT"); return users.saveAndFlush(agent); }

    @Test void supportHistoryOnlyExposesTheOwnersInquiriesAndRetriesAreIdempotent() throws Exception {
        User owner=user(), stranger=user(); JsonNode ownAuth=login(owner), otherAuth=login(stranger);
        Long id=inquiry(ownAuth,"same-request"); assertEquals(id,inquiry(ownAuth,"same-request"));
        assertEquals(1,supportInquiries.findByUser_UserId(owner.getUserId(),org.springframework.data.domain.PageRequest.of(0,20)).getTotalElements());
        mvc.perform(get("/api/support/inquiries/"+id).header("Authorization",bearer(ownAuth)))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.message").value("사진 선택이 안 됩니다.")).andExpect(jsonPath("$.status").value("WAITING"));
        mvc.perform(get("/api/support/inquiries/"+id).header("Authorization",bearer(otherAuth))).andExpect(status().isNotFound());
        mvc.perform(get("/api/support/inquiries").header("Authorization",bearer(otherAuth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(get("/api/support/inquiries/"+id)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/support/inquiries").header("Authorization",bearer(ownAuth))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/support/inquiries/"+id).header("Authorization",bearer(ownAuth))).andExpect(status().isForbidden());
        mvc.perform(postJson("/api/admin/support/inquiries/"+id+"/answer",Map.of("answer","unauthorized","version",0)).header("Authorization",bearer(ownAuth)))
            .andExpect(status().isForbidden());
        verify(mail,times(1)).send(any(SimpleMailMessage.class));
    }

    @Test void agentsShareTheInboxAndTheOwnerSeesTheAnswerWithoutExposingOperatorIdentity() throws Exception {
        JsonNode ownAuth=login(user()); Long id=inquiry(ownAuth,UUID.randomUUID().toString());
        User first=agent(), second=agent(); JsonNode firstAuth=login(first), secondAuth=login(second);
        for (JsonNode auth : List.of(firstAuth,secondAuth)) {
            mvc.perform(get("/api/admin/support/inquiries").param("status","WAITING").header("Authorization",bearer(auth))).andExpect(status().isOk());
            mvc.perform(get("/api/admin/support/inquiries/"+id).header("Authorization",bearer(auth)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inquiry.id").value(id));
        }
        mvc.perform(postJson("/api/admin/support/inquiries/"+id+"/answer",Map.of("answer","사진 권한을 확인해 주세요.","version",0)).header("Authorization",bearer(secondAuth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.answeredById").value(second.getUserId()));
        mvc.perform(get("/api/support/inquiries/"+id).header("Authorization",bearer(ownAuth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ANSWERED"))
            .andExpect(jsonPath("$.answer").value("사진 권한을 확인해 주세요.")).andExpect(jsonPath("$.answeredById").doesNotExist());
        mvc.perform(get("/api/admin/support/inquiries/"+id).header("Authorization",bearer(firstAuth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.answeredById").value(second.getUserId()));
        mvc.perform(postJson("/api/admin/support/inquiries/"+id+"/answer",Map.of("answer","덮어쓰기","version",0)).header("Authorization",bearer(firstAuth)))
            .andExpect(status().isConflict());
        first.setRole("USER"); users.saveAndFlush(first);
        mvc.perform(get("/api/admin/support/inquiries/"+id).header("Authorization",bearer(firstAuth))).andExpect(status().isForbidden());
    }

    @Test void simultaneousAnswersCannotOverwriteEachOther() throws Exception {
        JsonNode auth=login(user()); Long id=inquiry(auth,UUID.randomUUID().toString());
        User a=agent(), b=agent();
        var start=new java.util.concurrent.CountDownLatch(1);
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var tasks=List.of(a,b).stream().map(agent -> executor.submit(() -> {
                start.await();
                try { supportInbox.answer(agent.getUserId(),id,"answer-"+agent.getUserId(),0L); return 200; }
                catch (org.springframework.web.server.ResponseStatusException failure) { return failure.getStatusCode().value(); }
            })).toList();
            start.countDown();
            var codes=new ArrayList<Integer>(); for (var task:tasks) codes.add(task.get(15,java.util.concurrent.TimeUnit.SECONDS));
            Collections.sort(codes); assertEquals(List.of(200,409),codes);
        } finally { executor.shutdownNow(); }
    }

    @Test void supportAttachmentsAreValidatedStoredAndOnlyReadableByTheOwnerOrAnAgent() throws Exception {
        User owner=user(); JsonNode auth=login(owner), outsider=login(user()), operator=login(agent());
        var bytes=new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",bytes);
        var photo=new org.springframework.mock.web.MockMultipartFile("files","screen.png","image/png",bytes.toByteArray());
        String key=UUID.randomUUID().toString();
        var payload=new org.springframework.mock.web.MockMultipartFile("inquiry","","application/json",json.writeValueAsBytes(Map.of("replyEmail","reply@example.test","subject","첨부 테스트","message","확인 부탁드립니다.","requestKey",key)));
        JsonNode result=json.readTree(mvc.perform(multipart("/api/support/inquiries").file(payload).file(photo).header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        Long id=result.get("inquiryId").asLong();
        JsonNode detail=json.readTree(mvc.perform(get("/api/support/inquiries/"+id).header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.attachments[0].name").value("screen.jpg"))
            .andExpect(jsonPath("$.attachments[0].storageKey").doesNotExist()).andReturn().getResponse().getContentAsString());
        Long file=detail.get("attachments").get(0).get("id").asLong();
        String ownPath="/api/support/inquiries/"+id+"/attachments/"+file, adminPath="/api/admin/support/inquiries/"+id+"/attachments/"+file;
        mvc.perform(get(ownPath).header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(content().contentType("image/jpeg"))
            .andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("X-Content-Type-Options","nosniff"));
        mvc.perform(get(ownPath).header("Authorization",bearer(outsider))).andExpect(status().isNotFound());
        mvc.perform(get(adminPath).header("Authorization",bearer(auth))).andExpect(status().isForbidden());
        mvc.perform(get(adminPath).header("Authorization",bearer(operator))).andExpect(status().isOk());
        mvc.perform(get(ownPath)).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/support/inquiries").file(payload).file(photo).header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.inquiryId").value(id));
        mvc.perform(get("/api/support/inquiries/"+id).header("Authorization",bearer(auth))).andExpect(jsonPath("$.attachments.length()").value(1));
    }

    @Test void invalidOrTooManySupportAttachmentsRollBackTheWholeInquiry() throws Exception {
        User owner=user(); JsonNode auth=login(owner);
        long before=supportInquiries.count();
        var payload=new org.springframework.mock.web.MockMultipartFile("inquiry","","application/json",json.writeValueAsBytes(Map.of("replyEmail","reply@example.test","subject","bad attachment","message","test")));
        var fake=new org.springframework.mock.web.MockMultipartFile("files","image.png","image/png","<html>invalid</html>".getBytes());
        mvc.perform(multipart("/api/support/inquiries").file(payload).file(fake).header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        assertEquals(before,supportInquiries.count());
        var request=multipart("/api/support/inquiries").file(payload);
        for(int i=0;i<6;i++) request.file(new org.springframework.mock.web.MockMultipartFile("files","file.pdf","application/pdf","%PDF-1.4\n".getBytes()));
        mvc.perform(request.header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        assertEquals(before,supportInquiries.count());
        var pdf=new org.springframework.mock.web.MockMultipartFile("files","file.pdf","application/pdf","not a pdf".getBytes());
        mvc.perform(multipart("/api/support/inquiries").file(payload).file(pdf).header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        assertEquals(before,supportInquiries.count());
    }

    @Test void photoVisitWithoutDistrictIsAssignedVisibleAndTransferable() throws Exception {
        User a = user(), b = user(); WorkGroup group = group(a, b);
        var bytes = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", bytes);
        var photo = new org.springframework.mock.web.MockMultipartFile("photo", "photo.png", "image/png", bytes.toByteArray());
        JsonNode created = json.readTree(mvc.perform(multipart("/api/locations/photos").file(photo)
            .param("createdByUserId", a.getUserId().toString()).param("groupId", group.getGroupId().toString())
            .param("name", "사진으로 등록한 방문지").param("lat", "35.1").param("lng", "129.0")
            .header("Authorization", bearer(login(a))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        Long taskId = created.get("taskId").longValue();
        Task saved = tasks.findById(taskId).orElseThrow();
        assertNull(saved.getAdminDong());
        assertEquals(a.getUserId(), saved.getCurrentAssignee().getUserId());
        assertEquals(a.getUserId(), assignments.findByTaskOrderByAssignedAtAsc(saved).get(0).getAssignee().getUserId());
        mvc.perform(get("/api/locations/group/" + group.getGroupId()).param("userId", a.getUserId().toString())
            .header("Authorization", bearer(login(a)))).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].taskId").value(taskId)).andExpect(jsonPath("$[0].assigneeUserId").value(a.getUserId()));
        Map<String, Object> request = transfers.create(group.getGroupId(), a.getUserId(), b.getUserId(), List.of(taskId), null, null, null);
        transfers.respond(group.getGroupId(), ((Number) request.get("id")).longValue(), b.getUserId(), true);
        assertEquals(b.getUserId(), tasks.findById(taskId).orElseThrow().getCurrentAssignee().getUserId());
    }

    @Test void acceptedTransferUpdatesPersonalMapAndCurrentReportOwner() throws Exception {
        User a=user(), b=user(); WorkGroup group=group(a,b); Task task=task(group,a);
        LocationAssignment assignment=new LocationAssignment(); assignment.setGroup(group); assignment.setTask(task);
        assignment.setAssignee(a); assignment.setAssignedBy(a); assignments.saveAndFlush(assignment);
        TaskProgress report=new TaskProgress(); report.setTask(task); report.setProgressStatus("working");
        report.setPerformedByUserId(a.getUserId()); progress.saveAndFlush(report);
        Map<String,Object> request=transfers.create(group.getGroupId(), a.getUserId(), b.getUserId(), List.of(task.getTaskId()), null, null, null);
        transfers.respond(group.getGroupId(), ((Number)request.get("id")).longValue(), b.getUserId(), true);
        JsonNode bLogin=login(b), aLogin=login(a);
        mvc.perform(get("/api/groups/"+group.getGroupId()+"/assignments/mine").param("userId", b.getUserId().toString())
            .header("Authorization", bearer(bLogin))).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].taskId").value(task.getTaskId())).andExpect(jsonPath("$[0].assigneeUserId").value(b.getUserId()))
            .andExpect(jsonPath("$[0].scheduledDate").value(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString()));
        mvc.perform(get("/api/groups/"+group.getGroupId()+"/assignments/mine").param("userId", a.getUserId().toString())
            .header("Authorization", bearer(aLogin))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/groups/"+group.getGroupId()+"/reports").param("userId", b.getUserId().toString())
            .header("Authorization", bearer(bLogin))).andExpect(status().isOk()).andExpect(jsonPath("$[0].assigneeUserId").value(b.getUserId()));
    }

    @Test void savedReportCoordinatesUpdateCanonicalMapCoordinates() throws Exception {
        User a=user(), b=user(); WorkGroup group=group(a,b); Task task=task(group,a); JsonNode auth=login(a);
        mvc.perform(postJson("/api/task-progress", Map.of("taskId", task.getTaskId(), "userId", a.getUserId(),
            "latitude", 35.115, "longitude", 128.967, "progressStatus", "working", "fieldMemo", "location edit"))
            .header("Authorization", bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.taskLatitude").value(35.115));
        mvc.perform(get("/api/locations/group/"+group.getGroupId()).param("userId", a.getUserId().toString())
            .header("Authorization", bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$[0].lat").value(35.115))
            .andExpect(jsonPath("$[0].lng").value(128.967));
    }

    @Test void leavingKeepsOriginalOwnerAndReportsButRevokesAccess() throws Exception {
        User a=user(), b=user(); WorkGroup group=group(a,b); Task task=task(group,a);
        TaskProgress report=new TaskProgress(); report.setTask(task); report.setPerformedByUserId(a.getUserId());
        report.setProgressStatus("working"); progress.saveAndFlush(report);
        JsonNode aa=login(a), bb=login(b);
        mvc.perform(delete("/api/groups/"+group.getGroupId()+"/members/me").param("userId",a.getUserId().toString())
            .contentType("application/json").content(json.writeValueAsString(Map.of("userId",a.getUserId(),"password","test-password")))
            .header("Authorization",bearer(aa))).andExpect(status().isOk());
        assertEquals(a.getUserId(),tasks.findById(task.getTaskId()).orElseThrow().getCurrentAssignee().getUserId());
        mvc.perform(get("/api/groups/"+group.getGroupId()+"/reports").param("userId",b.getUserId().toString())
            .header("Authorization",bearer(bb))).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].performedByDeparted").value(true)).andExpect(jsonPath("$[0].assigneeDeparted").value(true));
        mvc.perform(get("/api/task-progress/"+report.getProgressId()).param("userId",a.getUserId().toString())
            .header("Authorization",bearer(aa))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/task-progress/task/"+task.getTaskId()+"/location").contentType("application/json")
            .content("{\"latitude\":35.1,\"longitude\":129.1}").header("Authorization",bearer(aa))).andExpect(status().isForbidden());
    }

    @Test void positionOnlySavePreservesReportContentAndRejectsStaleRevision() throws Exception {
        User a=user(), b=user(); Task task=task(group(a,b),a); JsonNode auth=login(a);
        JsonNode saved=json.readTree(mvc.perform(postJson("/api/task-progress",Map.of("taskId",task.getTaskId(),"userId",a.getUserId(),
            "latitude",35.1,"longitude",129.1,"fieldMemo","keep memo","mainComment","keep comment","progressStatus","working"))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String body=json.writeValueAsString(Map.of("latitude",35.2,"longitude",129.2,"progressId",saved.get("progressId").asLong(),
            "expectedRevision",saved.get("revision").asText()));
        mvc.perform(patch("/api/task-progress/task/"+task.getTaskId()+"/location").contentType("application/json").content(body)
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.taskLatitude").value(35.2))
            .andExpect(jsonPath("$.fieldMemo").value("keep memo")).andExpect(jsonPath("$.mainComment").value("keep comment"));
        mvc.perform(patch("/api/task-progress/task/"+task.getTaskId()+"/location").contentType("application/json").content(body)
            .header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
    }

    @Test void multipartPositionSavePreservesMemoAndUpdatesMapImage() throws Exception {
        User a=user(), b=user(); Task task=task(group(a,b),a); JsonNode auth=login(a);
        JsonNode saved=json.readTree(mvc.perform(postJson("/api/task-progress",Map.of("taskId",task.getTaskId(),"userId",a.getUserId(),
            "latitude",35.1,"longitude",129.1,"fieldMemo","keep memo","progressStatus","working"))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var image=new org.springframework.mock.web.MockMultipartFile("mapImage","map.png","image/png",
            Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN5cAAAAASUVORK5CYII="));
        mvc.perform(multipart("/api/task-progress/task/"+task.getTaskId()+"/location").file(image)
            .param("latitude","35.3").param("longitude","129.3").param("fieldMemo","must ignore")
            .param("progressId",saved.get("progressId").asText()).param("expectedRevision",saved.get("revision").asText())
            .with(request -> {request.setMethod("PATCH");return request;}).header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.fieldMemo").value("keep memo"))
            .andExpect(jsonPath("$.locationMapImage").isNotEmpty()).andExpect(jsonPath("$.taskLatitude").value(35.3));
    }

    @Test void positionBeforeFirstReportDoesNotCreateEmptyReport() throws Exception {
        User a=user(), b=user(); Task task=task(group(a,b),a); JsonNode auth=login(a);
        mvc.perform(patch("/api/task-progress/task/"+task.getTaskId()+"/location").contentType("application/json")
            .content("{\"latitude\":35.4,\"longitude\":129.4}").header("Authorization",bearer(auth)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.taskLatitude").value(35.4));
        assertTrue(progress.findTopByTask_TaskIdOrderByCreatedAtDesc(task.getTaskId()).isEmpty());
    }

    @Test void registrationAllowsSharedNamesButRequiresUniqueLoginIds() throws Exception {
        String first="new"+UUID.randomUUID().toString().replace("-", ""), second="new"+UUID.randomUUID().toString().replace("-", "");
        mvc.perform(get("/api/auth/login-id/availability").param("loginId",first)).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true));
        for (String id : List.of(first,second)) mvc.perform(postJson("/api/auth/register",Map.of("loginId",id,"password","test-password","name","same name","workSido","부산광역시","workSigungu","사하구")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("same name")).andExpect(jsonPath("$.loginId").value(id));
        mvc.perform(get("/api/auth/login-id/availability").param("loginId",first)).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
        mvc.perform(postJson("/api/auth/register",Map.of("loginId",first,"password","test-password","name","other name","workSido","부산광역시","workSigungu","사하구"))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/auth/login-id/availability").param("loginId","!!")).andExpect(status().isBadRequest());
        assertNotEquals(users.findByLoginId(first).orElseThrow().getUserId(),users.findByLoginId(second).orElseThrow().getUserId());
    }

    @Test void accountManagementRequiresPasswordAndKeepsLoginIdImmutable() throws Exception {
        User a=user(), b=user(); JsonNode auth=login(a);
        mvc.perform(postJson("/api/users/"+a.getUserId()+"/account/verify",Map.of("password","wrong"))
            .header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        mvc.perform(postJson("/api/users/"+b.getUserId()+"/account/verify",Map.of("password","test-password"))
            .header("Authorization",bearer(auth))).andExpect(status().isForbidden());
        mvc.perform(postJson("/api/users/"+a.getUserId()+"/account/verify",Map.of("password","test-password"))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.password").doesNotExist());
        Map<String,Object> body=new HashMap<>(Map.of("currentPassword","test-password","name","new name","workSido","충청남도","workSigungu","천안시 동남구", "workplaceAddress","new workplace","workplaceLat",35.12,"workplaceLng",129.12,"loginId","forged"));
        mvc.perform(patch("/api/users/"+a.getUserId()+"/account").contentType("application/json").content(json.writeValueAsString(body))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("new name"))
            .andExpect(jsonPath("$.loginId").value(a.getLoginId())).andExpect(jsonPath("$.requiresLogin").value(false));
        body.remove("workplaceAddress"); body.remove("workplaceLat"); body.remove("workplaceLng");
        mvc.perform(patch("/api/users/"+a.getUserId()+"/account").contentType("application/json").content(json.writeValueAsString(body))
            .header("Authorization",bearer(auth))).andExpect(status().isOk());
        assertNull(users.findById(a.getUserId()).orElseThrow().getWorkplaceAddress());
        assertEquals("천안시 동남구", users.findById(a.getUserId()).orElseThrow().getWorkSigungu());
        body.put("currentPassword","wrong"); body.put("name","must not save");
        mvc.perform(patch("/api/users/"+a.getUserId()+"/account").contentType("application/json").content(json.writeValueAsString(body))
            .header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        assertEquals("new name",users.findById(a.getUserId()).orElseThrow().getName());
    }

    @Test void changingPasswordRevokesSessionsAndUsesNewPassword() throws Exception {
        User a=user(); JsonNode auth=login(a);
        Map<String,Object> body=Map.of("currentPassword","test-password","newPassword","new-password-2026","name","tester", "workSido","부산광역시","workSigungu","사하구","workplaceAddress","workplace","workplaceLat",35.1,"workplaceLng",129.1);
        mvc.perform(patch("/api/users/"+a.getUserId()+"/account").contentType("application/json").content(json.writeValueAsString(body))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.requiresLogin").value(true));
        mvc.perform(get("/api/auth/me").header("Authorization",bearer(auth))).andExpect(status().isUnauthorized());
        mvc.perform(postJson("/api/auth/login",Map.of("loginId",a.getLoginId(),"password","new-password-2026")).header("X-Auth-Client","native")).andExpect(status().isOk());
    }

    @Test void personalWorkspaceKeepsDistrictUpdatedAndArchiveIsOwnerOnly() throws Exception {
        User a=user(), b=user(); a.setWorkSido("Busan"); a.setWorkSigungu("Saha"); users.saveAndFlush(a);
        JsonNode aa=login(a), bb=login(b);
        WorkGroup personal=groups.findFirstByLeaderAndPersonalTrue(a).orElseThrow();
        assertEquals("Saha",personal.getRegionSigungu());
        a.setWorkSigungu("Seo"); users.saveAndFlush(a);
        mvc.perform(get("/api/groups/user/"+a.getUserId()).header("Authorization",bearer(aa)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].regionSigungu").value("Seo"));
        Task task=task(personal,a);
        TaskProgress record=new TaskProgress(); record.setTask(task); record.setPerformedByUserId(a.getUserId()); record.setProgressStatus("pending"); progress.saveAndFlush(record);
        mvc.perform(get("/api/groups/"+personal.getGroupId()+"/reports").param("userId",a.getUserId().toString()).header("Authorization",bearer(aa)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].progressId").value(record.getProgressId())).andExpect(jsonPath("$[0].progressStatus").value("pending"));
        mvc.perform(get("/api/groups/"+personal.getGroupId()+"/reports").param("userId",b.getUserId().toString()).header("Authorization",bearer(bb)))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/task-progress/"+record.getProgressId()+"/report/prepare").param("userId",a.getUserId().toString()).header("Authorization",bearer(aa)))
            .andExpect(status().isConflict());
    }

    @Test void requiresAuthenticationAndRejectsForgedIdentity() throws Exception {
        User a=user(), b=user(); JsonNode session=login(a);
        mvc.perform(get("/api/locations").param("userId", a.getUserId().toString())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/locations").param("userId", b.getUserId().toString()).header("Authorization", bearer(session))).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + "a".repeat(43))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(session))).andExpect(status().isOk()).andExpect(jsonPath("$.password").doesNotExist());
        assertFalse(json.writeValueAsString(a).contains(a.getPassword()));
    }
    @Test void appAccountsCannotRunGlobalMaintenance() throws Exception {
        User account = user(); JsonNode auth = login(account);
        for (String path : List.of("/api/aeds/import", "/api/aeds/update-administrative-areas",
                "/api/bus-stops/import", "/api/bus-stops/update-administrative-areas")) {
            mvc.perform(post(path)).andExpect(status().isUnauthorized());
            mvc.perform(post(path).header("Authorization", bearer(auth))).andExpect(status().isForbidden());
        }
    }
    @Test void rotatedRefreshRetriesAreSafeButExpiredReplayRevokesTheSession() throws Exception {
        User account = user(); JsonNode auth = login(account);
        Instant deadline = sessions.findByAccessHash(AuthSessionService.hash(auth.get("accessToken").asText())).orElseThrow().refreshExpiresAt;
        String original = auth.get("refreshToken").asText();
        JsonNode rotated = json.readTree(mvc.perform(postJson("/api/auth/refresh", Map.of("refreshToken", original))
                .header("X-Auth-Client", "native")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertNotEquals(original, rotated.get("refreshToken").asText());
        JsonNode retried = json.readTree(mvc.perform(postJson("/api/auth/refresh", Map.of("refreshToken", original))
                .header("X-Auth-Client", "native")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(rotated.get("refreshToken"), retried.get("refreshToken"));
        AuthSession stored = sessions.findByAccessHash(AuthSessionService.hash(retried.get("accessToken").asText())).orElseThrow();
        assertEquals(deadline, stored.refreshExpiresAt);
        assertFalse(stored.refreshRetryCiphertext.contains(rotated.get("refreshToken").asText()));
        stored.previousRefreshUntil = Instant.now().minusSeconds(1); sessions.saveAndFlush(stored);
        mvc.perform(postJson("/api/auth/refresh", Map.of("refreshToken", original)).header("X-Auth-Client", "native")).andExpect(status().isUnauthorized());
        assertTrue(sessions.findById(stored.id).orElseThrow().revoked);
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(retried))).andExpect(status().isUnauthorized());
    }
    @Test void sessionRevocationIsOwnerOnlyAndAccountLimitsSurviveAnIpChange() throws Exception {
        User a = user(), b = user(); JsonNode aa = login(a), bb = login(b);
        AuthSession stored = sessions.findByAccessHash(AuthSessionService.hash(aa.get("accessToken").asText())).orElseThrow();
        mvc.perform(get("/api/auth/sessions").header("Authorization", bearer(aa))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sessionId").value(stored.id)).andExpect(jsonPath("$[0].refreshHash").doesNotExist());
        mvc.perform(delete("/api/auth/sessions/" + stored.id).header("Authorization", bearer(bb))).andExpect(status().isNotFound());
        for (int i = 0; i < 30; i++) {
            ip = UUID.randomUUID().toString();
            mvc.perform(postJson("/api/users/" + a.getUserId() + "/account/verify", Map.of("password", "bad"))
                    .header("Authorization", bearer(aa))).andExpect(status().isBadRequest());
        }
        mvc.perform(postJson("/api/users/" + a.getUserId() + "/account/verify", Map.of("password", "bad"))
                .header("Authorization", bearer(aa))).andExpect(status().isTooManyRequests());
        mvc.perform(delete("/api/auth/sessions/" + stored.id).header("Authorization", bearer(aa))).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(aa))).andExpect(status().isUnauthorized());
    }
    @Test void verificationResendsAreThrottledBeforeSendingMail() throws Exception {
        User account = user(); JsonNode auth = login(account);
        var body = Map.of("email", account.getLoginId() + "@example.test", "password", "test-password");
        mvc.perform(postJson("/api/auth/email/request",body).header("Authorization",bearer(auth))).andExpect(status().isOk());
        mvc.perform(postJson("/api/auth/email/request",body).header("Authorization",bearer(auth))).andExpect(status().isTooManyRequests());
        verify(mail,times(1)).send(any(SimpleMailMessage.class));
    }
    @Test void refreshSurvivesExpiredAccessAndLogoutRevokesBothTokens() throws Exception {
        User a=user(); JsonNode login=login(a);
        AuthSession stored=sessions.findByAccessHash(AuthSessionService.hash(login.get("accessToken").asText())).orElseThrow();
        assertNotEquals(login.get("refreshToken").asText(), stored.refreshHash);
        stored.accessExpiresAt=Instant.now().minusSeconds(1); sessions.saveAndFlush(stored);
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(login))).andExpect(status().isUnauthorized());
        JsonNode renewed=json.readTree(mvc.perform(postJson("/api/auth/refresh", Map.of("refreshToken", login.get("refreshToken").asText()))
            .header("X-Auth-Client", "native")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertNotEquals(login.get("accessToken").asText(), renewed.get("accessToken").asText());
        mvc.perform(postJson("/api/auth/logout", Map.of("refreshToken", renewed.get("refreshToken").asText())).header("X-Auth-Client", "native")).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(renewed))).andExpect(status().isUnauthorized());
        mvc.perform(postJson("/api/auth/refresh", Map.of("refreshToken", renewed.get("refreshToken").asText())).header("X-Auth-Client", "native")).andExpect(status().isUnauthorized());
    }
    @Test void sharedReadAllowsEveryMemberButProtectsOtherGroupsAndEdits() throws Exception {
        User a=user(), b=user(), outsider=user(); WorkGroup group=group(a,b); Task task=task(group,a);
        JsonNode session=login(b);
        mvc.perform(get("/api/locations/group/"+group.getGroupId()).param("userId", b.getUserId().toString()).header("Authorization", bearer(session)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(task.getTaskId()));
        mvc.perform(postJson("/api/tasks", Map.of("createdByUserId", a.getUserId(), "groupId", group.getGroupId())).header("Authorization", bearer(session))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/locations/"+task.getTaskId()+"/status").header("Authorization", bearer(session)).contentType("application/json").content("{\"status\":\"complete\"}"))
            .andExpect(status().isForbidden());
        JsonNode outside=login(outsider);
        mvc.perform(get("/api/files/"+task.getTaskId()+"/photo.jpg").header("Authorization", bearer(outside))).andExpect(status().isForbidden());
        mvc.perform(get("/api/task-progress/task/"+task.getTaskId()).header("Authorization", bearer(session))).andExpect(status().isOk());
    }
    @Test void webUsesHttpOnlyCookieAndCorsRejectsUnknownOrigins() throws Exception {
        User a=user(); var result=mvc.perform(postJson("/api/auth/login", Map.of("loginId", a.getLoginId(), "password", "test-password"))
            .header("X-Auth-Client", "web")).andExpect(status().isOk()).andExpect(jsonPath("$.refreshToken").doesNotExist()).andReturn();
        String cookie=result.getResponse().getHeader("Set-Cookie"); assertTrue(cookie.contains("HttpOnly")); assertTrue(cookie.contains("Secure")); assertTrue(cookie.contains("SameSite=Lax"));
        mvc.perform(options("/api/auth/login").header("Origin", "https://untrusted.test").header("Access-Control-Request-Method", "POST")
            .header("Access-Control-Request-Headers", "X-Auth-Client")).andExpect(status().isForbidden());
        mvc.perform(postJson("/api/auth/refresh", Map.of()).cookie(new jakarta.servlet.http.Cookie("pang3_refresh", cookie.split(";")[0].split("=")[1])))
            .andExpect(status().isBadRequest());
    }
    @Test void expiredRefreshCannotRestoreAndAnotherAccountCannotBeDeleted() throws Exception {
        User a=user(), b=user(); JsonNode login=login(a);
        mvc.perform(delete("/api/auth/account").header("Authorization", bearer(login)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("loginId", b.getLoginId(), "password", "test-password")))).andExpect(status().isForbidden());
        AuthSession stored=sessions.findByAccessHash(AuthSessionService.hash(login.get("accessToken").asText())).orElseThrow();
        stored.refreshExpiresAt=Instant.now().minusSeconds(1); sessions.saveAndFlush(stored);
        mvc.perform(postJson("/api/auth/refresh", Map.of("refreshToken", login.get("refreshToken").asText())).header("X-Auth-Client", "native")).andExpect(status().isUnauthorized());
    }
    @Test void reportDownloadRequiresMembershipAndLoginAttemptsAreLimited() throws Exception {
        User a=user(), b=user(), outside=user(); WorkGroup group=group(a,b); Task task=task(group,a);
        TaskProgress report=new TaskProgress(); report.setTask(task); report.setProgressStatus("complete"); report=progress.saveAndFlush(report);
        JsonNode memberLogin=login(b), outsideLogin=login(outside);
        String path="/api/task-progress/"+report.getProgressId()+"/report/download";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization", bearer(outsideLogin))).andExpect(status().isForbidden());
        mvc.perform(get(path).header("Authorization", bearer(memberLogin))).andExpect(status().isNotFound()); // allowed, no generated file yet
        String limitedIp=UUID.randomUUID().toString();
        for (int i=0; i<30; i++) mvc.perform(postJson("/api/auth/login", Map.of("loginId", "missing", "password", "bad"))
                .with(request -> { request.setRemoteAddr(limitedIp); return request; }).header("X-Auth-Client", "native")).andExpect(status().isUnauthorized());
        mvc.perform(postJson("/api/auth/login", Map.of("loginId", "missing", "password", "bad"))
                .with(request -> { request.setRemoteAddr(limitedIp); return request; }).header("X-Auth-Client", "native")).andExpect(status().isTooManyRequests());
    }
    @Test void registrationRequiresGuForCityAndPersistsFullSelection() throws Exception {
        String id = "new" + UUID.randomUUID().toString().replace("-", "");
        Map<String, String> body = new HashMap<>(Map.of("loginId", id, "password", "test-password", "name", "test user",
                "workSido", "충청남도", "workSigungu", "천안시"));
        mvc.perform(postJson("/api/auth/register", body)).andExpect(status().isBadRequest());
        body.put("workSigungu", "천안시 동남구");
        mvc.perform(postJson("/api/auth/register", body)).andExpect(status().isOk())
            .andExpect(jsonPath("$.workSigungu").value("천안시 동남구"));
        assertEquals("천안시 동남구", users.findByLoginId(id).orElseThrow().getWorkSigungu());
    }

    @Test void registrationRequiresCredentialsAndNameButAllowsNoRegionOrWorkplace() throws Exception {
        String id = "new" + UUID.randomUUID().toString().replace("-", "");
        Map<String, String> required = Map.of("loginId", id, "password", "test-password", "name", "test user");
        for (String field : required.keySet()) {
            Map<String, String> missing = new HashMap<>(required);
            missing.remove(field);
            mvc.perform(postJson("/api/auth/register", missing)).andExpect(status().isBadRequest());
            assertTrue(users.findByLoginId(id).isEmpty());
            missing.put(field, "        ");
            mvc.perform(postJson("/api/auth/register", missing)).andExpect(status().isBadRequest());
        }
        mvc.perform(postJson("/api/auth/register", required)).andExpect(status().isOk());
        User registered = users.findByLoginId(id).orElseThrow();
        assertNull(registered.getWorkSido());
        assertNull(registered.getWorkSigungu());
        assertNull(registered.getWorkplaceAddress());
        assertNull(registered.getWorkplaceLat());
        assertNull(registered.getWorkplaceLng());
    }
    @Test void registrationDoesNotExposePasswordAndWorksWithoutOptionalEmail() throws Exception {
        mvc.perform(postJson("/api/auth/register", Map.of("loginId", "new"+UUID.randomUUID().toString().replace("-", ""), "password", "test-password", "name", "test user", "workSido", "부산광역시", "workSigungu", "사하구")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.userId").exists()).andExpect(jsonPath("$.password").doesNotExist());
    }
    @Test void verifiedEmailRecoveryIsSingleUseAndRevokesExistingSessions() throws Exception {
        User a=user(); JsonNode session=login(a); String address=a.getLoginId()+"@example.test";
        mvc.perform(postJson("/api/auth/email/request", Map.of("email", address, "password", "test-password")).header("Authorization", bearer(session))).andExpect(status().isOk());
        var capture=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class); verify(mail).send(capture.capture());
        String verifyToken=capture.getValue().getText().split("#token=")[1].split("\\n")[0];
        mvc.perform(postJson("/api/auth/email/verify", Map.of("token", verifyToken))).andExpect(status().isOk());
        mvc.perform(postJson("/api/auth/email/verify", Map.of("token", verifyToken))).andExpect(status().isBadRequest());
        reset(mail);
        mvc.perform(postJson("/api/auth/password/forgot", Map.of("loginId", a.getLoginId(), "email", address))).andExpect(status().isOk());
        verify(mail).send(capture.capture()); String resetToken=capture.getValue().getText().split("#token=")[1].split("\\n")[0];
        mvc.perform(postJson("/api/auth/password/reset", Map.of("token", resetToken, "password", "new-password"))).andExpect(status().isOk());
        mvc.perform(postJson("/api/auth/password/reset", Map.of("token", resetToken, "password", "another-password"))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(session))).andExpect(status().isUnauthorized());
        mvc.perform(postJson("/api/auth/login", Map.of("loginId", a.getLoginId(), "password", "new-password")).header("X-Auth-Client", "native")).andExpect(status().isOk());
    }
}
