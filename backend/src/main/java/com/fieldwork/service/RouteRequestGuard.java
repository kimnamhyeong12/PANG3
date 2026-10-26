package com.fieldwork.service;

import com.fasterxml.jackson.databind.*;
import com.fieldwork.security.CurrentUser;
import com.fieldwork.security.RequestBudget;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

/** One shared guard for order, optimize and segment; it never limits location display updates. */
@Service
public class RouteRequestGuard {
    private record Cached(long expires, Map<String, Object> value) {}
    private final RequestBudget budget = new RequestBudget();
    private final Map<String, Cached> cache = new LinkedHashMap<>();
    private final Map<String, CompletableFuture<Map<String, Object>>> flights = new HashMap<>();
    private final Semaphore waiters = new Semaphore(32);
    private final ObjectMapper json = new ObjectMapper().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    public Map<String, Object> call(String kind, Object input, String walkingKey, Supplier<Map<String, Object>> action) {
        Long userId = CurrentUser.id();
        String serialized;
        try { serialized = json.writeValueAsString(input); }
        catch (Exception error) { throw invalid("경로 입력을 확인해 주세요."); }
        if (serialized.length() > 262144) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "경로 입력이 너무 큽니다.");
        validate(kind, json.valueToTree(input));
        var inputTree=json.valueToTree(input);
        String guidanceDay = kind.equals("order") && (!inputTree.hasNonNull("guidanceStart") || inputTree.path("guidanceStart").asBoolean(false))
                ? java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString() : "";
        String key = userId + ":" + kind + ":" + AuthSessionService.hash(serialized + ":" + Objects.toString(walkingKey, "") + ":" + guidanceDay);
        CompletableFuture<Map<String, Object>> flight;
        boolean owner = false;
        synchronized (this) {
            long now = System.currentTimeMillis();
            cache.entrySet().removeIf(entry -> entry.getValue().expires <= now);
            Cached cached = cache.get(key);
            if (cached != null) return copy(cached.value);
            if (!waiters.tryAcquire()) throw busy();
            flight = flights.get(key);
            if (flight == null) {
                if (flights.size() >= 4 || !budget.allow("user:" + userId, 60, 60000, now)
                        || !budget.allow("all", 300, 60000, now)) { waiters.release(); throw busy(); }
                flight = new CompletableFuture<>(); flights.put(key, flight); owner = true;
            }
        }
        try {
            if (owner) {
                ProviderQuotaInterceptor.begin();
                try {
                    Map<String, Object> value = copy(action.get());
                    synchronized (this) {
                        if (cache.size() >= 128) cache.remove(cache.keySet().iterator().next());
                        cache.put(key, new Cached(System.currentTimeMillis() + 30000, value));
                        flights.remove(key);
                    }
                    flight.complete(value);
                } catch (RuntimeException error) {
                    synchronized (this) { flights.remove(key); }
                    flight.completeExceptionally(error);
                } finally { ProviderQuotaInterceptor.end(); }
            }
            return copy(flight.get(60, TimeUnit.SECONDS));
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw busy(); }
        catch (TimeoutException error) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "경로를 계산 중입니다. 잠시 후 다시 시도해 주세요."); }
        catch (ExecutionException error) {
            if (error.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("경로 계산에 실패했습니다.");
        } finally { waiters.release(); }
    }
    @SuppressWarnings("unchecked") private Map<String, Object> copy(Map<String, Object> value) { return json.convertValue(value, Map.class); }
    private static void validate(String kind, JsonNode input) {
        if (kind.equals("segment")) { point(input.path("start")); point(input.path("end")); }
        else {
            point(input.path("currentLocation"));
            JsonNode locations = input.path("locations");
            int max = kind.equals("order") ? 500 : 50;
            if (!locations.isArray() || locations.size() > max) throw invalid("경로 방문지 수를 확인해 주세요. 최대 " + max + "개입니다.");
            locations.forEach(RouteRequestGuard::point);
            if (input.hasNonNull("returnLocation")) point(input.get("returnLocation"));
        }
        String mode = input.hasNonNull("transportMode") ? input.path("transportMode").asText() : "car";
        if (!mode.equalsIgnoreCase("car") && !mode.equalsIgnoreCase("walk")) throw invalid("이동 수단을 확인해 주세요.");
    }
    private static void point(JsonNode point) {
        double lat = point.path("lat").asDouble(point.path("latitude").asDouble(Double.NaN));
        double lng = point.path("lng").asDouble(point.path("longitude").asDouble(Double.NaN));
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
            throw invalid("경로 좌표를 확인해 주세요.");
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException busy() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "경로 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    }
}
