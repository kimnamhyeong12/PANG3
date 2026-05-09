package com.fieldwork.controller;

import com.fieldwork.service.RouteService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/routes")
@CrossOrigin("*")
public class RouteController {

    private final RouteService routeService;

    public RouteController(RouteService routeService) {
        this.routeService = routeService;
    }

    @PostMapping("/optimize")
    public Map<String, Object> optimizeRoute(@RequestBody Map<String, Object> body) {
        System.out.println("=== /api/routes/optimize 호출됨 ===");
        System.out.println(body);

        List<Map<String, Object>> locations = (List<Map<String, Object>>) body.get("locations");

        return routeService.optimizeRoute(locations);
    }
}
