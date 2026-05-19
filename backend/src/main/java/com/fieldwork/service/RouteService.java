package com.fieldwork.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class RouteService {

    @Value("${kakao.rest-api-key}")
    private String kakaoRestApiKey;

    @Value("${ors.api-key}")
    private String orsApiKey;

    private final RestTemplate restTemplate = new RestTemplate();

    public Map<String, Object> optimizeRoute(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations,
            String transportMode
    ) {
        if (locations == null || locations.size() < 2) {
            throw new IllegalArgumentException("방문지는 2개 이상 필요합니다.");
        }

        String mode = transportMode == null ? "car" : transportMode;

        List<Map<String, Object>> optimizedLocations =
                optimizeWithPriority(currentLocation, locations);

        Map<String, Object> routeResult;

        if (mode.equalsIgnoreCase("walk")) {
            routeResult = getOrsWalkingPath(currentLocation, optimizedLocations);
        } else {
            routeResult = getKakaoRoadPath(currentLocation, optimizedLocations);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("transportMode", mode);
        result.put("optimizedLocations", optimizedLocations);
        result.put("path", routeResult.get("path"));
        result.put("segments", routeResult.get("segments"));
        result.put("totalDistance", routeResult.get("totalDistance"));
        result.put("totalDuration", routeResult.get("totalDuration"));

        return result;
    }

    public Map<String, Object> optimizeRoute(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations
    ) {
        return optimizeRoute(currentLocation, locations, "car");
    }

    private List<Map<String, Object>> optimizeWithPriority(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations
    ) {
        List<Map<String, Object>> priorityLocations = new ArrayList<>();
        List<Map<String, Object>> normalLocations = new ArrayList<>();

        for (Map<String, Object> loc : locations) {
            Object priority = loc.get("priority");

            if (
                    priority != null &&
                    !String.valueOf(priority).equals("null") &&
                    !String.valueOf(priority).isBlank()
            ) {
                priorityLocations.add(loc);
            } else {
                normalLocations.add(loc);
            }
        }

        priorityLocations.sort((a, b) -> {
            int p1 = Integer.parseInt(String.valueOf(a.get("priority")));
            int p2 = Integer.parseInt(String.valueOf(b.get("priority")));
            return Integer.compare(p1, p2);
        });

        List<Map<String, Object>> result = new ArrayList<>();
        result.addAll(priorityLocations);

        if (!normalLocations.isEmpty()) {
            if (result.isEmpty()) {
                if (currentLocation != null) {
                    result.addAll(tspNearestNeighborFromStart(currentLocation, normalLocations));
                } else {
                    result.addAll(tspNearestNeighbor(normalLocations));
                }
            } else {
                Map<String, Object> lastPriorityLocation = result.get(result.size() - 1);
                result.addAll(tspNearestNeighborFromStart(lastPriorityLocation, normalLocations));
            }
        }

        return result;
    }

    private List<Map<String, Object>> tspNearestNeighbor(List<Map<String, Object>> locations) {
        List<Map<String, Object>> remaining = new ArrayList<>(locations);
        List<Map<String, Object>> result = new ArrayList<>();

        Map<String, Object> current = remaining.remove(0);
        result.add(current);

        while (!remaining.isEmpty()) {
            int nearestIndex = 0;
            double nearestDistance = getDistance(current, remaining.get(0));

            for (int i = 1; i < remaining.size(); i++) {
                double distance = getDistance(current, remaining.get(i));

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = i;
                }
            }

            current = remaining.remove(nearestIndex);
            result.add(current);
        }

        return result;
    }

    private List<Map<String, Object>> tspNearestNeighborFromStart(
            Map<String, Object> start,
            List<Map<String, Object>> locations
    ) {
        List<Map<String, Object>> remaining = new ArrayList<>(locations);
        List<Map<String, Object>> result = new ArrayList<>();

        Map<String, Object> current = start;

        while (!remaining.isEmpty()) {
            int nearestIndex = 0;
            double nearestDistance = getDistance(current, remaining.get(0));

            for (int i = 1; i < remaining.size(); i++) {
                double distance = getDistance(current, remaining.get(i));

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = i;
                }
            }

            current = remaining.remove(nearestIndex);
            result.add(current);
        }

        return result;
    }

    private double getDistance(Map<String, Object> a, Map<String, Object> b) {
        double lat1 = getLat(a);
        double lng1 = getLng(a);
        double lat2 = getLat(b);
        double lng2 = getLng(b);

        double dx = lat1 - lat2;
        double dy = lng1 - lng2;

        return Math.sqrt(dx * dx + dy * dy);
    }

    private Map<String, Object> getKakaoRoadPath(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations
    ) {
        List<Map<String, Object>> routePoints = makeRoutePoints(currentLocation, locations);

        List<Map<String, Double>> fullPath = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();

        int totalDistance = 0;
        int totalDuration = 0;

        for (int i = 0; i < routePoints.size() - 1; i++) {
            Map<String, Object> start = routePoints.get(i);
            Map<String, Object> end = routePoints.get(i + 1);

            String url = "https://apis-navi.kakaomobility.com/v1/directions"
                    + "?origin=" + getLng(start) + "," + getLat(start)
                    + "&destination=" + getLng(end) + "," + getLat(end)
                    + "&priority=RECOMMEND";

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "KakaoAK " + kakaoRestApiKey);

            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            Map<String, Object> body = response.getBody();

            if (body == null) continue;

            List<Map<String, Object>> routes =
                    (List<Map<String, Object>>) body.get("routes");

            if (routes == null || routes.isEmpty()) continue;

            Map<String, Object> route = routes.get(0);

            Map<String, Object> summary =
                    (Map<String, Object>) route.get("summary");

            if (summary != null) {
                totalDistance += ((Number) summary.getOrDefault("distance", 0)).intValue();
                totalDuration += ((Number) summary.getOrDefault("duration", 0)).intValue();
            }

            List<Map<String, Double>> segmentPath = new ArrayList<>();

            List<Map<String, Object>> sections =
                    (List<Map<String, Object>>) route.get("sections");

            if (sections == null) continue;

            for (Map<String, Object> section : sections) {
                List<Map<String, Object>> roads =
                        (List<Map<String, Object>>) section.get("roads");

                if (roads == null) continue;

                for (Map<String, Object> road : roads) {
                    List<Number> vertexes =
                            (List<Number>) road.get("vertexes");

                    if (vertexes == null) continue;

                    for (int j = 0; j < vertexes.size() - 1; j += 2) {
                        double lng = vertexes.get(j).doubleValue();
                        double lat = vertexes.get(j + 1).doubleValue();

                        Map<String, Double> point = new HashMap<>();
                        point.put("latitude", lat);
                        point.put("longitude", lng);

                        fullPath.add(point);
                        segmentPath.add(point);
                    }
                }
            }

            Map<String, Object> segment = makeSegment(i, start, end, segmentPath, "car");
            segments.add(segment);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("path", fullPath);
        result.put("segments", segments);
        result.put("totalDistance", totalDistance);
        result.put("totalDuration", totalDuration);

        return result;
    }

    private Map<String, Object> getOrsWalkingPath(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations
    ) {
        List<Map<String, Object>> routePoints = makeRoutePoints(currentLocation, locations);

        List<Map<String, Double>> fullPath = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();

        int totalDistance = 0;
        int totalDuration = 0;

        for (int i = 0; i < routePoints.size() - 1; i++) {
            Map<String, Object> start = routePoints.get(i);
            Map<String, Object> end = routePoints.get(i + 1);

            String url = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", orsApiKey);
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> requestBody = new HashMap<>();

            List<List<Double>> coordinates = new ArrayList<>();
            coordinates.add(Arrays.asList(getLng(start), getLat(start)));
            coordinates.add(Arrays.asList(getLng(end), getLat(end)));

            requestBody.put("coordinates", coordinates);

            HttpEntity<Map<String, Object>> entity =
                    new HttpEntity<>(requestBody, headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            Map<String, Object> body = response.getBody();

            if (body == null) continue;

            List<Map<String, Object>> features =
                    (List<Map<String, Object>>) body.get("features");

            if (features == null || features.isEmpty()) continue;

            Map<String, Object> feature = features.get(0);

            Map<String, Object> properties =
                    (Map<String, Object>) feature.get("properties");

            if (properties != null) {
                Map<String, Object> summary =
                        (Map<String, Object>) properties.get("summary");

                if (summary != null) {
                    totalDistance += ((Number) summary.getOrDefault("distance", 0)).intValue();
                    totalDuration += ((Number) summary.getOrDefault("duration", 0)).intValue();
                }
            }

            Map<String, Object> geometry =
                    (Map<String, Object>) feature.get("geometry");

            if (geometry == null) continue;

            List<List<Number>> orsCoords =
                    (List<List<Number>>) geometry.get("coordinates");

            if (orsCoords == null) continue;

            List<Map<String, Double>> segmentPath = new ArrayList<>();

            for (List<Number> coord : orsCoords) {
                if (coord.size() < 2) continue;

                double lng = coord.get(0).doubleValue();
                double lat = coord.get(1).doubleValue();

                Map<String, Double> point = new HashMap<>();
                point.put("latitude", lat);
                point.put("longitude", lng);

                fullPath.add(point);
                segmentPath.add(point);
            }

            Map<String, Object> segment = makeSegment(i, start, end, segmentPath, "walk");
            segments.add(segment);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("path", fullPath);
        result.put("segments", segments);
        result.put("totalDistance", totalDistance);
        result.put("totalDuration", totalDuration);

        return result;
    }

    private List<Map<String, Object>> makeRoutePoints(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations
    ) {
        List<Map<String, Object>> routePoints = new ArrayList<>();

        if (currentLocation != null) {
            Map<String, Object> startPoint = new HashMap<>(currentLocation);
            startPoint.put("name", "현재 위치");
            routePoints.add(startPoint);
        }

        routePoints.addAll(locations);

        return routePoints;
    }

    private Map<String, Object> makeSegment(
            int index,
            Map<String, Object> start,
            Map<String, Object> end,
            List<Map<String, Double>> segmentPath,
            String mode
    ) {
        Map<String, Object> segment = new HashMap<>();
        segment.put("fromIndex", index);
        segment.put("toIndex", index + 1);
        segment.put("fromName", String.valueOf(start.get("name")));
        segment.put("toName", String.valueOf(end.get("name")));
        segment.put("mode", mode);
        segment.put("path", segmentPath);

        return segment;
    }

    public Map<String, Object> getSingleSegmentPath(
            Map<String, Object> start,
            Map<String, Object> end,
            String transportMode
    ) {
        List<Map<String, Object>> locations = new ArrayList<>();
        locations.add(end);

        if ("walk".equalsIgnoreCase(transportMode)) {
            Map<String, Object> result = getOrsWalkingPath(start, locations);
            result.put("mode", "walk");
            return result;
        }

        Map<String, Object> result = getKakaoRoadPath(start, locations);
        result.put("mode", "car");
        return result;
    }

    private double getLat(Map<String, Object> location) {
        Object value = location.get("lat");

        if (value == null) {
            value = location.get("latitude");
        }

        return Double.parseDouble(String.valueOf(value));
    }

    private double getLng(Map<String, Object> location) {
        Object value = location.get("lng");

        if (value == null) {
            value = location.get("longitude");
        }

        return Double.parseDouble(String.valueOf(value));
    }
}