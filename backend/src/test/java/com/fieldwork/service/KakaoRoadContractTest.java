package com.fieldwork.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

/** Standalone contract checks: run with -ea, or --live for the screenshot's public POIs. */
@SuppressWarnings("unchecked")
public class KakaoRoadContractTest {
    private static final Map<String, Object> START = Map.of("lat", 35.153863853563315, "lng", 128.99917820891798, "name", "출발");
    private static final Map<String, Object> END = Map.of("lat", 35.1538830767717, "lng", 128.997466947464, "name", "도서관");

    record Request(String origin, String destination, String priority) {}

    static class Stub extends RestTemplate {
        final List<Request> calls = new ArrayList<>();
        final Function<Request, Map<String, Object>> respond;
        Stub(Function<Request, Map<String, Object>> respond) { this.respond = respond; }
        @Override public <T> ResponseEntity<T> exchange(String url, HttpMethod method, HttpEntity<?> entity,
                ParameterizedTypeReference<T> type, Object... variables) {
            assert method == HttpMethod.GET;
            assert entity.getHeaders().getFirst("Authorization").equals("KakaoAK synthetic-test-key");
            assert !url.contains("synthetic-test-key");
            Map<String, String> params = new HashMap<>();
            for (String pair : URI.create(url).getRawQuery().split("&")) {
                String[] parts = pair.split("=", 2);
                params.put(parts[0], parts[1]);
            }
            assert params.get("summary").equals("false");
            Request request = new Request(params.get("origin"), params.get("destination"), params.get("priority"));
            calls.add(request);
            return (ResponseEntity<T>) ResponseEntity.ok(respond.apply(request));
        }
    }

    private static Map<String, Object> response(Request request, int distance, int duration, int toll) {
        String[] from = request.origin().split(","), to = request.destination().split(",");
        // The provider snaps the final road coordinate slightly away from the POI.
        double endLng = Double.parseDouble(to[0]) + 0.00005;
        List<Double> vertices = List.of(Double.parseDouble(from[0]), Double.parseDouble(from[1]),
                endLng, Double.parseDouble(to[1]));
        return Map.of("routes", List.of(Map.of("result_code", 0,
                "summary", Map.of("distance", distance, "duration", duration, "fare", Map.of("toll", toll)),
                "sections", List.of(Map.of("roads", List.of(Map.of("vertexes", vertices, "traffic_state", 2)))))));
    }

    private static RouteService service(Stub stub, boolean withEntrance) throws Exception {
        RouteService service = new RouteService();
        set(service, "kakaoRestApiKey", "synthetic-test-key");
        set(service, "restTemplate", stub);
        if (withEntrance) set(service, "busanEntranceService", new BusanEntranceService(new ObjectMapper()) {
            @Override public Optional<Entrance> find(double lat, double lng) {
                return Optional.of(new Entrance(lat + 0.0008, lng));
            }
        });
        return service;
    }

    private static void set(RouteService service, String name, Object value) throws Exception {
        Field field = RouteService.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(service, value);
    }

    private static Map<String, Object> segment(Map<String, Object> result) {
        return ((List<Map<String, Object>>) result.get("segments")).get(0);
    }

    public static void main(String[] args) throws Exception {
        if (args.length > 0 && args[0].equals("--live")) { live(); return; }
        Stub faster = new Stub(r -> response(r, r.priority().equals("RECOMMEND") ? 1849 : 1360,
                r.priority().equals("RECOMMEND") ? 326 : 234, 0));
        Map<String, Object> result = service(faster, true).getSingleSegmentPath(START, END, "car");
        assert result.get("totalDistance").equals(1360);
        assert result.get("totalDuration").equals(234);
        assert segment(result).get("routePriority").equals("TIME");
        assert faster.calls.size() == 3;
        assert faster.calls.stream().allMatch(r -> r.destination().equals("128.997466947464,35.1538830767717"));
        Map<String, Object> diagnostics = (Map<String, Object>) segment(result).get("routeDiagnostics");
        assert diagnostics.get("destinationSource").equals("original");
        assert ((List<?>) diagnostics.get("candidates")).size() == 3;
        assert ((List<?>) segment(result).get("connectorPath")).size() == 2;
        assert ((List<?>) segment(result).get("trafficSections")).size() == 1;
        assert segment(result).get("totalDistance").equals(1360);
        assert END.get("lat").equals(35.1538830767717);

        // Shorter but slower, or faster with higher tolls, must not replace recommendation.
        Stub tradeoffs = new Stub(r -> switch (r.priority()) {
            case "TIME" -> response(r, 800, 80, 1000);
            case "DISTANCE" -> response(r, 700, 150, 0);
            default -> response(r, 1000, 100, 0);
        });
        assert segment(service(tradeoffs, false).getSingleSegmentPath(START, END, "car")).get("routePriority").equals("RECOMMEND");

        Stub optionalFailure = new Stub(r -> {
            if (!r.priority().equals("RECOMMEND")) throw new RuntimeException("provider failure");
            return response(r, 1000, 100, 0);
        });
        assert service(optionalFailure, false).getSingleSegmentPath(START, END, "car").get("totalDistance").equals(1000);

        Stub invalidSummary = new Stub(r -> response(r, r.priority().equals("RECOMMEND") ? 1000 : 0, 100, 0));
        assert service(invalidSummary, false).getSingleSegmentPath(START, END, "car").get("totalDistance").equals(1000);

        Stub unknownToll = new Stub(r -> {
            Map<String, Object> body = response(r, r.priority().equals("RECOMMEND") ? 1000 : 800, 100, 0);
            Map<String, Object> route = new HashMap<>(((List<Map<String, Object>>) body.get("routes")).get(0));
            Map<String, Object> summary = new HashMap<>((Map<String, Object>) route.get("summary"));
            if (!r.priority().equals("RECOMMEND")) summary.remove("fare");
            route.put("summary", summary);
            return Map.of("routes", List.of(route));
        });
        assert segment(service(unknownToll, false).getSingleSegmentPath(START, END, "car")).get("routePriority").equals("RECOMMEND");

        Stub fallback = new Stub(r -> r.destination().equals("128.997466947464,35.1538830767717")
                ? Map.of("routes", List.of(Map.of("result_code", 104))) : response(r, 1000, 100, 0));
        result = service(fallback, true).getSingleSegmentPath(START, END, "car");
        assert ((Map<?, ?>) segment(result).get("routeDiagnostics")).get("destinationSource").equals("entranceFallback");
        assert fallback.calls.size() == 6;

        Stub authFailure = new Stub(r -> { throw new RuntimeException("authorization failure"); });
        try { service(authFailure, true).getSingleSegmentPath(START, END, "car"); throw new AssertionError("Expected failure"); }
        catch (RuntimeException expected) { assert authFailure.calls.size() == 1; }

        Stub sequential = new Stub(r -> response(r, 1000, 100, 0));
        Map<String, Object> third = Map.of("lat", 35.155, "lng", 128.996, "name", "다음", "priority", 2);
        Map<String, Object> first = new HashMap<>(END); first.put("priority", 1);
        result = service(sequential, true).optimizeRoute(START, List.of(first, third), "car");
        List<Map<String, Object>> segments = (List<Map<String, Object>>) result.get("segments");
        List<Map<String, Double>> firstPath = (List<Map<String, Double>>) segments.get(0).get("path");
        Map<String, Double> arrival = firstPath.get(firstPath.size() - 1);
        assert sequential.calls.get(3).origin().equals(arrival.get("longitude") + "," + arrival.get("latitude"));
        assert result.get("totalDistance").equals(2000);
        assert result.get("totalDuration").equals(200);

        Stub samePoint = new Stub(r -> { throw new AssertionError("Same point should not call API"); });
        assert service(samePoint, false).getSingleSegmentPath(START, START, "car").get("totalDistance").equals(0);

        // Car option comparison must not affect the existing walking request contract.
        RouteService walking = new RouteService();
        set(walking, "walkingClient", new KakaoWalkingClient(new KakaoWalkingContractTest.Stub()));
        Map<String, Object> walkResult = walking.getSingleSegmentPath(
                Map.of("lat", 37.0, "lng", 127.0), Map.of("lat", 37.02, "lng", 127.02), "walk", "synthetic-test-key");
        assert ((Number) walkResult.get("totalDistance")).intValue() == 123;
        assert ((Number) walkResult.get("totalDuration")).intValue() == 99;
        System.out.println("PASS road options, original POI, time/distance/toll tradeoffs, optional failures, invalid summaries, entrance fallback, auth failures, road continuity, same point, connectors and traffic");
    }

    private static void live() throws Exception {
        String key = System.getenv("KAKAO_REST_API_KEY");
        if (key == null || key.isBlank()) throw new IllegalStateException("KAKAO_REST_API_KEY is required");
        RouteService service = new RouteService();
        set(service, "kakaoRestApiKey", key);
        set(service, "busanEntranceService", new BusanEntranceService(new ObjectMapper()));
        Map<String, Object> result = service.getSingleSegmentPath(START, END, "car");
        Map<String, Object> summary = new HashMap<>();
        summary.put("origin", "주례동일1차아파트 장소 좌표 (촬영 당시 GPS 아님)");
        summary.put("destination", "백양낙조전망대작은도서관");
        summary.put("distance", result.get("totalDistance"));
        summary.put("duration", result.get("totalDuration"));
        summary.put("priority", segment(result).get("routePriority"));
        summary.put("diagnostics", segment(result).get("routeDiagnostics"));
        summary.put("pathPoints", ((List<?>) result.get("path")).size());
        System.out.println(new ObjectMapper().writeValueAsString(summary));
    }
}
