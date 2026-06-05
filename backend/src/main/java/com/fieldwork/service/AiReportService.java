package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.util.ProjectPaths;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
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

    public AiReportService(FieldworkProperties properties) {
        this.properties = properties;
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

        return payload;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> generateReport(Task task, TaskProgress progress) throws Exception {
        Map<String, Object> payload = buildPayload(task, progress);
        String jsonPayload = objectMapper.writeValueAsString(payload);
        Map<String, Object> result = callPythonWithRetry(jsonPayload);

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

    @SuppressWarnings("unchecked")
    private Map<String, Object> callPythonWithRetry(String jsonPayload) {
        int maxRetries = 3;
        int retryDelayMs = 2000;

        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Path pythonPath = ProjectPaths.resolve(properties.getAi().getPythonPath());
                Path scriptPath = ProjectPaths.resolve(properties.getAi().getScriptPath());
                List<String> command = List.of(
                        pythonPath.toString(),
                        scriptPath.toString(),
                        jsonPayload
                );

                ProcessBuilder processBuilder = new ProcessBuilder(command);
                processBuilder.directory(ProjectPaths.projectRoot().toFile());
                processBuilder.redirectErrorStream(true);
                Process process = processBuilder.start();

                boolean finished = process.waitFor(120, TimeUnit.SECONDS);
                if (!finished) {
                    process.destroyForcibly();
                    throw new RuntimeException("Python execution timeout");
                }

                if (process.exitValue() != 0) {
                    System.out.println("[AI] 비정상 종료 코드: " + process.exitValue());
                    continue;
                }

                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        System.out.println("[Python] " + line);
                        if (line.contains("@@AI_RESULT@@")) {
                            String rawJson = line.substring(line.indexOf("@@AI_RESULT@@") + "@@AI_RESULT@@".length()).trim();
                            return objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
                        }
                    }
                }
            } catch (Exception e) {
                System.out.println("[AI] 시도 " + attempt + " 실패: " + e.getMessage());
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
