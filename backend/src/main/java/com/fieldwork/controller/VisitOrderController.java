package com.fieldwork.controller;

import com.fieldwork.service.VisitOrderService;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/routes")
public class VisitOrderController {
    private final VisitOrderService service;
    public VisitOrderController(VisitOrderService service) { this.service = service; }
    public record OrderRequest(Map<String, Object> currentLocation, List<Map<String, Object>> locations,
            Map<String, Object> returnLocation, String pinnedKey, String transportMode) {}
    @PostMapping("/order")
    public Map<String, Object> recommend(@RequestBody OrderRequest body) {
        return service.recommend(body.currentLocation(), body.locations(), body.returnLocation(), body.pinnedKey(),
                body.transportMode() == null ? "car" : body.transportMode());
    }
}
