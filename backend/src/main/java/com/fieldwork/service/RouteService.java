package com.fieldwork.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.core.ParameterizedTypeReference;

@SuppressWarnings("unchecked")
@Service
public class RouteService {

    @Value("${kakao.rest-api-key}")
    private String kakaoRestApiKey;

    @Value("${ors.api-key}")
    private String orsApiKey;

    private final RestTemplate restTemplate = new RestTemplate();
    private final KakaoWalkingClient walkingClient = new KakaoWalkingClient();
    private static final double MAX_ENTRANCE_SNAP_METERS = 50;

    @Autowired(required = false)
    private BusanEntranceService busanEntranceService;

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
        List<Map<String, Object>> routePoints = makeRoutePoints(currentLocation, locations);

        List<Map<String, Double>> fullPath = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();

        int totalDistance = 0;
        int totalDuration = 0;

        for (int i = 0; i < routePoints.size() - 1; i++) {
            Map<String, Object> start = routePoints.get(i);
            Map<String, Object> end = routePoints.get(i + 1);
            RoadLeg leg;
            try {
                leg = requestRoadLeg(start, end);
            } catch (RuntimeException error) {
                if (!end.containsKey("markerLatitude")) throw error;
                end = originalMarkerPoint(end);
                routePoints.set(i + 1, end);
                leg = requestRoadLeg(start, end);
            }
            totalDistance += leg.distance();
            totalDuration += leg.duration();
            fullPath.addAll(leg.path());
            Map<String, Object> segment = makeSegment(i, start, end, leg.path(), "car");
            segments.add(segment);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("path", fullPath);
        result.put("segments", segments);
        result.put("totalDistance", totalDistance);
        result.put("totalDuration", totalDuration);

        return result;
    }

    private record RoadLeg(List<Map<String, Double>> path, int distance, int duration) {}

    private RoadLeg requestRoadLeg(Map<String, Object> start, Map<String, Object> end) {
        String url = "https://apis-navi.kakaomobility.com/v1/directions"
                + "?origin=" + getLng(start) + "," + getLat(start)
                + "&destination=" + getLng(end) + "," + getLat(end)
                + "&priority=RECOMMEND";
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "KakaoAK " + kakaoRestApiKey);
        Map<String, Object> body = restTemplate.exchange(url, HttpMethod.GET,
                new HttpEntity<Void>(headers), new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
        List<Map<String, Object>> routes = body == null ? null : (List<Map<String, Object>>) body.get("routes");
        if (routes == null || routes.isEmpty()) throw new IllegalStateException("차량 경로를 찾지 못했습니다.");
        Map<String, Object> route = routes.get(0);
        if (route.get("result_code") instanceof Number code && code.intValue() != 0) {
            throw new IllegalStateException("차량 경로를 찾지 못했습니다.");
        }
        Map<String, Object> summary = (Map<String, Object>) route.get("summary");
        List<Map<String, Object>> sections = (List<Map<String, Object>>) route.get("sections");
        List<Map<String, Double>> path = new ArrayList<>();
        if (sections != null) {
            for (Map<String, Object> section : sections) {
                List<Map<String, Object>> roads = (List<Map<String, Object>>) section.get("roads");
                if (roads == null) continue;
                for (Map<String, Object> road : roads) {
                    List<Number> vertices = (List<Number>) road.get("vertexes");
                    if (vertices == null) continue;
                    for (int j = 0; j < vertices.size() - 1; j += 2) {
                        path.add(Map.of("latitude", vertices.get(j + 1).doubleValue(),
                                "longitude", vertices.get(j).doubleValue()));
                    }
                }
            }
        }
        if (path.size() < 2) throw new IllegalStateException("차량 경로 좌표가 부족합니다.");
        if (end.containsKey("markerLatitude") && !endsNearEntrance(path, end)) {
            throw new IllegalStateException("차량 경로가 출입구 근처에 연결되지 않았습니다.");
        }
        return new RoadLeg(path,
                summary == null ? 0 : ((Number) summary.getOrDefault("distance", 0)).intValue(),
                summary == null ? 0 : ((Number) summary.getOrDefault("duration", 0)).intValue());
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

            String url = "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson";

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

           ResponseEntity<Map<String, Object>> response =
            restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    new ParameterizedTypeReference<Map<String, Object>>() {}
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

    private Map<String, Object> getKakaoWalkingPath(Map<String, Object> currentLocation, List<Map<String, Object>> locations, String key) {
        List<Map<String, Object>> points = makeRoutePoints(currentLocation, locations);
        List<Map<String, Double>> path = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();
        double distance = 0, duration = 0;
        for (int i = 0; i < points.size() - 1; i++) {
            Map<String, Object> start = points.get(i), end = points.get(i + 1);
            Map<String, Object> route;
            try {
                route = walkingClient.route(getLat(start), getLng(start), getLat(end), getLng(end), key);
                if (end.containsKey("markerLatitude") &&
                        !endsNearEntrance((List<Map<String, Double>>) route.get("path"), end)) {
                    throw new IllegalStateException("도보 경로가 출입구 근처에 연결되지 않았습니다.");
                }
            } catch (RuntimeException error) {
                if (!end.containsKey("markerLatitude")) throw error;
                end = originalMarkerPoint(end);
                points.set(i + 1, end);
                route = walkingClient.route(getLat(start), getLng(start), getLat(end), getLng(end), key);
            }
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
            if (busanEntranceService != null) {
                double markerLat = getLat(location), markerLng = getLng(location);
                busanEntranceService.find(markerLat, markerLng).ifPresent(entrance -> {
                    double distance = distanceMeters(markerLat, markerLng,
                            entrance.latitude(), entrance.longitude());
                    if (distance > 2 && distance <= 500) {
                        endpoint.put("markerLatitude", markerLat);
                        endpoint.put("markerLongitude", markerLng);
                        endpoint.put("lat", entrance.latitude());
                        endpoint.put("lng", entrance.longitude());
                    }
                });
            }
            routePoints.add(endpoint);
        }

        return routePoints;
    }

    private Map<String, Object> originalMarkerPoint(Map<String, Object> entrancePoint) {
        Map<String, Object> original = new HashMap<>(entrancePoint);
        original.put("lat", ((Number) original.remove("markerLatitude")).doubleValue());
        original.put("lng", ((Number) original.remove("markerLongitude")).doubleValue());
        return original;
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
        if (end.containsKey("markerLatitude") && end.containsKey("markerLongitude")) {
            Map<String, Double> routeEnd = segmentPath.isEmpty()
                    ? Map.of("latitude", getLat(end), "longitude", getLng(end))
                    : segmentPath.get(segmentPath.size() - 1);
            segment.put("connectorPath", List.of(routeEnd,
                    Map.of("latitude", ((Number) end.get("markerLatitude")).doubleValue(),
                            "longitude", ((Number) end.get("markerLongitude")).doubleValue())));
        }

        return segment;
    }

    private double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double north = (lat2 - lat1) * 111_000;
        double east = (lng2 - lng1) * 111_000 * Math.cos(Math.toRadians((lat1 + lat2) / 2));
        return Math.hypot(north, east);
    }

    private boolean endsNearEntrance(List<Map<String, Double>> path, Map<String, Object> entrance) {
        if (path == null || path.isEmpty()) return false;
        Map<String, Double> last = path.get(path.size() - 1);
        return distanceMeters(last.get("latitude"), last.get("longitude"),
                getLat(entrance), getLng(entrance)) <= MAX_ENTRANCE_SNAP_METERS;
    }

    public Map<String, Object> getSingleSegmentPath(
            Map<String, Object> start,
            Map<String, Object> end,
            String transportMode
    ) {
        return getSingleSegmentPath(start, end, transportMode, kakaoRestApiKey);
    }

    public Map<String, Object> getSingleSegmentPath(Map<String, Object> start, Map<String, Object> end, String transportMode, String walkingKey) {
        List<Map<String, Object>> locations = new ArrayList<>();
        locations.add(end);

        if ("walk".equalsIgnoreCase(transportMode)) {
            Map<String, Object> result = getKakaoWalkingPath(start, locations, walkingKey);
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
