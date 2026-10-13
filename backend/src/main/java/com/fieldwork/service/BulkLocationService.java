package com.fieldwork.service;

import com.fieldwork.dto.BulkLocationRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Uses the existing TaskService transaction for each successfully validated row.
 * For large imports, the client must send successive requests of <= 200 rows.
 */
@Service
public class BulkLocationService {
    private final TaskService taskService;
    private static final int MAX_ROWS_PER_REQUEST = 200;

    public BulkLocationService(TaskService taskService) {
        this.taskService = taskService;
    }

    public Map<String, Object> importLocations(BulkLocationRequest request) {
        if (request == null || request.createdByUserId() == null || request.createdByUserId() <= 0) {
            throw new IllegalArgumentException("createdByUserId가 필요합니다.");
        }
        if (request.groupId() != null && request.groupId() <= 0) {
            throw new IllegalArgumentException("groupId가 올바르지 않습니다.");
        }
        if (request.locations() == null || request.locations().isEmpty()
                || request.locations().size() > MAX_ROWS_PER_REQUEST) {
            throw new IllegalArgumentException("한 요청에는 1~200개 행을 보내야 합니다.");
        }

        int saved = 0;
        List<Map<String, Object>> failures = new ArrayList<>();
        List<Long> savedTaskIds = new ArrayList<>();

        for (int i = 0; i < request.locations().size(); i++) {
            BulkLocationRequest.Row row = request.locations().get(i);
            int rowNumber = row != null && row.rowNumber() != null ? row.rowNumber() : i + 1;
            try {
                if (row == null) throw new IllegalArgumentException("빈 행입니다.");
                String roadAddress = trimToNull(row.roadAddress());
                // Compatibility with the previous client: address belongs to road_address only.
                if (roadAddress == null) roadAddress = trimToNull(row.address());
                String detailAddress = trimToNull(row.detailAddress());
                String name = trimToNull(row.name());
                String displayName = name != null ? name
                        : detailAddress != null ? detailAddress
                          : roadAddress != null ? roadAddress : "방문지 " + rowNumber;
                if (displayName.length() > 255) {
                    throw new IllegalArgumentException("방문지 이름은 255자 이하여야 합니다.");
                }
                String latitude = trimToNull(row.lat());
                String longitude = trimToNull(row.lng());

                Double lat = parseCoordinate(latitude, -90, 90, "위도");
                Double lng = parseCoordinate(longitude, -180, 180, "경도");

                if (lat == null || lng == null) {
                    throw new IllegalArgumentException("위도와 경도가 모두 필요합니다.");
                }

                Map<String, Object> body = new HashMap<>();
                body.put("createdByUserId", request.createdByUserId());
                if (request.groupId() != null) body.put("groupId", request.groupId());
                body.put("roadAddress", roadAddress);
                // Existing screens and TaskService use detailAddress as the display name.
                body.put("detailAddress", displayName);
                body.put("lat", lat);
                body.put("lng", lng);
                body.put("status", "pending");

                // TaskService also creates the LocationAssignment entry.
                Map<String, Object> result = taskService.createFromFrontendBody(body);
                Object taskId = result.get("taskId");
                if (taskId instanceof Number number) savedTaskIds.add(number.longValue());
                saved++;
            } catch (IllegalArgumentException ex) {
                failures.add(Map.of("rowNumber", rowNumber, "reason", ex.getMessage() == null ? "입력값 오류" : ex.getMessage()));
            } catch (Exception ex) {
                // Avoid exposing database or internal exception text to clients.
                failures.add(Map.of("rowNumber", rowNumber, "reason", "저장 실패: 서버 로그를 확인하세요."));
            }
        }

        Map<String, Object> response = new HashMap<>();
        response.put("totalCount", request.locations().size());
        response.put("savedCount", saved);
        response.put("failedCount", failures.size());
        response.put("failures", failures);
        response.put("savedTaskIds", savedTaskIds);
        return response;
    }

    private static String trimToNull(String text) {
        if (text == null) return null;
        String normalized = text.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static Double parseCoordinate(String text, double min, double max, String label) {
        if (text == null) return null;
        double number;
        try {
            number = Double.parseDouble(text);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(label + "가 숫자가 아닙니다.");
        }
        if (!Double.isFinite(number) || number < min || number > max) {
            throw new IllegalArgumentException(label + " 범위가 올바르지 않습니다.");
        }
        return number;
    }
}
