package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class SpeechService {

    private final FieldworkProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SpeechService(FieldworkProperties properties) {
        this.properties = properties;
    }

    public Map<String, Object> transcribe(MultipartFile audio) {
        Map<String, Object> error = new HashMap<>();

        if (audio == null || audio.isEmpty()) {
            error.put("ok", false);
            error.put("error", "음성 파일이 없습니다.");
            return error;
        }

        Path tempFile = null;
        try {
            String original = audio.getOriginalFilename();
            String suffix = ".m4a";
            if (original != null && original.contains(".")) {
                String ext = original.substring(original.lastIndexOf('.'));
                if (ext.length() <= 8) suffix = ext;
            }

            tempFile = Files.createTempFile("fieldwork-stt-", suffix);
            Files.copy(audio.getInputStream(), tempFile, StandardCopyOption.REPLACE_EXISTING);

            Path pythonPath = ProjectPaths.resolve(properties.getAi().getPythonPath());
            Path scriptPath = ProjectPaths.resolve(properties.getAi().getScriptPath());

            List<String> command = List.of(
                    pythonPath.toString(),
                    scriptPath.toString(),
                    "--stt",
                    tempFile.toAbsolutePath().toString()
            );

            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.directory(ProjectPaths.projectRoot().toFile());
            processBuilder.redirectErrorStream(true);
            Process process = processBuilder.start();

            boolean finished = process.waitFor(90, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RuntimeException("음성 변환 시간이 초과되었습니다.");
            }

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    System.out.println("[STT Python] " + line);
                    if (line.contains("@@AI_RESULT@@")) {
                        String rawJson = line.substring(
                                line.indexOf("@@AI_RESULT@@") + "@@AI_RESULT@@".length()
                        ).trim();
                        return objectMapper.readValue(
                                rawJson,
                                new TypeReference<Map<String, Object>>() {}
                        );
                    }
                }
            }

            throw new RuntimeException("음성 변환 결과를 받지 못했습니다.");
        } catch (Exception e) {
            error.put("ok", false);
            error.put("error", e.getMessage());
            return error;
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (Exception ignored) {
                }
            }
        }
    }
}
