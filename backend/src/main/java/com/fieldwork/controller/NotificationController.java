package com.fieldwork.controller;

import com.fieldwork.service.PushNotificationService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@CrossOrigin(origins = "*")
public class NotificationController {

    private final PushNotificationService pushNotificationService;

    public NotificationController(
            PushNotificationService pushNotificationService
    ) {
        this.pushNotificationService = pushNotificationService;
    }

    @PostMapping("/tokens")
    public Map<String, Object> registerToken(
            @RequestBody Map<String, Object> body
    ) {
        return pushNotificationService.registerToken(
                longValue(body.get("userId")),
                stringValue(body.get("expoPushToken")),
                stringValue(body.get("platform"))
        );
    }

    @DeleteMapping("/tokens")
    public Map<String, Object> unregisterToken(
            @RequestBody Map<String, Object> body
    ) {
        return pushNotificationService.unregisterToken(
                longValue(body.get("userId")),
                stringValue(body.get("expoPushToken"))
        );
    }

    private Long longValue(Object value) {
        if (value == null || value.toString().isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.valueOf(value.toString());
    }

    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }
}
