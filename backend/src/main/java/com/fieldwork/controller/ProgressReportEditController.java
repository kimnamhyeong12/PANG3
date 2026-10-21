package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.ProgressReportEditService;
import com.fieldwork.service.ReportHtmlRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/** 보고서 보관함 건별 보고서 편집 (제목·본문·사진 설명). */
@RestController
@RequestMapping("/api/progress-reports/{progressId}")
public class ProgressReportEditController {
    private static final MediaType HTML_UTF8 = new MediaType("text", "html", StandardCharsets.UTF_8);
    private final ProgressReportEditService service;
    private final ReportHtmlRenderer renderer;

    public ProgressReportEditController(ProgressReportEditService service, ReportHtmlRenderer renderer) {
        this.service = service;
        this.renderer = renderer;
    }

    @GetMapping
    public Map<String, Object> get(@PathVariable Long progressId) {
        return service.get(progressId, CurrentUser.id());
    }

    /** 건별 보고서 HTML (통합 보고서와 같은 지도+카드 양식, 한 건). 앱 미리보기·웹 HTML 저장. */
    @GetMapping("/html")
    public ResponseEntity<String> html(@PathVariable Long progressId) {
        return ResponseEntity.ok().contentType(HTML_UTF8).body(renderer.render(service.htmlJson(progressId, CurrentUser.id())));
    }

    @PatchMapping
    public Map<String, Object> update(@PathVariable Long progressId, @RequestBody Map<String, Object> body) {
        return service.update(progressId, CurrentUser.id(), body);
    }
}
