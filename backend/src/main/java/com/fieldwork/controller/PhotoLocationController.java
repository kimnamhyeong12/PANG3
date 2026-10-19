package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.PhotoLocationService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

@RestController
@RequestMapping("/api/locations/photos")
public class PhotoLocationController {
    private final PhotoLocationService service;

    public PhotoLocationController(PhotoLocationService service) { this.service = service; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> create(
            @RequestParam(value = "createdByUserId", required = false) Long createdByUserId,
            @RequestParam(value = "groupId", required = false) Long groupId,
            @RequestParam("name") String name,
            @RequestParam("lat") Double lat,
            @RequestParam("lng") Double lng,
            @RequestPart("photo") MultipartFile photo) throws Exception {
        Long userId = CurrentUser.require(createdByUserId);
        try {
            return ResponseEntity.ok(service.create(userId, groupId, name, lat, lng, photo));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage() == null ? "사진과 GPS 정보를 확인해 주세요." : ex.getMessage()));
        }
    }
}
