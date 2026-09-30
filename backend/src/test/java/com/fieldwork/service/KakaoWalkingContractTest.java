package com.fieldwork.service;

import java.util.*;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Run main with -ea; uses existing Spring dependencies, no test-library/version changes. */
public class KakaoWalkingContractTest {
    private static Map<String, Object> response() {
        var first = Map.of("path", Map.of("points", List.of(List.of(127.0, 37.0), List.of(127.01, 37.01))));
        var second = Map.of("path", Map.of("points", List.of(List.of(127.01, 37.01), List.of(127.02, 37.02))));
        var leg = Map.of("steps", List.of(first, second));
        return Map.of("status", "OK", "route", Map.of("properties", Map.of("totalDistance", 123, "totalTime", 99), "legs", List.of(leg)));
    }
    static class Stub extends RestTemplate {
        int calls;
        boolean fail;
        @Override public <T> ResponseEntity<T> exchange(String url, HttpMethod method, HttpEntity<?> request,
                ParameterizedTypeReference<T> type, Object... variables) {
            calls++;
            assert method == HttpMethod.GET;
            assert url.contains("start_x=127.0&start_y=37.0&end_x=127.02&end_y=37.02");
            assert url.contains("input_coord=WGS84&output_coord=WGS84&route_mode=BROAD_FIRST");
            assert request.getHeaders().getFirst("Authorization").equals("KakaoAK synthetic-test-key");
            assert !url.contains("synthetic-test-key");
            if (fail) throw new RuntimeException("provider private body synthetic-test-key");
            return (ResponseEntity<T>) ResponseEntity.ok(response());
        }
    }
    public static void main(String[] args) throws Exception {
        Stub http = new Stub();
        KakaoWalkingClient client = new KakaoWalkingClient(http);
        Map<String, Object> result = client.route(37, 127, 37.02, 127.02, "synthetic-test-key");
        List<Map<String, Double>> path = (List<Map<String, Double>>) result.get("path");
        assert path.size() == 3 && path.get(2).get("latitude") == 37.02 && path.get(2).get("longitude") == 127.02;
        assert ((Number) result.get("totalDistance")).doubleValue() == 123;
        assert ((Number) result.get("totalDuration")).doubleValue() == 99;
        assert ((Number) client.route(37,127,37,127,"synthetic-test-key").get("totalDistance")).doubleValue() == 0;
        assert http.calls == 1;
        assert ((Number) KakaoWalkingClient.normalize(Map.of("status", "SAME_POINT"),37,127).get("totalDuration")).doubleValue() == 0;
        for (String status : List.of("START_LINK_NOT_FOUND","END_LINK_NOT_FOUND","TOO_MANY_SEARCH_LINK","TOO_FAR_AWAY","ROUTE_RESULT_NOT_FOUND","private-status")) {
            try { KakaoWalkingClient.normalize(Map.of("status",status),37,127); throw new AssertionError(); }
            catch (ResponseStatusException e) { assert e.getStatusCode().value() == 502; assert !e.getReason().contains("private-status"); }
        }
        try { KakaoWalkingClient.normalize(Map.of("status","OK","route",Map.of()),37,127); throw new AssertionError(); }
        catch (ResponseStatusException expected) {}
        http.fail = true;
        try { client.route(37,127,37.02,127.02,"synthetic-test-key"); throw new AssertionError(); }
        catch (ResponseStatusException e) { assert !e.toString().contains("synthetic-test-key"); assert e.getCause() == null; }
        RouteService service = new RouteService();
        var field = RouteService.class.getDeclaredField("walkingClient"); field.setAccessible(true); field.set(service, new KakaoWalkingClient(new Stub()));
        Map<String,Object> a = new HashMap<>(Map.of("lat",37.0,"lng",127.0,"name","A","status","working","assigneeUserId",7,"priority",1));
        Map<String,Object> b = new HashMap<>(Map.of("lat",37.02,"lng",127.02,"name","B","status","complete","priority",2));
        // Identical first segment is zero; second performs the stub GET.
        Map<String,Object> optimized = service.optimizeRoute(a,List.of(a,b),"walk","synthetic-test-key");
        assert ((List<?>)optimized.get("segments")).size() == 2;
        assert a.get("status").equals("working") && b.get("status").equals("complete");
        assert a.get("assigneeUserId").equals(7);
        System.out.println("PASS walking request, coordinates, summary, statuses, safe errors, same-point, multi-stop and metadata");
    }
}
