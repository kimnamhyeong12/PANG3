package com.fieldwork.repository;

import com.fieldwork.entity.CompiledReport;
import com.fieldwork.entity.Project;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CompiledReportRepository extends JpaRepository<CompiledReport, Long> {

    List<CompiledReport> findByProjectOrderByReportIdDesc(Project project);

    List<CompiledReport> findByProjectAndStatusOrderByReportIdDesc(Project project, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from CompiledReport r where r.reportId = :id")
    Optional<CompiledReport> findLocked(@Param("id") Long id);

    List<CompiledReport> findByRootReportIdOrderByVersionDesc(Long rootReportId);
}
