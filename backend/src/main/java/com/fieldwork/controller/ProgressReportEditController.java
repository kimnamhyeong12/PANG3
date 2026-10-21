package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.ProgressReportEditService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 보고서 보관함 건별 보고서 편집 (제목·본문·사진 설명). */
@RestController
@RequestMapping("/api/progress-reports/{progressId}")
public class ProgressReportEditController {
    private final ProgressReportEditService service;

    public ProgressReportEditController(ProgressReportEditService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> get(@PathVariable Long progressId) {
        return service.get(progressId, CurrentUser.id());
    }

    @PatchMapping
    public Map<String, Object> update(@PathVariable Long progressId, @RequestBody Map<String, Object> body) {
        return service.update(progressId, CurrentUser.id(), body);
    }
}
