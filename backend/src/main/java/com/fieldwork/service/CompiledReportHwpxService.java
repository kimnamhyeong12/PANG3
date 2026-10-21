package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * 통합 보고서 JSON -> ai/compiled_report.py -> HWPX. prepare 가 파일을 만들고 key 를 돌려주면 download 로 받는다.
 * 파이썬 실행 규칙(pythonPath, 작업 폴더, 환경변수, 결과 접두어)은 AiReportService 와 같다.
 */
@Service
public class CompiledReportHwpxService {
    private static final Logger log = LoggerFactory.getLogger(CompiledReportHwpxService.class);
    private static final String RESULT_PREFIX = "@@AI_RESULT@@";
    private static final String SCRIPT_NAME = "compiled_report.py";
    private static final long KEEP_SECONDS = 86400;

    public record Prepared(Long userId, Long reportId, Path path, String fileName, Instant expiresAt) {}

    private final CompiledReportService reports;
    private final ReportHtmlRenderer renderer;
    private final FieldworkProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Semaphore slots;
    private final Map<String, Prepared> prepared = new ConcurrentHashMap<>();

    public CompiledReportHwpxService(CompiledReportService reports, ReportHtmlRenderer renderer, FieldworkProperties properties) {
        this.reports = reports;
        this.renderer = renderer;
        this.properties = properties;
        this.slots = new Semaphore(Math.max(1, properties.getAi().getMaxConcurrent()));
    }

    /** Builds the report JSON in its own transaction, then runs Python outside of it. */
    public Map<String, Object> prepare(Long reportId, Long userId) {
        Map<String, Object> json = reports.getJson(reportId, userId);
        expire();
        sweepOldFiles();
        Map<String, Object> report = map(json.get("report"));
        String fileName = safeName(Objects.toString(report.get("title"), "통합보고서")) + "_v"
                + Objects.toString(report.get("version"), "1") + ".hwpx";
        Path output;
        try {
            Path outputDir = outputDir();
            Files.createDirectories(outputDir);
            if (Files.getFileStore(outputDir).getUsableSpace() < 512L * 1024 * 1024) throw new IOException("Insufficient report storage space");
            output = outputDir.resolve("compiled-report-" + reportId + "-" + UUID.randomUUID() + ".hwpx");
        } catch (IOException ex) {
            throw unavailable(ex);
        }
        Map<String, Object> payload = buildPayload(json, output);
        boolean acquired = false;
        boolean done = false;
        try {
            acquired = slots.tryAcquire(60, TimeUnit.SECONDS);
            if (!acquired) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "보고서 생성 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
            Map<String, Object> result = runPython(objectMapper.writeValueAsString(payload));
            if (result == null || !Boolean.TRUE.equals(result.get("ok")) || !Files.isRegularFile(output)) {
                throw new IOException("compiled report failed: " + (result == null ? "no result" : result.get("error")));
            }
            done = true;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw unavailable(ex);
        } catch (Exception ex) {
            throw unavailable(ex);
        } finally {
            if (acquired) slots.release();
            if (!done) {
                try { Files.deleteIfExists(output); } catch (IOException ignored) {}
            }
        }
        String key = UUID.randomUUID().toString();
        prepared.put(key, new Prepared(userId, reportId, output, fileName, Instant.now().plusSeconds(KEEP_SECONDS)));
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("key", key);
        response.put("fileName", fileName);
        response.put("downloadUrl", "/api/compiled-reports/" + reportId + "/hwpx/" + key + "/download?userId=" + userId);
        return response;
    }

    /** Returns the prepared file for the same user/report, re-checking group membership. */
    public Prepared download(Long reportId, String key, Long userId) {
        Prepared file = prepared.get(key);
        if (file == null || !file.expiresAt().isAfter(Instant.now()) || !file.userId().equals(userId)
                || !file.reportId().equals(reportId) || !Files.isRegularFile(file.path())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "파일이 만료되었습니다. 다시 만들어 주세요.");
        }
        reports.requireReader(reportId, userId);
        return file;
    }

    /**
     * REPORT_SCHEMA v1 + local file paths for Python: each item gets {@code photo_files:[{path, caption}]}
     * and {@code map_file}; files that do not resolve are left out.
     */
    public Map<String, Object> buildPayload(Map<String, Object> json, Path output) {
        Map<String, Object> payload = objectMapper.convertValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        for (Object rawSection : list(payload.get("sections"))) {
            for (Object rawItem : list(map(rawSection).get("items"))) {
                Map<String, Object> item = map(rawItem);
                List<Map<String, Object>> files = new ArrayList<>();
                for (Object rawPhoto : list(item.get("photos"))) {
                    Map<String, Object> photo = map(rawPhoto);
                    Path file = renderer.resolveFile(Objects.toString(photo.get("url"), null));
                    if (file == null) continue;
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("path", file.toAbsolutePath().toString());
                    entry.put("caption", (Objects.toString(photo.get("slot"), "") + " " + Objects.toString(photo.get("comment"), "")).trim());
                    files.add(entry);
                }
                item.put("photo_files", files);
                Path mapFile = renderer.resolveFile(Objects.toString(item.get("locationMapImage"), null));
                item.put("map_file", mapFile == null ? null : mapFile.toAbsolutePath().toString());
            }
        }
        payload.put("output_path", output.toAbsolutePath().toString());
        return payload;
    }

    private Map<String, Object> runPython(String jsonPayload) throws Exception {
        Path payloadPath = null;
        try {
            String configuredPython = properties.getAi().getPythonPath();
            String pythonCommand = configuredPython.contains("/") || configuredPython.contains("\\")
                    ? ProjectPaths.resolve(configuredPython).toString() : configuredPython;
            Path scriptPath = ProjectPaths.resolve(properties.getAi().getScriptPath()).resolveSibling(SCRIPT_NAME);
            payloadPath = Files.createTempFile(outputDir(), "compiled-input-", ".json");
            Files.writeString(payloadPath, jsonPayload, StandardCharsets.UTF_8);
            ProcessBuilder builder = new ProcessBuilder(List.of(pythonCommand, scriptPath.toString(), payloadPath.toAbsolutePath().toString()));
            builder.environment().put("PYTHONUTF8", "1");
            builder.environment().put("PYTHONIOENCODING", "utf-8");
            builder.directory(ProjectPaths.projectRoot().toFile());
            builder.redirectErrorStream(true);
            Process process = builder.start();
            var reader = Executors.newSingleThreadExecutor(action -> {
                Thread thread = new Thread(action, "compiled-report-output"); thread.setDaemon(true); return thread;
            });
            try {
                var output = reader.submit(() -> {
                    byte[] bytes = process.getInputStream().readNBytes(1048577);
                    if (bytes.length > 1048576) { process.destroyForcibly(); throw new IOException("Report output too large"); }
                    return new String(bytes, StandardCharsets.UTF_8);
                });
                if (!process.waitFor(300, TimeUnit.SECONDS)) throw new IOException("Python execution timeout");
                String text = output.get(5, TimeUnit.SECONDS);
                for (String line : text.split("\\R")) {
                    if (line.startsWith(RESULT_PREFIX)) {
                        return objectMapper.readValue(line.substring(RESULT_PREFIX.length()).trim(), new TypeReference<Map<String, Object>>() {});
                    }
                }
                log.warn("compiled report produced no result (exit {})", process.exitValue());
                return null;
            } finally {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                if (process.isAlive()) process.destroyForcibly();
                process.getInputStream().close();
                reader.shutdownNow();
            }
        } finally {
            if (payloadPath != null) {
                try { Files.deleteIfExists(payloadPath); } catch (IOException ignored) {}
            }
        }
    }

    private void expire() {
        Instant now = Instant.now();
        prepared.entrySet().removeIf(entry -> {
            if (entry.getValue().expiresAt().isAfter(now)) return false;
            try { Files.deleteIfExists(entry.getValue().path()); } catch (IOException ignored) {}
            return true;
        });
    }

    /** Removes generated compiled-report-*.hwpx files older than a day (at startup and on each prepare). */
    @EventListener(ApplicationReadyEvent.class)
    public void sweepOldFiles() {
        Path dir = outputDir();
        if (!Files.isDirectory(dir)) return;
        Instant cutoff = Instant.now().minusSeconds(KEEP_SECONDS);
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "compiled-report-*.hwpx")) {
            for (Path file : files) {
                try {
                    if (Files.getLastModifiedTime(file).toInstant().isBefore(cutoff)) Files.deleteIfExists(file);
                } catch (IOException ignored) {
                    // next sweep retries
                }
            }
        } catch (IOException ex) {
            log.warn("compiled report sweep failed: {}", ex.getMessage());
        }
    }

    private Path outputDir() {
        return ProjectPaths.resolve(properties.getAi().getOutputDir()).toAbsolutePath().normalize();
    }

    private static ResponseStatusException unavailable(Exception cause) {
        log.warn("compiled report HWPX failed: {}", cause.getMessage());
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "HWPX 파일을 만들지 못했습니다. 다시 시도해 주세요.");
    }

    static String safeName(String name) {
        String cleaned = name.replaceAll("[\\\\/*?:\"<>|\\p{Cntrl}]", "_").trim();
        if (cleaned.length() > 80) cleaned = cleaned.substring(0, 80);
        return cleaned.isEmpty() ? "통합보고서" : cleaned;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object value) {
        return value instanceof List<?> l ? (List<Object>) l : List.of();
    }
}
