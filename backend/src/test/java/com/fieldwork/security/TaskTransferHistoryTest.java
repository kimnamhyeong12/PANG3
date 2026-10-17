package com.fieldwork.security;

import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import com.fieldwork.service.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = ReleaseAuthIntegrationTest.TestConfig.class,
    properties = "spring.config.location=classpath:/auth-test.properties")
@Import(TaskTransferRetentionService.class)
@Transactional
class TaskTransferHistoryTest {
    @Autowired UserRepository users;
    @Autowired WorkGroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskTransferRequestRepository requests;
    @Autowired TaskTransferService service;
    @Autowired TaskTransferRetentionService retention;
    @Autowired JdbcTemplate jdbc;
    final LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);

    User user() {
        User u = new User(); u.setLoginId(UUID.randomUUID().toString()); u.setName("tester");
        u.setPassword("test"); u.setRole("USER"); return users.saveAndFlush(u);
    }
    WorkGroup group(User a, User b) {
        WorkGroup g = new WorkGroup(); g.setName("history test"); g.setLeader(a); groups.saveAndFlush(g);
        for (User u : List.of(a, b)) { GroupMember m = new GroupMember(); m.setGroup(g); m.setUser(u); m.setRole("MEMBER"); members.saveAndFlush(m); }
        return g;
    }
    Task task(WorkGroup g, User u) {
        Task t = new Task(); t.setGroup(g); t.setCreatedBy(u); t.setTaskStatus("pending");
        return tasks.saveAndFlush(t);
    }
    TaskTransferRequest request(WorkGroup g, User from, User to, Task t, String state, LocalDateTime at, LocalDateTime reply) {
        TaskTransferRequest r = new TaskTransferRequest(); r.setGroup(g); r.setSender(from); r.setRecipient(to);
        r.setTaskIds(new ArrayList<>(List.of(t.getTaskId()))); r.setStatus(state); r.setRespondedAt(reply);
        ReflectionTestUtils.setField(r, "requestedAt", at); return requests.saveAndFlush(r);
    }
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows(Map<String, Object> page) { return (List<Map<String, Object>>) page.get("items"); }

    @Test void incomingUnansweredFirstThenLatestOthersAndExpiredHidden() {
        User a=user(), b=user(); WorkGroup g=group(a,b); Task t=task(g,a);
        var incoming=request(g,b,a,t,"PENDING",now.minusDays(60),null);
        var outgoing=request(g,a,b,t,"PENDING",now.minusHours(1),null);
        var accepted=request(g,b,a,t,"ACCEPTED",now,now);
        request(g,b,a,t,"REJECTED",now.minusDays(40),now.minusDays(31));
        assertEquals(List.of(incoming.getId(),accepted.getId(),outgoing.getId()),
            rows(service.page(g.getGroupId(),a.getUserId(),0,"all",null)).stream().map(r->r.get("id")).toList());
        assertThrows(IllegalArgumentException.class, ()->service.page(g.getGroupId(),user().getUserId(),0,"all",null));
    }
    @Test void pagesHaveTwentyRowsStopAtFortyAndPendingTaskProtectionIsIndependent() {
        User a=user(), b=user(); WorkGroup g=group(a,b); Task t=task(g,a);
        for(int i=0;i<45;i++) request(g,a,b,t,"ACCEPTED",now.minusMinutes(i),now);
        var first=service.page(g.getGroupId(),a.getUserId(),0,"all",null);
        var second=service.page(g.getGroupId(),a.getUserId(),1,"all",null);
        assertEquals(20,rows(first).size()); assertEquals(20,rows(second).size());
        assertEquals(true,first.get("hasMore")); assertEquals(false,second.get("hasMore"));
        Set<Object> ids=new HashSet<>(); rows(first).forEach(r->ids.add(r.get("id"))); rows(second).forEach(r->ids.add(r.get("id")));
        assertEquals(40,ids.size());
        assertThrows(IllegalArgumentException.class,()->service.page(g.getGroupId(),a.getUserId(),2,"all",null));
        request(g,a,b,t,"PENDING",now.minusDays(100),null);
        var outgoing=service.page(g.getGroupId(),a.getUserId(),0,"outgoing",b.getUserId());
        assertEquals(List.of(t.getTaskId()),outgoing.get("pendingTaskIds"));
        assertEquals(0,rows(service.page(g.getGroupId(),a.getUserId(),0,"incoming",null)).size());
    }
    @Test void cleanupUsesResponseDatePreservesPendingAndDeletesOnlyHistoryAndItsItems() {
        User a=user(), b=user(); WorkGroup g=group(a,b); Task t=task(g,a); var cutoff=now.minusDays(30);
        var old=request(g,a,b,t,"ACCEPTED",now.minusDays(90),cutoff.minusSeconds(1));
        var edge=request(g,a,b,t,"REJECTED",now.minusDays(90),cutoff);
        var recent=request(g,a,b,t,"ACCEPTED",now.minusDays(90),now.minusDays(1));
        var pending=request(g,b,a,t,"PENDING",now.minusDays(90),null);
        var legacy=request(g,a,b,t,"REJECTED",now.minusDays(90),null);
        retention.cleanupBefore(cutoff);
        assertFalse(requests.existsById(old.getId()), "older than 30 days");
        assertFalse(requests.existsById(edge.getId()), "exactly 30 days");
        for(var kept:List.of(recent,pending,legacy)) assertTrue(requests.existsById(kept.getId()));
        assertEquals(0,jdbc.queryForObject("select count(*) from task_transfer_items where request_id = ?",Integer.class,old.getId()));
        assertTrue(tasks.existsById(t.getTaskId()));
    }
}
