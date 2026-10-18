package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.util.ProjectPaths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class AiReportService {

    private final FieldworkProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ReportGenerationCoordinator coordinator;

    @Value("${gemini.api-key:}")
    private String geminiApiKey;

    public AiReportService(FieldworkProperties properties) {
        this.properties = properties;
        this.coordinator = new ReportGenerationCoordinator(properties.getAi().getMaxConcurrent(), properties.getAi().getQueueSize());
    }
    @jakarta.annotation.PreDestroy public void stop() { coordinator.close(); }

    public Map<String, Object> generatePayload(Map<String, Object> payload, Long userId) throws Exception {
        String json = objectMapper.writer().with(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                .writeValueAsString(payload);
        return coordinator.generate(AuthSessionService.hash(json), userId, () -> callPythonWithRetry(json));
    }

    public Map<String, Object> buildPayload(Task task, TaskProgress progress) {
        Map<String, Object> payload = new HashMap<>();

        String locationName = firstNonBlank(
                task.getDetailAddress(),
                task.getRoadAddress(),
                "사하구 관내"
        );
        payload.put("location_name", locationName);
        payload.put("task_category", firstNonBlank(task.getTaskCategory(), "현장 점검"));
        payload.put("latitude", progress.getLatitude() != null ? progress.getLatitude() : task.getLat());
        payload.put("longitude", progress.getLongitude() != null ? progress.getLongitude() : task.getLng());
        payload.put("main_comment", progress.getMainComment());
        payload.put("field_memo", progress.getFieldMemo());
        payload.put("map_image", progress.getLocationMapImage());
        payload.put("output_dir", ProjectPaths.resolve(properties.getAi().getOutputDir()).toString());

        List<Map<String, Object>> photos = new ArrayList<>();
        if (progress.getFieldPhotos() != null) {
            for (Map<String, Object> photo : progress.getFieldPhotos()) {
                Map<String, Object> item = new HashMap<>();
                Object path = photo.get("path");
                if (path == null) {
                    path = photo.get("uri");
                }
                item.put("path", path != null ? path.toString() : null);
                item.put("comment", photo.get("comment"));
                photos.add(item);
            }
        }
        payload.put("field_photos", photos);
        payload.put("task_id", task.getTaskId());
        payload.put("progress_id", progress.getProgressId());
        payload.put("recorded_at", progress.getCreatedAt() == null ? "" : progress.getCreatedAt().toString());
        payload.put("progress_status", progress.getProgressStatus());

        return payload;
    }

    public String generateCombined(List<Map<String, Object>> reports, Long userId) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("reports", reports);
        payload.put("output_dir", ProjectPaths.resolve(properties.getAi().getOutputDir()).toString());
        Map<String, Object> result = generatePayload(payload, userId);
        if (result == null || !Boolean.TRUE.equals(result.get("ok")) || result.get("report_file") == null) {
            throw new IllegalStateException("통합 보고서를 만들지 못했습니다. 다시 시도하세요.");
        }
        return result.get("report_file").toString();
    }

    public Map<String, Object> generateReport(Task task, TaskProgress progress) throws Exception {
        Map<String, Object> payload = buildPayload(task, progress);
        Map<String, Object> result = generatePayload(payload, progress.getPerformedByUserId());

        if (result == null) {
            result = new HashMap<>();
            result.put("ok", false);
            result.put("error", "AI 엔진 응답 없음");
        }

        Object ok = result.get("ok");
        if (Boolean.TRUE.equals(ok)) {
            progress.setAiRefinedContent((String) result.get("ai_refined_content"));
            progress.setReportFilePath((String) result.get("report_file"));
        } else if (result.get("ai_refined_content") != null) {
            progress.setAiRefinedContent((String) result.get("ai_refined_content"));
        } else {
            progress.setAiRefinedContent("AI 보고서 생성에 실패했습니다.");
        }

        return result;
    }

    private Map<String, Object> callPythonWithRetry(String jsonPayload) {
        // A failed request must not silently triple expensive work.
        int maxRetries = 1;
        int retryDelayMs = 2000;

        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            Path payloadPath = null;
            try {
                String configuredPython = properties.getAi().getPythonPath();
                String pythonCommand = configuredPython.contains("/") || configuredPython.contains("\\")
                        ? ProjectPaths.resolve(configuredPython).toString() : configuredPython;
                Path scriptPath = ProjectPaths.resolve(properties.getAi().getScriptPath());
                Path outputDir = ProjectPaths.resolve(properties.getAi().getOutputDir());
                java.nio.file.Files.createDirectories(outputDir);
                if (java.nio.file.Files.getFileStore(outputDir).getUsableSpace() < 512L * 1024 * 1024)
                    throw new IOException("Insufficient report storage space");
                payloadPath = java.nio.file.Files.createTempFile(outputDir, "report-input-", ".json");
                java.nio.file.Files.writeString(payloadPath, jsonPayload, StandardCharsets.UTF_8);
                List<String> command = List.of(
                        pythonCommand,
                        scriptPath.toString(),
                        payloadPath.toAbsolutePath().toString()
                );

                ProcessBuilder processBuilder = new ProcessBuilder(command);
                processBuilder.environment().put("PYTHONUTF8", "1");
                processBuilder.environment().put("PYTHONIOENCODING", "utf-8");
                processBuilder.directory(ProjectPaths.projectRoot().toFile());
                if (geminiApiKey != null && !geminiApiKey.isBlank()) {
                    processBuilder.environment().put("GEMINI_API_KEY", geminiApiKey);
                }
                processBuilder.redirectErrorStream(true);
                Process process = processBuilder.start();
                var reader = java.util.concurrent.Executors.newSingleThreadExecutor(action -> {
                    Thread thread = new Thread(action, "report-output"); thread.setDaemon(true); return thread;
                });
                try {
                    // Drain while Python runs: waiting first can deadlock a full stdout pipe.
                    var output = reader.submit(() -> {
                        byte[] bytes = process.getInputStream().readNBytes(1048577);
                        if (bytes.length > 1048576) { process.destroyForcibly(); throw new IOException("Report output too large"); }
                        return new String(bytes, StandardCharsets.UTF_8);
                    });
                    if (!process.waitFor(120, TimeUnit.SECONDS)) throw new IOException("Python execution timeout");
                    if (process.exitValue() != 0) throw new IOException("Python execution failed");
                    for (String line : output.get(5, TimeUnit.SECONDS).split("\\R")) {
                        if (line.startsWith("@@AI_RESULT@@")) return objectMapper.readValue(
                                line.substring("@@AI_RESULT@@".length()).trim(), new TypeReference<Map<String, Object>>() {});
                    }
                } finally {
                    process.descendants().forEach(ProcessHandle::destroyForcibly);
                    if (process.isAlive()) process.destroyForcibly();
                    process.getInputStream().close(); reader.shutdownNow();
                }
            } catch (Exception e) {
                System.out.println("[AI] 시도 " + attempt + " 실패: " + e.getMessage());
            } finally {
                if (payloadPath != null) {
                    try { java.nio.file.Files.deleteIfExists(payloadPath); } catch (Exception ignored) {}
                }
            }

            if (attempt < maxRetries) {
                try {
                    Thread.sleep(retryDelayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
