package com.fieldwork.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {TaskProgressController.class, GroupReportController.class})
public class TaskProgressExceptionHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException failure) {
        return ResponseEntity.badRequest().body(Map.of("message", failure.getMessage() == null ? "요청 내용을 확인해 주세요." : failure.getMessage()));
    }
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> unavailable(IllegalStateException failure) {
        return ResponseEntity.status(503).body(Map.of("message", "보고서 파일을 만들지 못했습니다. 작성한 기록은 유지됩니다. 다시 시도하세요."));
    }
}
