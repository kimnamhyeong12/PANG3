package com.fieldwork.repository;

import com.fieldwork.entity.CompiledReport;
import com.fieldwork.entity.CompiledReportItem;
import com.fieldwork.entity.Project;
import com.fieldwork.entity.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CompiledReportItemRepository extends JpaRepository<CompiledReportItem, Long> {

    @Query("select i from CompiledReportItem i join fetch i.progress p join fetch p.task where i.report = :report")
    List<CompiledReportItem> findWithProgress(@Param("report") CompiledReport report);

    Optional<CompiledReportItem> findByReportAndProgress_ProgressId(CompiledReport report, Long progressId);

    boolean existsByReportAndProgress_ProgressId(CompiledReport report, Long progressId);

    long countByReport(CompiledReport report);

    @Query("select coalesce(max(i.sortOrder), -1) from CompiledReportItem i where i.report = :report")
    int maxSortOrder(@Param("report") CompiledReport report);

    @Query("select i from CompiledReportItem i where i.progress.task = :task "
            + "and i.report.project = :project and i.report.status = 'DRAFT'")
    List<CompiledReportItem> findDraftItemsForTask(@Param("project") Project project, @Param("task") Task task);

    /** [reportId, progressId] pairs for the project's DRAFT reports. */
    @Query("select i.report.reportId, i.progress.progressId from CompiledReportItem i "
            + "where i.report.project = :project and i.report.status = 'DRAFT'")
    List<Object[]> findDraftMembership(@Param("project") Project project);
}
