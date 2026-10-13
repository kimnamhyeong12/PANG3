package com.fieldwork.controller;

import com.fieldwork.dto.BulkLocationRequest;
import com.fieldwork.service.BulkLocationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/locations/bulk")
@CrossOrigin(origins = "*")
public class BulkLocationController {
    private final BulkLocationService bulkLocationService;

    public BulkLocationController(BulkLocationService bulkLocationService) {
        this.bulkLocationService = bulkLocationService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> upload(@RequestBody BulkLocationRequest request) {
        try {
            return ResponseEntity.ok(bulkLocationService.importLocations(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        }
    }
}
