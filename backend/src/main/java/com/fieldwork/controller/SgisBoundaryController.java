package com.fieldwork.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldwork.service.SgisBoundaryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sgis")
public class SgisBoundaryController {

    private final SgisBoundaryService sgisBoundaryService;

    public SgisBoundaryController(SgisBoundaryService sgisBoundaryService) {
        this.sgisBoundaryService = sgisBoundaryService;
    }

    @GetMapping("/sahagu-boundaries")
    public JsonNode getSahaguBoundaries() {
        return sgisBoundaryService.getSahaguAdministrativeBoundaries();
    }

    @GetMapping("/boundaries")
    public JsonNode getAdministrativeBoundaries(
            @RequestParam String admCode) {
        return sgisBoundaryService.getAdministrativeBoundaries(admCode);
    }

    @GetMapping("/boundaries/by-region")
    public JsonNode getWorkRegionBoundaries(@RequestParam String sido, @RequestParam String sigungu) {
        return sgisBoundaryService.getWorkRegionBoundaries(sido, sigungu);
    }

    @GetMapping("/boundaries/by-sido")
    public JsonNode getAdministrativeDongBoundariesBySido(
            @RequestParam String sido) {
        return sgisBoundaryService.getSidoAdministrativeDongBoundaries(sido);
    }
}
