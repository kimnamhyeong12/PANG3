package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.LocalReportHtmlService;
import com.fieldwork.service.ReportHtmlRenderer;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/local-reports")
public class LocalReportHtmlController {
    private final LocalReportHtmlService reports;
    private final ReportHtmlRenderer maps;
    public LocalReportHtmlController(LocalReportHtmlService reports, ReportHtmlRenderer maps) {
        this.reports = reports; this.maps = maps;
    }
    @GetMapping("/progress/{id}/html-data")
    public ResponseEntity<Map<String, Object>> individual(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reports.descriptor("progress", id, CurrentUser.id()));
    }
    @GetMapping("/compiled/{id}/html-data")
    public ResponseEntity<Map<String, Object>> compiled(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reports.descriptor("compiled", id, CurrentUser.id()));
    }
    @GetMapping("/progress/{id}/overview")
    public ResponseEntity<byte[]> overview(@PathVariable Long id) {
        var image = maps.overviewMap(reports.source("progress", id, CurrentUser.id()));
        return image == null ? ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
                : ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_JPEG).body(image.jpeg());
    }
}
