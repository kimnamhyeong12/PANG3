package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RetiredWebpCleanupTest {
    @TempDir Path temp;

    @Test void removesOnlyRetiredImagesAndAffectedCachesAndClearsTheirReferences() throws Exception {
        Path uploads = Files.createDirectories(temp.resolve("uploads"));
        Path output = Files.createDirectories(temp.resolve("output"));
        Path jpg = Files.write(uploads.resolve("keep.jpg"), new byte[]{1});
        Path photo = Files.write(uploads.resolve("photo.webp"), new byte[]{1});
        Path map = Files.write(uploads.resolve("map.webp"), new byte[]{1});
        Path orphan = Files.write(uploads.resolve("orphan.webp"), new byte[]{1});
        Path cache = Files.write(output.resolve("affected.hwpx"), new byte[]{1});
        Path outside = Files.write(temp.resolve("outside.webp"), new byte[]{1});
        Path webpReport = output.resolve("webp.hwpx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(webpReport))) {
            zip.putNextEntry(new ZipEntry("BinData/BIN0001.webp")); zip.write(1); zip.closeEntry();
        }
        TaskProgress report = new TaskProgress();
        ReflectionTestUtils.setField(report, "progressId", 1L);
        report.setFieldMemo("keep memo"); report.setProgressStatus("complete");
        report.setFieldPhotos(List.of(Map.of("path", photo.toString()), Map.of("path", jpg.toString())));
        report.setLocationMapImage(map.toString()); report.setReportFilePath(cache.toString());
        var repository = mock(TaskProgressRepository.class);
        when(repository.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(report)));
        when(repository.findLocked(1L)).thenReturn(Optional.of(report));
        var manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        var properties = new FieldworkProperties();
        properties.getUpload().setBaseDir(uploads.toString()); properties.getAi().setOutputDir(output.toString());
        var cleaner = new ReportRetentionService(repository, manager, properties);
        cleaner.removeRetiredWebp(); cleaner.removeRetiredWebp();
        assertTrue(Files.exists(jpg)); assertTrue(Files.exists(outside));
        for (Path removed : List.of(photo, map, orphan, cache, webpReport)) assertFalse(Files.exists(removed), removed.toString());
        assertEquals(List.of(Map.of("path", jpg.toString())), report.getFieldPhotos());
        assertNull(report.getLocationMapImage()); assertNull(report.getReportFilePath());
        assertEquals("keep memo", report.getFieldMemo()); assertEquals("complete", report.getProgressStatus());
    }
}
