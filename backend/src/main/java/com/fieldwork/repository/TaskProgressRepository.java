package com.fieldwork.repository;

import com.fieldwork.entity.TaskProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface TaskProgressRepository
        extends JpaRepository<TaskProgress, Long> {

    Optional<TaskProgress> findTopByTask_TaskIdOrderByCreatedAtDesc(Long taskId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from TaskProgress p where p.progressId = :id")
    Optional<TaskProgress> findLocked(@Param("id") Long id);

    List<TaskProgress> findByTask_TaskIdInOrderByCreatedAtDesc(Collection<Long> taskIds);

    void deleteByTask_TaskId(Long taskId);

    @Query("select p.progressId from TaskProgress p where p.createdAt <= :cutoff order by p.createdAt")
    List<Long> findExpiredIds(@Param("cutoff") java.time.LocalDateTime cutoff, org.springframework.data.domain.Pageable page);
}
