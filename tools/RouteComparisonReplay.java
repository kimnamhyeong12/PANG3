import com.fasterxml.jackson.databind.*;
import com.fieldwork.service.VisitOrderService;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.*;
import org.springframework.mock.http.client.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.*;
import org.springframework.web.client.RestTemplate;

/** Replays recorded scalar observations through the unchanged production service, offline. */
public class RouteComparisonReplay {
    public static void main(String[] args) throws Exception {
        var mapper = new ObjectMapper();
        Path folder = Path.of(args[0]);
        var observations = mapper.readTree(folder.resolve("observations.json").toFile());
        var report = mapper.readTree(folder.resolve("results.json").toFile());
        List<Map<String,Object>> points = mapper.convertValue(observations.get("locations"), List.class);
        for (var row : report.get("results")) {
            int n = row.get("visits").asInt();
            String mode = row.get("mode").asText();
            var service = new VisitOrderService();
            ReflectionTestUtils.setField(service, "key", "offline-replay");
            Object walking = ReflectionTestUtils.getField(service, "walkingClient");
            var http = (RestTemplate) ReflectionTestUtils.getField(mode.equals("car") ? service : walking, mode.equals("car") ? "client" : "http");
            var server = MockRestServiceServer.bindTo(http).ignoreExpectOrder(true).build();
            var calls = new AtomicInteger();
            server.expect(ExpectedCount.manyTimes(), request -> {}).andRespond(request -> {
                calls.incrementAndGet();
                Map<String,Object> body;
                if (mode.equals("car")) {
                    var payload = mapper.readTree(((MockClientHttpRequest)request).getBodyAsString());
                    int from = find(points, payload.get("origin").get("y").asDouble(), payload.get("origin").get("x").asDouble());
                    List<Map<String,Object>> routes = new ArrayList<>();
                    for (var dest : payload.get("destinations")) {
                        int to = find(points, dest.get("y").asDouble(), dest.get("x").asDouble());
                        double seconds = observations.get("car").get(points.get(from).get("id").toString()).get(points.get(to).get("id").toString()).asDouble();
                        routes.add(Map.of("key", dest.get("key").asText(), "result_code", 0, "summary", Map.of("duration", seconds)));
                    }
                    body = Map.of("routes", routes);
                } else {
                    Map<String,Double> query = new HashMap<>();
                    for (String pair : request.getURI().getQuery().split("&")) {
                        String[] parts = pair.split("=");
                        if (parts[0].endsWith("_x") || parts[0].endsWith("_y")) query.put(parts[0], Double.parseDouble(parts[1]));
                    }
                    int from = find(points, query.get("start_y"), query.get("start_x"));
                    int to = find(points, query.get("end_y"), query.get("end_x"));
                    var value = observations.get("walk").get(points.get(from).get("id") + ">" + points.get(to).get("id"));
                    if (value == null) throw new AssertionError("Missing recorded walking edge " + from + ">" + to);
                    body = Map.of("status", "OK", "route", Map.of("properties", Map.of("totalDistance", 100, "totalTime", value.asDouble()),
                        "legs", List.of(Map.of("steps", List.of(Map.of("path", Map.of("points", List.of(List.of(128.97,35.05),List.of(128.98,35.06)))))))));
                }
                var response = new MockClientHttpResponse(mapper.writeValueAsBytes(body), HttpStatus.OK);
                response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                return response;
            });
            try {
                var result = service.recommend(points.get(0), points.subList(1,n+1), null, null, mode, "offline-replay");
                if (!"roadDuration".equals(result.get("basis"))) throw new AssertionError("Unexpected fallback");
                List<Map<String,Object>> actual = (List<Map<String,Object>>)result.get("optimizedLocations");
                List<Integer> indices = actual.stream().map(p -> points.indexOf(p)).toList();
                List<Integer> expected = mapper.convertValue(row.get("baseline").get("order_indices"), List.class);
                if (!indices.equals(expected)) throw new AssertionError("Order differs: " + indices + " vs " + expected);
                if (calls.get() != row.get("baseline").get("api_calls").asInt()) throw new AssertionError("Call count differs");
                double seconds = ((Number)result.get("totalCost")).doubleValue();
                if (Math.abs(seconds-row.get("baseline").get("seconds").asDouble()) > .001) throw new AssertionError("Time differs");
                System.out.println("PASS production replay " + mode + " " + n + " visits: " + calls.get() + " calls, " + seconds + " seconds");
            } finally { service.stop(); }
        }
    }
    static int find(List<Map<String,Object>> points, double lat, double lng) {
        for (int i=0;i<points.size();i++) {
            var p=points.get(i);
            if (Math.abs(((Number)p.get("lat")).doubleValue()-lat)<1e-9 && Math.abs(((Number)p.get("lng")).doubleValue()-lng)<1e-9) return i;
        }
        throw new AssertionError("Unknown coordinate");
    }
}
