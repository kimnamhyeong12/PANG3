package com.fieldwork.security;

import com.fieldwork.entity.*;
import com.fieldwork.sync.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes={ReleaseAuthIntegrationTest.TestConfig.class, ChangeSyncIntegrationTest.Config.class},
    properties={"spring.config.location=classpath:/auth-test.properties", "spring.datasource.url=jdbc:h2:mem:changesync;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"})
class ChangeSyncIntegrationTest extends ReleaseAuthIntegrationTest {
    @Configuration @EntityScan({"com.fieldwork.entity","com.fieldwork.sync"})
    @Import({ChangeHub.class, EntityChanges.class, SyncController.class}) static class Config {}
    @Autowired PlatformTransactionManager transactions;
    @Autowired ChangeHub hub;

    @Test void revokingASessionClosesItsStreamAndBlocksReconnection() throws Exception {
        User owner=user(); var auth=login(owner);
        var stream=mvc.perform(get("/api/sync/events").header("Authorization",bearer(auth))).andReturn();
        sessionService.revokeAll(owner.getUserId());
        assertDoesNotThrow(()->stream.getAsyncResult(1000));
        mvc.perform(get("/api/sync/events").header("Authorization",bearer(auth))).andExpect(status().isUnauthorized());
    }

    @Test void notificationWriteFailureRollsBackTheVisitInsteadOfReportingFalseSuccess() {
        User owner=user(), colleague=user(); WorkGroup group=group(owner,colleague);
        var real=org.springframework.test.util.ReflectionTestUtils.getField(hub,"jdbc");
        var broken=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class, invocation -> {
            if (invocation.getMethod().getName().equals("update")) throw new org.springframework.dao.DataAccessResourceFailureException("outbox unavailable");
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        try {
            org.springframework.test.util.ReflectionTestUtils.setField(hub,"jdbc",broken);
            org.springframework.test.util.ReflectionTestUtils.setField(hub,"postgres",true);
            assertThrows(RuntimeException.class,()->task(group,owner));
        } finally {
            org.springframework.test.util.ReflectionTestUtils.setField(hub,"jdbc",real);
            org.springframework.test.util.ReflectionTestUtils.setField(hub,"postgres",false);
        }
        assertTrue(tasks.findByGroupOrderByTaskIdDesc(group).isEmpty());
        assertNotNull(task(group,owner).getTaskId(),"Failed transaction must not poison later registrations");
    }

    @Test void syncRequiresLoginAndDeltaChecksMembership() throws Exception {
        User owner=user(), colleague=user(), outsider=user(); WorkGroup group=group(owner,colleague); Task task=task(group,owner);
        mvc.perform(get("/api/sync/events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/sync/tasks").param("groupId",group.getGroupId().toString()).param("ids",task.getTaskId().toString())
            .header("Authorization",bearer(login(outsider)))).andExpect(status().isForbidden());
        mvc.perform(get("/api/sync/tasks").param("groupId",group.getGroupId().toString()).param("ids",task.getTaskId()+",999999999")
            .header("Authorization",bearer(login(colleague)))).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].taskId").value(task.getTaskId()))
            .andExpect(jsonPath("$.removedIds[0]").value(999999999));
    }
    @Test void onlyCommittedChangesReachAuthorizedStreamsAndReconnectReconciles() throws Exception {
        User owner=user(), colleague=user(), outsider=user(); WorkGroup group=group(owner,colleague);
        var auth=login(colleague);
        var stream=mvc.perform(get("/api/sync/events").header("Authorization",bearer(auth))).andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
        var outside=mvc.perform(get("/api/sync/events").header("Authorization",bearer(login(outsider)))).andReturn();
        assertTrue(stream.getResponse().getContentAsString().contains("resync"));
        assertEquals("no",stream.getResponse().getHeader("X-Accel-Buffering"));
        int before=stream.getResponse().getContentAsString().length();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{task(group,owner);tx.setRollbackOnly();});
        assertEquals(before,stream.getResponse().getContentAsString().length(),"Rolled-back visits must never be sent");
        Task saved=task(group,owner);
        assertTrue(stream.getResponse().getContentAsString().contains("taskIds"));
        assertTrue(stream.getResponse().getContentAsString().contains(saved.getTaskId().toString()));
        assertFalse(outside.getResponse().getContentAsString().contains("taskIds"));
        var restored=mvc.perform(get("/api/sync/events").header("Authorization",bearer(auth))).andReturn();
        assertTrue(restored.getResponse().getContentAsString().contains("resync"));
    }
    @Test void movedTaskNotifiesBothOldAndNewGroupWithoutExposingForeignTaskData() throws Exception {
        User owner=user(), a=user(), b=user(); WorkGroup first=group(owner,a), second=group(owner,b); Task visit=task(first,owner);
        var oldStream=mvc.perform(get("/api/sync/events").header("Authorization",bearer(login(a)))).andReturn();
        var newStream=mvc.perform(get("/api/sync/events").header("Authorization",bearer(login(b)))).andReturn();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{Task changed=tasks.findById(visit.getTaskId()).orElseThrow();changed.setGroup(second);});
        assertTrue(oldStream.getResponse().getContentAsString().contains("taskIds"));
        assertTrue(newStream.getResponse().getContentAsString().contains("taskIds"));
        mvc.perform(get("/api/sync/tasks").param("groupId",first.getGroupId().toString()).param("ids",visit.getTaskId().toString())
            .header("Authorization",bearer(login(a)))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.removedIds[0]").value(visit.getTaskId()));
    }
}
