package com.fieldwork.controller;

import com.fieldwork.service.VisitOrderService;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/routes")
public class VisitOrderController {
    private final VisitOrderService service;
    private final com.fieldwork.service.RouteRequestGuard guard;
    public VisitOrderController(VisitOrderService service, com.fieldwork.service.RouteRequestGuard guard) { this.service = service; this.guard = guard; }
    public record OrderRequest(Map<String, Object> currentLocation, List<Map<String, Object>> locations,
            Map<String, Object> returnLocation, String pinnedKey, String transportMode,
            String cacheScope, Boolean guidanceStart) {}
    @PostMapping("/order")
    public Map<String, Object> recommend(@RequestBody OrderRequest body, @RequestHeader(value="X-Kakao-Walk-Key",required=false) String walkingKey) {
        return guard.call("order", body, walkingKey, () -> service.recommend(body.currentLocation(), body.locations(), body.returnLocation(), body.pinnedKey(),
                body.transportMode() == null ? "car" : body.transportMode(), walkingKey,
                com.fieldwork.security.CurrentUser.id(), body.cacheScope(), body.guidanceStart()==null || body.guidanceStart()));
    }
}
