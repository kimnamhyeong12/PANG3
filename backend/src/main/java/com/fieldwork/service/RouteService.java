package com.fieldwork.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.core.ParameterizedTypeReference;

@SuppressWarnings("unchecked")
@Service
public class RouteService {

    @Value("${kakao.rest-api-key}")
    private String kakaoRestApiKey;


    private final RestTemplate restTemplate;
    private final KakaoWalkingClient walkingClient = new KakaoWalkingClient();
    public RouteService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        restTemplate = new RestTemplate(factory);
        restTemplate.setInterceptors(java.util.List.of(new ProviderQuotaInterceptor()));
    }

    public Map<String, Object> optimizeRoute(
            Map<String, Object> currentLocation,
            List<Map<String, Object>> locations,
            String transportMode
    ) {
        if (locations == null || locations.isEmpty()) {
            throw new IllegalArgumentException("미완료 방문지가 필요합니다.");
        }

        return optimizeRoute(currentLocation, locations, transportMode, kakaoRestApiKey);
    }

    public Map<String, Object> optimizeRoute(Map<String, Object> currentLocation, List<Map<String, Object>> locations, String transportMode, String walkingKey) {
        if (locations == null) throw new IllegalArgumentException("미완료 방문지가 필요합니다.");
        locations = locations.stream().filter(location -> !"complete".equals(location.get("status"))).toList();
        if (locations.isEmpty()) throw new IllegalArgumentException("미완료 방문지가 필요합니다.");
        String mode = transportMode == null ? "car" : transportMode;

        List<Map<String, Object>> optimizedLocations =
                optimizeWithPriority(currentLocation, locations);

        Map<String, Object> routeResult;

        if (mode.equalsIgnoreCase("walk")) {
            routeResult = getKakaoWalkingPath(currentLocation, optimizedLocations, walkingKey);
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
        return getKakaoRoadPath(currentLocation, locations, null);
    }

    private Map<String, Object> getKakaoRoadPath(Map<String, Object> currentLocation,
            List<Map<String, Object>> locations, String priority) {
        List<Map<String, Object>> routePoints = makeRoutePoints(currentLocation, locations);

        List<Map<String, Double>> fullPath = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();

        int totalDistance = 0;
        int totalDuration = 0;

        for (int i = 0; i < routePoints.size() - 1; i++) {
            Map<String, Object> start = routePoints.get(i);
            Map<String, Object> end = routePoints.get(i + 1);
            RoadSelection selection = selectRoadLeg(start, end, priority);
            RoadLeg leg = selection.leg();
            totalDistance += leg.distance();
            totalDuration += leg.duration();
            fullPath.addAll(leg.path());
            Map<String, Object> segment = makeSegment(i, start, end, leg.path(), "car");
            segment.put("trafficSections", leg.trafficSections());
            segment.put("totalDistance", leg.distance());
            segment.put("totalDuration", leg.duration());
            segment.put("routePriority", leg.priority());
            segment.put("routeCompared", priority == null);
            Map<String, Double> navigationEnd = leg.path().get(leg.path().size() - 1);
            segment.put("navigationDestination", Map.of("lat", navigationEnd.get("latitude"),
                    "lng", navigationEnd.get("longitude")));
            segment.put("routeDiagnostics", Map.of(
                    "requestedOrigin", Map.of("latitude", getLat(start), "longitude", getLng(start)),
                    "requestedDestination", Map.of("latitude", getLat(end), "longitude", getLng(end)),
                    "destinationSource", "original",
                    "candidates", selection.candidates()));
            segments.add(segment);
            // The next vehicle leg starts at the actual road arrival, not inside the building.
            Map<String, Double> arrival = leg.path().get(leg.path().size() - 1);
            Map<String, Object> nextStart = new HashMap<>(end);
            nextStart.put("lat", arrival.get("latitude"));
            nextStart.put("lng", arrival.get("longitude"));
            routePoints.set(i + 1, nextStart);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("path", fullPath);
        result.put("segments", segments);
        result.put("totalDistance", totalDistance);
        result.put("totalDuration", totalDuration);

        return result;
    }

    private record RoadLeg(List<Map<String, Double>> path,
                           List<Map<String, Object>> trafficSections,
                           int distance, int duration, int toll, String priority) {}

    private record RoadSelection(RoadLeg leg, List<Map<String, Object>> candidates) {}

    private static class RoadPathUnavailable extends IllegalStateException {
        RoadPathUnavailable(String message) { super(message); }
    }

    private RoadSelection selectRoadLeg(Map<String, Object> start, Map<String, Object> end) {
        return selectRoadLeg(start, end, null);
    }

    private RoadSelection selectRoadLeg(Map<String, Object> start, Map<String, Object> end, String requestedPriority) {
        if (distanceMeters(getLat(start), getLng(start), getLat(end), getLng(end)) < 1) {
            Map<String, Double> point = Map.of("latitude", getLat(end), "longitude", getLng(end));
            return new RoadSelection(new RoadLeg(List.of(point, point), List.of(), 0, 0, 0, "RECOMMEND"), List.of());
        }
        RoadLeg selected = null;
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (String priority : requestedPriority == null ? List.of("RECOMMEND", "TIME", "DISTANCE") : List.of(requestedPriority)) {
            RoadLeg candidate;
            try {
                candidate = requestRoadLeg(start, end, priority);
            } catch (RoadPathUnavailable error) {
                candidates.add(Map.of("priority", priority, "available", false));
                continue;
            } catch (RuntimeException error) {
                // A failed optional comparison must not discard a usable recommended route.
                if (selected == null) throw error;
                candidates.add(Map.of("priority", priority, "available", false));
                continue;
            }
            candidates.add(Map.of("priority", priority, "available", true,
                    "distance", candidate.distance(), "duration", candidate.duration(), "toll", candidate.toll()));
            // Keep the recommendation unless another provider route improves at least one
            // metric without increasing travel time, distance, or tolls.
            if (selected == null || (candidate.distance() <= selected.distance()
                    && candidate.duration() <= selected.duration()
                    && candidate.toll() >= 0 && selected.toll() >= 0 && candidate.toll() <= selected.toll()
                    && (candidate.distance() < selected.distance() || candidate.duration() < selected.duration()))) {
                selected = candidate;
            }
        }
        if (selected == null) throw new RoadPathUnavailable("차량 경로를 찾지 못했습니다.");
        return new RoadSelection(selected, candidates);
    }

    private RoadLeg requestRoadLeg(Map<String, Object> start, Map<String, Object> end, String priority) {
        String url = "https://apis-navi.kakaomobility.com/v1/directions"
                + "?origin=" + getLng(start) + "," + getLat(start)
                + "&destination=" + getLng(end) + "," + getLat(end)
                + "&priority=" + priority + "&summary=false";
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "KakaoAK " + kakaoRestApiKey);
        Map<String, Object> body = restTemplate.exchange(url, HttpMethod.GET,
                new HttpEntity<Void>(headers), new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
        List<Map<String, Object>> routes = body == null ? null : (List<Map<String, Object>>) body.get("routes");
        if (routes == null || routes.isEmpty()) throw new RoadPathUnavailable("차량 경로를 찾지 못했습니다.");
        Map<String, Object> route = routes.get(0);
        if (route.get("result_code") instanceof Number code && code.intValue() != 0) {
            throw new RoadPathUnavailable("차량 경로를 찾지 못했습니다.");
        }
        Map<String, Object> summary = (Map<String, Object>) route.get("summary");
        List<Map<String, Object>> sections = (List<Map<String, Object>>) route.get("sections");
        List<Map<String, Double>> path = new ArrayList<>();
        List<Map<String, Object>> trafficSections = new ArrayList<>();
        if (sections != null) {
            for (Map<String, Object> section : sections) {
                List<Map<String, Object>> roads = (List<Map<String, Object>>) section.get("roads");
                if (roads == null) continue;
                for (Map<String, Object> road : roads) {
                    List<Number> vertices = (List<Number>) road.get("vertexes");
                    if (vertices == null) continue;
                    List<Map<String, Double>> roadPath = new ArrayList<>();
                    for (int j = 0; j < vertices.size() - 1; j += 2) {
                        Map<String, Double> point = Map.of("latitude", vertices.get(j + 1).doubleValue(),
                                "longitude", vertices.get(j).doubleValue());
                        path.add(point);
                        roadPath.add(point);
                    }
                    if (roadPath.size() >= 2) {
                        Map<String, Object> trafficSection = new HashMap<>();
                        trafficSection.put("path", roadPath);
                        trafficSection.put("trafficState", road.get("traffic_state"));
                        trafficSections.add(trafficSection);
                    }
                }
            }
        }
        if (path.size() < 2) throw new RoadPathUnavailable("차량 경로 좌표가 부족합니다.");
        if (summary == null || !(summary.get("distance") instanceof Number distance)
                || !(summary.get("duration") instanceof Number duration)
                || distance.intValue() <= 0 || duration.intValue() < 0) {
            throw new RoadPathUnavailable("차량 경로 요약 정보가 부족합니다.");
        }
        Map<String, Object> fare = (Map<String, Object>) summary.get("fare");
        return new RoadLeg(path, trafficSections,
                distance.intValue(), duration.intValue(),
                fare == null || !(fare.get("toll") instanceof Number)
                        ? -1 : ((Number) fare.get("toll")).intValue(), priority);
    }

    private Map<String, Object> getKakaoWalkingPath(Map<String, Object> currentLocation, List<Map<String, Object>> locations, String key) {
        List<Map<String, Object>> points = makeRoutePoints(currentLocation, locations);
        List<Map<String, Double>> path = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();
        double distance = 0, duration = 0;
        for (int i = 0; i < points.size() - 1; i++) {
            Map<String, Object> start = points.get(i), end = points.get(i + 1);
            Map<String, Object> route = walkingClient.route(getLat(start), getLng(start), getLat(end), getLng(end), key);
            List<Map<String, Double>> segmentPath = (List<Map<String, Double>>) route.get("path");
            path.addAll(segmentPath);
            segments.add(makeSegment(i, start, end, segmentPath, "walk"));
            distance += ((Number) route.get("totalDistance")).doubleValue();
            duration += ((Number) route.get("totalDuration")).doubleValue();
        }
        Map<String, Object> result = new HashMap<>();
        result.put("path", path); result.put("segments", segments);
        result.put("totalDistance", distance); result.put("totalDuration", duration);
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

        for (Map<String, Object> location : locations) {
            Map<String, Object> endpoint = new HashMap<>(location);
            endpoint.remove("markerLatitude");
            endpoint.remove("markerLongitude");
            routePoints.add(endpoint);
        }

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
        if ("car".equals(mode)) {
            Map<String, Double> routeEnd = segmentPath.isEmpty()
                    ? Map.of("latitude", getLat(end), "longitude", getLng(end))
                    : segmentPath.get(segmentPath.size() - 1);
            double markerLat = getLat(end), markerLng = getLng(end);
            double gap = distanceMeters(routeEnd.get("latitude"), routeEnd.get("longitude"), markerLat, markerLng);
            if (gap > 2 && gap <= 500) {
                segment.put("connectorPath", List.of(routeEnd,
                        Map.of("latitude", markerLat, "longitude", markerLng)));
            }
        }

        return segment;
    }

    private double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double north = (lat2 - lat1) * 111_000;
        double east = (lng2 - lng1) * 111_000 * Math.cos(Math.toRadians((lat1 + lat2) / 2));
        return Math.hypot(north, east);
    }

    public Map<String, Object> getSingleSegmentPath(
            Map<String, Object> start,
            Map<String, Object> end,
            String transportMode
    ) {
        return getSingleSegmentPath(start, end, transportMode, kakaoRestApiKey);
    }

    public Map<String, Object> getSingleSegmentPath(Map<String, Object> start, Map<String, Object> end, String transportMode, String walkingKey) {
        return getSingleSegmentPath(start, end, transportMode, walkingKey, null);
    }

    public Map<String, Object> getSingleSegmentPath(Map<String, Object> start, Map<String, Object> end,
            String transportMode, String walkingKey, String routePriority) {
        if (routePriority != null && !"RECOMMEND".equals(routePriority)) {
            throw new IllegalArgumentException("지원하지 않는 경로 기준입니다.");
        }
        List<Map<String, Object>> locations = new ArrayList<>();
        locations.add(end);

        if ("walk".equalsIgnoreCase(transportMode)) {
            Map<String, Object> result = getKakaoWalkingPath(start, locations, walkingKey == null ? kakaoRestApiKey : walkingKey);
            result.put("mode", "walk");
            return result;
        }

        Map<String, Object> result = getKakaoRoadPath(start, locations, routePriority);
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
