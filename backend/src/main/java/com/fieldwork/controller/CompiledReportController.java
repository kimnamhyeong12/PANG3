package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.CompiledReportHwpxService;
import com.fieldwork.service.CompiledReportService;
import com.fieldwork.service.ReportHtmlRenderer;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/compiled-reports/{reportId}")
public class CompiledReportController {
    private static final MediaType HTML_UTF8 = new MediaType("text", "html", StandardCharsets.UTF_8);
    private final CompiledReportService reports;
    private final ReportHtmlRenderer renderer;
    private final CompiledReportHwpxService hwpx;

    public CompiledReportController(CompiledReportService reports, ReportHtmlRenderer renderer, CompiledReportHwpxService hwpx) {
        this.reports = reports;
        this.renderer = renderer;
        this.hwpx = hwpx;
    }

    @GetMapping
    public Map<String, Object> get(@PathVariable Long reportId, @RequestParam(required = false) Long userId) {
        return reports.getJson(reportId, CurrentUser.require(userId));
    }

    @PatchMapping
    public Map<String, Object> update(@PathVariable Long reportId, @RequestBody Map<String, Object> body) {
        return reports.update(reportId, CurrentUser.require(body.get("userId")), body);
    }

    @PostMapping("/items")
    public Map<String, Object> addItems(@PathVariable Long reportId, @RequestBody Map<String, Object> body) {
        return reports.addItems(reportId, CurrentUser.require(body.get("userId")), body.get("progressIds"));
    }

    @PatchMapping("/items/{progressId}")
    public Map<String, Object> updateItem(@PathVariable Long reportId, @PathVariable Long progressId,
            @RequestBody Map<String, Object> body) {
        return reports.updateItem(reportId, progressId, CurrentUser.require(body.get("userId")), body);
    }

    @DeleteMapping("/items/{progressId}")
    public Map<String, Object> removeItem(@PathVariable Long reportId, @PathVariable Long progressId,
            @RequestParam(required = false) Long userId) {
        return reports.removeItem(reportId, progressId, CurrentUser.require(userId));
    }

    @GetMapping("/html")
    public ResponseEntity<String> html(@PathVariable Long reportId, @RequestParam(required = false) Long userId) {
        // JSON is built inside a transaction; photo embedding runs here, outside of it.
        Map<String, Object> json = reports.getJson(reportId, CurrentUser.require(userId));
        return ResponseEntity.ok().contentType(HTML_UTF8).body(renderer.render(json));
    }

    @PostMapping("/finalize")
    public Map<String, Object> finalizeReport(@PathVariable Long reportId, @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) Long userId) {
        return reports.finalizeReport(reportId, CurrentUser.require(userId != null ? userId : body == null ? null : body.get("userId")));
    }

    @PostMapping("/revise")
    public Map<String, Object> revise(@PathVariable Long reportId, @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) Long userId) {
        return reports.revise(reportId, CurrentUser.require(userId != null ? userId : body == null ? null : body.get("userId")));
    }

    @GetMapping("/versions")
    public List<Map<String, Object>> versions(@PathVariable Long reportId, @RequestParam(required = false) Long userId) {
        return reports.versions(reportId, CurrentUser.require(userId));
    }

    @PostMapping("/hwpx/prepare")
    public Map<String, Object> prepareHwpx(@PathVariable Long reportId, @RequestParam(required = false) Long userId) {
        return hwpx.prepare(reportId, CurrentUser.require(userId));
    }

    @GetMapping("/hwpx/{key}/download")
    public ResponseEntity<Resource> downloadHwpx(@PathVariable Long reportId, @PathVariable String key,
            @RequestParam(required = false) Long userId) {
        CompiledReportHwpxService.Prepared file = hwpx.download(reportId, key, CurrentUser.require(userId));
        // ASCII fallback + RFC 5987 UTF-8 name, same as TaskProgressController downloads.
        String encoded = URLEncoder.encode(file.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        String disposition = "attachment; filename=\"compiled_report_" + reportId + ".hwpx\"; filename*=UTF-8''" + encoded;
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .contentType(MediaType.APPLICATION_OCTET_STREAM).body(new FileSystemResource(file.path()));
    }
}
