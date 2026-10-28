package com.fieldwork.repository;

import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkGroupRepository extends JpaRepository<WorkGroup, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select g from WorkGroup g where g.groupId=:id")
    Optional<WorkGroup> lockForJoin(@org.springframework.data.repository.query.Param("id") Long id);

    List<WorkGroup> findByLeader(User leader);

    Optional<WorkGroup> findFirstByLeaderAndPersonalTrue(User leader);
}
