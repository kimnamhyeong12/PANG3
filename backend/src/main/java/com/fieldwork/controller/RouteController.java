package com.fieldwork.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fieldwork.service.RouteService;

@SuppressWarnings("unchecked")
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

        List<Map<String, Object>> locations =
                (List<Map<String, Object>>) body.get("locations");

        Map<String, Object> currentLocation =
                (Map<String, Object>) body.get("currentLocation");

        String transportMode = String.valueOf(
                body.getOrDefault("transportMode", "car")
        );

        return routeService.optimizeRoute(currentLocation, locations, transportMode);
    }

    @PostMapping("/segment")
    public Map<String, Object> getSegmentRoute(@RequestBody Map<String, Object> body) {
        Map<String, Object> start =
                (Map<String, Object>) body.get("start");

        Map<String, Object> end =
                (Map<String, Object>) body.get("end");

        String transportMode = String.valueOf(
                body.getOrDefault("transportMode", "car")
        );

        return routeService.getSingleSegmentPath(start, end, transportMode);
    }
}