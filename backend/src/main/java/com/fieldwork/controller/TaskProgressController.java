package com.fieldwork.controller;

import com.fieldwork.entity.TaskProgress;
import com.fieldwork.service.TaskProgressService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

@RestController
@RequestMapping("/api/task-progress")
@CrossOrigin(origins = "*")
public class TaskProgressController {

    private final TaskProgressService taskProgressService;

    public TaskProgressController(TaskProgressService taskProgressService) {
        this.taskProgressService = taskProgressService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> saveProgressMultipart(MultipartHttpServletRequest request) throws Exception {
        return taskProgressService.saveFromMultipart(request);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> saveProgressJson(@RequestBody Map<String, Object> body) throws Exception {
        return taskProgressService.saveFromJson(body);
    }

    @GetMapping("/task/{taskId}")
    public Map<String, Object> getProgressByTaskId(@PathVariable Long taskId) {
        return taskProgressService.getLatestByTaskId(taskId);
    }

    @GetMapping("/{progressId}/report/download")
    public ResponseEntity<Resource> downloadReport(@PathVariable Long progressId) {
        TaskProgress progress = taskProgressService.getById(progressId);
        String reportPath = progress.getReportFilePath();

        if (reportPath == null || reportPath.isBlank()) {
            return ResponseEntity.notFound().build();
        }

        Path file = Paths.get(reportPath);
        if (!file.toFile().exists()) {
            return ResponseEntity.notFound().build();
        }

        String filename = file.getFileName().toString();
        FileSystemResource resource = new FileSystemResource(file);

        // 파일명에 한글이 들어가면 Content-Disposition 헤더가 순수 UTF-8 바이트로
        // 전송되는데, HTTP 헤더는 원래 ASCII만 허용되는 값이라 일부 모바일
        // 브라우저(특히 iOS Safari 등)가 이 헤더를 못 읽고 확장자 없는
        // "download" 같은 이름으로 저장해버린다. 그래서 항상 ".hwpx"로 끝나는
        // ASCII 대체 파일명을 기본으로 주고, RFC 5987 인코딩된 원래 한글
        // 파일명은 filename*= 로 같이 보내서 지원하는 브라우저에서는 그걸 쓰게 한다.
        String extension = filename.contains(".")
                ? filename.substring(filename.lastIndexOf('.'))
                : ".hwpx";
        String asciiFallback = "report_" + progressId + extension;
        String encodedFilename = encodeRfc5987(filename);

        String contentDisposition = "attachment; filename=\"" + asciiFallback + "\""
                + "; filename*=UTF-8''" + encodedFilename;

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }

    private static String encodeRfc5987(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.name())
                    .replace("+", "%20");
        } catch (UnsupportedEncodingException e) {
            return "report.hwpx";
        }
    }
}
