package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.PushToken;
import com.fieldwork.entity.User;
import com.fieldwork.repository.PushTokenRepository;
import com.fieldwork.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PushNotificationService {

    public static final String TYPE_TASK_ASSIGNED = "TASK_ASSIGNED";
    public static final String TYPE_ASSIGNEE_CHANGED = "ASSIGNEE_CHANGED";
    public static final String TYPE_PRIORITY_CHANGED = "PRIORITY_CHANGED";
    public static final String TYPE_MORNING_SUMMARY = "MORNING_SUMMARY";
    public static final String TYPE_END_OF_DAY_INCOMPLETE = "END_OF_DAY_INCOMPLETE";

    private static final URI EXPO_PUSH_URI =
            URI.create("https://exp.host/--/api/v2/push/send");

    private final PushTokenRepository pushTokenRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public PushNotificationService(
            PushTokenRepository pushTokenRepository,
            UserRepository userRepository,
            ObjectMapper objectMapper
    ) {
        this.pushTokenRepository = pushTokenRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @Transactional
    public Map<String, Object> registerToken(
            Long userId,
            String expoPushToken,
            String platform
    ) {
        if (userId == null) {
            throw new RuntimeException("userId가 필요합니다.");
        }
        if (expoPushToken == null || expoPushToken.isBlank()) {
            throw new RuntimeException("expoPushToken이 필요합니다.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));

        String normalizedToken = expoPushToken.trim();

        PushToken token = pushTokenRepository
                .findByExpoPushToken(normalizedToken)
                .orElseGet(PushToken::new);

        token.setUser(user);
        token.setExpoPushToken(normalizedToken);
        token.setPlatform(platform == null ? null : platform.trim());
        token.setActive(true);

        PushToken saved = pushTokenRepository.save(token);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pushTokenId", saved.getPushTokenId());
        result.put("userId", user.getUserId());
        result.put("platform", saved.getPlatform());
        result.put("active", saved.isActive());
        result.put("message", "Push Token이 등록되었습니다.");
        return result;
    }

    @Transactional
    public Map<String, Object> unregisterToken(
            Long userId,
            String expoPushToken
    ) {
        if (userId == null || expoPushToken == null || expoPushToken.isBlank()) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("removed", false);
            result.put("message", "해제할 Push Token 정보가 없습니다.");
            return result;
        }

        PushToken token = pushTokenRepository
                .findByExpoPushToken(expoPushToken.trim())
                .orElse(null);

        boolean removed = false;

        if (token != null
                && token.getUser() != null
                && userId.equals(token.getUser().getUserId())) {
            token.setActive(false);
            pushTokenRepository.save(token);
            removed = true;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("removed", removed);
        result.put("message", removed
                ? "Push Token 연결을 해제했습니다."
                : "등록된 Push Token이 없습니다.");
        return result;
    }

    public void sendToUserAfterCommit(
            Long userId,
            String title,
            String body,
            Map<String, Object> data
    ) {
        Runnable action = () -> sendToUser(userId, title, body, data);

        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            action.run();
                        }
                    }
            );
            return;
        }

        action.run();
    }

    public void sendToUser(
            Long userId,
            String title,
            String body,
            Map<String, Object> data
    ) {
        if (userId == null) {
            return;
        }

        try {
            User user = userRepository.findById(userId).orElse(null);
            if (user == null) {
                return;
            }

            List<PushToken> tokens =
                    pushTokenRepository.findByUserAndActiveTrue(user);

            for (PushToken token : tokens) {
                sendToExpoToken(
                        token.getExpoPushToken(),
                        title,
                        body,
                        data
                );
            }
        } catch (Exception error) {
            System.out.println(
                    "[Notification] 사용자 Push 전송 실패 userId="
                            + userId + " / " + error.getMessage()
            );
        }
    }

    private void sendToExpoToken(
            String expoPushToken,
            String title,
            String body,
            Map<String, Object> data
    ) {
        if (expoPushToken == null || expoPushToken.isBlank()) {
            return;
        }

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("to", expoPushToken);
            payload.put("title", title);
            payload.put("body", body);
            payload.put("sound", "default");
            payload.put("channelId", "task");
            payload.put("priority", "high");
            payload.put(
                    "data",
                    data == null ? Map.of() : data
            );

            String json = objectMapper.writeValueAsString(payload);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(EXPO_PUSH_URI)
                    .timeout(Duration.ofSeconds(10))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                System.out.println(
                        "[Notification] Expo Push HTTP 실패 status="
                                + response.statusCode()
                );
                return;
            }

            // Expo가 200을 반환해도 ticket 자체가 error일 수 있어 최소한 확인한다.
            try {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode status = root.path("data").path("status");
                if (status.isTextual() && "error".equalsIgnoreCase(status.asText())) {
                    System.out.println(
                            "[Notification] Expo Push ticket 오류: "
                                    + root.path("data").path("message").asText("unknown")
                    );
                }
            } catch (Exception ignored) {
                // 응답 파싱 실패가 실제 업무 흐름을 막지 않도록 무시한다.
            }
        } catch (Exception error) {
            System.out.println(
                    "[Notification] Expo Push 전송 실패: "
                            + error.getMessage()
            );
        }
    }
}
