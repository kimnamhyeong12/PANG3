package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.LocalReportService;
import com.fieldwork.service.StaticMapService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/local-reports")
public class LocalReportController {
    private final LocalReportService reports;
    public LocalReportController(LocalReportService reports) { this.reports = reports; }

    @GetMapping("/progress/{id}")
    public ResponseEntity<Map<String, Object>> individual(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reports.individual(id, CurrentUser.id()));
    }
    @GetMapping("/compiled/{id}")
    public ResponseEntity<Map<String, Object>> compiled(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reports.compiled(id, CurrentUser.id()));
    }
    @GetMapping("/progress/{id}/map")
    public ResponseEntity<byte[]> individualMap(@PathVariable Long id) {
        return image(reports.individualMap(id, CurrentUser.id()));
    }
    @GetMapping("/compiled/{id}/map/{index}")
    public ResponseEntity<byte[]> compiledMap(@PathVariable Long id, @PathVariable Integer index) {
        return image(reports.compiledMap(id, CurrentUser.id(), index));
    }
    @GetMapping("/compiled/{id}/overview")
    public ResponseEntity<byte[]> overview(@PathVariable Long id) {
        return image(reports.compiledMap(id, CurrentUser.id(), null));
    }
    private static ResponseEntity<byte[]> image(StaticMapService.MapImage image) {
        return image == null ? ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
                : ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_JPEG).body(image.jpeg());
    }
}
