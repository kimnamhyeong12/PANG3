package com.fieldwork.controller;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// Only handles photo-visit requests. No raw SQL, file paths or exception details
// are returned to the app. A reference ID links the response to server logs.
@RestControllerAdvice(assignableTypes = PhotoLocationController.class)
public class PhotoLocationExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(PhotoLocationExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handle(Exception error) {
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        int status = 500;
        String code = "PHOTO_INTERNAL";
        String message = "사진 등록 중 서버 내부 오류가 발생했습니다. 오류 코드를 관리자에게 전달해 주세요.";
        // Preserve existing 4xx errors, including storage quota and malformed multipart requests.
        if (error instanceof ErrorResponse response) {
            status = response.getStatusCode().value();
            code = "PHOTO_REQUEST_REJECTED";
            message = status < 500 && response.getBody().getDetail() != null
                    ? response.getBody().getDetail() : message;
        } else {
            SQLException sql = null;
            boolean dataFailure = false, fileFailure = false;
            Throwable current = error;
            for (int depth = 0; current != null && depth < 20; depth++, current = current.getCause()) {
                if (current instanceof SQLException candidate) sql = candidate;
                if (current instanceof DataAccessException) dataFailure = true;
                if (current instanceof IOException) fileFailure = true;
            }
            if (sql != null || dataFailure) {
                code = "PHOTO_DB_WRITE";
                message = "사진 등록 중 DB 저장에 실패했습니다. 서버 DB 설정과 배포된 백엔드를 확인해 주세요.";
                String state = sql == null ? null : sql.getSQLState();
                if ("23502".equals(state)) {
                    code = "PHOTO_DB_REQUIRED";
                    message = "서버 DB의 필수 컬럼 값이 비어 저장이 거절되었습니다. DB 구조와 엔티티를 확인해 주세요.";
                } else if ("42703".equals(state) || "42P01".equals(state)) {
                    code = "PHOTO_DB_SCHEMA";
                    message = "서버 DB에 필요한 테이블 또는 컬럼이 없습니다. DB 구조와 배포된 소스를 확인해 주세요.";
                } else if (state != null && state.startsWith("08")) {
                    code = "PHOTO_DB_CONNECTION";
                    message = "서버에서 DB에 연결하지 못했습니다. DB 연결 상태를 확인해 주세요.";
                }
            } else if (fileFailure) {
                code = "PHOTO_STORAGE_IO";
                message = "서버에 사진 파일을 저장하지 못했습니다. 업로드 폴더의 쓰기 권한·경로·디스크 공간을 확인해 주세요.";
            }
        }
        if (status >= 500) log.error("Photo import failed [{}] {}", requestId, code, error);
        else log.warn("Photo import rejected [{}] {} status={}", requestId, code, status);
        return ResponseEntity.status(status).body(Map.of("message", message, "errorCode", code, "requestId", requestId));
    }
}
