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

@SpringBootTest(classes = ReleaseAuthIntegrationTest.TestConfig.class, properties = "spring.config.location=classpath:/auth-test.properties")
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
class ReleaseAuthIntegrationTest {
    @Configuration @EnableAutoConfiguration @EntityScan("com.fieldwork.entity") @EnableJpaRepositories("com.fieldwork.repository")
    @Import({SecurityConfig.class, CorsConfig.class, SecurityExceptionHandler.class, ApiExceptionHandler.class,
        AuthController.class, AccountEmailController.class, UserController.class, FileController.class,
        GroupController.class, GroupReportController.class, LocationController.class, TaskController.class,
        NotificationController.class, TaskProgressController.class, AuthService.class, AuthSessionService.class,
        AccountEmailService.class, GroupService.class, TaskService.class, TaskProgressService.class, TaskTransferService.class,
        FileStorageService.class, FieldworkProperties.class})
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
    String ip;
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
        for (String id : List.of(first,second)) mvc.perform(postJson("/api/auth/register",Map.of("loginId",id,"password","test-password","name","same name","workSigungu","test district")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("same name")).andExpect(jsonPath("$.loginId").value(id));
        mvc.perform(get("/api/auth/login-id/availability").param("loginId",first)).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
        mvc.perform(postJson("/api/auth/register",Map.of("loginId",first,"password","test-password","name","other name","workSigungu","test district"))).andExpect(status().isBadRequest());
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
        Map<String,Object> body=new HashMap<>(Map.of("currentPassword","test-password","name","new name","workSido","new region","workSigungu","new district", "workplaceAddress","new workplace","workplaceLat",35.12,"workplaceLng",129.12,"loginId","forged"));
        mvc.perform(patch("/api/users/"+a.getUserId()+"/account").contentType("application/json").content(json.writeValueAsString(body))
            .header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("new name"))
            .andExpect(jsonPath("$.loginId").value(a.getLoginId())).andExpect(jsonPath("$.requiresLogin").value(false));
        body.put("currentPassword","wrong"); body.put("name","must not save");
        mvc.perform(patch("/api/users/"+a.getUserId()+"/account").contentType("application/json").content(json.writeValueAsString(body))
            .header("Authorization",bearer(auth))).andExpect(status().isBadRequest());
        assertEquals("new name",users.findById(a.getUserId()).orElseThrow().getName());
    }

    @Test void changingPasswordRevokesSessionsAndUsesNewPassword() throws Exception {
        User a=user(); JsonNode auth=login(a);
        Map<String,Object> body=Map.of("currentPassword","test-password","newPassword","new-password-2026","name","tester", "workSido","region","workSigungu","district","workplaceAddress","workplace","workplaceLat",35.1,"workplaceLng",129.1);
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
    @Test void registrationDoesNotExposePasswordAndWorksWithoutOptionalEmail() throws Exception {
        mvc.perform(postJson("/api/auth/register", Map.of("loginId", "new"+UUID.randomUUID().toString().replace("-", ""), "password", "test-password", "name", "test user", "workSigungu", "사하구")))
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
