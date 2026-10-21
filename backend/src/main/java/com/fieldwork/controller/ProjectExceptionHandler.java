package com.fieldwork.controller;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestControllerAdvice(assignableTypes = {ProjectController.class, CompiledReportController.class})
public class ProjectExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> status(ResponseStatusException failure) {
        String message = failure.getReason() == null ? "요청을 처리할 수 없습니다." : failure.getReason();
        return ResponseEntity.status(failure.getStatusCode()).body(Map.of("message", message));
    }

    /** e.g. two members adding the same record at the same moment (unique report_id + progress_id). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> conflict(DataIntegrityViolationException failure) {
        return ResponseEntity.status(409).body(Map.of("message", "이미 담긴 기록이 있습니다. 목록을 새로 고친 뒤 다시 시도해 주세요."));
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> invalid(Exception failure) {
        return ResponseEntity.badRequest().body(Map.of("message", "요청 내용을 확인해 주세요."));
    }
}
