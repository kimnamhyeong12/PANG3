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

    private final RestTemplate restTemplate = new RestTemplate();

    public Map<String, Object> optimizeRoute(List<Map<String, Object>> locations) {
        if (locations == null || locations.size() < 2) {
            throw new IllegalArgumentException("방문지는 2개 이상 필요합니다.");
        }

        // 우선순위가 있으면 우선순위를 먼저 반영하고, 나머지는 TSP 방식으로 최적화
        List<Map<String, Object>> optimizedLocations = optimizeWithPriority(locations);

        // 최적화된 방문 순서대로 카카오 도로 경로 요청
        Map<String, Object> kakaoResult = getKakaoRoadPath(optimizedLocations);

        Map<String, Object> result = new HashMap<>();

        // 프론트의 방문지 순서 갱신용
        result.put("optimizedLocations", optimizedLocations);

        // 프론트 지도에 실제 도로 선을 그리기 위한 좌표 배열
        result.put("path", kakaoResult.get("path"));

        result.put("segments", kakaoResult.get("segments"));
        // 총 거리와 총 시간
        result.put("totalDistance", kakaoResult.get("totalDistance"));
        result.put("totalDuration", kakaoResult.get("totalDuration"));

        return result;
    }

    private List<Map<String, Object>> optimizeWithPriority(List<Map<String, Object>> locations) {
        List<Map<String, Object>> priorityLocations = new ArrayList<>();
        List<Map<String, Object>> normalLocations = new ArrayList<>();

        for (Map<String, Object> loc : locations) {
            Object priority = loc.get("priority");

            if (priority != null && !String.valueOf(priority).equals("null") && !String.valueOf(priority).isBlank()) {
                priorityLocations.add(loc);
            } else {
                normalLocations.add(loc);
            }
        }

        // priority 값이 작은 순서대로 먼저 방문
        priorityLocations.sort((a, b) -> {
            int p1 = Integer.parseInt(String.valueOf(a.get("priority")));
            int p2 = Integer.parseInt(String.valueOf(b.get("priority")));
            return Integer.compare(p1, p2);
        });

        List<Map<String, Object>> result = new ArrayList<>();

        // 사용자가 지정한 우선순위 방문지를 먼저 고정
        result.addAll(priorityLocations);

        // 우선순위가 없는 방문지는 TSP 방식으로 뒤에 붙임
        if (!normalLocations.isEmpty()) {
            if (result.isEmpty()) {
                result.addAll(tspNearestNeighbor(normalLocations));
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

        // 첫 번째 방문지를 시작점으로 사용
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
            List<Map<String, Object>> locations) {
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

    private Map<String, Object> getKakaoRoadPath(List<Map<String, Object>> locations) {
        List<Map<String, Double>> fullPath = new ArrayList<>();
        List<Map<String, Object>> segments = new ArrayList<>();

        int totalDistance = 0;
        int totalDuration = 0;

        for (int i = 0; i < locations.size() - 1; i++) {
            Map<String, Object> start = locations.get(i);
            Map<String, Object> end = locations.get(i + 1);

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
                    Map.class);

            Map<String, Object> body = response.getBody();

            if (body == null) {
                continue;
            }

            List<Map<String, Object>> routes = (List<Map<String, Object>>) body.get("routes");

            if (routes == null || routes.isEmpty()) {
                continue;
            }

            Map<String, Object> route = routes.get(0);

            Map<String, Object> summary = (Map<String, Object>) route.get("summary");

            if (summary != null) {
                totalDistance += ((Number) summary.getOrDefault("distance", 0)).intValue();
                totalDuration += ((Number) summary.getOrDefault("duration", 0)).intValue();
            }

            List<Map<String, Double>> segmentPath = new ArrayList<>();

            List<Map<String, Object>> sections = (List<Map<String, Object>>) route.get("sections");

            if (sections == null) {
                continue;
            }

            for (Map<String, Object> section : sections) {
                List<Map<String, Object>> roads = (List<Map<String, Object>>) section.get("roads");

                if (roads == null) {
                    continue;
                }

                for (Map<String, Object> road : roads) {
                    List<Number> vertexes = (List<Number>) road.get("vertexes");

                    if (vertexes == null) {
                        continue;
                    }

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

            Map<String, Object> segment = new HashMap<>();
            segment.put("fromIndex", i + 1);
            segment.put("toIndex", i + 2);
            segment.put("fromName", String.valueOf(start.get("name")));
            segment.put("toName", String.valueOf(end.get("name")));
            segment.put("path", segmentPath);

            segments.add(segment);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("path", fullPath);
        result.put("segments", segments);
        result.put("totalDistance", totalDistance);
        result.put("totalDuration", totalDuration);

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