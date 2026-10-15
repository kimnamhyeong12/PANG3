package com.fieldwork.service;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/** Order recommendations only: actual guidance stays a user-selected single destination. */
@Service
@SuppressWarnings("unchecked")
public class VisitOrderService {
    private final RestTemplate client;
    private final java.util.concurrent.ExecutorService workers = new java.util.concurrent.ThreadPoolExecutor(4, 4, 0,
            java.util.concurrent.TimeUnit.SECONDS, new java.util.concurrent.ArrayBlockingQueue<>(128));
    @jakarta.annotation.PreDestroy public void stop() { workers.shutdownNow(); }
    @Value("${kakao.rest-api-key}") private String key;
    private record Cached(long time, double[] durations) {}
    private final Map<String, Cached> cache = Collections.synchronizedMap(new LinkedHashMap<>());
    public VisitOrderService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000); factory.setReadTimeout(5000);
        client = new RestTemplate(factory);
    }
    public Map<String, Object> recommend(Map<String, Object> start, List<Map<String, Object>> visits,
            Map<String, Object> home, String pinnedKey, String mode) {
        requirePoint(start);
        if (home != null) requirePoint(home);
        if (visits == null || visits.size() > 500) throw new IllegalArgumentException("방문지를 확인해 주세요.");
        List<Map<String, Object>> pending = visits.stream().filter(row -> !List.of("complete", "completed", "done")
                .contains(String.valueOf(row.getOrDefault("status", "pending")).toLowerCase())).toList();
        pending.forEach(VisitOrderService::requirePoint);
        List<Map<String, Object>> points = new ArrayList<>(); points.add(start); points.addAll(pending);
        if (home != null) points.add(home);
        int n = pending.size();
        int pinned = -1;
        for (int i = 0; i < n; i++) if (Objects.equals(id(pending.get(i)), pinnedKey)) pinned = i;
        double[][] costs = new double[points.size()][points.size()];
        String basis = "roadDuration";
        String notice = "";
        try {
            // The standard multi-destination API supports at most 30 targets and a 10km radius.
            if (!"car".equals(mode) || n > 29) throw new IllegalStateException();
            List<java.util.concurrent.CompletableFuture<double[]>> requests = new ArrayList<>();
            for (int i = 0; i <= n && n > 0; i++) {
                int origin = i;
                requests.add(java.util.concurrent.CompletableFuture.supplyAsync(() -> durations(points.get(origin), points), workers));
            }
            java.util.concurrent.CompletableFuture.allOf(requests.toArray(java.util.concurrent.CompletableFuture[]::new))
                .orTimeout(25, java.util.concurrent.TimeUnit.SECONDS).join();
            for (int i = 0; i < requests.size(); i++) costs[i] = requests.get(i).join();
        } catch (RuntimeException error) {
            basis = "distance";
            notice = "이동시간 비교를 사용할 수 없어 근무지 복귀를 포함한 거리 기준으로 추천합니다.";
            for (int i = 0; i < points.size(); i++) for (int j = 0; j < points.size(); j++) costs[i][j] = distance(points.get(i), points.get(j));
        }
        List<Integer> order = solve(costs, n, home != null, pinned);
        List<Map<String, Object>> ordered = order.stream().map(i -> pending.get(i)).toList();
        Map<String, Object> result = new HashMap<>();
        result.put("optimizedLocations", ordered); result.put("includesReturn", home != null);
        result.put("basis", basis); result.put("notice", notice);
        result.put("algorithm", n <= 12 ? "exact" : "heuristic");
        result.put("totalCost", cost(order, costs, n, home != null));
        return result;
    }
    private double[] durations(Map<String, Object> origin, List<Map<String, Object>> points) {
        String cacheKey = origin.get("lat") + "," + origin.get("lng") + ":" + points.stream()
                .map(point -> point.get("lat") + "," + point.get("lng")).toList();
        Cached existing = cache.get(cacheKey);
        if (existing != null && System.currentTimeMillis() - existing.time < 300000) return existing.durations;
        double[] result = new double[points.size()];
        Arrays.fill(result, Double.POSITIVE_INFINITY);
        List<Map<String, Object>> destinations = new ArrayList<>();
        for (int j = 0; j < points.size(); j++) {
            if (distance(origin, points.get(j)) < 1) result[j] = 0;
            else {
                if (distance(origin, points.get(j)) > 10000) throw new IllegalStateException("Outside matrix radius");
                destinations.add(Map.of("x", points.get(j).get("lng"), "y", points.get(j).get("lat"), "key", String.valueOf(j)));
            }
        }
        if (!destinations.isEmpty()) {
            HttpHeaders headers = new HttpHeaders(); headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "KakaoAK " + key);
            Map<String, Object> request = Map.of("origin", Map.of("x", origin.get("lng"), "y", origin.get("lat")),
                    "destinations", destinations, "radius", 10000, "priority", "TIME");
            Map<String, Object> response = client.exchange("https://apis-navi.kakaomobility.com/v1/destinations/directions",
                    HttpMethod.POST, new HttpEntity<>(request, headers), new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
            if (response == null || !(response.get("routes") instanceof List<?> routes)) throw new IllegalStateException();
            for (Object raw : routes) {
                Map<String, Object> route = (Map<String, Object>) raw;
                if (!(route.get("result_code") instanceof Number code) || code.intValue() != 0) continue;
                int j = Integer.parseInt(String.valueOf(route.get("key")));
                if (j < 0 || j >= result.length) throw new IllegalStateException();
                double seconds = ((Number) ((Map<?, ?>) route.get("summary")).get("duration")).doubleValue();
                if (!Double.isFinite(seconds) || seconds < 0) throw new IllegalStateException();
                result[j] = seconds;
            }
        }
        if (Arrays.stream(result).anyMatch(value -> !Double.isFinite(value))) throw new IllegalStateException("Incomplete duration matrix");
        synchronized (cache) {
            if (cache.size() >= 256) cache.remove(cache.keySet().iterator().next());
            cache.put(cacheKey, new Cached(System.currentTimeMillis(), result));
        }
        return result;
    }
    static List<Integer> solve(double[][] costs, int n, boolean home, int pinned) {
        if (n == 0) return new ArrayList<>();
        if (n <= 12) {
            int states = 1 << n;
            double[][] dp = new double[states][n]; int[][] parent = new int[states][n];
            for (int mask = 0; mask < states; mask++) { Arrays.fill(dp[mask], Double.POSITIVE_INFINITY); Arrays.fill(parent[mask], -1); }
            for (int i = 0; i < n; i++) if (pinned < 0 || i == pinned) dp[1 << i][i] = costs[0][i + 1];
            for (int mask = 1; mask < states; mask++) for (int i = 0; i < n; i++) {
                if (!Double.isFinite(dp[mask][i])) continue;
                for (int j = 0; j < n; j++) if ((mask & (1 << j)) == 0) {
                    int next = mask | (1 << j); double candidate = dp[mask][i] + costs[i + 1][j + 1];
                    if (candidate < dp[next][j]) { dp[next][j] = candidate; parent[next][j] = i; }
                }
            }
            int last = 0; double best = Double.POSITIVE_INFINITY;
            for (int i = 0; i < n; i++) {
                double value = dp[states - 1][i] + (home ? costs[i + 1][n + 1] : 0);
                if (value < best) { best = value; last = i; }
            }
            List<Integer> order = new ArrayList<>(); int mask = states - 1;
            while (last >= 0) { order.add(last); int previous = parent[mask][last]; mask ^= 1 << last; last = previous; }
            Collections.reverse(order); return order;
        }
        List<Integer> order = new ArrayList<>(); Set<Integer> remaining = new LinkedHashSet<>();
        for (int i = 0; i < n; i++) remaining.add(i);
        int cursor = 0;
        if (pinned >= 0) { order.add(pinned); remaining.remove(pinned); cursor = pinned + 1; }
        while (!remaining.isEmpty()) {
            int from = cursor; int next = remaining.stream().min(Comparator.comparingDouble(i -> costs[from][i + 1])).orElseThrow();
            order.add(next); remaining.remove(next); cursor = next + 1;
        }
        // Full cost evaluation handles one-way streets: reversing a leg is not symmetric.
        for (int pass = 0; pass < (n <= 100 ? 4 : 1); pass++) {
            boolean improved = false;
            for (int i = pinned >= 0 ? 1 : 0; i < n - 1; i++) for (int j = i + 1; j < n; j++) {
                double before = cost(order, costs, n, home);
                Collections.reverse(order.subList(i, j + 1));
                if (cost(order, costs, n, home) + 0.01 < before) improved = true;
                else Collections.reverse(order.subList(i, j + 1));
            }
            if (!improved) break;
        }
        return order;
    }
    static double cost(List<Integer> order, double[][] costs, int n, boolean home) {
        double total = 0; int previous = 0;
        for (int i : order) { total += costs[previous][i + 1]; previous = i + 1; }
        return total + (home ? costs[previous][n + 1] : 0);
    }
    private static String id(Map<String, Object> point) { return String.valueOf(point.getOrDefault("id", point.get("taskId"))); }
    private static void requirePoint(Map<String, Object> point) {
        try {
            double lat = Double.parseDouble(String.valueOf(point.get("lat"))), lng = Double.parseDouble(String.valueOf(point.get("lng")));
            if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new IllegalArgumentException();
        } catch (Exception error) { throw new IllegalArgumentException("방문지 좌표를 확인해 주세요."); }
    }
    private static double distance(Map<String, Object> a, Map<String, Object> b) {
        double lat1 = Math.toRadians(Double.parseDouble(a.get("lat").toString()));
        double lat2 = Math.toRadians(Double.parseDouble(b.get("lat").toString()));
        double dlng = Math.toRadians(Double.parseDouble(b.get("lng").toString()) - Double.parseDouble(a.get("lng").toString()));
        double x = Math.pow(Math.sin((lat2 - lat1) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dlng / 2), 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
    }
}
