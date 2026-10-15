package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import com.fieldwork.util.ProjectPaths;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/** Keep report records and source attachments for one calendar year, generated caches for seven days. */
@Service
public class ReportRetentionService {
    private static final Logger log = LoggerFactory.getLogger(ReportRetentionService.class);
    private final TaskProgressRepository repository;
    private final TransactionTemplate transactions;
    private final Path uploads;
    private final Path output;
    public ReportRetentionService(TaskProgressRepository repository, PlatformTransactionManager manager, FieldworkProperties properties) {
        this.repository = repository;
        transactions = new TransactionTemplate(manager);
        uploads = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize();
        output = ProjectPaths.resolve(properties.getAi().getOutputDir()).toAbsolutePath().normalize();
    }
    public static LocalDateTime expiresAt(TaskProgress report) {
        return report.getCreatedAt() == null ? null : report.getCreatedAt().plusYears(1);
    }
    public static void requireAvailable(TaskProgress report) {
        if (!available(report))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.GONE, "보고서의 1년 보관 기간이 만료되었습니다.");
    }
    public static boolean available(TaskProgress report) {
        LocalDateTime expiry = expiresAt(report);
        return expiry == null || expiry.isAfter(LocalDateTime.now(ZoneId.of("Asia/Seoul")));
    }
    @Scheduled(cron = "0 0 3 * * *", zone = "Asia/Seoul")
    public void cleanup() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusYears(1);
        // Batches bound locks and heap use. File removal follows the committed DB deletion.
        for (int batch = 0; batch < 100; batch++) {
            List<String> candidates = new ArrayList<>();
            Integer count = transactions.execute(status -> {
                List<Long> ids = repository.findExpiredIds(cutoff, PageRequest.of(0, 100));
                for (Long id : ids) repository.findLocked(id).ifPresent(report -> {
                    if (report.getCreatedAt() != null && !report.getCreatedAt().isAfter(cutoff)) {
                        candidates.addAll(references(report));
                        repository.delete(report);
                    }
                });
                repository.flush();
                return ids.size();
            });
            Set<Path> retained = retainedPaths();
            candidates.forEach(value -> deleteUnreferenced(value, retained));
            if (count == null || count < 100) break;
        }
        // Cache expiry never removes report content or its source photos: prepare regenerates HWPX.
        transactions.executeWithoutResult(status -> {
            for (TaskProgress report : repository.findAll()) {
                Path file = safePath(report.getReportFilePath());
                if (file != null && file.startsWith(output) && old(file, Duration.ofDays(7))) {
                    TaskProgress locked = repository.findLocked(report.getProgressId()).orElse(null);
                    if (locked != null && Objects.equals(locked.getReportFilePath(), report.getReportFilePath())) locked.setReportFilePath(null);
                }
            }
        });
        Set<Path> retained = retainedPaths();
        sweep(output, retained, Duration.ofDays(1));
        sweep(uploads, retained, Duration.ofDays(1));
    }
    private Set<Path> retainedPaths() {
        Set<Path> paths = new HashSet<>();
        repository.findAll().forEach(report -> references(report).forEach(value -> {
            Path path = safePath(value); if (path != null) paths.add(path);
        }));
        return paths;
    }
    static List<String> references(TaskProgress report) {
        List<String> paths = new ArrayList<>();
        if (report.getReportFilePath() != null) paths.add(report.getReportFilePath());
        if (report.getLocationMapImage() != null) paths.add(report.getLocationMapImage());
        if (report.getFieldPhotos() != null) report.getFieldPhotos().forEach(photo -> {
            Object path = photo.get("path"); if (path == null) path = photo.get("uri");
            if (path != null) paths.add(path.toString());
        });
        return paths;
    }
    private Path safePath(String value) {
        if (value == null) return null;
        try {
            Path path = Path.of(value).toAbsolutePath().normalize();
            if ((!path.startsWith(uploads) && !path.startsWith(output)) || Files.isSymbolicLink(path)) return null;
            Path root = path.startsWith(uploads) ? uploads : output;
            if (!Files.exists(path) || !path.toRealPath().startsWith(root.toRealPath())) return null;
            return path;
        } catch (Exception ignored) { return null; }
    }
    private boolean old(Path path, Duration age) {
        try { return Files.getLastModifiedTime(path).toInstant().isBefore(Instant.now().minus(age)); }
        catch (Exception ignored) { return false; }
    }
    private void deleteUnreferenced(String value, Set<Path> retained) {
        Path path = safePath(value);
        if (path != null && !retained.contains(path)) try { Files.deleteIfExists(path); }
        catch (Exception error) { log.warn("Report file cleanup failed: {}", path, error); }
    }
    private void sweep(Path root, Set<Path> retained, Duration age) {
        if (!Files.isDirectory(root) || Files.isSymbolicLink(root)) return;
        try (var files = Files.walk(root)) {
            files.filter(path -> Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) && old(path, age))
                .forEach(path -> deleteUnreferenced(path.toString(), retained));
        } catch (Exception error) { log.warn("Report cache cleanup failed: {}", root, error); }
    }
}
