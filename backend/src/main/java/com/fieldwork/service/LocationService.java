package com.fieldwork.service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.Location;
import com.fieldwork.repository.LocationRepository;

@SuppressWarnings("unchecked")
@Service
public class LocationService {

    private final LocationRepository repo;

    public LocationService(LocationRepository repo) {
        this.repo = repo;
    }

    public List<Location> getAllLocations() {
        return repo.findAll();
    }

    public Location saveLocation(Location location) {
        location.setStatus("작업대기");
        Location savedLocation = repo.save(location);

        try {
            Map<String, Object> pythonPayload = new HashMap<>();
            pythonPayload.put("location_name", savedLocation.getAddress());
            pythonPayload.put("task_category", savedLocation.getName());
            pythonPayload.put("field_memo", savedLocation.getFieldMemo());
            pythonPayload.put("latitude", savedLocation.getLat());
            pythonPayload.put("longitude", savedLocation.getLng());
            pythonPayload.put("main_comment", "현장 점검에 따른 긴급 조치 및 모니터링 요망");
            pythonPayload.put("output_dir", "output");

            // 가변 이미지 리스트 바인딩 (S3 연동 전 임시 mock 데이터 구성)
            List<Map<String, String>> fieldPhotos = new ArrayList<>();
            
            Map<String, String> photo1 = new HashMap<>();
            photo1.put("path", "test2.jpeg");
            photo1.put("comment", "현장사진 (전) | 인도 보행로 및 경계석 파손 심각 상태");
            fieldPhotos.add(photo1);

            Map<String, String> photo2 = new HashMap<>();
            photo2.put("path", "test2.jpeg");
            photo2.put("comment", "현장사진 (후) | 현장 임시 안전 조치 및 고깔 배치 완료");
            fieldPhotos.add(photo2);

            pythonPayload.put("field_photos", fieldPhotos);

            System.out.println("[Java Backend] DB 1차 저장 완료 (ID: " + savedLocation.getId() + "). 파이썬 가동.");

            ObjectMapper objectMapper = new ObjectMapper();
            String jsonPayload = objectMapper.writeValueAsString(pythonPayload);
            String aiRefinedContent = callPythonAiEngineWithRetry(jsonPayload);

            if (aiRefinedContent != null && !aiRefinedContent.isEmpty()) {
                savedLocation.setAiRefinedContent(aiRefinedContent);
            } else {
                savedLocation.setAiRefinedContent("AI 현장 분석을 수행하지 못했습니다. (연동 에러)");
            }

        } catch (Exception e) {
            System.out.println("[Java Backend] 페이로드 가공 중 예외 발생");
            savedLocation.setAiRefinedContent("AI 페이로드 조립 실패");
            e.printStackTrace();
        }

        return repo.save(savedLocation);
    }

    public Location updateStatus(Long id, String status) {
        Location location = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Location not found"));
        location.setStatus(status);
        return repo.save(location);
    }

    private String callPythonAiEngineWithRetry(String jsonPayload) {
        int maxRetries = 3;      
        int retryDelayMs = 2000; 
        
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                String pythonExecutable = "./ai/venv/bin/python";
                String pythonScript = "./ai/app.py";

                List<String> command = new ArrayList<>();
                command.add(pythonExecutable);
                command.add(pythonScript);
                command.add(jsonPayload);

                ProcessBuilder processBuilder = new ProcessBuilder(command);
                processBuilder.redirectErrorStream(true); 

                Process process = processBuilder.start();

                // 60초 프로세스 타임아웃 제어
                boolean finished = process.waitFor(60, TimeUnit.SECONDS);
                if (!finished) {
                    System.out.println("[Timeout] 파이썬 프로세스 응답 지연으로 강제 종료합니다.");
                    process.destroyForcibly(); 
                    throw new RuntimeException("Python execution timeout");
                }

                int exitCode = process.exitValue();
                if (exitCode == 0) {
                    BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)
                    );
                    String line;
                    while ((line = reader.readLine()) != null) {
                        System.out.println("[Python Log] " + line);
                        
                        // @@AI_RESULT@@ 마커 라인을 식별하여 JSON 결과 파싱
                        if (line.contains("@@AI_RESULT@@")) {
                            String rawJson = line.substring(line.indexOf("@@AI_RESULT@@") + "@@AI_RESULT@@".length()).trim();
                            ObjectMapper mapper = new ObjectMapper();
                            Map<String, Object> resultMap = mapper.readValue(rawJson, Map.class);
                            return (String) resultMap.get("ai_refined_content");
                        }
                    }
                }
                System.out.println("[실패] 파이썬 비정상 종료 코드: " + exitCode + " (시도: " + attempt + "/" + maxRetries + ")");
                
            } catch (Exception e) {
                System.out.println("[예외] 파이썬 연동 실패: " + e.getMessage() + " (시도: " + attempt + "/" + maxRetries + ")");
            }

            if (attempt < maxRetries) {
                try { Thread.sleep(retryDelayMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }
        return null; 
    }
}