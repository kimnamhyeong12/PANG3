package com.fieldwork.service;

import com.fieldwork.entity.VisitDurationSnapshot;
import com.fieldwork.repository.VisitDurationSnapshotRepository;
import jakarta.persistence.EntityManager;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes=VisitDurationPersistenceTest.Config.class,properties={
    "spring.config.location=classpath:/auth-test.properties",
    "spring.datasource.url=jdbc:h2:mem:visitdurations;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"})
@Transactional
class VisitDurationPersistenceTest {
    @Configuration @EnableAutoConfiguration @EntityScan("com.fieldwork.entity")
    @EnableJpaRepositories("com.fieldwork.repository") @Import(VisitDurationCache.class)
    static class Config {}
    @Autowired VisitDurationCache cache;
    @Autowired VisitDurationSnapshotRepository repository;
    @Autowired EntityManager em;
    @Test void databaseRoundTripKeepsDirectionAndAccountDeletionRemovesOnlyItsOwner() {
        cache.use(101L,"personal","car","private-key",snapshot->{
            snapshot.put("A>B",123,cache.now());snapshot.put("B>A",456,cache.now());return null;
        });
        cache.use(202L,"personal","car","other-key",snapshot->{snapshot.put("A>B",789,cache.now());return null;});
        em.flush();em.clear();
        assertEquals(2,repository.count());
        assertTrue(repository.findAll().stream().noneMatch(row->row.payload.contains("private-key")));
        var restarted=new VisitDurationCache(repository);
        restarted.use(101L,"personal","car","private-key",snapshot->{
            assertEquals(123,snapshot.get("A>B"));assertEquals(456,snapshot.get("B>A"));return null;
        });
        repository.deleteAll(repository.findByOwnerIdOrderByTouchedAtDesc(101L));em.flush();
        restarted.use(101L,"personal","car","private-key",snapshot->{assertEquals(123,snapshot.get("A>B"));return null;});
        em.flush();em.clear();
        assertEquals(1,repository.findByOwnerIdOrderByTouchedAtDesc(101L).size(),"an evicted database snapshot is restored from the active cache without another API lookup");
        restarted.clearUser(101L);em.flush();em.clear();
        assertEquals(0,repository.findByOwnerIdOrderByTouchedAtDesc(101L).size());
        assertEquals(1,repository.findByOwnerIdOrderByTouchedAtDesc(202L).size());
    }
}
