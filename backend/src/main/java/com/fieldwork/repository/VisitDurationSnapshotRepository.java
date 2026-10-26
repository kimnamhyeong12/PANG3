package com.fieldwork.repository;

import com.fieldwork.entity.VisitDurationSnapshot;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface VisitDurationSnapshotRepository extends JpaRepository<VisitDurationSnapshot, String> {
    List<VisitDurationSnapshot> findByOwnerIdOrderByTouchedAtDesc(Long ownerId);
    @Query("select s.id from VisitDurationSnapshot s where s.ownerId=:owner order by s.touchedAt desc")
    List<String> recentIds(Long owner);
    @Modifying @Transactional
    @Query("update VisitDurationSnapshot s set s.touchedAt=:now where s.id=:id")
    int touch(String id,long now);
    void deleteByOwnerId(Long ownerId);
}
