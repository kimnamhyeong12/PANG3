package com.fieldwork.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Walking only: preserve the existing path/distance/duration contract. */
public class KakaoWalkingClient {
    public static final String ROUTE_MODE = "BROAD_FIRST";
    private final RestTemplate http;
    public KakaoWalkingClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(20));
        http = new RestTemplate(factory);
        http.setInterceptors(java.util.List.of(new ProviderQuotaInterceptor()));
    }
    KakaoWalkingClient(RestTemplate http) { this.http = http; }

    /** Up to six directed legs, in caller-specified order; this never optimizes the order. */
    public List<Double> durations(List<Map<String,Object>> points, String key) {
        if (points.size() < 2 || points.size() > 7) throw new IllegalArgumentException("Invalid walking batch");
        if (key == null || key.isBlank()) throw failure("카카오 도보 REST API 키가 설정되지 않았습니다.");
        var start = points.get(0); var end = points.get(points.size()-1);
        String url = "https://dapi.kakao.com/v2/routing/walk?start_x=" + start.get("lng") + "&start_y=" + start.get("lat")
                + "&end_x=" + end.get("lng") + "&end_y=" + end.get("lat");
        if (points.size() > 2) {
            url += "&via_x=" + points.subList(1,points.size()-1).stream().map(p -> p.get("lng").toString()).collect(java.util.stream.Collectors.joining(","))
                + "&via_y=" + points.subList(1,points.size()-1).stream().map(p -> p.get("lat").toString()).collect(java.util.stream.Collectors.joining(","));
        }
        url += "&input_coord=WGS84&output_coord=WGS84&route_mode=" + ROUTE_MODE;
        HttpHeaders headers = new HttpHeaders(); headers.set("Authorization", "KakaoAK " + key);
        Map<String,Object> body = http.exchange(url, HttpMethod.GET, new HttpEntity<Void>(headers),
                new ParameterizedTypeReference<Map<String,Object>>() {}).getBody();
        if (body == null || !"OK".equals(body.get("status"))) throw failure("도보 구간을 조회하지 못했습니다.");
        Map<?,?> route = object(body.get("route")); List<?> legs = array(route.get("legs"));
        if (legs.size() != points.size()-1) throw failure("도보 구간 응답이 일치하지 않습니다.");
        double total = number(object(route.get("properties")).get("totalTime"));
        List<Double> result = new ArrayList<>();
        for (Object leg : legs) {
            var props = object(object(leg).get("properties"));
            double seconds = props.containsKey("time") ? number(props.get("time")) : legs.size()==1 ? total : Double.NaN;
            if (!Double.isFinite(seconds) || seconds < 0) throw failure("도보 구간 시간이 올바르지 않습니다.");
            result.add(seconds);
        }
        if (!Double.isFinite(total) || total < 0 || Math.abs(result.stream().mapToDouble(Double::doubleValue).sum()-total)>1)
            throw failure("도보 구간 합계가 일치하지 않습니다.");
        return result;
    }

    public Map<String, Object> route(double startLat, double startLng, double endLat, double endLng, String key) {
        if (key == null || key.isBlank()) throw failure("카카오 도보 REST API 키가 설정되지 않았습니다.");
        validate(startLat, startLng); validate(endLat, endLng);
        if (startLat == endLat && startLng == endLng) return samePoint(startLat, startLng);
        String url = "https://dapi.kakao.com/v2/routing/walk?start_x=" + startLng + "&start_y=" + startLat
                + "&end_x=" + endLng + "&end_y=" + endLat
                + "&input_coord=WGS84&output_coord=WGS84&route_mode=" + ROUTE_MODE;
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "KakaoAK " + key);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        Map<String, Object> body;
        try {
            body = http.exchange(url, HttpMethod.GET, new HttpEntity<Void>(headers),
                    new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
        } catch (org.springframework.web.server.ResponseStatusException limited) {
            if (limited.getStatusCode().value() == 429 || limited.getStatusCode().value() == 503) throw limited;
            throw failure("카카오 도보 경로 요청에 실패했습니다. 네트워크와 서비스 권한을 확인해주세요.");
        } catch (Exception ignored) {
            // Do not expose provider bodies, HTTP headers, URLs or original exceptions.
            throw failure("카카오 도보 경로 요청에 실패했습니다. 네트워크와 서비스 권한을 확인해주세요.");
        }
        return normalize(body, startLat, startLng);
    }

    static Map<String, Object> normalize(Map<String, Object> body, double lat, double lng) {
        if (body == null) throw failure("카카오 도보 경로 응답이 비어 있습니다.");
        String status = String.valueOf(body.get("status"));
        if ("SAME_POINT".equals(status)) return samePoint(lat, lng);
        if (!"OK".equals(status)) {
            String message = switch (status) {
                case "START_LINK_NOT_FOUND" -> "출발지 주변 보행로를 찾지 못했습니다.";
                case "END_LINK_NOT_FOUND" -> "목적지 주변 보행로를 찾지 못했습니다.";
                case "TOO_MANY_SEARCH_LINK" -> "도보 탐색 범위를 초과했습니다.";
                case "TOO_FAR_AWAY" -> "도보 목적지가 너무 멉니다.";
                case "ROUTE_RESULT_NOT_FOUND" -> "이용 가능한 도보 경로를 찾지 못했습니다.";
                default -> "카카오 도보 경로 응답이 올바르지 않습니다.";
            };
            throw failure(message);
        }
        Map<?, ?> route = object(body.get("route"));
        Map<?, ?> properties = object(route.get("properties"));
        double distance = number(properties.get("totalDistance")), time = number(properties.get("totalTime"));
        if (distance < 0 || time < 0) throw failure("도보 거리/시간이 올바르지 않습니다.");
        List<Map<String, Double>> path = new ArrayList<>();
        for (Object legValue : array(route.get("legs"))) {
            for (Object stepValue : array(object(legValue).get("steps"))) {
                for (Object pointValue : array(object(object(stepValue).get("path")).get("points"))) {
                    List<?> point = array(pointValue);
                    if (point.size() != 2) throw failure("도보 좌표가 올바르지 않습니다.");
                    double x = number(point.get(0)), y = number(point.get(1));
                    validate(y, x);
                    Map<String, Double> mapped = Map.of("latitude", y, "longitude", x);
                    if (path.isEmpty() || !path.get(path.size() - 1).equals(mapped)) path.add(mapped);
                }
            }
        }
        if (path.size() < 2) throw failure("도보 경로 좌표가 부족합니다.");
        return result(path, distance, time);
    }
    private static Map<String, Object> samePoint(double lat, double lng) {
        return result(List.of(Map.of("latitude", lat, "longitude", lng)), 0, 0);
    }
    private static Map<String, Object> result(List<Map<String, Double>> path, double distance, double time) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", path); result.put("totalDistance", distance); result.put("totalDuration", time);
        return result;
    }
    private static Map<?, ?> object(Object value) {
        if (value instanceof Map<?, ?> map) return map;
        throw failure("카카오 도보 경로 응답 형식이 올바르지 않습니다.");
    }
    private static List<?> array(Object value) {
        if (value instanceof List<?> list) return list;
        throw failure("카카오 도보 좌표 목록이 올바르지 않습니다.");
    }
    private static double number(Object value) {
        if (value instanceof Number number && Double.isFinite(number.doubleValue())) return number.doubleValue();
        throw failure("카카오 도보 숫자 값이 올바르지 않습니다.");
    }
    private static void validate(double lat, double lng) {
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
            throw failure("출발지 또는 목적지 좌표가 올바르지 않습니다.");
    }
    private static ResponseStatusException failure(String message) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
    }
}
