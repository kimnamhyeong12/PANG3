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
            @RequestParam(defaultValue = "21100") String admCode) {
        return sgisBoundaryService.getAdministrativeBoundaries(admCode);
    }
}
