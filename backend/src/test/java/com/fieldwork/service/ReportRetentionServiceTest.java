package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ReportRetentionServiceTest {
    @TempDir Path root;
    private TaskProgress report(long id, LocalDateTime date) throws Exception {
        TaskProgress p=new TaskProgress();
        var idField=TaskProgress.class.getDeclaredField("progressId"); idField.setAccessible(true); idField.set(p,id);
        var created=TaskProgress.class.getDeclaredField("createdAt"); created.setAccessible(true); created.set(p,date);
        return p;
    }
    @Test void oneYearBoundaryAndLeapDay() throws Exception {
        TaskProgress leap=report(1, LocalDateTime.of(2024,2,29,12,0));
        assertEquals(LocalDateTime.of(2025,2,28,12,0),ReportRetentionService.expiresAt(leap));
        assertFalse(ReportRetentionService.available(leap));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->ReportRetentionService.requireAvailable(leap));
        assertTrue(ReportRetentionService.available(report(2,LocalDateTime.now(ZoneId.of("Asia/Seoul")))));
    }
    @Test void removesExpiredRecordsButKeepsSharedPhotosAndFilesOutsideManagedRoots() throws Exception {
        Path uploads=Files.createDirectory(root.resolve("uploads")), output=Files.createDirectory(root.resolve("output"));
        Path shared=Files.writeString(uploads.resolve("shared.jpg"),"shared");
        Path expiredPhoto=Files.writeString(uploads.resolve("expired.jpg"),"expired");
        Path outside=Files.writeString(root.resolve("outside.jpg"),"outside");
        Path cache=Files.writeString(output.resolve("report.hwpx"),"cache");
        Files.setLastModifiedTime(cache,FileTime.from(Instant.now().minus(Duration.ofDays(8))));
        TaskProgress expired=report(1,LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusYears(2));
        expired.setFieldPhotos(List.of(Map.of("path",shared.toString()),Map.of("path",expiredPhoto.toString()),Map.of("path",outside.toString())));
        TaskProgress current=report(2,LocalDateTime.now(ZoneId.of("Asia/Seoul")));
        current.setLocationMapImage(shared.toString()); current.setReportFilePath(cache.toString());
        Map<Long,TaskProgress> records=new HashMap<>(Map.of(1L,expired,2L,current));
        TaskProgressRepository repository=mock(TaskProgressRepository.class);
        when(repository.findExpiredIds(any(),any())).thenAnswer(call->records.containsKey(1L)?List.of(1L):List.of());
        when(repository.findLocked(anyLong())).thenAnswer(call->Optional.ofNullable(records.get(call.getArgument(0))));
        when(repository.findAll()).thenAnswer(call->new ArrayList<>(records.values()));
        doAnswer(call->{ records.remove(((TaskProgress)call.getArgument(0)).getProgressId()); return null; }).when(repository).delete(any());
        PlatformTransactionManager manager=mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(call->new SimpleTransactionStatus());
        FieldworkProperties properties=new FieldworkProperties();
        properties.getUpload().setBaseDir(uploads.toString()); properties.getAi().setOutputDir(output.toString());
        new ReportRetentionService(repository,manager,properties).cleanup();
        assertEquals(Set.of(2L),records.keySet()); assertTrue(Files.exists(shared));
        assertFalse(Files.exists(expiredPhoto)); assertTrue(Files.exists(outside));
        assertFalse(Files.exists(cache)); assertNull(current.getReportFilePath());
        assertTrue(Files.exists(Path.of(current.getLocationMapImage())),"cache expiry preserves regeneration inputs");
    }
}
