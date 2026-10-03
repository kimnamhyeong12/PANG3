package com.fieldwork.controller;

import com.fieldwork.dto.PublicDataItem;
import com.fieldwork.service.PublicDataService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/public-data")
public class PublicDataController {

    private final PublicDataService publicDataService;

    public PublicDataController(PublicDataService publicDataService) {
        this.publicDataService = publicDataService;
    }

    @GetMapping
    public Map<String, Object> getPublicData(
            @RequestParam String category,
            @RequestParam(required = false) String admCode,
            @RequestParam(required = false) String sido,
            @RequestParam(required = false) String sigungu,
            @RequestParam(required = false) String adminDong
    ) {
        List<PublicDataItem> items = publicDataService.getPublicData(
                category,
                admCode,
                sido,
                sigungu,
                adminDong
        );

        return Map.of(
                "category", category,
                "items", items
        );
    }
}
